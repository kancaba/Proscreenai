import { type OutputSizeProps } from './OutputSizeControls';
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { getAssetPath, getRenderableAssetUrl } from "@/lib/assetPath";
import { BUILT_IN_WALLPAPERS, WALLPAPER_PATHS, WALLPAPER_RELATIVE_PATHS } from "@/lib/wallpapers";
import { SliderControl } from "./SliderControl";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import Block from '@uiw/react-color-block';
import { Trash2, Crop, X, Upload, Sparkles, Palette, Save, FolderOpen, SlidersHorizontal, MousePointer2, Layers, AudioLines, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useI18n, useScopedT } from "../../contexts/I18nContext";
import type { ZoomDepth, CropRegion, AnnotationAnimation, AnnotationRegion, AnnotationType, PlaybackSpeed } from "./types";
import { SPEED_OPTIONS, DEFAULT_CURSOR_SIZE, DEFAULT_CURSOR_SMOOTHING, DEFAULT_CURSOR_MOTION_BLUR, DEFAULT_CURSOR_CLICK_BOUNCE, ZOOM_MOTION_BLUR_ON } from "./types";
import { CropControl } from "./CropControl";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { AnnotationSettingsPanel } from "./AnnotationSettingsPanel";
import { type AspectRatio } from "@/utils/aspectRatioUtils";
import type { ExportQuality, ExportFormat, GifFrameRate, GifSizePreset } from "@/lib/exporter";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FADE_CHOICES_MS, type Fades } from "@/lib/fades";
const GRADIENTS = [
  "linear-gradient( 111.6deg,  rgba(114,167,232,1) 9.4%, rgba(253,129,82,1) 43.9%, rgba(253,129,82,1) 54.8%, rgba(249,202,86,1) 86.3% )",
  "linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)",
  "radial-gradient( circle farthest-corner at 3.2% 49.6%,  rgba(80,12,139,0.87) 0%, rgba(161,10,144,0.72) 83.6% )",
  "linear-gradient( 111.6deg,  rgba(0,56,68,1) 0%, rgba(163,217,185,1) 51.5%, rgba(231, 148, 6, 1) 88.6% )",
  "linear-gradient( 107.7deg,  rgba(235,230,44,0.55) 8.4%, rgba(252,152,15,1) 90.3% )",
  "linear-gradient( 91deg,  rgba(72,154,78,1) 5.2%, rgba(251,206,70,1) 95.9% )",
  "radial-gradient( circle farthest-corner at 10% 20%,  rgba(2,37,78,1) 0%, rgba(4,56,126,1) 19.7%, rgba(85,245,221,1) 100.2% )",
  "linear-gradient( 109.6deg,  rgba(15,2,2,1) 11.2%, rgba(36,163,190,1) 91.1% )",
  "linear-gradient(135deg, #FBC8B4, #2447B1)",
  "linear-gradient(109.6deg, #F635A6, #36D860)",
  "linear-gradient(90deg, #FF0101, #4DFF01)",
  "linear-gradient(315deg, #EC0101, #5044A9)",
  "linear-gradient(45deg, #ff9a9e 0%, #fad0c4 99%, #fad0c4 100%)",
  "linear-gradient(to top, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%)",
  "linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)",
  "linear-gradient(to right, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(to top, #fcc5e4 0%, #fda34b 15%, #ff7882 35%, #c8699e 52%, #7046aa 71%, #0c1db8 87%, #020f75 100%)",
  "linear-gradient(to right, #fa709a 0%, #fee140 100%)",
  "linear-gradient(to top, #30cfd0 0%, #330867 100%)",
  "linear-gradient(to top, #c471f5 0%, #fa71cd 100%)",
  "linear-gradient(to right, #f78ca0 0%, #f9748f 19%, #fd868c 60%, #fe9a8b 100%)",
  "linear-gradient(to top, #48c6ef 0%, #6f86d6 100%)",
  "linear-gradient(to right, #0acffe 0%, #495aff 100%)",
];

