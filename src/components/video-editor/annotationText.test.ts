import { describe, expect, it, vi } from 'vitest'
import { getAnnotationText, getAnnotationImage } from './annotationText'
import { normalizeProjectEditor } from './projectPersistence'
import { renderAnnotations } from '@/lib/exporter/annotationRenderer'
import { DEFAULT_ANNOTATION_POSITION, DEFAULT_ANNOTATION_SIZE, DEFAULT_ANNOTATION_STYLE, type AnnotationRegion } from './types'

describe('annotation placeholder regression', () => {
  it('keeps image content independent of text retained while switching annotation types', () => {
    expect(getAnnotationImage({ content: 'legacy', imageContent: 'data:image/png;base64,new' })).toBe('data:image/png;base64,new')
    expect(getAnnotationImage({ content: 'data:image/png;base64,legacy' })).toBe('data:image/png;base64,legacy')
    expect(getAnnotationImage({ content: 'data:image/png;base64,old', imageContent: '' })).toBe('')
  })
  it('exports the image even when the annotation retains separate text', async () => {
    let loadedSource = ''
    class MockImage {
      width = 100; height = 100; onload?: () => void
      set src(value: string) { loadedSource = value; this.onload?.() }
    }
    vi.stubGlobal('Image', MockImage)
    try {
      const drawImage = vi.fn()
      await renderAnnotations({ drawImage } as unknown as CanvasRenderingContext2D, [{
        id: 'image-1', type: 'image', content: 'retained text', textContent: 'title',
        imageContent: 'data:image/png;base64,new', startMs: 0, endMs: 1000,
        position: DEFAULT_ANNOTATION_POSITION, size: DEFAULT_ANNOTATION_SIZE,
        style: DEFAULT_ANNOTATION_STYLE, zIndex: 1,
      }], 1280, 720, 500)
      expect(loadedSource).toBe('data:image/png;base64,new')
      expect(drawImage).toHaveBeenCalledOnce()
    } finally { vi.unstubAllGlobals() }
  })
  it('removes old automatically inserted hints', () => {
    expect(getAnnotationText({ content: 'Metninizi yazın…' })).toBe('')
    expect(getAnnotationText({ content: 'Enter text...' })).toBe('')
  })
  it('preserves explicitly typed content, including text matching an old hint', () => {
    expect(getAnnotationText({ content: 'Başlık' })).toBe('Başlık')
    expect(getAnnotationText({ content: 'Metninizi yazın…', textContent: 'Metninizi yazın…' })).toBe('Metninizi yazın…')
  })
  it('does not revive old content after the user clears the text', () => {
    expect(getAnnotationText({ content: 'Old text', textContent: '' })).toBe('')
  })
  it('cleans legacy placeholder content when reopening a project', () => {
    const restored = normalizeProjectEditor({ annotationRegions: [{ id: 'annotation-1', type: 'text', content: 'Metninizi yazın…', startMs: 0, endMs: 1000 }] })
    expect(restored.annotationRegions[0].content).toBe('')
    expect(restored.annotationRegions[0].textContent).toBe('')
  })
  it('makes no canvas draw calls for empty or legacy placeholder annotations', async () => {
    const annotation: AnnotationRegion = {
      id: 'annotation-1', type: 'text', content: '', startMs: 0, endMs: 1000,
      position: DEFAULT_ANNOTATION_POSITION, size: DEFAULT_ANNOTATION_SIZE,
      style: DEFAULT_ANNOTATION_STYLE, zIndex: 1,
    }
    // An empty context deliberately throws if a drawing method is attempted.
    const context = {} as CanvasRenderingContext2D
    await renderAnnotations(context, [annotation], 1280, 720, 500)
    await renderAnnotations(context, [{ ...annotation, content: 'Metninizi yazın…' }], 1280, 720, 500)
  })
})
