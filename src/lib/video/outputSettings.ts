export type ResolutionPreset = 'source' | '720' | '1080' | '1440' | '2160' | 'custom' | 'legacy'
export type VideoFps = 30 | 60
export const RESOLUTIONS = [
  { value: 'source', label: 'Orijinal' }, { value: '720', label: '720p' },
  { value: '1080', label: '1080p · Full HD' }, { value: '1440', label: '1440p · QHD' },
  { value: '2160', label: '2160p · 4K' }, { value: 'custom', label: 'Özel ölçü' },
] as const
export function validDimensions(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width >= 64 && height >= 64 && width <= 4096 && height <= 4096 && width % 2 === 0 && height % 2 === 0
}
const even = (value: number) => Math.max(2, Math.round(value / 2) * 2)
/** True when a width/height pair already has this aspect ratio (within 1%). */
export function matchesRatio(width: number, height: number, ratio: number) {
  return ratio > 0 && height > 0 && Math.abs(width / height - ratio) / ratio < 0.01
}
/** Reshapes a custom export size to an aspect ratio, keeping its long side where possible. */
export function fitCustomSizeToRatio(width: number, height: number, ratio: number) {
  if (!(ratio > 0) || matchesRatio(width, height, ratio)) return { width, height }
  const long = Math.min(4096, Math.max(64, width, height))
  let next = ratio >= 1 ? { width: long, height: long / ratio } : { width: long * ratio, height: long }
  const short = Math.min(next.width, next.height)
  if (short < 64) next = { width: next.width * 64 / short, height: next.height * 64 / short }
  const fitted = { width: Math.min(4096, even(next.width)), height: Math.min(4096, even(next.height)) }
  return validDimensions(fitted.width, fitted.height) ? fitted : { width, height }
}
export function outputDimensions(sourceWidth: number, sourceHeight: number, ratio: number, preset: ResolutionPreset, customWidth = 1920, customHeight = 1080, quality = 'source') {
  if (![sourceWidth, sourceHeight, ratio].every(value => Number.isFinite(value) && value > 0)) throw new Error('Geçersiz video ölçüsü')
  if (preset === 'custom') {
    if (!validDimensions(customWidth, customHeight)) throw new Error('Ölçüler 64–4096 arasında çift sayılar olmalı')
    return { width: customWidth, height: customHeight }
  }
  if (preset === 'source' || preset === 'legacy') {
    if (preset === 'legacy' && quality === 'source') {
      if (ratio === 1) { const side = even(Math.min(sourceWidth, sourceHeight)); return { width: side, height: side } }
      return ratio > 1 ? { width: even(sourceWidth), height: even(sourceWidth / ratio) } : { width: even(sourceHeight * ratio), height: even(sourceHeight) }
    }
    const scale = preset === 'legacy' ? (({ medium: .6, good: .75, high: .9 } as Record<string, number>)[quality] ?? 1) : 1
    const width = sourceWidth * scale, height = sourceHeight * scale
    return ratio >= width / height ? { width: even(width), height: even(width / ratio) } : { width: even(height * ratio), height: even(height) }
  }
  const short = Number(preset)
  const long = short * 16 / 9
  if (ratio >= 1) { const height = Math.min(short, long / ratio); return { width: even(height * ratio), height: even(height) } }
  const width = Math.min(short, long * ratio); return { width: even(width), height: even(width / ratio) }
}
// Capture preserves the source aspect ratio and never enlarges a small window.
export function captureLimits(preset: string) {
  const short = ['720', '1080', '1440', '2160'].includes(preset) ? Number(preset) : 0
  return short ? { maxWidth: Math.round(short * 16 / 9), maxHeight: short } : { maxWidth: 0, maxHeight: 0 }
}
export function exportBitrate(width: number, height: number, fps: VideoFps, quality: string) {
  const bpp = ({ medium: .08, good: .14, high: .22, source: .32 } as Record<string, number>)[quality] ?? .14
  return Math.round(Math.max(2_000_000, Math.min(120_000_000, width * height * fps * bpp)))
}
