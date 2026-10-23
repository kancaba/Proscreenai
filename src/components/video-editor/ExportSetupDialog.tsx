import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useI18n, useScopedT } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'
import { Film, Image } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { OutputSizeControls } from './OutputSizeControls'
import { GIF_FRAME_RATES, GIF_SIZE_PRESETS, type GifSizePreset } from '@/lib/exporter'
import type { SettingsPanelProps } from './SettingsPanel'
export function ExportSetupDialog({ open, onOpenChange, onStart, ...props }: SettingsPanelProps & { open: boolean; onOpenChange: (open: boolean) => void; onStart: () => void }) {
  const { locale } = useI18n(); const tSettings = useScopedT('settings'); const tr = locale === 'tr'
  const { exportFormat = 'mp4', onExportFormatChange, exportQuality = 'source', onExportQualityChange, exportResolution, onExportResolutionChange, exportFps, onExportFpsChange, exportCustomWidth, exportCustomHeight, onExportCustomSizeChange, videoElement, aspectRatio, gifFrameRate = 15, onGifFrameRateChange, gifSizePreset = 'medium', onGifSizePresetChange, gifLoop = true, onGifLoopChange, gifOutputDimensions = {width:1280,height:720} } = props
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent data-testid="export-setup" className="max-h-[85vh] max-w-lg overflow-y-auto border-white/10 bg-[#15151c] text-white"><DialogHeader><DialogTitle>{tr ? 'Videoyu dışa aktar' : 'Export video'}</DialogTitle><DialogDescription>{tr ? 'Çıktı boyutunu ve kalitesini seçin. Aktarım siz başlatınca çalışır.' : 'Choose your output settings, then start the export.'}</DialogDescription></DialogHeader>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => onExportFormatChange?.('mp4')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-all text-xs font-medium",
              exportFormat === 'mp4'
                ? "bg-[#2563EB]/10 border-[#2563EB]/50 text-white"
                : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            )}
          >
            <Film className="w-3.5 h-3.5" />
            {tSettings('export.mp4')}
          </button>
          <button
            onClick={() => onExportFormatChange?.('gif')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-all text-xs font-medium",
              exportFormat === 'gif'
                ? "bg-[#2563EB]/10 border-[#2563EB]/50 text-white"
                : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            )}
          >
            <Image className="w-3.5 h-3.5" />
            {tSettings('export.gif')}
          </button>
        </div>

        {exportFormat === 'mp4' && <OutputSizeControls exportResolution={exportResolution} onExportResolutionChange={onExportResolutionChange} exportFps={exportFps} onExportFpsChange={onExportFpsChange} exportCustomWidth={exportCustomWidth} exportCustomHeight={exportCustomHeight} onExportCustomSizeChange={onExportCustomSizeChange} video={videoElement} aspectRatio={aspectRatio} quality={exportQuality} />}
        {exportFormat === 'mp4' && <p className="mb-1 text-[10px] text-slate-400">{locale === 'tr' ? 'Sıkıştırma kalitesi' : 'Compression quality'}</p>}
        {exportFormat === 'mp4' && (
          <div className="mb-3 bg-white/5 border border-white/5 p-0.5 w-full grid grid-cols-4 h-7 rounded-lg">
            <button
              onClick={() => onExportQualityChange?.('medium')}
              className={cn(
                "rounded-md transition-all text-[10px] font-medium",
                exportQuality === 'medium' ? "bg-white text-black" : "text-slate-400 hover:text-slate-200"
              )}
            >
              {tSettings('export.quality.low')}
            </button>
            <button
              onClick={() => onExportQualityChange?.('good')}
              className={cn(
                "rounded-md transition-all text-[10px] font-medium",
                exportQuality === 'good' ? "bg-white text-black" : "text-slate-400 hover:text-slate-200"
              )}
            >
              {tSettings('export.quality.medium')}
            </button>
            <button
              onClick={() => onExportQualityChange?.('high')}
              className={cn(
                "rounded-md transition-all text-[10px] font-medium",
                exportQuality === 'high' ? "bg-white text-black" : "text-slate-400 hover:text-slate-200"
              )}
            >
              {tSettings('export.quality.high')}
            </button>
            <button
              onClick={() => onExportQualityChange?.('source')}
              className={cn(
                "rounded-md transition-all text-[10px] font-medium",
                exportQuality === 'source' ? "bg-white text-black" : "text-slate-400 hover:text-slate-200"
              )}
            >
              {locale === 'tr' ? 'En yüksek' : 'Maximum'}
            </button>
          </div>
        )}

        {exportFormat === 'gif' && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white/5 border border-white/5 p-0.5 grid grid-cols-4 h-7 rounded-lg">
                {GIF_FRAME_RATES.map((rate) => (
                  <button
                    key={rate.value}
                    onClick={() => onGifFrameRateChange?.(rate.value)}
                    className={cn(
                      "rounded-md transition-all text-[10px] font-medium",
                      gifFrameRate === rate.value ? "bg-white text-black" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {rate.value}
                  </button>
                ))}
              </div>
              <div className="flex-1 bg-white/5 border border-white/5 p-0.5 grid grid-cols-3 h-7 rounded-lg">
                {Object.entries(GIF_SIZE_PRESETS).map(([key, _preset]) => (
                  <button
                    key={key}
                    onClick={() => onGifSizePresetChange?.(key as GifSizePreset)}
                    className={cn(
                      "rounded-md transition-all text-[10px] font-medium",
                      gifSizePreset === key ? "bg-white text-black" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {key === 'original' ? 'Orig' : key.charAt(0).toUpperCase() + key.slice(1, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">{gifOutputDimensions.width} × {gifOutputDimensions.height}px</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">{tSettings('export.loop')}</span>
                <Switch
                  checked={gifLoop}
                  onCheckedChange={onGifLoopChange}
                  className="data-[state=checked]:bg-[#2563EB] scale-75"
                />
              </div>
            </div>
          </div>
        )}

<div className="flex justify-end gap-2 border-t border-white/10 pt-4"><button onClick={() => onOpenChange(false)} className="rounded-lg px-4 py-2 text-sm text-slate-400">{tr ? 'Vazgeç' : 'Cancel'}</button><button data-testid="confirm-export" onClick={onStart} className="rounded-lg bg-violet-300 px-5 py-2 text-sm font-semibold text-black">{tr ? 'Dışa aktarmayı başlat' : 'Start export'}</button></div></DialogContent></Dialog>
}
