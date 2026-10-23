import { useEffect, useState } from 'react'
import { RESOLUTIONS, fitCustomSizeToRatio, outputDimensions, validDimensions, type ResolutionPreset, type VideoFps } from '@/lib/video/outputSettings'
import { getAspectRatioValue, type AspectRatio } from '@/utils/aspectRatioUtils'
import { useI18n } from '@/contexts/I18nContext'
export interface OutputSizeProps {
  exportResolution?: ResolutionPreset; onExportResolutionChange?: (value: ResolutionPreset) => void
  exportFps?: VideoFps; onExportFpsChange?: (value: VideoFps) => void
  exportCustomWidth?: number; exportCustomHeight?: number
  onExportCustomSizeChange?: (width: number, height: number) => void
}
export function OutputSizeControls({ exportResolution = 'source', onExportResolutionChange, exportFps = 60, onExportFpsChange, exportCustomWidth = 1920, exportCustomHeight = 1080, onExportCustomSizeChange, video, aspectRatio, quality }: OutputSizeProps & { video?: HTMLVideoElement | null; aspectRatio: AspectRatio; quality: string }) {
  const { locale } = useI18n(); const tr = locale === 'tr'
  const [width, setWidth] = useState(String(exportCustomWidth)); const [height, setHeight] = useState(String(exportCustomHeight)); const [invalid, setInvalid] = useState(false)
  useEffect(() => { setWidth(String(exportCustomWidth)); setHeight(String(exportCustomHeight)); setInvalid(false) }, [exportCustomWidth, exportCustomHeight]);
  const sw = video?.videoWidth || 1920, sh = video?.videoHeight || 1080
  const ratio = getAspectRatioValue(aspectRatio, sw / sh)
  const dimensions = outputDimensions(sw, sh, ratio, exportResolution, exportCustomWidth, exportCustomHeight, quality)
  // Switching to a custom size starts from the current output, unless it is outside the custom limits.
  const customStart = validDimensions(dimensions.width, dimensions.height) ? dimensions : fitCustomSizeToRatio(exportCustomWidth, exportCustomHeight, ratio)
  const upscaled = dimensions.width > sw || dimensions.height > sh
  const selectClass = 'mt-1 w-full rounded-md border border-white/10 bg-[#181820] p-2 text-xs text-white outline-none focus:border-violet-300'
  return <section className="mb-3 space-y-2 rounded-xl border border-white/10 p-3" aria-label={tr ? 'Çıktı ölçüleri' : 'Output dimensions'}>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs text-slate-400">{tr ? 'Çözünürlük' : 'Resolution'}<select data-testid="export-resolution" aria-label={tr ? 'Çıktı çözünürlüğü' : 'Output resolution'} className={selectClass} value={exportResolution} onChange={event => { onExportResolutionChange?.(event.target.value as ResolutionPreset); if (event.target.value === 'custom') onExportCustomSizeChange?.(customStart.width, customStart.height) }}>
        {exportResolution === 'legacy' && <option value="legacy">{tr ? 'Projede kayıtlı' : 'Saved in project'}</option>}
        {RESOLUTIONS.map(option => <option key={option.value} value={option.value}>{option.value === 'source' ? (tr ? 'Orijinal' : 'Source') : option.value === 'custom' ? (tr ? 'Özel ölçü' : 'Custom') : option.label}</option>)}
      </select></label>
      <label className="text-xs text-slate-400">FPS<select data-testid="export-fps" aria-label="Export FPS" className={selectClass} value={exportFps} onChange={event => onExportFpsChange?.(Number(event.target.value) as VideoFps)}><option value="30">30 FPS</option><option value="60">60 FPS</option></select></label>
    </div>
    {exportResolution === 'custom' && <form onSubmit={event => { event.preventDefault(); const w = Number(width), h = Number(height); setInvalid(!validDimensions(w, h)); if (validDimensions(w, h)) onExportCustomSizeChange?.(w, h) }}>
      <div className="grid grid-cols-2 gap-2">{[{name:tr ? 'Genişlik' : 'Width', value:width, set:setWidth}, {name:tr ? 'Yükseklik' : 'Height',value:height,set:setHeight}].map(field => <label key={field.name} className="text-xs text-slate-400">{field.name}<input aria-invalid={invalid} type="number" min="64" max="4096" step="2" className={selectClass} value={field.value} onChange={event => field.set(event.target.value)} /></label>)}</div>
      {invalid && <p role="alert" className="mt-1 text-xs text-red-300">{tr ? '64–4096 arasında çift sayılar girin.' : 'Enter even numbers from 64 to 4096.'}</p>}
      <button type="submit" className="mt-2 rounded bg-violet-300/15 px-2 py-1 text-xs text-violet-200">{tr ? 'Ölçüyü uygula' : 'Apply size'}</button>
    </form>}
    <p data-testid="export-dimensions" className="text-xs text-violet-200">{dimensions.width} × {dimensions.height} px · {exportFps} FPS</p>
    <p className="text-[10px] text-slate-500">{tr ? 'Kaynak' : 'Source'}: {sw} × {sh} px</p>
    {upscaled && <p className="text-[10px] text-amber-300">{tr ? 'Kaynak büyütülecek; yeni görüntü ayrıntısı oluşmaz.' : 'Upscaling does not add source detail.'}</p>}
  </section>
}
