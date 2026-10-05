<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** @type {{ label: string, youNorm: number, eloNorm: number, youValue: number, eloValue: number }[]} */
  axes: { type: Array, default: () => [] },
  size: { type: Number, default: 260 },
  showLegend: { type: Boolean, default: true },
})

const cx = computed(() => props.size / 2)
const cy = computed(() => props.size / 2)
const radius = computed(() => props.size * 0.36)

function point(index, value, total) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total
  const r = radius.value * Math.max(0, Math.min(1, value))
  return {
    x: cx.value + r * Math.cos(angle),
    y: cy.value + r * Math.sin(angle),
  }
}

function polygon(values) {
  const total = values.length || 1
  return values
    .map((v, i) => {
      const p = point(i, v, total)
      return `${p.x},${p.y}`
    })
    .join(' ')
}

const youPolygon = computed(() => polygon(props.axes.map((a) => a.youNorm ?? 0)))
const eloPolygon = computed(() => polygon(props.axes.map((a) => a.eloNorm ?? 0)))

const rings = computed(() =>
  [0.25, 0.5, 0.75, 1].map((scale) => {
    const total = Math.max(props.axes.length, 3)
    return Array.from({ length: total }, (_, i) => {
      const p = point(i, scale, total)
      return `${p.x},${p.y}`
    }).join(' ')
  }),
)

const spokes = computed(() => {
  const total = Math.max(props.axes.length, 3)
  return props.axes.map((_, i) => {
    const p = point(i, 1, total)
    return { x1: cx.value, y1: cy.value, x2: p.x, y2: p.y }
  })
})

const labels = computed(() => {
  const total = Math.max(props.axes.length, 3)
  return props.axes.map((axis, i) => {
    const p = point(i, 1.22, total)
    return {
      ...axis,
      x: p.x,
      y: p.y,
      short: String(axis.label || '')
        .replace('Dégâts aux champions', 'Dégâts')
        .replace('Dégâts subis', 'Subis')
        .replace('Or gagné', 'Or')
        .replace('Vision / wards', 'Vision'),
    }
  })
})
</script>

<template>
  <div class="lol-radar-wrap">
    <svg
      class="lol-radar"
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      role="img"
      aria-label="Comparatif radar même elo"
    >
      <polygon
        v-for="(ring, idx) in rings"
        :key="idx"
        :points="ring"
        class="lol-radar__ring"
      />
      <line
        v-for="(spoke, idx) in spokes"
        :key="`s-${idx}`"
        :x1="spoke.x1"
        :y1="spoke.y1"
        :x2="spoke.x2"
        :y2="spoke.y2"
        class="lol-radar__spoke"
      />
      <polygon :points="eloPolygon" class="lol-radar__elo" />
      <polygon :points="youPolygon" class="lol-radar__you" />
      <text
        v-for="(label, idx) in labels"
        :key="`l-${idx}`"
        :x="label.x"
        :y="label.y"
        class="lol-radar__label"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        {{ label.short }}
      </text>
    </svg>
    <ul v-if="showLegend" class="lol-radar-legend">
      <li>
        <span class="lol-radar-legend__swatch lol-radar-legend__swatch--you" aria-hidden="true" />
        Cette partie
      </li>
      <li>
        <span class="lol-radar-legend__swatch lol-radar-legend__swatch--elo" aria-hidden="true" />
        Moyenne même elo / rôle
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lol-radar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
}

.lol-radar__ring,
.lol-radar__spoke {
  fill: none;
  stroke: rgba(173, 129, 190, 0.28);
  stroke-width: 1;
}

.lol-radar__elo {
  fill: rgba(213, 181, 234, 0.28);
  stroke: rgba(141, 104, 168, 0.9);
  stroke-width: 1.5;
}

.lol-radar__you {
  fill: rgba(114, 160, 152, 0.28);
  stroke: #72a098;
  stroke-width: 2;
}

.lol-radar__label {
  fill: #6d5a7e;
  font-size: 10px;
  font-weight: 700;
}

.lol-radar-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  justify-content: center;
  font-size: 0.78rem;
  font-weight: 650;
  color: #6d5a7e;
}

.lol-radar-legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.lol-radar-legend__swatch {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 3px;
  flex-shrink: 0;
}

.lol-radar-legend__swatch--you {
  background: rgba(114, 160, 152, 0.45);
  border: 2px solid #72a098;
}

.lol-radar-legend__swatch--elo {
  background: rgba(213, 181, 234, 0.45);
  border: 2px solid rgba(141, 104, 168, 0.85);
}

@media (prefers-color-scheme: dark) {
  .lol-radar__label,
  .lol-radar-legend {
    color: #cbb8dc;
  }

  .lol-radar__ring,
  .lol-radar__spoke {
    stroke: rgba(213, 181, 234, 0.22);
  }

  .lol-radar__you {
    fill: rgba(114, 160, 152, 0.35);
  }

  .lol-radar__elo {
    fill: rgba(173, 129, 190, 0.25);
  }
}
</style>
