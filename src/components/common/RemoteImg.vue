<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  src: {
    type: String,
    default: null,
  },
  /** URLs de secours si `src` échoue (ordre d’essai). */
  fallbacks: {
    type: Array,
    default: () => [],
  },
  alt: {
    type: String,
    default: '',
  },
  loading: {
    type: String,
    default: 'lazy',
  },
})

const emit = defineEmits(['error'])

const currentSrc = ref('')
const failed = ref(false)
let fallbackIndex = 0

function resetFromProps() {
  fallbackIndex = 0
  failed.value = false
  currentSrc.value = String(props.src || '').trim()
  if (!currentSrc.value) failed.value = true
}

watch(() => [props.src, props.fallbacks], resetFromProps, { immediate: true, deep: true })

function onError() {
  const list = (props.fallbacks || [])
    .map((url) => String(url || '').trim())
    .filter((url) => url && url !== currentSrc.value)

  if (fallbackIndex < list.length) {
    currentSrc.value = list[fallbackIndex]
    fallbackIndex += 1
    return
  }

  failed.value = true
  emit('error')
}
</script>

<template>
  <img
    v-if="!failed && currentSrc"
    :src="currentSrc"
    :alt="alt"
    :loading="loading"
    referrerpolicy="no-referrer"
    @error="onError"
  />
</template>
