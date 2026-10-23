import { ASPECT_RATIOS, isCustomAspectRatio } from '@/utils/aspectRatioUtils'
import type { ProjectEditorState } from './projectPersistence'

export const APPEARANCE_KEYS = [
  'wallpaper', 'shadowIntensity', 'backgroundBlur', 'zoomMotionBlur',
  'connectZooms', 'showCursor', 'loopCursor', 'cursorSize', 'cursorSmoothing',
  'cursorMotionBlur', 'cursorClickBounce', 'borderRadius', 'padding', 'cropRegion', 'aspectRatio',
] as const satisfies readonly (keyof ProjectEditorState)[]

export type EditorAppearance = Pick<ProjectEditorState, (typeof APPEARANCE_KEYS)[number]>

export interface AppearancePreset {
  id: string
  name: string
  appearance: EditorAppearance
}

export const BUILT_IN_STYLES = [
  { id: 'studio', tr: 'Stüdyo', en: 'Studio', background: 'linear-gradient(135deg, #b8b1ed, #e4b7aa)', padding: 48, borderRadius: 18, shadowIntensity: 0.6, aspectRatio: '16:9' },
  { id: 'midnight', tr: 'Gece', en: 'Midnight', background: 'linear-gradient(135deg, #141428, #483b6a)', padding: 40, borderRadius: 14, shadowIntensity: 0.8, aspectRatio: '16:9' },
  { id: 'minimal', tr: 'Sade', en: 'Minimal', background: '#f0f0f3', padding: 30, borderRadius: 8, shadowIntensity: 0.3, aspectRatio: '16:9' },
  { id: 'social', tr: 'Dikey', en: 'Vertical', background: 'linear-gradient(150deg, #e7c4d8, #a5b8e4)', padding: 35, borderRadius: 20, shadowIntensity: 0.45, aspectRatio: '9:16' },
] as const

export function parseSavedPresets(raw: string | null): AppearancePreset[] {
  try {
    const data: unknown = JSON.parse(raw || '[]')
    if (!Array.isArray(data)) return []
    return data.filter((entry): entry is AppearancePreset => {
      if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || typeof entry.name !== 'string') return false
      const a = entry.appearance
      if (!a || typeof a !== 'object') return false
      return APPEARANCE_KEYS.every((key) => key in a)
        && typeof a.wallpaper === 'string'
        && typeof a.aspectRatio === 'string' && ((ASPECT_RATIOS as readonly string[]).includes(a.aspectRatio) || isCustomAspectRatio(a.aspectRatio))
        && ['connectZooms', 'showCursor', 'loopCursor'].every((key) => typeof a[key] === 'boolean')
        && ['shadowIntensity', 'backgroundBlur', 'zoomMotionBlur', 'cursorSize', 'cursorSmoothing', 'cursorMotionBlur', 'cursorClickBounce', 'borderRadius', 'padding'].every((key) => Number.isFinite(a[key]) && a[key] >= 0 && a[key] <= 200)
        && a.cropRegion && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(a.cropRegion[key]) && a.cropRegion[key] >= 0 && a.cropRegion[key] <= 1)
    }).slice(0, 6)
  } catch { return [] }
}
