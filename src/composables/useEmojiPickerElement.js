const FRENCH_EMOJI_DATA =
  'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@^1/fr/emojibase/data.json'

let frI18n = null
let pickerImportPromise = null

export function loadEmojiPickerElement() {
  if (!pickerImportPromise) {
    pickerImportPromise = Promise.all([
      import('emoji-picker-element'),
      import('emoji-picker-element/i18n/fr.js'),
    ]).then(([, frModule]) => {
      frI18n = frModule.default
    })
  }
  return pickerImportPromise
}

export function configureEmojiPickerElement(pickerEl) {
  if (!pickerEl || !frI18n) return
  pickerEl.i18n = frI18n
}

export { FRENCH_EMOJI_DATA }
