type TextAnnotation = { content?: string; textContent?: string }

// Older builds stored the input hint as actual video content. Explicitly typed
// text has textContent set, so preserve it even when it matches one of the hints.
const LEGACY_HINTS = new Set([
  'Enter text...', 'Enter your text...', 'Ingresa tu texto...', '输入文本...',
  'Metninizi yazın…', 'Metninizi yazın...', 'Metininizi yazın…', 'Metininizi yazın...',
])

export function getAnnotationText(annotation: TextAnnotation): string {
  if (typeof annotation.textContent === 'string') return annotation.textContent
  const text = typeof annotation.content === 'string' ? annotation.content : ''
  return LEGACY_HINTS.has(text.trim()) ? '' : text
}

export function getAnnotationImage(annotation: { content?: string; imageContent?: string }): string {
  return typeof annotation.imageContent === 'string' ? annotation.imageContent : annotation.content ?? ''
}
