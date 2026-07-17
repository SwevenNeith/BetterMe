<script setup>
defineProps({
  edit: {
    type: Boolean,
    default: false,
  },
  inline: {
    type: Boolean,
    default: false,
  },
  /** Affiche la section Spoil (popup uniquement). */
  showSpoil: {
    type: Boolean,
    default: true,
  },
})
</script>

<template>
  <div
    class="reading-fiche"
    :class="{
      'reading-fiche--inline': inline,
      'reading-fiche--edit': edit,
      'reading-fiche--no-spoil': !showSpoil,
    }"
  >
    <header class="reading-fiche-header">
      <h2 class="reading-fiche-title">Fiche de Lecture</h2>
      <div v-if="$slots.actions" class="reading-fiche-actions">
        <slot name="actions" />
      </div>
    </header>

    <slot name="alert" />

    <div class="reading-fiche-top">
      <div class="reading-fiche-info">
        <slot name="info" />
      </div>

      <div class="reading-fiche-polaroid">
        <span class="reading-fiche-tape reading-fiche-tape--tl" aria-hidden="true" />
        <span class="reading-fiche-tape reading-fiche-tape--br" aria-hidden="true" />
        <div class="reading-fiche-polaroid-inner">
          <slot name="cover" />
        </div>
      </div>
    </div>

    <slot name="cover-controls" />

    <section class="reading-fiche-section">
      <h3 class="reading-fiche-section-title">À propos</h3>
      <slot name="about" />
    </section>

    <section class="reading-fiche-section">
      <h3 class="reading-fiche-section-title reading-fiche-section-title--boxed">Commentaires</h3>
      <div class="reading-fiche-box reading-fiche-box--comments">
        <slot name="comments" />
      </div>
    </section>

    <div class="reading-fiche-bottom">
      <section v-if="showSpoil" class="reading-fiche-section reading-fiche-section--half">
        <h3 class="reading-fiche-section-title reading-fiche-section-title--boxed">Spoil</h3>
        <div class="reading-fiche-box reading-fiche-box--spoil">
          <slot name="spoil" />
        </div>
      </section>

      <section class="reading-fiche-section" :class="{ 'reading-fiche-section--half': showSpoil }">
        <h3 class="reading-fiche-section-title">Citation</h3>
        <div class="reading-fiche-box reading-fiche-box--quote">
          <span class="reading-fiche-quote-mark reading-fiche-quote-mark--open" aria-hidden="true">“</span>
          <slot name="quote" />
          <span class="reading-fiche-quote-mark reading-fiche-quote-mark--close" aria-hidden="true">”</span>
        </div>
      </section>
    </div>

    <slot name="footer" />
  </div>
</template>

<style>
.reading-fiche {
  width: min(820px, 100%);
  max-height: min(92vh, 920px);
  overflow: auto;
  padding: 1.35rem 1.45rem 1.6rem;
  border: 1px solid rgba(173, 129, 190, 0.45);
  border-radius: 18px;
  background: linear-gradient(180deg, #fffefb 0%, #faf6ff 100%);
  box-shadow: 0 18px 50px rgba(92, 62, 112, 0.16);
  box-sizing: border-box;
}

.reading-fiche--inline {
  margin: 0 auto 1.25rem;
  max-height: none;
  box-shadow: 0 8px 28px rgba(92, 62, 112, 0.1);
}

.reading-fiche-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.1rem;
}

.reading-fiche-title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.75rem, 4vw, 2.35rem);
  font-weight: 700;
  color: #3d2f4a;
  line-height: 1.1;
}

.reading-fiche-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.reading-fiche-icon-btn,
.reading-fiche-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease;
}

.reading-fiche-icon-btn svg {
  width: 1.05rem;
  height: 1.05rem;
}

.reading-fiche-icon-btn--edit {
  color: #e67e22;
}

.reading-fiche-icon-btn--edit:hover:not(:disabled) {
  background: rgba(230, 126, 34, 0.12);
}

.reading-fiche-icon-btn--delete {
  color: #dc3545;
}

.reading-fiche-icon-btn--delete:hover:not(:disabled) {
  background: rgba(220, 53, 69, 0.1);
}

.reading-fiche-close {
  color: #7a6b86;
  font-size: 0.95rem;
}

