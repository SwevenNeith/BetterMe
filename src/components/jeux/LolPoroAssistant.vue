<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase.js'
import { loadPoroRuntimeContext } from '../../services/jeux/lolPoroData.js'
import { invokeSyncPoroMetaRole } from '../../services/jeux/poroMeta.js'
import { fetchMatchTimeline } from '../../services/jeux/riot.js'
import { listPoroMemories, upsertPoroMemory } from '../../services/jeux/lolPoroMemory.js'
import { answerPoroQuery, poroWelcomeMessage } from '../../utils/jeux/poroEngine.js'
import { buildPoroMatchSnapshot } from '../../utils/jeux/poroMatchAdvice.js'
import { renderPoroContent } from '../../utils/jeux/poroMarkup.js'
import { resolvePreferredRole } from '../../utils/jeux/poroRoles.js'

defineOptions({ name: 'LolPoroAssistant' })

const props = defineProps({
  open: { type: Boolean, default: false },
  userId: { type: String, default: null },
  /** Puuid du compte LoL sélectionné (historique). */
  puuid: { type: String, default: null },
  accountLabel: { type: String, default: '' },
  /** Match ouvert dans le détail LoL (conseils contextuels). */
  match: { type: Object, default: null },
  /** Matchs récents chargés (détection série de défaites / coach tilt). */
  recentMatches: { type: Array, default: () => [] },
  /** Message à envoyer automatiquement après ouverture (ex. analyse). */
  autoPrompt: { type: String, default: '' },
})

const emit = defineEmits(['close', 'auto-prompt-done'])

const isBooting = ref(false)
const isSending = ref(false)
const loadError = ref('')
/** @type {import('vue').Ref<{ id?: string, role: string, content: string, meta?: object }[]>} */
const messages = ref([])
/** @type {import('vue').Ref<{ kind: string, label: string, value: string }[]>} */
const memories = ref([])
const draft = ref('')
/** @type {import('vue').Ref<object | null>} */
const pendingQuiz = ref(null)
/** @type {import('vue').Ref<object | null>} */
const runtime = ref(null)
const patchLabel = ref('')
const listRef = ref(null)

const quickPrompts = ['Aide', 'Que retiens-tu sur moi ?', 'Quiz']

const roleHint = computed(() => {
  const role = resolvePreferredRole('', memories.value, runtime.value?.preferredRole || null)
  return role?.label || ''
})

const matchHint = computed(() => {
  const p = props.match?.participant
  if (!p?.championName) return ''
  const result = p.win ? 'Victoire' : 'Défaite'
  return `${p.championName} · ${result}`
})

function attachMatchToRuntime() {
  if (!runtime.value) return
  const platform = props.match?.platform || 'euw1'
  const puuid = props.puuid || props.match?.participant?.puuid || ''
  runtime.value = {
    ...runtime.value,
    match: props.match || null,
    timeline: null,
    recentMatches: Array.isArray(props.recentMatches) ? props.recentMatches : [],
    matchSnapshot: props.match
      ? buildPoroMatchSnapshot(props.match, runtime.value.itemsById, runtime.value.champions, {
          runesById: runtime.value.runesById,
          runeTrees: runtime.value.runeTrees,
          summonersByKey: runtime.value.summonersByKey,
        })
      : null,
    fetchTimeline: async (matchId) => {
      if (!matchId || !puuid) throw new Error('matchId/puuid manquant pour la timeline.')
      return fetchMatchTimeline(matchId, puuid, platform)
    },
    syncMetaRole: async (roleId) => invokeSyncPoroMetaRole(roleId),
    /** @deprecated */
    syncMetaMid: async () => invokeSyncPoroMetaRole('mid'),
  }
}

function renderContent(text) {
  return renderPoroContent(text, { version: runtime.value?.version || undefined })
}

async function scrollToBottom() {
  await nextTick()
  const el = listRef.value
  if (el) el.scrollTop = el.scrollHeight
}

