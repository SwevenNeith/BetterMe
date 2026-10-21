<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  buildReliableCoverCandidates,
  googleCoverUrlsFromIsbns,
  resolveIsbnsForWorkCached,
} from '../../services/bibliotheque/reliableBookCovers.js'

/** Timeout uniquement pour les (rares) URLs non-Google encore tentées. */
const COVER_ATTEMPT_TIMEOUT_MS = 4000

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
    default: 'lazy',
  },
})

const emit = defineEmits(['error', 'load'])

const attemptIndex = ref(0)
const dynamicIsbns = ref([])
const exhausted = ref(false)
let attemptTimer = null
let isbnAbort = null

const allIsbns = computed(() => {
  const list = []
  for (const value of [...(props.isbns || []), props.isbn, ...dynamicIsbns.value]) {
    const clean = String(value ?? '').replace(/[^0-9Xx]/g, '')
    if (clean.length >= 10 && !list.includes(clean)) list.push(clean)
  }
  return list
})

const resolvedCandidates = computed(() => {
  const fromIsbns = googleCoverUrlsFromIsbns(allIsbns.value, props.size)
  return buildReliableCoverCandidates({
    src: props.src,
    candidates: [...fromIsbns, ...(props.candidates || [])],
    isbns: allIsbns.value,
    size: props.size,
  })
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
  // Les URL Google Books content sont en général rapides ; timeout de secours.
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

async function ensureIsbnsFromWork() {
  isbnAbort?.abort()
  isbnAbort = null

  if (allIsbns.value.length) return
  if (!props.workKey || String(props.workKey).startsWith('/google/')) return

  // S’il y a déjà une URL fiable (upload, Google déjà stocké), pas besoin d’ISBN.
  if (resolvedCandidates.value.length) return

  isbnAbort = new AbortController()
  try {
    const isbns = await resolveIsbnsForWorkCached(props.workKey, {
      signal: isbnAbort.signal,
    })
    if (isbns.length) {
      dynamicIsbns.value = isbns
      attemptIndex.value = 0
      exhausted.value = false
      scheduleAttemptTimeout()
    } else if (!resolvedCandidates.value.length) {
      exhausted.value = true
      emit('error')
    }
  } catch {
    if (!resolvedCandidates.value.length) {
      exhausted.value = true
      emit('error')
    }
  }
}

watch(
  () => [props.src, props.isbn, props.isbns, props.candidates, props.workKey, props.size],
  () => {
    attemptIndex.value = 0
    exhausted.value = false
    dynamicIsbns.value = []
    scheduleAttemptTimeout()
    void ensureIsbnsFromWork()
  },
  { immediate: true, deep: true },
)

watch(currentSrc, () => {
  if (currentSrc.value) scheduleAttemptTimeout()
  else if (!exhausted.value && !resolvedCandidates.value.length) {
    // En attente des ISBN async
  }
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