.reading-fiche-close:hover:not(:disabled) {
  background: rgba(173, 129, 190, 0.15);
}

.reading-fiche-icon-btn:disabled,
.reading-fiche-close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reading-fiche-error {
  margin-bottom: 0.75rem;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.1);
  color: #b02a37;
  font-size: 0.88rem;
}

.reading-fiche-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(130px, 190px);
  gap: 1rem;
  align-items: start;
  margin-bottom: 1rem;
}

.reading-fiche-info {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  background: rgba(244, 234, 252, 0.65);
  border: 1px solid rgba(213, 181, 234, 0.45);
}

.reading-fiche-polaroid {
  position: relative;
  padding: 0.55rem 0.55rem 1.4rem;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 8px 22px rgba(61, 47, 74, 0.14);
  transform: rotate(2.5deg);
}

.reading-fiche-polaroid-inner {
  overflow: hidden;
  border-radius: 2px;
  min-height: 210px;
  background: #f8f4fc;
}

.reading-fiche-tape {
  position: absolute;
  width: 2.4rem;
  height: 0.85rem;
  background: rgba(213, 181, 234, 0.55);
  border: 1px solid rgba(173, 129, 190, 0.35);
  z-index: 2;
}

.reading-fiche-tape--tl {
  top: -0.35rem;
  left: 0.65rem;
  transform: rotate(-18deg);
}

.reading-fiche-tape--br {
  bottom: 0.55rem;
  right: 0.35rem;
  transform: rotate(14deg);
}

.reading-fiche-cover,
.reading-fiche-cover-wrap {
  width: 100%;
  min-height: 210px;
  height: 100%;
  display: block;
}

.reading-fiche-cover {
  object-fit: cover;
}

.reading-fiche-cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 210px;
  padding: 1rem;
  text-align: center;
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
  font-size: 0.82rem;
  color: #8b7a96;
}

.reading-fiche-row,
.reading-fiche-field,
.reading-fiche-edit-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.reading-fiche-row--dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}

.reading-fiche-row--collection {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 0.75rem;
}

.reading-fiche-field--collection {
  flex: 1;
  min-width: 0;
}

.reading-fiche-saga {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  padding: 0.45rem 0.15rem 0.35rem;
  cursor: pointer;
  user-select: none;
}

.reading-fiche-saga__input {
  width: 1.05rem;
  height: 1.05rem;
  accent-color: #ad81be;
  cursor: pointer;
}

.reading-fiche-saga__label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #5a4a68;
}

.reading-fiche-saga:has(.reading-fiche-saga__input:disabled) {
  opacity: 0.65;
  cursor: wait;
}

.reading-fiche-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #5a4a68;
}

.reading-fiche-value {
  font-size: 0.95rem;
  color: #2c2434;
  border-bottom: 1px dashed rgba(173, 129, 190, 0.55);
  padding-bottom: 0.3rem;
  line-height: 1.35;
  word-break: break-word;
  min-height: 1.35rem;
}

.reading-fiche-value--multiline {
  --lined-h: 1.75rem;
  border-bottom: none;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: calc(var(--lined-h) * 3);
  line-height: var(--lined-h);
  font-size: 0.95rem;
  padding: 0;
  color: #2c2434;
  background-color: transparent;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--lined-h) - 1px),
    rgba(173, 129, 190, 0.38) calc(var(--lined-h) - 1px),
    rgba(173, 129, 190, 0.38) var(--lined-h)
  );
  background-size: 100% var(--lined-h);
  background-position: left top;
  background-attachment: local;
}

.reading-fiche-value--empty {
  color: transparent;
  font-style: normal;
}

.reading-fiche-value--empty:focus,
.reading-fiche-value--empty:hover {
  color: transparent;
}

.reading-fiche-section {
  margin-top: 0.95rem;
}

.reading-fiche-section--half {
  min-width: 0;
}

.reading-fiche-section-title {
  margin: 0 0 0.5rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.15rem;
  font-weight: 700;
  color: #3d2f4a;
}

.reading-fiche-section-title--boxed {
  text-align: center;
}

.reading-fiche-about-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.reading-fiche-box {
  border-radius: 16px;
  background: rgba(244, 234, 252, 0.55);
  border: 1px solid rgba(213, 181, 234, 0.4);
  padding: 0.85rem 1rem;
  min-height: 5.5rem;
}