async function refreshMemories() {
  if (!props.userId) {
    memories.value = []
    return
  }
  try {
    memories.value = await listPoroMemories(supabase, props.userId)
  } catch (err) {
    console.warn('Poro memories:', err)
  }
}

async function loadRuntime() {
  try {
    runtime.value = await loadPoroRuntimeContext({ puuid: props.puuid || null })
    patchLabel.value = runtime.value?.patch || ''
    attachMatchToRuntime()
  } catch (err) {
    console.warn('Poro runtime:', err)
    runtime.value = null
    patchLabel.value = ''
  }
}

function welcomeText() {
  return poroWelcomeMessage(patchLabel.value, roleHint.value)
}

/** Une seule session locale (pas d’historique multi-conversations). */
async function resetSession() {
  pendingQuiz.value = null
  draft.value = ''
  messages.value = [
    {
      role: 'assistant',
      content: welcomeText(),
      meta: { intent: 'welcome', patch: patchLabel.value },
    },
  ]
  await scrollToBottom()
}

async function bootstrapSession() {
  isBooting.value = true
  loadError.value = ''
  const auto = String(props.autoPrompt || '').trim()
  try {
    await Promise.all([refreshMemories(), loadRuntime()])
    await resetSession()
    if (auto) {
      isBooting.value = false
      emit('auto-prompt-done')
      await sendText(auto)
    }
  } catch (err) {
    console.error(err)
    loadError.value = err?.message || 'Impossible d’ouvrir Poro.'
    messages.value = [{ role: 'assistant', content: welcomeText() }]
  } finally {
    isBooting.value = false
    await scrollToBottom()
  }
}

/**
 * @param {string} text
 */
async function sendText(text) {
  const content = String(text ?? '').trim()
  if (!content || isSending.value) return

  isSending.value = true
  loadError.value = ''
  draft.value = ''

  messages.value = [...messages.value, { role: 'user', content }]
  await scrollToBottom()

  try {
    // Contexte des messages précédents (même session) pour les follow-ups
    const recentMessages = messages.value
      .slice(0, -1)
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: m.content,
        meta: m.meta || {},
      }))

    const result = await answerPoroQuery(content, {
      memories: memories.value,
      pendingQuiz: pendingQuiz.value,
      runtime: runtime.value,
      recentMessages,
    })

    if (result.memoriesToUpsert?.length && props.userId) {
      for (const mem of result.memoriesToUpsert) {
        await upsertPoroMemory(supabase, props.userId, mem)
      }
      await refreshMemories()
    }

    if (result.meta?.quiz) pendingQuiz.value = result.meta.quiz
    else if (result.meta?.clearQuiz) pendingQuiz.value = null

    messages.value = [
      ...messages.value,
      {
        role: 'assistant',
        content: result.reply,
        meta: result.meta || {},
      },
    ]
  } catch (err) {
    console.error(err)
    loadError.value = err?.message || 'Erreur pendant la réponse.'
    messages.value = [
      ...messages.value,
      { role: 'assistant', content: 'Oups, un souci est survenu. Réessaie dans un instant.' },
    ]
  } finally {
    isSending.value = false
    await scrollToBottom()
  }
}

function onSubmit() {
  void sendText(draft.value)
}

function onQuick(prompt) {
  void sendText(prompt)
}

function onClose() {
  emit('close')
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) void bootstrapSession()
  },
)

watch(
  () => props.puuid,
  () => {
    if (props.open) void loadRuntime()
  },
)

watch(
  () => [props.match, props.recentMatches],
  () => {
    if (props.open) attachMatchToRuntime()
  },
  { deep: true },
)

