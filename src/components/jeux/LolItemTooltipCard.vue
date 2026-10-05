<script setup>
import { computed } from 'vue'
import { lolItemCard, lolItemIconUrl } from '../../services/jeux/riot.js'

const props = defineProps({
  itemId: { type: Number, default: 0 },
  compact: { type: Boolean, default: false },
})

const card = computed(() => lolItemCard(props.itemId))
const iconUrl = computed(() => lolItemIconUrl(props.itemId))

const effectTypeLabel = {
  passive: 'Passif',
  active: 'Actif',
  unique: 'Unique',
}
</script>

<template>
  <div class="lol-item-card" :class="{ 'lol-item-card--compact': compact }">
    <header class="lol-item-card__head">
      <img v-if="iconUrl" :src="iconUrl" alt="" class="lol-item-card__icon" />
      <div class="lol-item-card__title-wrap">
        <strong class="lol-item-card__name">{{ card.name }}</strong>
        <span v-if="card.goldTotal" class="lol-item-card__gold">
          {{ card.goldTotal.toLocaleString('fr-FR') }}
          <span class="lol-item-card__gold-suffix">or</span>
        </span>
      </div>
    </header>

    <ul v-if="card.stats.length" class="lol-item-card__stats">
      <li v-for="(stat, idx) in card.stats" :key="idx">
        <img
          v-if="stat.icon"
          :src="stat.icon"
          alt=""
          class="lol-item-card__stat-icon"
        />
        <span v-else class="lol-item-card__stat-fallback" aria-hidden="true">+</span>
        <span class="lol-item-card__stat-text">
          <span v-if="stat.value" class="lol-item-card__stat-value">{{ stat.value }}</span>
          {{ stat.label }}
        </span>
      </li>
    </ul>

    <div v-for="(effect, idx) in card.effects" :key="`fx-${idx}`" class="lol-item-card__effect">
      <p v-if="effect.name" class="lol-item-card__effect-name">
        <span v-if="effectTypeLabel[effect.type]" class="lol-item-card__effect-tag">
          {{ effectTypeLabel[effect.type] }}
        </span>
        {{ effect.name }}
      </p>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <p
        v-if="effect.bodyHtml"
        class="lol-item-card__effect-body"
        v-html="effect.bodyHtml"
      />
      <p v-else-if="effect.bodyText" class="lol-item-card__effect-body">
        {{ effect.bodyText }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.lol-item-card {
  width: max-content;
  max-width: 17.5rem;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(52, 42, 68, 0.98), rgba(36, 28, 48, 0.98));
  color: #ece4f5;
  font-size: 0.72rem;
  line-height: 1.4;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  text-align: left;
  box-sizing: border-box;
}

.lol-item-card--compact {
  max-width: 15rem;
  font-size: 0.68rem;
}

.lol-item-card__head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.35rem;
}

.lol-item-card__icon {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 6px;
  flex-shrink: 0;
}

.lol-item-card__title-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.lol-item-card__name {
  font-size: 0.82rem;
  font-weight: 800;
  color: #f8f2ff;
}

.lol-item-card__gold {
  font-size: 0.72rem;
  font-weight: 700;
  color: #e8c547;
  font-variant-numeric: tabular-nums;
}

.lol-item-card__gold-suffix {
  margin-left: 0.15rem;
  font-weight: 650;
  color: #d4b84a;
}

.lol-item-card__stats {
  list-style: none;
  margin: 0 0 0.4rem;
  padding: 0;
  display: grid;
  gap: 0.2rem;
}

.lol-item-card__stats li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.lol-item-card__stat-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  object-fit: contain;
}

.lol-item-card__stat-fallback {
  width: 1rem;
  text-align: center;
  font-weight: 800;
  color: #c9b8dc;
  flex-shrink: 0;
}

.lol-item-card__stat-value {
  font-weight: 800;
  color: #f0e6ff;
}

.lol-item-card__effect + .lol-item-card__effect {
  margin-top: 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.lol-item-card__effect-name {
  margin: 0 0 0.15rem;
  font-weight: 800;
  color: #d5b5ea;
  font-size: 0.74rem;
}

.lol-item-card__effect-tag {
  display: inline-block;
  margin-right: 0.25rem;
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  background: rgba(213, 181, 234, 0.2);
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  vertical-align: middle;
}

.lol-item-card__effect-body {
  margin: 0;
  color: #ddd2ea;
}

.lol-item-card__effect-body :deep(.lol-item-fx--magic) {
  color: #8fd4ff;
  font-weight: 650;
}

.lol-item-card__effect-body :deep(.lol-item-fx--phys) {
  color: #e8a060;
  font-weight: 650;
}

.lol-item-card__effect-body :deep(.lol-item-fx--true) {
  color: #f0f0f0;
  font-weight: 650;
}

.lol-item-card__effect-body :deep(.lol-item-fx--attention) {
  font-weight: 800;
  color: #fff6d9;
}
</style>