.reading-fiche-box--comments {
  min-height: 7.5rem;
}

.reading-fiche-box--spoil {
  min-height: 6.5rem;
}

.reading-fiche-box--quote {
  position: relative;
  min-height: 6.5rem;
  padding-top: 1.5rem;
}

.reading-fiche-quote-mark {
  position: absolute;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 2.5rem;
  line-height: 1;
  color: rgba(173, 129, 190, 0.35);
  pointer-events: none;
}

.reading-fiche-quote-mark--open {
  top: 0.35rem;
  left: 0.65rem;
}

.reading-fiche-quote-mark--close {
  bottom: 0.2rem;
  right: 0.75rem;
}

.reading-fiche-bottom {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 0.85rem;
  margin-top: 0.95rem;
}

.reading-fiche--no-spoil .reading-fiche-bottom {
  grid-template-columns: 1fr;
}

.reading-fiche-input,
.reading-fiche-textarea,
.reading-fiche-select {
  width: 100%;
  box-sizing: border-box;
  padding: 0.42rem 0.55rem;
  border: 1px solid rgba(173, 129, 190, 0.35);
  border-radius: 8px;
  background: #fff;
  font-size: 0.92rem;
  color: #2c2434;
}

.reading-fiche-textarea {
  --lined-h: 1.75rem;
  min-height: calc(var(--lined-h) * 4);
  resize: vertical;
  line-height: var(--lined-h);
  padding: 0 0.55rem;
  background-color: #fff;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--lined-h) - 1px),
    rgba(173, 129, 190, 0.32) calc(var(--lined-h) - 1px),
    rgba(173, 129, 190, 0.32) var(--lined-h)
  );
  background-size: 100% var(--lined-h);
  background-position: left top;
  background-attachment: local;
}

.reading-fiche-input:focus,
.reading-fiche-textarea:focus,
.reading-fiche-select:focus {
  outline: 2px solid rgba(173, 129, 190, 0.45);
  outline-offset: 1px;
}

.reading-fiche-form-hint {
  margin: 0;
  font-size: 0.76rem;
  color: #8b7a96;
  font-style: italic;
}

.reading-fiche-cover-edit {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-top: 0.35rem;
  padding-top: 0.85rem;
  border-top: 1px dashed rgba(173, 129, 190, 0.35);
}

.reading-fiche-image-mode {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.reading-fiche-mode-btn {
  padding: 0.4rem 0.65rem;
  border: 1px solid rgba(173, 129, 190, 0.35);
  border-radius: 8px;
  background: #fff;
  font-size: 0.8rem;
  font-weight: 700;
  color: #5a4a68;
  cursor: pointer;
}

.reading-fiche-mode-btn--active {
  background: rgba(213, 181, 234, 0.4);
  border-color: #ad81be;
}

.reading-fiche-file-input {
  display: none;
}

.reading-fiche-upload-btn {
  align-self: flex-start;
  padding: 0.45rem 0.7rem;
  border: 1px dashed rgba(173, 129, 190, 0.55);
  border-radius: 8px;
  background: #fff;
  font-size: 0.82rem;
  font-weight: 700;
  color: #6b4f7c;
  cursor: pointer;
}

.reading-fiche-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.reading-fiche-save-btn,
.reading-fiche-cancel-btn,
.reading-fiche-add-btn {
  padding: 0.65rem 0.9rem;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.reading-fiche-save-btn,
.reading-fiche-add-btn {
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.reading-fiche-cancel-btn {
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: #fff;
  color: #5a4a68;
}

.reading-fiche-save-btn:disabled,
.reading-fiche-add-btn:disabled,
.reading-fiche-cancel-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.reading-fiche-placeholder {
  color: #9a8aa6;
  font-style: italic;
  font-size: 0.9rem;
}

@media (max-width: 720px) {
  .reading-fiche-top,
  .reading-fiche-bottom,
  .reading-fiche-about-grid,
  .reading-fiche-row--dates {
    grid-template-columns: 1fr;
  }

  .reading-fiche-polaroid {
    transform: none;
    max-width: 220px;
    margin: 0 auto;
  }
}
</style>