onMounted(() => {
  if (props.open) void bootstrapSession()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="poro-root" role="dialog" aria-modal="true" aria-labelledby="poro-title">
      <button type="button" class="poro-backdrop" aria-label="Fermer Poro" @click="onClose" />
      <aside class="poro-panel">
        <header class="poro-header">
          <div class="poro-header__id">
            <span class="poro-avatar" aria-hidden="true">🐾</span>
            <div>
              <h2 id="poro-title" class="poro-title">Poro</h2>
              <p class="poro-subtitle">
                Assistant LoL
                <template v-if="patchLabel"> · patch {{ patchLabel }}</template>
                <template v-if="roleHint"> · {{ roleHint }}</template>
              </p>
            </div>
          </div>
          <div class="poro-header__actions">
            <button
              type="button"
              class="poro-icon-btn"
              title="Effacer la discussion"
              :disabled="isSending || isBooting"
              @click="resetSession"
            >
              Effacer
            </button>
            <button type="button" class="poro-close" aria-label="Fermer" @click="onClose">×</button>
          </div>
        </header>

        <p v-if="loadError" class="poro-error" role="alert">{{ loadError }}</p>
        <p v-if="memories.length || accountLabel || matchHint" class="poro-memory-hint">
          <template v-if="accountLabel">Compte · {{ accountLabel }}</template>
          <template v-if="matchHint">
            <template v-if="accountLabel"> · </template>
            Match · {{ matchHint }}
          </template>
          <template v-if="memories.length">
            <template v-if="accountLabel || matchHint"> · </template>
            Mémoire · {{ memories.length }} fait{{ memories.length > 1 ? 's' : '' }}
          </template>
        </p>

        <div ref="listRef" class="poro-messages" aria-live="polite">
          <p v-if="isBooting" class="poro-muted">Poro charge le patch…</p>
          <div
            v-for="(msg, idx) in messages"
            :key="msg.id || idx"
            class="poro-bubble"
            :class="msg.role === 'user' ? 'poro-bubble--user' : 'poro-bubble--assistant'"
          >
            <p class="poro-bubble__role">{{ msg.role === 'user' ? 'Toi' : 'Poro' }}</p>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="poro-bubble__text" v-html="renderContent(msg.content)" />
          </div>
        </div>

        <div class="poro-quick" role="group" aria-label="Suggestions">
          <button
            v-for="prompt in quickPrompts"
            :key="prompt"
            type="button"
            class="poro-chip"
            :disabled="isSending || isBooting"
            @click="onQuick(prompt)"
          >
            {{ prompt }}
          </button>
        </div>

        <form class="poro-form" @submit.prevent="onSubmit">
          <input
            v-model="draft"
            class="poro-input"
            type="text"
            maxlength="2000"
            placeholder="Ex. build Veigar ADC vs MF, R de Wukong…"
            :disabled="isSending || isBooting"
            autocomplete="off"
          />
          <button
            type="submit"
            class="poro-send"
            :disabled="isSending || isBooting || !draft.trim()"
          >
            {{ isSending ? '…' : 'Envoyer' }}
          </button>
        </form>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.poro-root {
  position: fixed;
  inset: 0;
  /* Au-dessus du modal détail match (z-index 200) */
  z-index: 320;
  display: flex;
  justify-content: flex-end;
}

.poro-backdrop {
  position: absolute;
  inset: 0;
  border: none;
  background: rgba(20, 16, 28, 0.45);
  cursor: pointer;
}

.poro-panel {
  position: relative;
  z-index: 1;
  width: min(420px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(165deg, #1a1524 0%, #241c32 45%, #1e1830 100%);
  color: #f0e8f8;
  border-left: 1px solid rgba(213, 181, 234, 0.28);
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.35);
  box-sizing: border-box;
}

.poro-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid rgba(213, 181, 234, 0.18);
}

.poro-header__id {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.poro-header__actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.poro-avatar {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(173, 129, 190, 0.28);
  font-size: 1.25rem;
}

.poro-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
}

.poro-subtitle {
  margin: 0.1rem 0 0;
  font-size: 0.78rem;
  color: #b8a8c8;
}

.poro-icon-btn {
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.06);
  color: #e8dcf2;
  border-radius: 10px;
  padding: 0.28rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.poro-icon-btn[aria-pressed='true'] {
  background: rgba(173, 129, 190, 0.28);
  border-color: rgba(213, 181, 234, 0.55);
}

.poro-close {
  border: none;
  background: transparent;
  color: #d5b5ea;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.2rem 0.45rem;
  border-radius: 8px;
}

.poro-close:hover {
  background: rgba(213, 181, 234, 0.12);
}

.poro-error {
  margin: 0.5rem 1rem 0;
  padding: 0.45rem 0.65rem;
  border-radius: 10px;
  background: rgba(196, 92, 92, 0.18);
  color: #ffb4b4;
  font-size: 0.82rem;
}

.poro-memory-hint {
  margin: 0.45rem 1rem 0;
  font-size: 0.72rem;
  color: #9ec4a8;
}

.poro-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.poro-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.poro-muted {
  margin: 0;
  color: #9a8aa8;
  font-size: 0.88rem;
}

.poro-bubble {
  max-width: 94%;
  padding: 0.55rem 0.7rem;
  border-radius: 14px;
  font-size: 0.88rem;
  line-height: 1.45;
}

.poro-bubble--assistant {
  align-self: flex-start;
  background: rgba(173, 129, 190, 0.18);
  border: 1px solid rgba(213, 181, 234, 0.22);
}

.poro-bubble--user {
  align-self: flex-end;
  background: rgba(143, 162, 212, 0.22);
  border: 1px solid rgba(143, 162, 212, 0.35);
}

.poro-bubble__role {
  margin: 0 0 0.2rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.7;
}

.poro-bubble__text {
  margin: 0;
  word-break: break-word;
}

.poro-bubble__text :deep(.poro-h) {
  display: block;
  font-weight: 800;
  margin: 0.55rem 0 0.35rem;
}

.poro-bubble__text :deep(.poro-h-main) {
  font-size: 1.05rem;
  color: #f3e9fc;
}

.poro-bubble__text :deep(.poro-h-sub) {
  display: block;
  font-size: 0.92rem;
  color: #c4ddff;
  margin-top: 0.75rem;
  margin-bottom: 0.25rem;
}

.poro-bubble__text :deep(.poro-strong) {
  font-weight: 750;
  color: #f7f0ff;
}

.poro-bubble__text :deep(.poro-tip) {
  font-style: italic;
  color: #b9a8c9;
}

.poro-bubble__text :deep(.poro-tag) {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  font-weight: 750;
  border-radius: 8px;
  padding: 0.18rem 0.42rem 0.18rem 0.28rem;
  margin: 0.1rem 0.12rem 0.1rem 0;
  border: 1px solid transparent;
  line-height: 1.25;
  vertical-align: middle;
  max-width: 100%;
}

.poro-bubble__text :deep(.poro-tag-ico) {
  padding-left: 0.2rem;
}

.poro-bubble__text :deep(.poro-ico) {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.25);
}

.poro-bubble__text :deep(.poro-tag-champ .poro-ico) {
  width: 26px;
  height: 26px;
  border-radius: 6px;
}

.poro-bubble__text :deep(.poro-tag-label) {
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 7.5rem;
}

.poro-tag-item {
  color: #f0d78c;
  background: rgba(240, 215, 140, 0.14);
  border-color: rgba(240, 215, 140, 0.32) !important;
}

.poro-tag-spell {
  color: #8fd6ff;
  background: rgba(110, 190, 240, 0.14);
  border-color: rgba(143, 214, 255, 0.35) !important;
}

.poro-tag-rune {
  color: #d4b4ff;
  background: rgba(180, 140, 240, 0.14);
  border-color: rgba(212, 180, 255, 0.35) !important;
}

.poro-tag-champ {
  color: #f2a8d8;
  background: rgba(230, 140, 200, 0.14);
  border-color: rgba(242, 168, 216, 0.35) !important;
}

.poro-tag-role {
  color: #9fe3b4;
  background: rgba(120, 200, 150, 0.14);
  border-color: rgba(159, 227, 180, 0.35) !important;
}

.poro-bubble__text :deep(.poro-row) {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
  margin: 0.3rem 0 0.5rem;
  align-items: center;
}

.poro-bubble__text :deep(.poro-sep) {
  border: none;
  border-top: 1px solid rgba(213, 181, 234, 0.22);
  margin: 0.7rem 0;
}

.poro-bubble__text :deep(.poro-stat) {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: baseline;
  padding: 0.35rem 0.5rem;
  margin: 0.15rem 0;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(213, 181, 234, 0.14);
  font-size: 0.84rem;
}

.poro-bubble__text :deep(.poro-stat-k) {
  color: #b8a8c8;
  font-weight: 650;
  flex-shrink: 0;
}

.poro-bubble__text :deep(.poro-stat-v) {
  color: #f5eef8;
  font-weight: 750;
  text-align: right;
}

.poro-bubble__text :deep(.poro-li) {
  display: block;
  padding: 0.2rem 0 0.2rem 0.55rem;
  border-left: 2px solid rgba(173, 129, 190, 0.45);
  margin: 0.08rem 0;
  line-height: 1.35;
}

.poro-bubble__text :deep(.poro-tier) {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 800;
  border-radius: 8px;
  padding: 0.2rem 0.5rem;
  border: 1px solid transparent;
  margin: 0.25rem 0;
}

.poro-bubble__text :deep(.poro-tier-label) {
  font-weight: 650;
  opacity: 0.9;
  font-size: 0.82em;
}

.poro-bubble__text :deep(.poro-tier-s) {
  color: #ffb4b4;
  background: rgba(196, 92, 92, 0.22);
  border-color: rgba(255, 180, 180, 0.35);
}

.poro-bubble__text :deep(.poro-tier-a) {
  color: #ffc9a0;
  background: rgba(220, 140, 80, 0.18);
  border-color: rgba(255, 201, 160, 0.35);
}

.poro-bubble__text :deep(.poro-tier-b) {
  color: #f0d78c;
  background: rgba(240, 215, 140, 0.14);
  border-color: rgba(240, 215, 140, 0.32);
}

.poro-bubble__text :deep(.poro-tier-c) {
  color: #c4ddff;
  background: rgba(110, 160, 220, 0.16);
  border-color: rgba(196, 221, 255, 0.35);
}

.poro-bubble__text :deep(.poro-tier-d),
.poro-bubble__text :deep(.poro-tier-e) {
  color: #9fe3b4;
  background: rgba(120, 200, 150, 0.16);
  border-color: rgba(159, 227, 180, 0.35);
}

.poro-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.35rem 1rem 0.55rem;
}

