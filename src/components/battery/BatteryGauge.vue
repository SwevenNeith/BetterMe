<script setup>
import { computed } from 'vue'
import { remainingEnergy, remainingRatio } from '../../utils/battery/batteryMath.js'

const props = defineProps({
  budget: { type: Number, default: 10 },
  spent: { type: Number, default: 0 },
  /** sm = widget, md = page, lg = hero */
  size: { type: String, default: 'md' },
  showLabel: { type: Boolean, default: true },
})

const remaining = computed(() => remainingEnergy(props.budget, props.spent))
const ratio = computed(() => remainingRatio(props.budget, props.spent))

/** Largeur du remplissage 0–100 % (0 si dépassement). */
const fillPct = computed(() => Math.max(0, Math.min(100, ratio.value * 100)))

/** Niveau pour la couleur / dégradé. */
const level = computed(() => {
  if (ratio.value > 0.4) return 'green'
  if (ratio.value > 0.15) return 'orange'
  return 'red'
})

const label = computed(() => `${remaining.value} / ${props.budget}`)
</script>

<template>
  <div
    class="battery-bar"
    :class="[`battery-bar--${size}`, `battery-bar--${level}`]"
    role="img"
    :aria-label="`Batterie ${label}`"
  >
    <div class="battery-bar__track">
      <div
        class="battery-bar__fill"
        :style="{ width: `${fillPct}%` }"
      />
      <div class="battery-bar__glow" :style="{ width: `${fillPct}%` }" aria-hidden="true" />
    </div>
    <p v-if="showLabel" class="battery-bar__label">
      <span class="battery-bar__remaining">{{ remaining }}</span>
      <span class="battery-bar__sep">/</span>
      <span class="battery-bar__budget">{{ budget }}</span>
    </p>
  </div>
</template>

<style scoped>
.battery-bar {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: 100%;
  max-width: 420px;
  margin-inline: auto;
}

.battery-bar--sm {
  max-width: none;
}

.battery-bar__track {
  position: relative;
  width: 100%;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(173, 129, 190, 0.12);
  border: 1px solid rgba(213, 181, 234, 0.35);
  box-shadow: inset 0 1px 3px rgba(44, 62, 80, 0.06);
}

.battery-bar--sm .battery-bar__track {
  height: 8px;
}

.battery-bar--lg .battery-bar__track {
  height: 12px;
}

.battery-bar__fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  transition:
    width 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    background 0.35s ease;
  /* Dégradé vert → orange → rose, dans l’esprit app */
  background: linear-gradient(
    90deg,
    #72a098 0%,
    #95d1aa 28%,
    #e8c04a 62%,
    #e8a0c0 88%,
    #c45c5c 100%
  );
  background-size: 100% 100%;
}

.battery-bar--green .battery-bar__fill {
  background: linear-gradient(90deg, #5a9e78 0%, #95d1aa 55%, #b8e0c4 100%);
}

.battery-bar--orange .battery-bar__fill {
  background: linear-gradient(90deg, #d4a017 0%, #e8c04a 50%, #f0d78a 100%);
}

.battery-bar--red .battery-bar__fill {
  background: linear-gradient(90deg, #c45c5c 0%, #e8a0c0 55%, #f0b8d0 100%);
}

.battery-bar__glow {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  pointer-events: none;
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.35) 0%,
    transparent 55%
  );
  transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.battery-bar__label {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  color: #2c3e50;
  letter-spacing: 0.02em;
  text-align: center;
}

.battery-bar--sm .battery-bar__label {
  font-size: 0.9rem;
}

.battery-bar--md .battery-bar__label {
  font-size: 1.05rem;
}

.battery-bar--lg .battery-bar__label {
  font-size: 1.15rem;
}

.battery-bar__sep {
  margin: 0 0.2em;
  font-weight: 500;
  opacity: 0.45;
}

.battery-bar--green .battery-bar__remaining {
  color: #3d7a58;
}

.battery-bar--orange .battery-bar__remaining {
  color: #b8860b;
}

.battery-bar--red .battery-bar__remaining {
  color: #c45c5c;
}

@media (prefers-color-scheme: dark) {
  .battery-bar__track {
    background: rgba(173, 129, 190, 0.15);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .battery-bar__label {
    color: #f0e8f8;
  }

  .battery-bar--green .battery-bar__remaining {
    color: #7dca9a;
  }

  .battery-bar--orange .battery-bar__remaining {
    color: #e8c04a;
  }

  .battery-bar--red .battery-bar__remaining {
    color: #e88888;
  }
}
</style>
