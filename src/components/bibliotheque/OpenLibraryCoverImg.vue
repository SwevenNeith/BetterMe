<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  fetchOpenLibraryIsbnsForWork,
  googleBooksCoverCandidates,
  openLibraryCoverCandidates,
  readingBookCoverCandidates,
} from '../../services/bibliotheque/openLibrary.js'

const COVER_ATTEMPT_TIMEOUT_MS = 3500

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
  /** Clé work OL pour résoudre des ISBN → Google Books si besoin. */
  workKey: {
    type: String,
    default: null,
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
    default: 'lazy',
  },
})

const emit = defineEmits(['error', 'load'])

const attemptIndex = ref(0)
const dynamicIsbns = ref([])
const exhausted = ref(false)
let attemptTimer = null
let isbnAbort = null

function coverIdFromUrl(url) {
  const raw = String(url ?? '')
  const match =
    raw.match(/\/b\/id\/(\d+)/i) ||
    raw.match(/\/0*(\d{4,})-(?:S|M|L)\.jpg/i) ||
    raw.match(/olcovers\d+[^/]*\/(\d+)-(?:S|M|L)\.jpg/i)
  if (!match) return null
  const id = Number(match[1])
  return Number.isFinite(id) && id > 0 ? id : null
}

function isFlakyHost(url) {
  return /covers\.openlibrary\.org/i.test(url) || /archive\.org\/download\//i.test(url)
}

const allIsbns = computed(() => {
  const list = []
  for (const value of [...(props.isbns || []), props.isbn, ...dynamicIsbns.value]) {
    const clean = String(value ?? '').replace(/[^0-9Xx]/g, '')
    if (clean.length >= 10 && !list.includes(clean)) list.push(clean)
  }
  return list
})

const resolvedCandidates = computed(() => {
  const primary = String(props.src || '').trim()
  const fromProp = (props.candidates || []).filter((u) => typeof u === 'string' && u.trim())
  const inferredId = props.coverId ?? coverIdFromUrl(primary) ?? coverIdFromUrl(fromProp[0])
  const built = openLibraryCoverCandidates(inferredId, props.size, {
    isbns: allIsbns.value,
    includeFlakyHosts: true,
  })
  const reading = readingBookCoverCandidates(
    { coverUrl: primary },
    { isbns: allIsbns.value },
  )

  /** @type {string[]} */
  const reliable = []
  /** @type {string[]} */
  const flaky = []
  const push = (url) => {
    const value = String(url || '').trim()
    if (!value) return
    if (isFlakyHost(value)) {
      if (!flaky.includes(value) && !reliable.includes(value)) flaky.push(value)
    } else if (!reliable.includes(value)) {
      reliable.push(value)
    }
  }

  for (const url of googleBooksCoverCandidates(allIsbns.value, props.size === 'L' ? 2 : 1)) {
    push(url)
  }
  for (const url of built) push(url)
  for (const url of reading) push(url)
  for (const url of fromProp) push(url)
  if (primary) push(primary)

  return [...reliable, ...flaky]
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
    advance('timeout')
  }, COVER_ATTEMPT_TIMEOUT_MS)
}

function advance(_reason) {
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
  advance('error')
}

function onLoad(event) {
  clearAttemptTimer()
  const img = event?.target
  if (img && (img.naturalWidth < 8 || img.naturalHeight < 8)) {
    advance('tiny')
    return
  }
  emit('load', event)
}

async function ensureIsbnsFromWork() {
  isbnAbort?.abort()
  isbnAbort = null
  if (allIsbns.value.length || !props.workKey) return

  isbnAbort = new AbortController()
  try {
    const isbns = await fetchOpenLibraryIsbnsForWork(props.workKey, {
      signal: isbnAbort.signal,
    })
    if (isbns.length) {
      dynamicIsbns.value = isbns
      // Reprend depuis le début pour prioriser Google Books.
      attemptIndex.value = 0
      exhausted.value = false
      scheduleAttemptTimeout()
    }
  } catch {
    /* ignore */
  }
}

watch(
  () => [props.src, props.coverId, props.isbn, props.isbns, props.candidates, props.workKey],
  () => {
    attemptIndex.value = 0
    exhausted.value = false
    dynamicIsbns.value = []
    ensureIsbnsFromWork()
    scheduleAttemptTimeout()
  },
  { immediate: true, deep: true },
)

watch(currentSrc, () => {
  if (currentSrc.value) scheduleAttemptTimeout()
})

onUnmounted(() => {
  clearAttemptTimer()
  isbnAbort?.abort()
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
    @error="onError"
    @load="onLoad"
  />
</template>
