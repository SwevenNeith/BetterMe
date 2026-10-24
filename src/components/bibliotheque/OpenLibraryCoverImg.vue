<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { resolveGoogleBooksThumbnailsByIsbnsQueued } from '../../services/bibliotheque/googleBooks.js'
import {
  buildReliableCoverCandidates,
  resolveIsbnsForWorkCached,
} from '../../services/bibliotheque/reliableBookCovers.js'

/** Timeout uniquement pour les (rares) URLs encore tentées en <img>. */
const COVER_ATTEMPT_TIMEOUT_MS = 5000

const props = defineProps({
  src: {
    type: String,
    default: '',
  },
  candidates: {
    type: Array,
    default: () => [],
  },
  coverId: {
    type: [Number, String],
    default: null,
  },
  isbn: {
    type: String,
    default: null,
  },
  isbns: {
    type: Array,
    default: () => [],
  },
  workKey: {
    type: String,
    default: null,
  },
  title: {
    type: String,
    default: '',
  },
  author: {
    type: String,
    default: '',
  },
  size: {
    type: String,
    default: 'M',
  },
  alt: {
    type: String,
    default: '',
  },
  imgClass: {
    type: String,
    default: '',
  },
  loading: {
    type: String,
    default: 'eager',
  },
})

const emit = defineEmits(['error', 'load'])

const attemptIndex = ref(0)
const dynamicIsbns = ref([])
const verifiedThumbs = ref([])
const exhausted = ref(false)
let attemptTimer = null
let resolveAbort = null
let resolveGen = 0

const allIsbns = computed(() => {
  const list = []
  for (const value of [...(props.isbns || []), props.isbn, ...dynamicIsbns.value]) {
    const clean = String(value ?? '').replace(/[^0-9Xx]/g, '')
    if (clean.length >= 10 && !list.includes(clean)) list.push(clean)
  }
  return list
})

const resolvedCandidates = computed(() => {
  const base = buildReliableCoverCandidates({
    src: props.src,
    candidates: [...verifiedThumbs.value, ...(props.candidates || [])],
    // Pas d’URL ISBN aveugles ici — uniquement vignettes View API vérifiées.
    isbns: [],
    size: props.size,
  })
  return base
})

const currentSrc = computed(() => {
  if (exhausted.value) return null
  return resolvedCandidates.value[attemptIndex.value] || null
})

function clearAttemptTimer() {
  if (attemptTimer != null) {
    clearTimeout(attemptTimer)
    attemptTimer = null
  }
}

function scheduleAttemptTimeout() {
  clearAttemptTimer()
  if (!currentSrc.value) return
  attemptTimer = window.setTimeout(() => {
    advance()
  }, COVER_ATTEMPT_TIMEOUT_MS)
}

function advance() {
  clearAttemptTimer()
  if (attemptIndex.value < resolvedCandidates.value.length - 1) {
    attemptIndex.value += 1
    scheduleAttemptTimeout()
    return
  }
  exhausted.value = true
  emit('error')
}

function onError() {
  advance()
}

function onLoad(event) {
  clearAttemptTimer()
  const img = event?.target
  if (img && (img.naturalWidth < 8 || img.naturalHeight < 8)) {
    advance()
    return
  }
  emit('load', event)
}

async function resolveCovers() {
  resolveAbort?.abort()
  const controller = new AbortController()
  resolveAbort = controller
  const gen = ++resolveGen

  attemptIndex.value = 0
  exhausted.value = false
  dynamicIsbns.value = []
  verifiedThumbs.value = []
  clearAttemptTimer()

  // Affiche tout de suite les URL déjà fiables (imageLinks Google, upload…).
  if (resolvedCandidates.value.length) {
    scheduleAttemptTimeout()
  }

  try {
    let isbns = [...allIsbns.value]

    if (
      !isbns.length &&
      props.workKey &&
      !String(props.workKey).startsWith('/google/')
    ) {
      const fromWork = await resolveIsbnsForWorkCached(props.workKey, {
        signal: controller.signal,
      })
      if (gen !== resolveGen) return
      if (fromWork.length) {
        dynamicIsbns.value = fromWork
        isbns = fromWork
      }
    }

    // Si une couverture fiable est déjà affichée, pas besoin de View API.
    if (!resolvedCandidates.value.length && isbns.length) {
      const thumbs = await resolveGoogleBooksThumbnailsByIsbnsQueued(isbns.slice(0, 4), {
        signal: controller.signal,
      })
      if (gen !== resolveGen) return
      verifiedThumbs.value = thumbs
      attemptIndex.value = 0
      if (resolvedCandidates.value.length) {
        exhausted.value = false
        scheduleAttemptTimeout()
      }
    }

    if (gen !== resolveGen) return

    if (!resolvedCandidates.value.length) {
      exhausted.value = true
      emit('error')
    }
  } catch (err) {
    if (err?.name === 'AbortError') return
    if (gen !== resolveGen) return
    if (!resolvedCandidates.value.length) {
      exhausted.value = true
      emit('error')
    }
  }
}

watch(
  () => [
    props.src,
    props.isbn,
    props.isbns,
    props.candidates,
    props.workKey,
    props.size,
  ],
  () => {
    void resolveCovers()
  },
  { immediate: true, deep: true },
)

watch(currentSrc, (url) => {
  if (url) scheduleAttemptTimeout()
})

onUnmounted(() => {
  clearAttemptTimer()
  resolveAbort?.abort()
  resolveGen += 1
})
</script>

<template>
  <img
    v-if="currentSrc"
    :key="currentSrc"
    :src="currentSrc"
    :alt="alt"
    :class="imgClass"
    :loading="loading"
    decoding="async"
    referrerpolicy="no-referrer"
    width="120"
    height="180"
    @error="onError"
    @load="onLoad"
  />
</template>