export interface SettingsPanelProps extends OutputSizeProps {
  header?: React.ReactNode;
  presets?: React.ReactNode;
  aiPanel?: React.ReactNode;
  autoZoomControls?: React.ReactNode;
  /** The recording's own sound: 0 (muted) to 1. */
  sourceAudioVolume?: number;
  onSourceAudioVolumeChange?: (volume: number) => void;
  /** Optional fade from/to black at the start and end of the video. */
  fades?: Fades;
  onFadeChange?: (key: keyof Fades, ms: number) => void;
  /** Switches to a tab (and scrolls to its target) when the nonce changes. */
  focusRequest?: { tab: "motion"; target: "auto-zoom"; nonce: number } | null;
  /** A part of the video is selected; its card (speed, cut) shows on the Motion tab. */
  hasSelectedClipPart?: boolean;
  selectedAudioId?: string | null;
  selected: string;
  onWallpaperChange: (path: string) => void;
  selectedZoomDepth?: ZoomDepth | null;
  onZoomDepthChange?: (depth: ZoomDepth) => void;
  selectedZoomId?: string | null;
  onZoomDelete?: (id: string) => void;
  selectedTrimId?: string | null;
  onTrimDelete?: (id: string) => void;
  shadowIntensity?: number;
  onShadowChange?: (intensity: number) => void;
  backgroundBlur?: number;
  onBackgroundBlurChange?: (amount: number) => void;
  zoomMotionBlur?: number;
  onZoomMotionBlurChange?: (amount: number) => void;
  connectZooms?: boolean;
  onConnectZoomsChange?: (enabled: boolean) => void;
  showCursor?: boolean;
  onShowCursorChange?: (enabled: boolean) => void;
  loopCursor?: boolean;
  onLoopCursorChange?: (enabled: boolean) => void;
  cursorSize?: number;
  onCursorSizeChange?: (size: number) => void;
  cursorSmoothing?: number;
  onCursorSmoothingChange?: (smoothing: number) => void;
  cursorMotionBlur?: number;
  onCursorMotionBlurChange?: (amount: number) => void;
  cursorClickBounce?: number;
  onCursorClickBounceChange?: (amount: number) => void;
  borderRadius?: number;
  onBorderRadiusChange?: (radius: number) => void;
  padding?: number;
  onPaddingChange?: (padding: number) => void;
  cropRegion?: CropRegion;
  onCropChange?: (region: CropRegion) => void;
  aspectRatio: AspectRatio;
  videoElement?: HTMLVideoElement | null;
  exportQuality?: ExportQuality;
  onExportQualityChange?: (quality: ExportQuality) => void;
  // Export format settings
  exportFormat?: ExportFormat;
  onExportFormatChange?: (format: ExportFormat) => void;
  gifFrameRate?: GifFrameRate;
  onGifFrameRateChange?: (rate: GifFrameRate) => void;
  gifLoop?: boolean;
  onGifLoopChange?: (loop: boolean) => void;
  gifSizePreset?: GifSizePreset;
  onGifSizePresetChange?: (preset: GifSizePreset) => void;
  gifOutputDimensions?: { width: number; height: number };
  onSaveProject?: () => void;
  onLoadProject?: () => void;
  onExport?: () => void;
  selectedAnnotationId?: string | null;
  annotationRegions?: AnnotationRegion[];
  onAnnotationContentChange?: (id: string, content: string) => void;
  onAnnotationTypeChange?: (id: string, type: AnnotationType) => void;
  onAnnotationStyleChange?: (id: string, style: Partial<AnnotationRegion['style']>) => void;
  onAnnotationAnimationChange?: (id: string, animation: AnnotationAnimation | undefined) => void;
  onAnnotationFigureDataChange?: (id: string, figureData: any) => void;
  onAnnotationDelete?: (id: string) => void;
  selectedSpeedId?: string | null;
  selectedSpeedValue?: PlaybackSpeed | null;
  onSpeedChange?: (speed: PlaybackSpeed) => void;
  onSpeedDelete?: (id: string) => void;
}

export default SettingsPanel;

const ZOOM_DEPTH_OPTIONS: Array<{ depth: ZoomDepth; label: string }> = [
  { depth: 1, label: "1.25×" },
  { depth: 2, label: "1.5×" },
  { depth: 3, label: "1.8×" },
  { depth: 4, label: "2.2×" },
  { depth: 5, label: "3.5×" },
  { depth: 6, label: "5×" },
];