.poro-chip {
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.06);
  color: #e8dcf2;
  border-radius: 999px;
  padding: 0.22rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
}

.poro-chip--accent {
  border-color: rgba(159, 227, 180, 0.45);
  color: #c8f0d4;
}

.poro-chip:disabled {
  opacity: 0.5;
  cursor: wait;
}

.poro-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.45rem;
  padding: 0.65rem 1rem 1rem;
  border-top: 1px solid rgba(213, 181, 234, 0.16);
}

.poro-input {
  min-width: 0;
  border: 1px solid rgba(213, 181, 234, 0.3);
  border-radius: 12px;
  padding: 0.55rem 0.7rem;
  background: rgba(0, 0, 0, 0.25);
  color: #f5eef8;
  font: inherit;
  font-size: 0.9rem;
}

.poro-input:focus {
  outline: none;
  border-color: rgba(173, 129, 190, 0.7);
}

.poro-send {
  border: none;
  border-radius: 12px;
  padding: 0.55rem 0.85rem;
  background: linear-gradient(135deg, #ad81be, #8fa2d4);
  color: #fff;
  font: inherit;
  font-weight: 800;
  font-size: 0.85rem;
  cursor: pointer;
}

.poro-send:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 520px) {
  .poro-panel {
    width: 100%;
  }
}
</style>