export function SettingsPanel({
  header, presets, aiPanel, autoZoomControls, focusRequest, hasSelectedClipPart = false, sourceAudioVolume = 1, onSourceAudioVolumeChange, fades, onFadeChange, selectedAudioId,
  selected,
  onWallpaperChange,
  selectedZoomDepth,
  onZoomDepthChange,
  selectedZoomId,
  onZoomDelete,
  selectedTrimId,
  onTrimDelete,
  shadowIntensity = 0.67,
  onShadowChange,
  backgroundBlur = 0,
  onBackgroundBlurChange,
  zoomMotionBlur = 0,
  onZoomMotionBlurChange,
  connectZooms = true,
  onConnectZoomsChange,
  showCursor = false,
  onShowCursorChange,
  loopCursor = false,
  onLoopCursorChange,
  cursorSize = 5,
  onCursorSizeChange,
  cursorSmoothing = 2,
  onCursorSmoothingChange,
  cursorMotionBlur = 0.35,
  onCursorMotionBlurChange,
  cursorClickBounce = 1,
  onCursorClickBounceChange,
  borderRadius = 12.5,
  onBorderRadiusChange,
  padding = 50,
  onPaddingChange,
  cropRegion,
  onCropChange,
  aspectRatio,
  videoElement,
  onSaveProject,
  onLoadProject,
  selectedAnnotationId,
  annotationRegions = [],
  onAnnotationContentChange,
  onAnnotationTypeChange,
  onAnnotationStyleChange,
  onAnnotationAnimationChange,
  onAnnotationFigureDataChange,
  onAnnotationDelete,
  selectedSpeedId,
  selectedSpeedValue,
  onSpeedChange,
  onSpeedDelete,
}: SettingsPanelProps) {
  const tSettings = useScopedT('settings');
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = useState('appearance');
  useEffect(() => { if (selectedAnnotationId) setActiveTab('item'); else if (selectedAudioId) setActiveTab('audio'); else if (selectedZoomId || selectedSpeedId || selectedTrimId || hasSelectedClipPart) setActiveTab('motion'); }, [selectedAnnotationId, selectedAudioId, selectedZoomId, selectedSpeedId, selectedTrimId, hasSelectedClipPart]);
  const autoZoomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusRequest) return;
    setActiveTab(focusRequest.tab);
    requestAnimationFrame(() => autoZoomRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [focusRequest]);
  const [wallpaperPreviewPaths, setWallpaperPreviewPaths] = useState<string[]>([]);
  const [customImages, setCustomImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const resolved = await Promise.all(
          WALLPAPER_RELATIVE_PATHS.map(async (path) => getRenderableAssetUrl(await getAssetPath(path)))
        )
        if (mounted) setWallpaperPreviewPaths(resolved)
      } catch (err) {
        if (mounted) setWallpaperPreviewPaths(WALLPAPER_PATHS)
      }
    })()
    return () => { mounted = false }
  }, [])
  const colorPalette = [
    '#FF0000', '#FFD700', '#00FF00', '#FFFFFF', '#0000FF', '#FF6B00',
    '#9B59B6', '#E91E63', '#00BCD4', '#FF5722', '#8BC34A', '#FFC107',
    '#2563EB', '#000000', '#607D8B', '#795548',
  ];

  const [selectedColor, setSelectedColor] = useState('#ADADAD');
  const [gradient, setGradient] = useState<string>(GRADIENTS[0]);
  const [showCropModal, setShowCropModal] = useState(false);
  const cropSnapshotRef = useRef<CropRegion | null>(null);

  const zoomEnabled = Boolean(selectedZoomDepth);
  const trimEnabled = Boolean(selectedTrimId);

  const handleDeleteClick = () => {
    if (selectedZoomId && onZoomDelete) {
      onZoomDelete(selectedZoomId);
    }
  };

  const handleTrimDeleteClick = () => {
    if (selectedTrimId && onTrimDelete) {
      onTrimDelete(selectedTrimId);
    }
  };

  const handleCropToggle = () => {
    if (!showCropModal && cropRegion) {
      cropSnapshotRef.current = { ...cropRegion };
    }
    setShowCropModal(!showCropModal);
  };

  const handleCropCancel = () => {
    if (cropSnapshotRef.current && onCropChange) {
      onCropChange(cropSnapshotRef.current);
    }
    setShowCropModal(false);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file type - only allow JPG/JPEG
    const validTypes = ['image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast.error(tSettings('background.uploadError'), {
        description: tSettings('background.uploadErrorDescription'),
      });
      event.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setCustomImages(prev => [...prev, dataUrl]);
        onWallpaperChange(dataUrl);
        toast.success(tSettings('background.uploadSuccess'));
      }
    };

    reader.onerror = () => {
      toast.error(t('common.failedToUploadImage'), {
        description: t('common.errorReadingFile'),
      });
    };

    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again
    event.target.value = '';
  };

  const handleRemoveCustomImage = (imageUrl: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setCustomImages(prev => prev.filter(img => img !== imageUrl));
    // If the removed image was selected, clear selection
    if (selected === imageUrl) {
      onWallpaperChange(WALLPAPER_PATHS[0]);
    }
  };

  // Find selected annotation
  const selectedAnnotation = selectedAnnotationId
    ? annotationRegions.find(a => a.id === selectedAnnotationId)
    : null;

  const annotationPanel = selectedAnnotation && onAnnotationContentChange && onAnnotationTypeChange && onAnnotationStyleChange && onAnnotationDelete ? (
      <AnnotationSettingsPanel
        annotation={selectedAnnotation}
        onContentChange={(content) => onAnnotationContentChange(selectedAnnotation.id, content)}
        onTypeChange={(type) => onAnnotationTypeChange(selectedAnnotation.id, type)}
        onStyleChange={(style) => onAnnotationStyleChange(selectedAnnotation.id, style)}
        onAnimationChange={onAnnotationAnimationChange ? (animation) => onAnnotationAnimationChange(selectedAnnotation.id, animation) : undefined}
        onFigureDataChange={onAnnotationFigureDataChange ? (figureData) => onAnnotationFigureDataChange(selectedAnnotation.id, figureData) : undefined}
        onDelete={() => onAnnotationDelete(selectedAnnotation.id)}
      />
  ) : <p className="p-4 text-xs text-slate-500">{locale === 'tr' ? 'Düzenlemek için zaman çizelgesinden bir yazı, görsel veya ok seçin.' : 'Select an annotation on the timeline.'}</p>;

  return (
    <div className="workspace-settings flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      <div className="workspace-inspector-heading"><div><strong>{locale === 'tr' ? 'Detayları şekillendir' : 'Make it yours'}</strong><p>{locale === 'tr' ? 'Küçük dokunuşlar. Büyük fark.' : 'Small details. Big difference.'}</p></div><span><SlidersHorizontal size={14}/></span></div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
      <TabsList aria-label={locale === 'tr' ? 'Düzenleme sekmeleri' : 'Inspector tabs'} className="workspace-tabs grid shrink-0 grid-cols-5">
        {[['appearance',locale === 'tr' ? 'Görünüm' : 'Style'],['motion',locale === 'tr' ? 'Hareket' : 'Motion'],['item',locale === 'tr' ? 'Öğe' : 'Item'],['audio',locale === 'tr' ? 'Ses' : 'Audio'],['ai','AI']].map(([id,label]) => <TabsTrigger key={id} value={id} className="px-1 text-[11px]">{id === 'appearance' ? <Palette size={15}/> : id === 'motion' ? <MousePointer2 size={15}/> : id === 'item' ? <Layers size={15}/> : id === 'audio' ? <AudioLines size={15}/> : <Sparkles size={15}/>}<span>{label}</span></TabsTrigger>)}
      </TabsList>
      <TabsContent value={activeTab} className="mt-0 flex-1 overflow-y-auto custom-scrollbar p-4 pb-0">
        {activeTab === 'appearance' && presets}
        {activeTab === 'appearance' && fades && onFadeChange && (
          <div className="mb-4 rounded-lg border border-white/5 bg-white/5 p-2.5" data-testid="video-fades">
            <span className="text-[11px] font-medium text-slate-200">{tSettings('fades.title')}</span>
            {(['fadeInMs', 'fadeOutMs'] as const).map((key) => (
              <div key={key} className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-400">{tSettings(key === 'fadeInMs' ? 'fades.in' : 'fades.out')}</span>
                <div role="radiogroup" aria-label={`${tSettings('fades.title')}: ${tSettings(key === 'fadeInMs' ? 'fades.in' : 'fades.out')}`} className="flex gap-1">
                  {FADE_CHOICES_MS.map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      role="radio"
                      aria-checked={fades[key] === ms}
                      data-testid={`${key}-${ms}`}
                      onClick={() => onFadeChange(key, ms)}
                      className={fades[key] === ms ? 'rounded bg-violet-300/25 px-2 py-1 text-[10px] text-violet-100' : 'rounded px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10'}
                    >
                      {ms === 0 ? tSettings('fades.off') : `${(ms / 1000).toLocaleString(locale)} ${locale === 'tr' ? 'sn' : 's'}`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="mt-2 text-[9px] leading-snug text-slate-500">{tSettings('fades.hint')}</p>
          </div>
        )}
        {activeTab === 'item' && annotationPanel}
        {activeTab === 'ai' && aiPanel}
        {activeTab === 'audio' && onSourceAudioVolumeChange && (
          <div className="mb-4 rounded-lg border border-white/5 bg-white/5 p-2.5" data-testid="source-audio">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-200">{tSettings('sourceAudio.title')}</span>
              <button
                type="button"
                data-testid="source-audio-mute"
                aria-pressed={sourceAudioVolume === 0}
                onClick={() => onSourceAudioVolumeChange(sourceAudioVolume === 0 ? 1 : 0)}
                className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-slate-300 hover:bg-white/10"
              >
                {sourceAudioVolume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                {sourceAudioVolume === 0 ? tSettings('sourceAudio.unmute') : tSettings('sourceAudio.mute')}
              </button>
            </div>
            <SliderControl
              label={tSettings('sourceAudio.volume')}
              value={Math.round(sourceAudioVolume * 100)}
              defaultValue={100}
              min={0}
              max={100}
              step={1}
              onChange={(v) => onSourceAudioVolumeChange(Math.max(0, Math.min(100, v)) / 100)}
              formatValue={(v) => `${Math.round(v)}%`}
              parseInput={(t) => parseFloat(t.replace(/%$/, ''))}
            />
            <p className="mt-1 text-[9px] leading-snug text-slate-500">{tSettings('sourceAudio.hint')}</p>
          </div>
        )}
        {activeTab === 'audio' && <>{header}{!selectedAudioId && <p className="p-3 text-xs text-slate-500">{locale === 'tr' ? 'Ses düzeyini ve zamanlamayı düzenlemek için bir ses şeridi seçin. + Ses ile dosya ekleyebilirsiniz.' : 'Select an audio track to edit volume and timing.'}</p>}</>}
        <div className={activeTab === 'motion' ? '' : 'hidden'}>

        {activeTab === 'motion' && header}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-200">{tSettings('zoom.level')}</span>
            <div className="flex items-center gap-2">
              {zoomEnabled && selectedZoomDepth && (
                <span className="text-[10px] uppercase tracking-wider font-medium text-[#2563EB] bg-[#2563EB]/10 px-2 py-0.5 rounded-full">
                  {ZOOM_DEPTH_OPTIONS.find(o => o.depth === selectedZoomDepth)?.label}
                </span>
              )}
              <KeyboardShortcutsHelp />
            </div>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {ZOOM_DEPTH_OPTIONS.map((option) => {
              const isActive = selectedZoomDepth === option.depth;
              return (
                <Button
                  key={option.depth}
                  type="button"
                  disabled={!zoomEnabled}
                  onClick={() => onZoomDepthChange?.(option.depth)}
                  className={cn(
                    "h-auto w-full rounded-lg border px-1 py-2 text-center shadow-sm transition-all",
                    "duration-200 ease-out",
                    zoomEnabled ? "opacity-100 cursor-pointer" : "opacity-40 cursor-not-allowed",
                    isActive
                      ? "border-[#2563EB] bg-[#2563EB] text-white shadow-[#2563EB]/20"
                      : "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200"
                  )}
                >
                  <span className="text-xs font-semibold">{option.label}</span>
                </Button>
              );
            })}
          </div>
          {!zoomEnabled && (
            <p className="text-[10px] text-slate-500 mt-2 text-center">{tSettings('zoom.selectRegion')}</p>
          )}
          {zoomEnabled && (
            <Button
              onClick={handleDeleteClick}
              variant="destructive"
              size="sm"
              className="mt-2 w-full gap-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all h-8 text-xs"
            >
              <Trash2 className="w-3 h-3" />
              {tSettings('zoom.deleteZoom')}
            </Button>
          )}
        </div>

        {trimEnabled && (
          <div className="mb-4">
            <Button
              onClick={handleTrimDeleteClick}
              variant="destructive"
              size="sm"
              className="w-full gap-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all h-8 text-xs"
            >
              <Trash2 className="w-3 h-3" />
              {tSettings('trim.deleteRegion')}
            </Button>
          </div>
        )}

        {/* Speeds are set on video parts now; this grid edits a selected speed range from older projects. */}
        {selectedSpeedId && <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-200">{tSettings('speed.playbackSpeed')}</span>
            {selectedSpeedId && selectedSpeedValue && (
              <span className="text-[10px] uppercase tracking-wider font-medium text-[#d97706] bg-[#d97706]/10 px-2 py-0.5 rounded-full">
                {SPEED_OPTIONS.find(o => o.speed === selectedSpeedValue)?.label ?? `${selectedSpeedValue}×`}
              </span>
            )}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {SPEED_OPTIONS.map((option) => {
              const isActive = selectedSpeedValue === option.speed;
              return (
                <Button
                  key={option.speed}
                  type="button"
                  disabled={!selectedSpeedId}
                  onClick={() => onSpeedChange?.(option.speed)}
                  className={cn(
                    "h-auto w-full rounded-lg border px-1 py-2 text-center shadow-sm transition-all",
                    "duration-200 ease-out",
                    selectedSpeedId ? "opacity-100 cursor-pointer" : "opacity-40 cursor-not-allowed",
                    isActive
                      ? "border-[#d97706] bg-[#d97706] text-white shadow-[#d97706]/20"
                      : "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200"
                  )}
                >
                  <span className="text-xs font-semibold">{option.label}</span>
                </Button>
              );
            })}
          </div>
          {!selectedSpeedId && (
            <p className="text-[10px] text-slate-500 mt-2 text-center">{tSettings('speed.selectRegion')}</p>
          )}
          {selectedSpeedId && (
            <Button
              onClick={() => selectedSpeedId && onSpeedDelete?.(selectedSpeedId)}
              variant="destructive"
              size="sm"
              className="mt-2 w-full gap-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all h-8 text-xs"
            >
              <Trash2 className="w-3 h-3" />
              {tSettings('speed.deleteRegion')}
            </Button>
          )}
        </div>}

        {autoZoomControls && <div ref={autoZoomRef}>{autoZoomControls}</div>}

        </div>
        <div className={activeTab === 'appearance' || activeTab === 'motion' ? '' : 'hidden'}>
        <Accordion type="multiple" defaultValue={["effects", "background"]} className="space-y-1">
          <AccordionItem value="effects" className="border-white/5 rounded-xl bg-white/[0.02] px-3">
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#2563EB]" />
                <span className="text-xs font-medium">{tSettings('effects.title')}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <div className={activeTab === 'motion' ? 'grid grid-cols-2 gap-2 mb-3' : 'hidden'}>
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                  <div className="text-[10px] font-medium text-slate-300">{tSettings('effects.showCursor')}</div>
                  <Switch
                    checked={showCursor}
                    onCheckedChange={onShowCursorChange}
                    className="data-[state=checked]:bg-[#2563EB] scale-90"
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                  <div>
                    <div className="text-[10px] font-medium text-slate-300">{tSettings('effects.loopCursor')}</div>
                  </div>
                  <Switch
                    checked={loopCursor}
                    onCheckedChange={onLoopCursorChange}
                    className="data-[state=checked]:bg-[#2563EB] scale-90"
                  />
                </div>

              </div>

              <div className={activeTab === 'motion' ? 'grid grid-cols-2 gap-2 mb-3' : 'hidden'}>
                <div className="p-2 rounded-lg bg-white/5 border border-white/5" data-testid="zoom-motion-blur">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-medium text-slate-300">{tSettings('effects.zoomMotionBlur')}</div>
                    <Switch
                      checked={zoomMotionBlur > 0}
                      onCheckedChange={(on) => onZoomMotionBlurChange?.(on ? ZOOM_MOTION_BLUR_ON : 0)}
                      className="data-[state=checked]:bg-[#2563EB] scale-90"
                      aria-label={tSettings('effects.zoomMotionBlur')}
                    />
                  </div>
                  {zoomMotionBlur > 0 ? (
                    <SliderControl
                      label={tSettings('effects.zoomMotionBlurStrength')}
                      value={zoomMotionBlur}
                      defaultValue={ZOOM_MOTION_BLUR_ON}
                      min={0.05}
                      max={2}
                      step={0.05}
                      onChange={(v) => onZoomMotionBlurChange?.(v)}
                      formatValue={(v) => `${v.toFixed(2)}×`}
                      parseInput={(t) => parseFloat(t.replace(/×$/, ''))}
                    />
                  ) : (
                    <p className="mt-1 text-[9px] leading-snug text-slate-500">{tSettings('effects.zoomMotionBlurOff')}</p>
                  )}
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                  <div className="text-[10px] font-medium text-slate-300">{tSettings('effects.connectZooms')}</div>
                  <Switch
                    checked={connectZooms}
                    onCheckedChange={onConnectZoomsChange}
                    className="data-[state=checked]:bg-[#2563EB] scale-90"
                  />
                </div>
              </div>

              <div className={activeTab === 'motion' ? 'grid grid-cols-2 gap-2 mb-3' : 'hidden'}>
                <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                  <SliderControl
                    label={tSettings('effects.cursorSize')}
                    value={cursorSize}
                    defaultValue={DEFAULT_CURSOR_SIZE}
                    min={0.5}
                    max={10}
                    step={0.05}
                    onChange={(v) => onCursorSizeChange?.(v)}
                    formatValue={(v) => `${v.toFixed(2)}×`}
                    parseInput={(t) => parseFloat(t.replace(/×$/, ''))}
                  />
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                  <SliderControl
                    label={tSettings('effects.cursorSmoothing')}
                    value={cursorSmoothing}
                    defaultValue={DEFAULT_CURSOR_SMOOTHING}
                    min={0}
                    max={2}
                    step={0.01}
                    onChange={(v) => onCursorSmoothingChange?.(v)}
                    formatValue={(v) => v <= 0 ? 'Off' : v.toFixed(2)}
                    parseInput={(t) => parseFloat(t)}
                  />
                </div>
              </div>

              <div className={activeTab === 'motion' ? 'grid grid-cols-2 gap-2 mb-3' : 'hidden'}>
                <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                  <SliderControl
                    label={tSettings('effects.cursorMotionBlur')}
                    value={cursorMotionBlur}
                    defaultValue={DEFAULT_CURSOR_MOTION_BLUR}
                    min={0}
                    max={2}
                    step={0.05}
                    onChange={(v) => onCursorMotionBlurChange?.(v)}
                    formatValue={(v) => `${v.toFixed(2)}×`}
                    parseInput={(t) => parseFloat(t.replace(/×$/, ''))}
                  />
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                  <SliderControl
                    label={tSettings('effects.cursorClickBounce')}
                    value={cursorClickBounce}
                    defaultValue={DEFAULT_CURSOR_CLICK_BOUNCE}
                    min={0}
                    max={5}
                    step={0.05}
                    onChange={(v) => onCursorClickBounceChange?.(v)}
                    formatValue={(v) => `${v.toFixed(2)}×`}
                    parseInput={(t) => parseFloat(t.replace(/×$/, ''))}
                  />
                </div>
              </div>

              <div className={activeTab === 'appearance' ? '' : 'hidden'}>
                <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                  <SliderControl
                    label={tSettings('effects.backgroundBlur')}
                    value={backgroundBlur}
                    defaultValue={0}
                    min={0}
                    max={8}
                    step={0.25}
                    onChange={(v) => onBackgroundBlurChange?.(v)}
                    formatValue={(v) => `${v.toFixed(1)}px`}
                    parseInput={(t) => parseFloat(t.replace(/px$/, ''))}
                  />
                </div>
              <div className="workspace-effect-controls grid grid-cols-1 gap-2 mt-2">
                <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                  <SliderControl
                    label={tSettings('effects.shadow')}
                    value={shadowIntensity}
                    defaultValue={0.67}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => onShadowChange?.(v)}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    parseInput={(t) => parseFloat(t.replace(/%$/, '')) / 100}
                  />
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                  <SliderControl
                    label={tSettings('effects.roundness')}
                    value={borderRadius}
                    defaultValue={12.5}
                    min={0}
                    max={25}
                    step={0.5}
                    onChange={(v) => onBorderRadiusChange?.(v)}
                    formatValue={(v) => `${v}px`}
                    parseInput={(t) => parseFloat(t.replace(/px$/, ''))}
                  />
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                  <SliderControl
                    label={tSettings('effects.padding')}
                    value={padding}
                    defaultValue={50}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => onPaddingChange?.(v)}
                    formatValue={(v) => `${v}%`}
                    parseInput={(t) => parseFloat(t.replace(/%$/, ''))}
                  />
                </div>
              </div>

              <Button
                onClick={handleCropToggle}
                variant="outline"
                className="w-full mt-2 gap-1.5 bg-white/5 text-slate-200 border-white/10 hover:bg-white/10 hover:border-white/20 hover:text-white text-[10px] h-8 transition-all"
              >
                <Crop className="w-3 h-3" />
                {tSettings('crop.title')}
              </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="background" className={activeTab === 'appearance' ? "border-white/5 rounded-xl bg-white/[0.02] px-3" : "hidden"}>
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-[#2563EB]" />
                <span className="text-xs font-medium">{tSettings('background.title')}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <Tabs defaultValue="image" className="w-full">
                <TabsList className="mb-2 bg-white/5 border border-white/5 p-0.5 w-full grid grid-cols-3 h-7 rounded-lg">
                  <TabsTrigger value="image" className="data-[state=active]:bg-[#2563EB] data-[state=active]:text-white text-slate-400 text-[10px] py-1 rounded-md transition-all">{tSettings('background.image')}</TabsTrigger>
                  <TabsTrigger value="color" className="data-[state=active]:bg-[#2563EB] data-[state=active]:text-white text-slate-400 text-[10px] py-1 rounded-md transition-all">{tSettings('background.color')}</TabsTrigger>
                  <TabsTrigger value="gradient" className="data-[state=active]:bg-[#2563EB] data-[state=active]:text-white text-slate-400 text-[10px] py-1 rounded-md transition-all">{tSettings('background.gradient')}</TabsTrigger>
                </TabsList>

                <div className="max-h-[min(200px,25vh)] overflow-y-auto custom-scrollbar">
                  <TabsContent value="image" className="mt-0 space-y-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept=".jpg,.jpeg,image/jpeg"
                      className="hidden"
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="w-full gap-2 bg-white/5 text-slate-200 border-white/10 hover:bg-[#2563EB] hover:text-white hover:border-[#2563EB] transition-all h-7 text-[10px]"
                    >
                      <Upload className="w-3 h-3" />
                      {tSettings('background.uploadCustom')}
                    </Button>

                    <div className="grid grid-cols-7 gap-1.5">
                      {customImages.map((imageUrl, idx) => {
                        const isSelected = selected === imageUrl;
                        return (
                          <div
                            key={`custom-${idx}`}
                            className={cn(
                              "aspect-square w-9 h-9 rounded-md border-2 overflow-hidden cursor-pointer transition-all duration-200 relative group shadow-sm",
                              isSelected
                                ? "border-[#2563EB] ring-1 ring-[#2563EB]/30"
                                : "border-white/10 hover:border-[#2563EB]/40 opacity-80 hover:opacity-100 bg-white/5"
                            )}
                            style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
                            onClick={() => onWallpaperChange(imageUrl)}
                            role="button"
                          >
                            <button
                              onClick={(e) => handleRemoveCustomImage(imageUrl, e)}
                              className="absolute top-0.5 right-0.5 w-3 h-3 bg-red-500/90 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            >
                              <X className="w-2 h-2 text-white" />
                            </button>
                          </div>
                        );
                      })}

                      {(wallpaperPreviewPaths.length > 0 ? wallpaperPreviewPaths : WALLPAPER_PATHS).map((previewPath, index) => {
                        const wallpaper = BUILT_IN_WALLPAPERS[index];
                        const wallpaperValue = WALLPAPER_PATHS[index] ?? previewPath;
                        const isSelected = (() => {
                          if (!selected) return false;
                          if (selected === wallpaperValue || selected === previewPath) return true;
                          try {
                            const clean = (s: string) => s.replace(/^file:\/\//, '').replace(/^\//, '')
                            if (clean(selected).endsWith(clean(wallpaperValue))) return true;
                            if (clean(wallpaperValue).endsWith(clean(selected))) return true;
                            if (clean(selected).endsWith(clean(previewPath))) return true;
                            if (clean(previewPath).endsWith(clean(selected))) return true;
                          } catch {}
                          return false;
                        })();
                        return (
                          <div
                            key={wallpaperValue}
                            className={cn(
                              "aspect-square w-9 h-9 rounded-md border-2 overflow-hidden cursor-pointer transition-all duration-200 shadow-sm",
                              isSelected
                                ? "border-[#2563EB] ring-1 ring-[#2563EB]/30"
                                : "border-white/10 hover:border-[#2563EB]/40 opacity-80 hover:opacity-100 bg-white/5"
                            )}
                            aria-label={wallpaper?.label ?? `Wallpaper ${index + 1}`}
                            title={wallpaper?.label ?? `Wallpaper ${index + 1}`}
                            style={{ backgroundImage: `url(${previewPath})`, backgroundSize: "cover", backgroundPosition: "center" }}
                            onClick={() => onWallpaperChange(wallpaperValue)}
                            role="button"
                          />
                        )
                      })}
                    </div>
                  </TabsContent>

                  <TabsContent value="color" className="mt-0">
                    <div className="p-1">
                      <Block
                        color={selectedColor}
                        colors={colorPalette}
                        onChange={(color) => {
                          setSelectedColor(color.hex);
                          onWallpaperChange(color.hex);
                        }}
                        style={{
                          width: '100%',
                          borderRadius: '8px',
                        }}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="gradient" className="mt-0">
                    <div className="grid grid-cols-7 gap-1.5">
                      {GRADIENTS.map((g, idx) => (
                        <div
                          key={g}
                          className={cn(
                            "aspect-square w-9 h-9 rounded-md border-2 overflow-hidden cursor-pointer transition-all duration-200 shadow-sm",
                            gradient === g
                              ? "border-[#2563EB] ring-1 ring-[#2563EB]/30"
                              : "border-white/10 hover:border-[#2563EB]/40 opacity-80 hover:opacity-100 bg-white/5"
                          )}
                          style={{ background: g }}
                          aria-label={`Gradient ${idx + 1}`}
                          onClick={() => { setGradient(g); onWallpaperChange(g); }}
                          role="button"
                        />
                      ))}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        </div>
      </TabsContent>
      </Tabs>

      {showCropModal && cropRegion && onCropChange && (
        <>
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 animate-in fade-in duration-200"
            onClick={handleCropCancel}
          />
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[60] bg-[#09090b] rounded-2xl shadow-2xl border border-white/10 p-8 w-[90vw] max-w-5xl max-h-[90vh] overflow-auto animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-xl font-bold text-slate-200">{tSettings('crop.title')}</span>
                <p className="text-sm text-slate-400 mt-2">{tSettings('crop.instruction')}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCropCancel}
                className="hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <CropControl
              videoElement={videoElement || null}
              cropRegion={cropRegion}
              onCropChange={onCropChange}
              aspectRatio={aspectRatio}
            />
            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => setShowCropModal(false)}
                size="lg"
                className="bg-[#2563EB] hover:bg-[#2563EB]/90 text-white"
              >
                {t('common.actions.done')}
              </Button>
            </div>
          </div>
        </>
      )}

      <div className="flex-shrink-0 p-4 pt-3 border-t border-white/5 bg-[#09090b]">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Button
            type="button"
            variant="outline"
            onClick={onLoadProject}
            className="h-8 text-[10px] font-medium gap-1.5 bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            {tSettings('export.loadProject')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onSaveProject}
            className="h-8 text-[10px] font-medium gap-1.5 bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
          >
            <Save className="w-3.5 h-3.5" />
            {tSettings('export.saveProject')}
          </Button>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => {
              void window.electronAPI?.openRecordingsFolder();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 py-1.5 transition-colors"
          >
            <FolderOpen className="w-3 h-3 text-[#2563EB]" />
            {t('common.app.manageRecordings')}
          </button>

        </div>
      </div>
    </div>
  );
}

