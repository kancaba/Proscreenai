import type { ClipSession } from './sequenceClipEdit';
import SequenceWorkspace, { inspectClip } from './SequenceWorkspace';
import { sequenceEnd, validSequence, type Sequence, type SequenceClip } from '@/lib/sequence';
import { useProjectDraft } from '@/hooks/useProjectDraft';
import './editor-workspace.css';
import { PreviewWorkspaceBar } from './PreviewWorkspaceBar';
import { ModelionSettings } from './ModelionSettings';
import { VoiceoverPanel } from './VoiceoverPanel';
import { addVoiceoverTake, type VoiceoverTake } from './voiceoverTakes';
import { ExportSetupDialog } from './ExportSetupDialog';
import { outputDimensions, exportBitrate, fitCustomSizeToRatio, matchesRatio, type ResolutionPreset, type VideoFps } from '@/lib/video/outputSettings';
import { AudioClipControls } from './AudioInspector';
import { audioClipName } from './audioClipName';
import { ClipPartInspector } from './ClipPartInspector';
import { TypingInspector } from './TypingInspector';
import { findTypingStretches, isStretchCut } from './typingStretches';
import { setPartSpeed, speedOfPart } from './clipSpeed';
import type { Span } from "dnd-timeline";
import { Home, FolderOpen, Languages, Monitor, Settings2 } from "lucide-react";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useI18n } from "@/contexts/I18nContext";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import type { AppLocale } from "@/i18n/config";

import VideoPlayback, { VideoPlaybackRef } from "./VideoPlayback";
import PlaybackControls from "./PlaybackControls";
import TimelineEditor from "./timeline/TimelineEditor";
import { SettingsPanel, type SettingsFocusRequest } from "./SettingsPanel";
import { ExportDialog } from "./ExportDialog";
import { DEFAULT_WALLPAPER_RELATIVE_PATH, WALLPAPER_PATHS } from "@/lib/wallpapers";
import {
  createProjectData,
  deriveNextId,
  fromFileUrl,
  normalizeProjectEditor,
  toFileUrl,
  validateProjectData,
} from "./projectPersistence";

import {
  DEFAULT_CURSOR_CLICK_BOUNCE,
  DEFAULT_CURSOR_MOTION_BLUR,
  DEFAULT_CURSOR_SIZE,
  DEFAULT_CURSOR_SMOOTHING,
  DEFAULT_ZOOM_DEPTH,
  DEFAULT_ZOOM_MOTION_BLUR,
  clampFocusToDepth,
  DEFAULT_CROP_REGION,
  DEFAULT_ANNOTATION_POSITION,
  DEFAULT_ANNOTATION_SIZE,
  DEFAULT_ANNOTATION_STYLE,
  DEFAULT_FIGURE_DATA,
  DEFAULT_PLAYBACK_SPEED,
  type ZoomDepth,
  type ZoomFocus,
  type ZoomRegion,
  type CursorTelemetryPoint,
  type TrimRegion,
  type AnnotationAnimation,
  type AnnotationRegion,
  type CropRegion,
  type FigureData,
  type SpeedRegion,
  type VideoClip,
  type VideoInsertPlace,
  type AudioRegion,
  type PlaybackSpeed,
} from "./types";
import { VideoExporter, GifExporter, type ExportProgress, type ExportQuality, type ExportSettings, type ExportFormat, type GifFrameRate, type GifSizePreset, GIF_SIZE_PRESETS, calculateOutputDimensions } from "@/lib/exporter";
import { type AspectRatio, getAspectRatioValue } from "@/utils/aspectRatioUtils";
import { getAssetPath } from "@/lib/assetPath";
import { matchesShortcut } from "@/lib/shortcuts";
import { normalizeCursorTelemetry } from "./timeline/zoomSuggestionUtils";
import { buildAutoZoomSpans, countClicks } from "./autoZoom";
import { type AutoZoomSettings, loadAutoZoomSettings, saveAutoZoomSettings } from "./autoZoomSettings";
import { AutoZoomControls } from "./AutoZoomControls";
import { AutoCaptionsSection } from "./AutoCaptionsSection";
import { applyCaptionStyle, captionLook, type CaptionStyleChoice, DEFAULT_CAPTION_STYLE, detectCaptionStyle } from "./captionStyles";
import { useAutoCaptions } from "./useAutoCaptions";
import { AgentPanel } from "./AgentPanel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAgentRun } from "./useAgentRun";
import { applyProposals, mergeTrims } from "./agentApply";
import { clipSegments, createCutMap, cutMarkers, normalizeSplits, spanToOutput, spanToSource, toOutputMs, toSourceMs } from "./timeline/editedTime";
import { createReorder, insertAddedAt, isInOrder, movePiece, moveRegions, piecesBetween, type Reorder, reorderSplits, reorderVideoClips, type SourcePiece, splitRegions } from "@/lib/videoReorder";
import type { AgentProjectSnapshot } from "@/lib/agent/agentSnapshot";
import { SUBTITLE_PLACEMENT, TEXT_STYLE_PRESETS } from "./annotationEffects";
import type { CaptionCue } from "@/lib/captions/captionCues";
import { AUTOMATIC_CHANGE_WINDOW_MS, changedHistoryKeys, decideHistoryChange } from "./editorHistory";
import { buildLoopedCursorTelemetry, getDisplayedTimelineWindowMs } from "./videoPlayback/cursorLoopTelemetry";
import { findDominantRegion } from "./videoPlayback/zoomRegionUtils";

import { EditorToolbar, type EditorTool } from './EditorToolbar';
import { AiCaptionsPanel } from './AiCaptionsPanel';
import type { CaptionSlot } from './aiCaptionTiming';
import { StylePresets } from './StylePresets';
import { RegionInspector } from './RegionInspector';
import { DEFAULT_ZOOM_SPAN_MS, findAvailableSpan, validRegionSpan, type TimeSpan } from './editingTools';
import { KIND_ALLOWS_OVERLAP, nudgeRegion, placeCopy, type RegionCommand, type RegionKind, type RegionTarget, splitRegion, type TimedRegion } from './timeline/regionCommands';
import { getAnnotationText } from './annotationText';
import { fadeAmount, type Fades, NO_FADES } from '@/lib/fades';
import { type EndingHold, NO_ENDING } from '@/lib/endingHold';
import { applyAudioTimelineChange, audioFileOffsetSeconds, audioTimelineSpan, firstFreeAudioTrack, isAudioActive, MAX_AUDIO_TRACKS, splitAudioRegion } from './audioRegionSpan';
import type { EditorAppearance } from './appearancePresets';
import { type BlurRect, type BlurRegion, clampBlurRect, DEFAULT_BLUR_RECT, DEFAULT_BLUR_SPAN_MS, DEFAULT_BLUR_STRENGTH } from './blurRegions';
import { BlurControls } from './BlurControls';

const LOOP_CURSOR_END_WINDOW_MS = 670;

type EditorHistorySnapshot = {
  appearance: EditorAppearance;
  zoomRegions: ZoomRegion[];
  trimRegions: TrimRegion[];
  speedRegions: SpeedRegion[];
  annotationRegions: AnnotationRegion[];
  audioRegions: AudioRegion[];
  blurRegions: BlurRegion[];
  sourceAudioVolume: number;
  fades: Fades;
  ending: EndingHold;
  clipSplits: number[];
  selectedZoomId: string | null;
  selectedTrimId: string | null;
  selectedSpeedId: string | null;
  selectedAnnotationId: string | null;
  selectedAudioId: string | null;
  selectedBlurId: string | null;
};

type PendingExportSave = {
	fileName: string;
	arrayBuffer: ArrayBuffer;
};

function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const idx = SUPPORTED_LOCALES.indexOf(locale as typeof SUPPORTED_LOCALES[number]);
  const next = SUPPORTED_LOCALES[(idx + 1) % SUPPORTED_LOCALES.length] as AppLocale;
  const labels: Record<string, string> = { tr: "TR", en: "EN", es: "ES", "zh-CN": "中文" };
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-white/90 transition hover:bg-white/8 hover:text-white cursor-pointer"
      title={t("common.app.language", "Language")}
      aria-label={t("common.app.language", "Language")}
    >
      <Languages className="h-4 w-4" />
      <span className="text-xs font-normal">{labels[locale] ?? locale.toUpperCase()}</span>
    </button>
  );
}

function getGifOutputDimensions(width: number, height: number, aspect: AspectRatio, preset: GifSizePreset) {
  const canvas = outputDimensions(width, height, getAspectRatioValue(aspect, width / height), 'source');
  return calculateOutputDimensions(canvas.width, canvas.height, preset, GIF_SIZE_PRESETS);
}

export default function VideoEditor({ clipSession }: { clipSession?: ClipSession } = {}) {
  const sessionRef = useRef(clipSession);
  sessionRef.current = clipSession;
  const embedded = Boolean(clipSession);
  const initialClipTool = useRef(clipSession?.tool);
  const { t, locale } = useI18n();
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const videoPathRef = useRef<string | null>(null);
  videoPathRef.current = videoPath;
  const [videoSourcePath, setVideoSourcePath] = useState<string | null>(null);
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [sequenceVisible, setSequenceVisible] = useState(false);
  const [sequenceEdited, setSequenceEdited] = useState(false);
  const [projectGeneration, setProjectGeneration] = useState(0);
  const sequenceTime = useRef(0);
  const voiceInsert = useRef<((path:string,at:"start"|"playhead")=>Promise<void>) | null>(null);
  const attemptedProxy = useRef(false);
  const mounted = useRef(true);
  useEffect(()=>{mounted.current=true; return ()=>{mounted.current=false;};},[]);
  const handlePreviewError = useCallback(async (message:string)=>{
    const source = sessionRef.current?.initial.videoPath;
    if (!source || attemptedProxy.current || message !== "Failed to load video") { setError(message); return; }
    attemptedProxy.current = true;
    try {
      const proxy = await window.electronAPI.sequencePreviewCopy(fromFileUrl(source));
      if (mounted.current) { setError(null);setVideoPath(toFileUrl(proxy)); }
    } catch(e){ if(mounted.current)setError(String(e)); }
  },[]);
  const rememberSequenceTime = useCallback((ms: number) => { sequenceTime.current = ms; }, []);
  const editSequence = useCallback((next: Sequence) => { setSequence(next); setSequenceEdited(true); }, []);
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [wallpaper, setWallpaper] = useState<string>(WALLPAPER_PATHS[0]);
  const wallpaperRef = useRef(wallpaper);
  wallpaperRef.current = wallpaper;
  const [shadowIntensity, setShadowIntensity] = useState(0.67);
  const [backgroundBlur, setBackgroundBlur] = useState(0);
  const [zoomMotionBlur, setZoomMotionBlur] = useState(DEFAULT_ZOOM_MOTION_BLUR);
  const [connectZooms, setConnectZooms] = useState(true);
  const [showCursor, setShowCursor] = useState(true);
  const [loopCursor, setLoopCursor] = useState(false);
  const [cursorSize, setCursorSize] = useState(DEFAULT_CURSOR_SIZE);
  const [cursorSmoothing, setCursorSmoothing] = useState(DEFAULT_CURSOR_SMOOTHING);
  const [cursorMotionBlur, setCursorMotionBlur] = useState(DEFAULT_CURSOR_MOTION_BLUR);
  const [cursorClickBounce, setCursorClickBounce] = useState(DEFAULT_CURSOR_CLICK_BOUNCE);
  const [borderRadius, setBorderRadius] = useState(12.5);
  const [padding, setPadding] = useState(50);
  const [cropRegion, setCropRegion] = useState<CropRegion>(DEFAULT_CROP_REGION);
  const [zoomRegions, setZoomRegions] = useState<ZoomRegion[]>([]);
  const [cursorTelemetry, setCursorTelemetry] = useState<CursorTelemetryPoint[]>([]);
  /** When keys were pressed while recording (source ms); only the time, never the key. */
  const [keyTimes, setKeyTimes] = useState<number[]>([]);
  // Video whose telemetry has finished loading (empty or not), so "no clicks" can be told apart from "not loaded yet".
  const [cursorTelemetryPath, setCursorTelemetryPath] = useState<string | null>(null);
  const [autoZoomSettings, setAutoZoomSettingsState] = useState<AutoZoomSettings>(loadAutoZoomSettings);
  const [settingsFocusRequest, setSettingsFocusRequest] = useState<SettingsFocusRequest | null>(null);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [trimRegions, setTrimRegions] = useState<TrimRegion[]>([]);
  const [selectedTrimId, setSelectedTrimId] = useState<string | null>(null);
  const [speedRegions, setSpeedRegions] = useState<SpeedRegion[]>([]);
  const [selectedSpeedId, setSelectedSpeedId] = useState<string | null>(null);
  const [annotationRegions, setAnnotationRegions] = useState<AnnotationRegion[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [audioRegions, setAudioRegions] = useState<AudioRegion[]>([]);
  const [blurRegions, setBlurRegions] = useState<BlurRegion[]>([]);
  // Not part of undo: a generated voiceover is kept even when the edits around it are undone.
  const [voiceoverTakes, setVoiceoverTakes] = useState<VoiceoverTake[]>([]);
  const [selectedBlurId, setSelectedBlurId] = useState<string | null>(null);
  /** Volume of the recording's own sound, 0 (muted) to 1. */
  const [sourceAudioVolume, setSourceAudioVolume] = useState(1);
  /** Optional fade from/to black at the video's start and end. */
  const [fades, setFades] = useState<Fades>(NO_FADES);
  /** Time added after the video's end (last frame or background). */
  const [ending, setEnding] = useState<EndingHold>(NO_ENDING);
  /** Points (source ms) where the video track is split into parts that can be cut. */
  const [clipSplits, setClipSplits] = useState<number[]>([]);
  /** The videos joined into the edit when videos were added to the end (empty for a single video). */
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  /** Progress (0–1) while a video is being added to the end. */
  const [addingVideo, setAddingVideo] = useState<number | null>(null);
  const totalSourceMs = Math.round(duration * 1000);
  const cutMap = useMemo(() => createCutMap(trimRegions, totalSourceMs, speedRegions), [trimRegions, totalSourceMs, speedRegions]);
  /** The ending extension after the video, and the whole edited timeline with it. */
  const endingMs = duration > 0 ? ending.durationMs : 0;
  const timelineMs = cutMap.outputMs + endingMs;
  /** Fade darkening at the playhead, shown over the preview and applied to the preview's sound. */
  const previewFade = fadeAmount(toOutputMs(cutMap, currentTime * 1000), timelineMs, fades);
  /** The selected video part, by its source start. */
  const [selectedClipStart, setSelectedClipStart] = useState<number | null>(null);
  /** Start (source ms) of the selected typing stretch, if any. */
  const [selectedTypingStart, setSelectedTypingStart] = useState<number | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [exportResolution, setExportResolution] = useState<ResolutionPreset>('source');
  const [exportFps, setExportFps] = useState<VideoFps>(60);
  const [exportCustomWidth, setExportCustomWidth] = useState(1920);
  const [exportCustomHeight, setExportCustomHeight] = useState(1080);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [compositionGuides, setCompositionGuides] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  useEffect(() => {
    if (!focusMode) return;
    const exitFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        setFocusMode(false);
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', exitFocus);
    return () => window.removeEventListener('keydown', exitFocus);
  }, [focusMode]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [exportQuality, setExportQuality] = useState<ExportQuality>('source');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');
  const [gifFrameRate, setGifFrameRate] = useState<GifFrameRate>(15);
  const [gifLoop, setGifLoop] = useState(true);
  const [gifSizePreset, setGifSizePreset] = useState<GifSizePreset>('medium');
  const [exportedFilePath, setExportedFilePath] = useState<string | undefined>(undefined);
  const [hasPendingExportSave, setHasPendingExportSave] = useState(false);
  const [recoveredDraft, setRecoveredDraft] = useState(false);
  const pendingPlayheadRef = useRef<number | null>(null);
  /** A new recording to add to the end once the project it was made for is open again. */
  const pendingAppendRecordingRef = useRef<string | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);

  const videoPlaybackRef = useRef<VideoPlaybackRef>(null);

  // --- Ending extension: after the video, a clock moves the playhead on while the video
  // element rests on its last frame. Past the end, the playhead's source time is the video's
  // length plus how far into the extension it is.
  /** How far (ms) into the extension the playhead is; null while it is on the video. */
  const endingPositionRef = useRef<number | null>(null);
  const endingClockRef = useRef<number | null>(null);
  const endingStateRef = useRef({ endingMs, sourceMs: totalSourceMs, cutMap, isPlaying });
  endingStateRef.current = { endingMs, sourceMs: totalSourceMs, cutMap, isPlaying };

  const stopEndingClock = useCallback(() => {
    if (endingClockRef.current !== null) cancelAnimationFrame(endingClockRef.current);
    endingClockRef.current = null;
  }, []);

  const runEndingClock = useCallback((fromMs: number) => {
    stopEndingClock();
    const startedAt = performance.now();
    setIsPlaying(true);
    const tick = () => {
      const { endingMs: length, sourceMs } = endingStateRef.current;
      const position = Math.min(length, fromMs + performance.now() - startedAt);
      endingPositionRef.current = position;
      setCurrentTime((sourceMs + position) / 1000);
      if (position >= length) {
        endingClockRef.current = null;
        setIsPlaying(false);
        return;
      }
      endingClockRef.current = requestAnimationFrame(tick);
    };
    endingClockRef.current = requestAnimationFrame(tick);
  }, [stopEndingClock]);

  useEffect(() => stopEndingClock, [stopEndingClock]);

  // A shorter (or removed) extension pulls a playhead that was in it back inside.
  useEffect(() => {
    const position = endingPositionRef.current;
    if (position === null || position <= endingMs) return;
    if (endingMs > 0) {
      endingPositionRef.current = endingMs;
      setCurrentTime((totalSourceMs + endingMs) / 1000);
      return;
    }
    stopEndingClock();
    endingPositionRef.current = null;
    setIsPlaying(false);
    setCurrentTime(duration);
  }, [endingMs, totalSourceMs, duration, stopEndingClock]);

  /** Times from the video element; ignored while the playhead is in the extension. */
  const handleVideoTime = useCallback((time: number) => {
    if (endingPositionRef.current === null) setCurrentTime(time);
  }, []);

  const handleVideoPlayState = useCallback((playing: boolean) => {
    if (playing) {
      stopEndingClock();
      endingPositionRef.current = null;
      setIsPlaying(true);
      return;
    }
    if (endingClockRef.current !== null) return;
    const { endingMs: length, cutMap: map, isPlaying: wasPlaying } = endingStateRef.current;
    const video = videoPlaybackRef.current?.video;
    // The video played to its end (or into a cut that runs to the end): the extension plays on.
    if (length > 0 && wasPlaying && video && toOutputMs(map, video.currentTime * 1000) >= map.outputMs - 60) {
      endingPositionRef.current = 0;
      runEndingClock(0);
      return;
    }
    setIsPlaying(false);
  }, [runEndingClock, stopEndingClock]);

  /** Pauses the video or the extension's clock. */
  const pausePlayback = useCallback(() => {
    if (endingClockRef.current !== null) {
      stopEndingClock();
      setIsPlaying(false);
    }
    videoPlaybackRef.current?.pause();
  }, [stopEndingClock]);

  const nextZoomIdRef = useRef(1);
  const nextTrimIdRef = useRef(1);
  const nextSpeedIdRef = useRef(1);
  const nextAudioIdRef = useRef(1);
  const nextBlurIdRef = useRef(1);

  const { shortcuts, isMac, openConfig } = useShortcuts();
  const nextAnnotationIdRef = useRef(1);
  const nextAnnotationZIndexRef = useRef(1); // Track z-index for stacking order
  const exporterRef = useRef<VideoExporter | null>(null);
  const autoSuggestedVideoPathRef = useRef<string | null>(null);
  // A saved project opened without zooms: offer (never force) automatic zooms once.
  const autoZoomOfferPathRef = useRef<string | null>(null);
  const historyPastRef = useRef<EditorHistorySnapshot[]>([]);
  const historyFutureRef = useRef<EditorHistorySnapshot[]>([]);
  const historyCurrentRef = useRef<EditorHistorySnapshot | null>(null);
  const applyingHistoryRef = useRef(false);
  const lastHistoryChangeRef = useRef<{ at: number; keys: string } | null>(null);
  const pendingAutomaticChangesRef = useRef(new Map<string, number>());
  const automaticChangeAbsorbedRef = useRef(false);
  /** Marks the next change to these settings as automatic: no undo step, no unsaved-changes prompt. */
  /** The next change is its own undo step, even right after another edit of the same kind. */
  const startNewHistoryStep = useCallback(() => {
    lastHistoryChangeRef.current = null;
  }, []);

  const expectAutomaticChange = useCallback((...keys: string[]) => {
    const expiresAt = Date.now() + AUTOMATIC_CHANGE_WINDOW_MS;
    for (const key of keys) pendingAutomaticChangesRef.current.set(key, expiresAt);
  }, []);
  const pendingExportSaveRef = useRef<PendingExportSave | null>(null);

  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
  const [aiCaptionsOpen, setAiCaptionsOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [voiceoverOpen, setVoiceoverOpen] = useState(false);
  const [voiceoverText, setVoiceoverText] = useState('');
  const [exportSetupOpen, setExportSetupOpen] = useState(false);
  const openVoiceover = (text?: string) => { pausePlayback(); setVoiceoverText(text ?? annotationRegions.filter(region => region.type === 'text' && (!selectedAnnotationId || region.id === selectedAnnotationId)).sort((a,b) => a.startMs-b.startMs).map(getAnnotationText).filter(Boolean).join(' ')); setVoiceoverOpen(true); };
  const appearance = useMemo<EditorAppearance>(() => ({
    wallpaper, shadowIntensity, backgroundBlur, zoomMotionBlur, connectZooms,
    showCursor, loopCursor, cursorSize, cursorSmoothing, cursorMotionBlur,
    cursorClickBounce, borderRadius, padding, cropRegion, aspectRatio,
  }), [wallpaper, shadowIntensity, backgroundBlur, zoomMotionBlur, connectZooms,
    showCursor, loopCursor, cursorSize, cursorSmoothing, cursorMotionBlur,
    cursorClickBounce, borderRadius, padding, cropRegion, aspectRatio]);
  const applyAppearance = useCallback((next: EditorAppearance) => {
    setWallpaper(next.wallpaper); setShadowIntensity(next.shadowIntensity);
    setBackgroundBlur(next.backgroundBlur); setZoomMotionBlur(next.zoomMotionBlur);
    setConnectZooms(next.connectZooms); setShowCursor(next.showCursor);
    setLoopCursor(next.loopCursor); setCursorSize(next.cursorSize);
    setCursorSmoothing(next.cursorSmoothing); setCursorMotionBlur(next.cursorMotionBlur);
    setCursorClickBounce(next.cursorClickBounce); setBorderRadius(next.borderRadius);
    setPadding(next.padding); setCropRegion({ ...next.cropRegion }); setAspectRatio(next.aspectRatio);
  }, []);

  const cloneSnapshot = useCallback((snapshot: EditorHistorySnapshot): EditorHistorySnapshot => {
    return {
      appearance: structuredClone(snapshot.appearance),
      zoomRegions: JSON.parse(JSON.stringify(snapshot.zoomRegions)),
      trimRegions: JSON.parse(JSON.stringify(snapshot.trimRegions)),
      speedRegions: JSON.parse(JSON.stringify(snapshot.speedRegions)),
      annotationRegions: JSON.parse(JSON.stringify(snapshot.annotationRegions)),
      audioRegions: JSON.parse(JSON.stringify(snapshot.audioRegions)),
      blurRegions: JSON.parse(JSON.stringify(snapshot.blurRegions ?? [])),
      sourceAudioVolume: snapshot.sourceAudioVolume,
      fades: { ...snapshot.fades },
      ending: { ...(snapshot.ending ?? NO_ENDING) },
      clipSplits: [...(snapshot.clipSplits ?? [])],
      selectedZoomId: snapshot.selectedZoomId,
      selectedTrimId: snapshot.selectedTrimId,
      selectedSpeedId: snapshot.selectedSpeedId,
      selectedAnnotationId: snapshot.selectedAnnotationId,
      selectedAudioId: snapshot.selectedAudioId,
      selectedBlurId: snapshot.selectedBlurId ?? null,
    };
  }, []);

  const buildHistorySnapshot = useCallback((): EditorHistorySnapshot => {
    return {
      appearance,
      zoomRegions,
      trimRegions,
      speedRegions,
      annotationRegions,
      audioRegions,
      blurRegions,
      sourceAudioVolume,
      fades,
      ending,
      clipSplits,
      selectedZoomId,
      selectedTrimId,
      selectedSpeedId,
      selectedAnnotationId,
      selectedAudioId,
      selectedBlurId,
    };
  }, [
    appearance,
    zoomRegions,
    trimRegions,
    speedRegions,
    annotationRegions,
    audioRegions,
    blurRegions,
    sourceAudioVolume,
    fades,
    ending,
    clipSplits,
    selectedZoomId,
    selectedTrimId,
    selectedSpeedId,
    selectedAnnotationId,
    selectedAudioId,
    selectedBlurId,
  ]);

  const applyHistorySnapshot = useCallback((snapshot: EditorHistorySnapshot) => {
    applyingHistoryRef.current = true;
    const cloned = cloneSnapshot(snapshot);
    applyAppearance(cloned.appearance);
    setZoomRegions(cloned.zoomRegions);
    setTrimRegions(cloned.trimRegions);
    setSpeedRegions(cloned.speedRegions);
    setAnnotationRegions(cloned.annotationRegions);
    setAudioRegions(cloned.audioRegions);
    setBlurRegions(cloned.blurRegions);
    setSourceAudioVolume(cloned.sourceAudioVolume ?? 1);
    setFades(cloned.fades ?? NO_FADES);
    setEnding(cloned.ending ?? NO_ENDING);
    setClipSplits(cloned.clipSplits ?? []);
    setSelectedClipStart(null);
    setSelectedZoomId(cloned.selectedZoomId);
    setSelectedTrimId(cloned.selectedTrimId);
    setSelectedSpeedId(cloned.selectedSpeedId);
    setSelectedAnnotationId(cloned.selectedAnnotationId);
    setSelectedAudioId(cloned.selectedAudioId);
    setSelectedBlurId(cloned.selectedBlurId);

    nextBlurIdRef.current = deriveNextId("blur", cloned.blurRegions.map((region) => region.id));
    nextZoomIdRef.current = deriveNextId("zoom", cloned.zoomRegions.map((region) => region.id));
    nextTrimIdRef.current = deriveNextId("trim", cloned.trimRegions.map((region) => region.id));
    nextSpeedIdRef.current = deriveNextId("speed", cloned.speedRegions.map((region) => region.id));
    nextAnnotationIdRef.current = deriveNextId("annotation", cloned.annotationRegions.map((region) => region.id));
    nextAudioIdRef.current = deriveNextId("audio", cloned.audioRegions.map((region) => region.id));
    nextAnnotationZIndexRef.current =
      cloned.annotationRegions.reduce((max, region) => Math.max(max, region.zIndex), 0) + 1;
  }, [cloneSnapshot, applyAppearance]);

  const handleUndo = useCallback(() => {
    if (historyPastRef.current.length === 0) return;

    const current = historyCurrentRef.current ?? cloneSnapshot(buildHistorySnapshot());
    const previous = historyPastRef.current.pop();
    if (!previous) return;

    historyFutureRef.current.push(cloneSnapshot(current));
    historyCurrentRef.current = cloneSnapshot(previous);
    applyHistorySnapshot(previous);
    setHistoryAvailability({ canUndo: historyPastRef.current.length > 0, canRedo: true });
  }, [applyHistorySnapshot, buildHistorySnapshot, cloneSnapshot]);

  const handleRedo = useCallback(() => {
    if (historyFutureRef.current.length === 0) return;

    const current = historyCurrentRef.current ?? cloneSnapshot(buildHistorySnapshot());
    const next = historyFutureRef.current.pop();
    if (!next) return;

    historyPastRef.current.push(cloneSnapshot(current));
    historyCurrentRef.current = cloneSnapshot(next);
    applyHistorySnapshot(next);
    setHistoryAvailability({ canUndo: true, canRedo: historyFutureRef.current.length > 0 });
  }, [applyHistorySnapshot, buildHistorySnapshot, cloneSnapshot]);

  const applyLoadedProject = useCallback(async (candidate: unknown, path?: string | null, recovered = false) => {
    if (!validateProjectData(candidate)) {
      return false;
    }

    const project = candidate;
    setRecoveredDraft(recovered);
    setProjectGeneration(g => g+1);
    pendingPlayheadRef.current = typeof project.workspace?.playheadSeconds === 'number' && Number.isFinite(project.workspace.playheadSeconds) ? Math.max(0,project.workspace.playheadSeconds) : null;
    const sourcePath = fromFileUrl(project.videoPath);
    const normalizedEditor = normalizeProjectEditor(project.editor);
    setSequence(normalizedEditor.sequence ?? null);
    setSequenceVisible(Boolean(normalizedEditor.sequence));
    setSequenceEdited(false);
    sequenceTime.current = normalizedEditor.sequence ? (pendingPlayheadRef.current ?? 0)*1000 : 0;
    if (normalizedEditor.sequence) pendingPlayheadRef.current = null;

    try {
      pausePlayback();
    } catch {
      // no-op
    }
    historyPastRef.current = [];
    historyFutureRef.current = [];
    historyCurrentRef.current = null;
    setHistoryAvailability({ canUndo: false, canRedo: false });
    setIsPlaying(false);
    setCurrentTime(0);
    // The same video does not load again, so its duration would never come back.
    if (videoPathRef.current !== toFileUrl(sourcePath)) {
      setDuration(0);
    }

    setError(null);
    setVideoSourcePath(sourcePath);
    setVideoPath(toFileUrl(sourcePath));
    setCurrentProjectPath(path ?? null);
    // A saved project keeps its own zoom choices, even when it has none.
    autoSuggestedVideoPathRef.current = toFileUrl(sourcePath);
    autoZoomOfferPathRef.current = normalizedEditor.zoomRegions.length === 0 ? toFileUrl(sourcePath) : null;

    setWallpaper(normalizedEditor.wallpaper);
    setShadowIntensity(normalizedEditor.shadowIntensity);
    setBackgroundBlur(normalizedEditor.backgroundBlur);
    setZoomMotionBlur(normalizedEditor.zoomMotionBlur);
    setConnectZooms(normalizedEditor.connectZooms);
    setShowCursor(normalizedEditor.showCursor);
    setLoopCursor(normalizedEditor.loopCursor);
    setCursorSize(normalizedEditor.cursorSize);
    setCursorSmoothing(normalizedEditor.cursorSmoothing);
    setCursorMotionBlur(normalizedEditor.cursorMotionBlur);
    setCursorClickBounce(normalizedEditor.cursorClickBounce);
    setBorderRadius(normalizedEditor.borderRadius);
    setPadding(normalizedEditor.padding);
    setCropRegion(normalizedEditor.cropRegion);
    setZoomRegions(normalizedEditor.zoomRegions);
    setTrimRegions(normalizedEditor.trimRegions);
    setSpeedRegions(normalizedEditor.speedRegions);
    setAnnotationRegions(normalizedEditor.annotationRegions);
    setAudioRegions(normalizedEditor.audioRegions);
    setBlurRegions(normalizedEditor.blurRegions ?? []);
    setVoiceoverTakes(normalizedEditor.voiceoverTakes ?? []);
    setSourceAudioVolume(normalizedEditor.sourceAudioVolume);
    setFades(normalizedEditor.fades);
    setEnding(normalizedEditor.ending ?? NO_ENDING);
    setClipSplits(normalizedEditor.clipSplits);
    setVideoClips(normalizedEditor.videoClips ?? []);
    setSelectedClipStart(null);
    setExportResolution(normalizedEditor.exportResolution ?? 'legacy');
    setExportFps(normalizedEditor.exportFps ?? 60);
    setExportCustomWidth(normalizedEditor.exportCustomWidth ?? 1920);
    setExportCustomHeight(normalizedEditor.exportCustomHeight ?? 1080);
    setAspectRatio(normalizedEditor.aspectRatio);
    setExportQuality(normalizedEditor.exportQuality);
    setExportFormat(normalizedEditor.exportFormat);
    setGifFrameRate(normalizedEditor.gifFrameRate);
    setGifLoop(normalizedEditor.gifLoop);
    setGifSizePreset(normalizedEditor.gifSizePreset);

    setSelectedZoomId(null);
    setSelectedTrimId(null);
    setSelectedSpeedId(null);
    setSelectedAnnotationId(null);
    setSelectedAudioId(null);
    setSelectedBlurId(null);

    nextBlurIdRef.current = deriveNextId("blur", (normalizedEditor.blurRegions ?? []).map((region) => region.id));
    nextZoomIdRef.current = deriveNextId("zoom", normalizedEditor.zoomRegions.map((region) => region.id));
    nextTrimIdRef.current = deriveNextId("trim", normalizedEditor.trimRegions.map((region) => region.id));
    nextSpeedIdRef.current = deriveNextId("speed", normalizedEditor.speedRegions.map((region) => region.id));
    nextAudioIdRef.current = deriveNextId("audio", normalizedEditor.audioRegions.map((region) => region.id));
    nextAnnotationIdRef.current = deriveNextId(
      "annotation",
      normalizedEditor.annotationRegions.map((region) => region.id),
    );
    nextAnnotationZIndexRef.current =
      normalizedEditor.annotationRegions.reduce((max, region) => Math.max(max, region.zIndex), 0) + 1;

    setLastSavedSnapshot(JSON.stringify(createProjectData(sourcePath, normalizedEditor)));
    return true;
  }, []);

  const currentProjectSnapshot = useMemo(() => {
    const sourcePath = videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null);
    if (!sourcePath) {
      return null;
    }
    return JSON.stringify(
      createProjectData(sourcePath, {
        ...(sequence ? {sequence} : {}),
        wallpaper,
        shadowIntensity,
        backgroundBlur,
        zoomMotionBlur,
        connectZooms,
        showCursor,
        loopCursor,
        cursorSize,
        cursorSmoothing,
        cursorMotionBlur,
        cursorClickBounce,
        borderRadius,
        padding,
        cropRegion,
        zoomRegions,
        trimRegions,
        speedRegions,
        annotationRegions,
        audioRegions,
        ...(blurRegions.length > 0 ? { blurRegions } : {}),
        ...(voiceoverTakes.length > 0 ? { voiceoverTakes } : {}),
        sourceAudioVolume,
        fades,
        ...(ending.durationMs > 0 ? { ending } : {}),
        clipSplits,
        ...(videoClips.length > 1 ? { videoClips } : {}),
        aspectRatio,
        exportQuality, exportResolution, exportFps, exportCustomWidth, exportCustomHeight,
        exportFormat,
        gifFrameRate,
        gifLoop,
        gifSizePreset,
      }),
    );
  }, [
    videoPath,
    videoSourcePath,
    sequence,
    wallpaper,
    shadowIntensity,
    backgroundBlur,
    zoomMotionBlur,
    connectZooms,
    showCursor,
    loopCursor,
    cursorSize,
    cursorSmoothing,
    cursorMotionBlur,
    cursorClickBounce,
    borderRadius,
    padding,
    cropRegion,
    zoomRegions,
    trimRegions,
    speedRegions,
    audioRegions,
    blurRegions,
    voiceoverTakes,
    sourceAudioVolume,
    fades,
    ending,
    clipSplits,
    videoClips,
    annotationRegions,
    aspectRatio,
    exportQuality, exportResolution, exportFps, exportCustomWidth, exportCustomHeight,
    exportFormat,
    gifFrameRate,
    gifLoop,
    gifSizePreset,
  ]);

  useEffect(() => {
    const snapshot = cloneSnapshot(buildHistorySnapshot());

    if (!historyCurrentRef.current) {
      historyCurrentRef.current = snapshot;
      return;
    }

    if (applyingHistoryRef.current) {
      historyCurrentRef.current = snapshot;
      applyingHistoryRef.current = false;
      lastHistoryChangeRef.current = null;
      return;
    }

    const now = Date.now();
    const changedKeys = changedHistoryKeys(historyCurrentRef.current, snapshot);
    const decision = decideHistoryChange(
      changedKeys,
      now,
      lastHistoryChangeRef.current,
      pendingAutomaticChangesRef.current,
    );
    if (decision === "none") {
      historyCurrentRef.current = snapshot;
      return;
    }
    if (decision === "absorb") {
      for (const key of changedKeys) pendingAutomaticChangesRef.current.delete(key);
      historyCurrentRef.current = snapshot;
      automaticChangeAbsorbedRef.current = true;
      return;
    }
    if (decision === "merge") {
      // The step before the drag is already in history; just follow the drag.
      historyCurrentRef.current = snapshot;
      lastHistoryChangeRef.current = { at: now, keys: changedKeys.join("|") };
      return;
    }

    lastHistoryChangeRef.current = { at: now, keys: changedKeys.join("|") };
    historyPastRef.current.push(cloneSnapshot(historyCurrentRef.current));
    if (historyPastRef.current.length > 100) {
      historyPastRef.current.shift();
    }
    historyCurrentRef.current = snapshot;
    historyFutureRef.current = [];
    setHistoryAvailability({ canUndo: true, canRedo: false });
  }, [buildHistorySnapshot, cloneSnapshot]);

  const getCurrentAspectRatioValue = useCallback(() => {
    const video = videoPlaybackRef.current?.video;
    const sourceRatio = video && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9;
    return getAspectRatioValue(aspectRatio, sourceRatio);
  }, [aspectRatio]);

  // A custom export size follows the frame's aspect ratio, so the export matches the preview.
  useEffect(() => {
    if (exportResolution !== 'custom' || duration <= 0) return;
    const fitted = fitCustomSizeToRatio(exportCustomWidth, exportCustomHeight, getCurrentAspectRatioValue());
    if (fitted.width !== exportCustomWidth || fitted.height !== exportCustomHeight) {
      setExportCustomWidth(fitted.width);
      setExportCustomHeight(fitted.height);
    }
  }, [exportResolution, exportCustomWidth, exportCustomHeight, duration, getCurrentAspectRatioValue]);

  // A recording that was never saved only needs saving once the user has edited it;
  // a saved project needs saving whenever it differs from the file.
  const hasUnsavedChanges = Boolean(
    videoPath && currentProjectSnapshot && (recoveredDraft || (
      lastSavedSnapshot === null
        ? historyAvailability.canUndo || sequenceEdited
        : currentProjectSnapshot !== lastSavedSnapshot
    )),
  );

  const autoDraft = useProjectDraft(currentProjectSnapshot,currentProjectPath,!embedded && hasUnsavedChanges,() => sequenceVisible ? sequenceTime.current/1000 : videoPlaybackRef.current?.video?.currentTime ?? currentTime);
  useEffect(() => {
    if (duration <= 0 || pendingPlayheadRef.current === null) return;
    const time = Math.min(duration,pendingPlayheadRef.current);
    pendingPlayheadRef.current = null;
    const video = videoPlaybackRef.current?.video;
    if (video) video.currentTime = time;
    setCurrentTime(time);
  },[duration]);

  useEffect(() => {
    if (!embedded || loading || !currentProjectSnapshot || !totalSourceMs) return;
    const {videoPath,editor} = JSON.parse(currentProjectSnapshot) as ReturnType<typeof createProjectData>;
    sessionRef.current?.onDraft({videoPath,editor,sourceMs:totalSourceMs});
  }, [embedded, loading, currentProjectSnapshot, totalSourceMs]);

  const wasCleanRef = useRef(true);
  useEffect(() => {
    if (automaticChangeAbsorbedRef.current) {
      automaticChangeAbsorbedRef.current = false;
      // An automatic change to a project that was saved and unchanged keeps it unchanged.
      if (!recoveredDraft && wasCleanRef.current && lastSavedSnapshot !== null && currentProjectSnapshot) {
        setLastSavedSnapshot(currentProjectSnapshot);
        return;
      }
    }
    wasCleanRef.current = !hasUnsavedChanges;
  }, [currentProjectSnapshot, hasUnsavedChanges, lastSavedSnapshot, recoveredDraft]);

  useEffect(() => {
    let active = true;
    async function loadInitialData() {
      try {
        if (sessionRef.current) {
          await applyLoadedProject(sessionRef.current.initial);
          return;
        }
        const currentProjectResult = await window.electronAPI.loadCurrentProjectFile();
        if (!active) return;
        if (currentProjectResult.success && currentProjectResult.project) {
          const restored = await applyLoadedProject(
            currentProjectResult.project,
            currentProjectResult.path ?? null,
            currentProjectResult.recovered ?? false,
          );
          if (restored) {
            const added = currentProjectResult.appendRecordingPath;
            const project = currentProjectResult.project;
            if (added && validateProjectData(project) && project.editor.sequence) {
              const base = project.editor.sequence;
              const {clip} = await inspectClip(added,sequenceEnd(base.clips),0);
              if (active) editSequence({...base, clips:[...base.clips,clip]});
            } else pendingAppendRecordingRef.current = added ?? null;
            return;
          }
        }

        const result = await window.electronAPI.getCurrentVideoPath();
        if (!active) return;
        if (result.success && result.path) {
          const sourcePath = fromFileUrl(result.path);
          const {clip,width,height,fps} = await inspectClip(sourcePath,0,0);
          if (!active) return;
          const even = (n: number) => Math.max(2,Math.min(8192,Math.round(n/2)*2));
          setSequence({width:even(width||1920),height:even(height||1080),fps,clips:[clip]});
          setSequenceVisible(true);
          setVideoSourcePath(sourcePath);
          setVideoPath(toFileUrl(sourcePath));
          setCurrentProjectPath(null);
          setLastSavedSnapshot(null);
        } else {
          setError("No video to load. Please record or select a video.");
        }
      } catch (err) {
        setError("Error loading video: " + String(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadInitialData();
    return () => { active = false; };
  }, [applyLoadedProject,editSequence]);

  const saveProject = useCallback(async (forceSaveAs: boolean) => {
    if (!videoPath) {
      toast.error('No video loaded');
      return false;
    }

    const sourcePath = videoSourcePath ?? fromFileUrl(videoPath);
    if (!sourcePath) {
      toast.error('Unable to determine source video path');
      return false;
    }

    if (!currentProjectSnapshot) return false;
    const projectData = JSON.parse(currentProjectSnapshot) as ReturnType<typeof createProjectData>;

    const fileNameBase = sourcePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || `project-${Date.now()}`;
    const projectSnapshot = JSON.stringify(projectData);
    projectData.workspace = {playheadSeconds: sequenceVisible ? sequenceTime.current/1000 : videoPlaybackRef.current?.video?.currentTime ?? 0};
    const result = await window.electronAPI.saveProjectFile(
      projectData,
      fileNameBase,
      forceSaveAs ? undefined : currentProjectPath ?? undefined,
    );

    if (result.canceled) {
      toast.info("Project save canceled");
      return false;
    }

    if (!result.success) {
      toast.error(result.message || 'Failed to save project');
      return false;
    }

    if (result.path) {
      setCurrentProjectPath(result.path);
    }
    setRecoveredDraft(false);
    setLastSavedSnapshot(projectSnapshot);

    toast.success(`Proje kaydedildi: ${result.path}`);
    return true;
  }, [videoPath, videoSourcePath, currentProjectPath, currentProjectSnapshot, sequenceVisible]);

  useEffect(() => {
    if (!embedded) window.electronAPI.setHasUnsavedChanges(hasUnsavedChanges);
  }, [hasUnsavedChanges,embedded]);

  useEffect(() => {
    if (embedded) return;
    const cleanup = window.electronAPI.onRequestSaveBeforeClose(async () => {
      return saveProject(false);
    });

    return () => cleanup?.();
  }, [saveProject, embedded]);

  const handleSaveProject = useCallback(async () => {
    await saveProject(false);
  }, [saveProject]);

  const handleSaveProjectAs = useCallback(async () => {
    await saveProject(true);
  }, [saveProject]);

  const handleLoadProject = useCallback(async () => {
    const result = await window.electronAPI.loadProjectFile();

    if (result.canceled) {
      return;
    }

    if (!result.success) {
      toast.error(result.message || 'Failed to load project');
      return;
    }

    const restored = await applyLoadedProject(result.project, result.path ?? null);
    if (!restored) {
      toast.error('Invalid project file format');
      return;
    }

    toast.success(`Project loaded from ${result.path}`);
  }, [applyLoadedProject]);

  useEffect(() => {
    if (embedded) return;
    const removeLoadListener = window.electronAPI.onMenuLoadProject(handleLoadProject);
    const removeSaveListener = window.electronAPI.onMenuSaveProject(handleSaveProject);
    const removeSaveAsListener = window.electronAPI.onMenuSaveProjectAs(handleSaveProjectAs);

    return () => {
      removeLoadListener?.();
      removeSaveListener?.();
      removeSaveAsListener?.();
    };
  }, [handleLoadProject, handleSaveProject, handleSaveProjectAs, embedded]);

  useEffect(() => {
    let mounted = true;

    async function loadCursorTelemetry() {
      if (!videoPath) {
        if (mounted) {
          setCursorTelemetry([]);
          setKeyTimes([]);
          setCursorTelemetryPath(null);
        }
        return;
      }

      try {
        const result = await window.electronAPI.getCursorTelemetry(sessionRef.current?.initial.videoPath ?? fromFileUrl(videoPath));
        if (mounted) {
          setCursorTelemetry(result.success ? result.samples : []);
          setKeyTimes(result.success ? result.keys ?? [] : []);
          setCursorTelemetryPath(videoPath);
        }
      } catch (telemetryError) {
        console.warn('Unable to load cursor telemetry:', telemetryError);
        if (mounted) {
          setCursorTelemetry([]);
          setKeyTimes([]);
          setCursorTelemetryPath(videoPath);
        }
      }
    }

    loadCursorTelemetry();

    return () => {
      mounted = false;
    };
  }, [videoPath]);

  const normalizedCursorTelemetry = useMemo(() => {
    if (cursorTelemetry.length === 0) {
      return [] as CursorTelemetryPoint[];
    }

    const totalMs = Math.max(0, Math.round(duration * 1000));
    return normalizeCursorTelemetry(cursorTelemetry, totalMs > 0 ? totalMs : Number.MAX_SAFE_INTEGER);
  }, [cursorTelemetry, duration]);

  const displayedTimelineWindow = useMemo(() => {
    const totalMs = Math.max(0, Math.round(duration * 1000));
    return getDisplayedTimelineWindowMs(totalMs, trimRegions);
  }, [duration, trimRegions]);

  const effectiveCursorTelemetry = useMemo(() => {
    if (!loopCursor) {
      return normalizedCursorTelemetry;
    }

    if (normalizedCursorTelemetry.length < 2 || displayedTimelineWindow.endMs <= displayedTimelineWindow.startMs) {
      return normalizedCursorTelemetry;
    }

    return buildLoopedCursorTelemetry(
      normalizedCursorTelemetry,
      displayedTimelineWindow.endMs,
      displayedTimelineWindow.startMs,
    );
  }, [loopCursor, normalizedCursorTelemetry, displayedTimelineWindow]);

  const effectiveZoomRegions = useMemo(() => {
    if (!loopCursor || zoomRegions.length === 0) {
      return zoomRegions;
    }

    if (displayedTimelineWindow.endMs <= displayedTimelineWindow.startMs) {
      return zoomRegions;
    }

    const dominantAtStart = findDominantRegion(zoomRegions, displayedTimelineWindow.startMs, { connectZooms }).region;
    if (!dominantAtStart) {
      return zoomRegions;
    }

    const endWindowStartMs = Math.max(displayedTimelineWindow.startMs, displayedTimelineWindow.endMs - LOOP_CURSOR_END_WINDOW_MS);
    const loopEndRegion: ZoomRegion = {
      id: `${dominantAtStart.id}__loop-end-sync`,
      startMs: endWindowStartMs,
      endMs: displayedTimelineWindow.endMs,
      depth: dominantAtStart.depth,
      focus: {
        cx: dominantAtStart.focus.cx,
        cy: dominantAtStart.focus.cy,
      },
    };

    return [
      ...zoomRegions.filter((region) => region.id !== loopEndRegion.id),
      loopEndRegion,
    ];
  }, [loopCursor, zoomRegions, displayedTimelineWindow, connectZooms]);

  const updateAutoZoomSettings = useCallback((next: AutoZoomSettings) => {
    setAutoZoomSettingsState(next);
    saveAutoZoomSettings(next);
  }, []);

  const openAutoZoomSettings = useCallback(() => {
    setSettingsFocusRequest({ tab: "motion", target: "auto-zoom", nonce: Date.now() });
  }, []);

  /** Zoom regions for the recorded clicks with the current settings (fresh ids, not yet applied). */
  const buildAutoZoomRegions = useCallback((): ZoomRegion[] => {
    const totalMs = Math.max(0, Math.round(duration * 1000));
    const { depth, mode, density } = autoZoomSettings;
    const spans = buildAutoZoomSpans(normalizedCursorTelemetry, totalMs, depth, { mode, density });
    let nextId = nextZoomIdRef.current;
    const regions = spans.map<ZoomRegion>((span) => ({
      id: `zoom-${nextId++}`,
      startMs: span.startMs,
      endMs: span.endMs,
      depth,
      focus: span.focus,
    }));
    nextZoomIdRef.current = nextId;
    return regions;
  }, [duration, autoZoomSettings, normalizedCursorTelemetry]);

  const showClickTrackingHelp = useCallback(async () => {
    const status = await window.electronAPI.getAccessibilityPermissionStatus().catch(() => null);
    if (!status?.success || status.trusted) {
      return false;
    }
    toast.info(t('editor.autoZoom.noClickData'), {
      id: 'auto-zoom',
      description: t('editor.autoZoom.needsAccessibility'),
      duration: 12000,
      action: {
        label: t('editor.autoZoom.allow'),
        onClick: () => {
          void window.electronAPI.requestAccessibilityPermission().then((result) => {
            if (!result.trusted) void window.electronAPI.openAccessibilityPreferences();
          });
        },
      },
    });
    return true;
  }, [t]);

  // A new recording gets zooms where the user clicked, once its telemetry is in.
  useEffect(() => {
    if (!videoPath || duration <= 0 || cursorTelemetryPath !== videoPath) {
      return;
    }

    if (autoSuggestedVideoPathRef.current === videoPath) {
      return;
    }
    autoSuggestedVideoPathRef.current = videoPath;

    if (zoomRegions.length > 0 || autoZoomSettings.mode === 'off') {
      return;
    }

    const additions = buildAutoZoomRegions();
    if (additions.length === 0) {
      if (normalizedCursorTelemetry.length === 0) {
        void showClickTrackingHelp();
      } else {
        toast.info(t('editor.autoZoom.nothingFound'), {
          id: 'auto-zoom',
          action: { label: t('editor.autoZoom.adjust'), onClick: openAutoZoomSettings },
        });
      }
      return;
    }

    // Generated zooms are part of the recording, not an edit to undo or save.
    expectAutomaticChange("zoomRegions");
    setZoomRegions((prev) => (prev.length > 0 ? prev : additions));
    const addedIds = new Set(additions.map((region) => region.id));
    const clicks = countClicks(normalizedCursorTelemetry);
    toast.success(
      clicks > 0
        ? t('editor.autoZoom.applied', undefined, { clicks: String(clicks), zooms: String(additions.length) })
        : t('editor.autoZoom.appliedFromPauses', undefined, { zooms: String(additions.length) }),
      {
        id: 'auto-zoom',
        duration: 8000,
        action: {
          label: t('editor.autoZoom.remove'),
          onClick: () => setZoomRegions((prev) => prev.filter((region) => !addedIds.has(region.id))),
        },
        cancel: { label: t('editor.autoZoom.adjust'), onClick: openAutoZoomSettings },
      },
    );
  }, [videoPath, duration, cursorTelemetryPath, normalizedCursorTelemetry, zoomRegions.length, autoZoomSettings.mode, buildAutoZoomRegions, expectAutomaticChange, showClickTrackingHelp, openAutoZoomSettings, t]);

  // A saved project without zooms: offer the automatic zooms as a normal, undoable edit.
  useEffect(() => {
    if (!videoPath || duration <= 0 || cursorTelemetryPath !== videoPath || autoZoomOfferPathRef.current !== videoPath) {
      return;
    }
    autoZoomOfferPathRef.current = null;
    if (zoomRegions.length > 0 || autoZoomSettings.mode === 'off') {
      return;
    }

    const { depth, mode, density } = autoZoomSettings;
    const count = buildAutoZoomSpans(normalizedCursorTelemetry, Math.round(duration * 1000), depth, { mode, density }).length;
    if (count === 0) {
      return;
    }
    toast(t('editor.autoZoom.offer', undefined, { zooms: String(count) }), {
      id: 'auto-zoom',
      duration: 10000,
      action: {
        label: t('editor.autoZoom.apply'),
        onClick: () => {
          const additions = buildAutoZoomRegions();
          setZoomRegions((prev) => (prev.length > 0 ? prev : additions));
        },
      },
    });
  }, [videoPath, duration, cursorTelemetryPath, normalizedCursorTelemetry, zoomRegions.length, autoZoomSettings, buildAutoZoomRegions, t]);

  const handleRegenerateAutoZoom = useCallback(() => {
    const regions = buildAutoZoomRegions();
    setZoomRegions(regions);
    setSelectedZoomId(null);
    toast.success(t('editor.autoZoom.regenerated', undefined, { zooms: String(regions.length) }), { id: 'auto-zoom' });
  }, [buildAutoZoomRegions, t]);

  // Initialize default wallpaper with resolved asset path
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resolvedPath = await getAssetPath(DEFAULT_WALLPAPER_RELATIVE_PATH);
        if (mounted && resolvedPath !== WALLPAPER_PATHS[0] && wallpaperRef.current === WALLPAPER_PATHS[0]) {
          // Same wallpaper, resolved path: not a user edit.
          expectAutomaticChange("appearance.wallpaper");
          setWallpaper(resolvedPath);
        }
      } catch (err) {
        // If resolution fails, keep the fallback
        console.warn('Failed to resolve default wallpaper path:', err);
      }
    })();
    return () => { mounted = false };
  }, [expectAutomaticChange]);

  function togglePlayPause() {
    const playback = videoPlaybackRef.current;
    const video = playback?.video;
    if (!playback || !video) return;

    if (isPlaying) {
      pausePlayback();
      return;
    }
    const position = endingPositionRef.current;
    if (position !== null && position < endingMs - 30) {
      runEndingClock(position);
      return;
    }
    // At the very end: start over from the beginning.
    endingPositionRef.current = null;
    playback.play().catch(err => console.error('Video play failed:', err));
  }

  function handleSeek(time: number) {
    const playback = videoPlaybackRef.current;
    const video = playback?.video;
    if (!playback || !video) return;
    if (endingMs > 0 && duration > 0 && time * 1000 > totalSourceMs) {
      const position = Math.min(endingMs, time * 1000 - totalSourceMs);
      const keepPlaying = isPlaying;
      if (keepPlaying && endingClockRef.current === null) playback.pause();
      endingPositionRef.current = position;
      video.currentTime = duration;
      setCurrentTime((totalSourceMs + position) / 1000);
      if (keepPlaying) runEndingClock(position);
      return;
    }
    if (endingPositionRef.current !== null) {
      const wasRunning = endingClockRef.current !== null;
      stopEndingClock();
      endingPositionRef.current = null;
      video.currentTime = time;
      setCurrentTime(time);
      if (wasRunning) {
        setIsPlaying(false);
        playback.play().catch(err => console.error('Video play failed:', err));
      }
      return;
    }
    video.currentTime = time;
  }

  const handleSelectZoom = useCallback((id: string | null) => {
    setSelectedZoomId(id);
    if (id) {
      setSelectedSpeedId(null);
      setSelectedTrimId(null);
      setSelectedAudioId(null);
    }
  }, []);

  const handleSelectTrim = useCallback((id: string | null) => {
    setSelectedTrimId(id);
    if (id) {
      setSelectedSpeedId(null);
      setSelectedZoomId(null);
      setSelectedAnnotationId(null);
      setSelectedAudioId(null);
    }
  }, []);

  const handleSelectAnnotation = useCallback((id: string | null) => {
    setSelectedAnnotationId(id);
    if (id) {
      setSelectedSpeedId(null);
      setSelectedZoomId(null);
      setSelectedTrimId(null);
      setSelectedAudioId(null);
    }
  }, []);

  const handleSelectBlur = useCallback((id: string | null) => {
    setSelectedBlurId(id);
    if (id) {
      setSelectedZoomId(null);
      setSelectedTrimId(null);
      setSelectedSpeedId(null);
      setSelectedAnnotationId(null);
      setSelectedAudioId(null);
      setSelectedClipStart(null);
      setSelectedTypingStart(null);
    }
  }, []);

  /** A new blur area at `span`, selected so it can be placed on the preview right away. */
  const handleBlurAdded = useCallback((span: Span) => {
    const id = `blur-${nextBlurIdRef.current++}`;
    const region: BlurRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
      rect: { ...DEFAULT_BLUR_RECT },
      style: 'blur',
      strength: DEFAULT_BLUR_STRENGTH,
    };
    setBlurRegions((prev) => [...prev, region]);
    handleSelectBlur(id);
  }, [handleSelectBlur]);

  const handleBlurSpanChange = useCallback((id: string, span: Span) => {
    setBlurRegions((prev) => prev.map((region) => (region.id === id ? { ...region, startMs: Math.round(span.start), endMs: Math.round(span.end) } : region)));
  }, []);

  const handleBlurRectChange = useCallback((id: string, rect: BlurRect) => {
    setBlurRegions((prev) => prev.map((region) => (region.id === id ? { ...region, rect: clampBlurRect(rect) } : region)));
  }, []);

  const handleBlurDelete = useCallback((id: string) => {
    setBlurRegions((prev) => prev.filter((region) => region.id !== id));
    setSelectedBlurId((current) => (current === id ? null : current));
  }, []);

  const handleZoomAdded = useCallback((span: Span) => {
    setSelectedSpeedId(null);
    setSelectedAudioId(null);
    const id = `zoom-${nextZoomIdRef.current++}`;
    const newRegion: ZoomRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
      depth: DEFAULT_ZOOM_DEPTH,
      focus: { cx: 0.5, cy: 0.5 },
    };
    setZoomRegions((prev) => [...prev, newRegion]);
    setSelectedZoomId(id);
    setSelectedTrimId(null);
    setSelectedAnnotationId(null);
  }, []);

  const handleZoomSuggested = useCallback((span: Span, focus: ZoomFocus) => {
    setSelectedSpeedId(null);
    setSelectedAudioId(null);
    const id = `zoom-${nextZoomIdRef.current++}`;
    const newRegion: ZoomRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
      depth: DEFAULT_ZOOM_DEPTH,
      focus: clampFocusToDepth(focus, DEFAULT_ZOOM_DEPTH),
    };
    setZoomRegions((prev) => [...prev, newRegion]);
    setSelectedZoomId(id);
    setSelectedTrimId(null);
    setSelectedAnnotationId(null);
  }, []);

  const handleTrimAdded = useCallback((span: Span) => {
    setSelectedSpeedId(null);
    setSelectedAudioId(null);
    const id = `trim-${nextTrimIdRef.current++}`;
    const newRegion: TrimRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
    };
    setTrimRegions((prev) => [...prev, newRegion]);
    setSelectedTrimId(id);
    setSelectedZoomId(null);
    setSelectedAnnotationId(null);
  }, []);

  const handleZoomSpanChange = useCallback((id: string, span: Span) => {
    setZoomRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              startMs: Math.round(span.start),
              endMs: Math.round(span.end),
            }
          : region,
      ),
    );
  }, []);

  const handleTrimSpanChange = useCallback((id: string, span: Span) => {
    setTrimRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              startMs: Math.round(span.start),
              endMs: Math.round(span.end),
            }
          : region,
      ),
    );
  }, []);

  const handleZoomFocusChange = useCallback((id: string, focus: ZoomFocus) => {
    setZoomRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              focus: clampFocusToDepth(focus, region.depth),
            }
          : region,
      ),
    );
  }, []);

  const handleZoomDepthChange = useCallback((depth: ZoomDepth) => {
    if (!selectedZoomId) return;
    setZoomRegions((prev) =>
      prev.map((region) =>
        region.id === selectedZoomId
          ? {
              ...region,
              depth,
              focus: clampFocusToDepth(region.focus, depth),
            }
          : region,
      ),
    );
  }, [selectedZoomId]);

  const handleZoomDelete = useCallback((id: string) => {
    setZoomRegions((prev) => prev.filter((region) => region.id !== id));
    if (selectedZoomId === id) {
      setSelectedZoomId(null);
    }
  }, [selectedZoomId]);

  const handleTrimDelete = useCallback((id: string) => {
    setTrimRegions((prev) => prev.filter((region) => region.id !== id));
    if (selectedTrimId === id) {
      setSelectedTrimId(null);
    }
  }, [selectedTrimId]);

  const handleSelectSpeed = useCallback((id: string | null) => {
    setSelectedSpeedId(id);
    if (id) {
      setSelectedZoomId(null);
      setSelectedTrimId(null);
      setSelectedAnnotationId(null);
      setSelectedAudioId(null);
    }
  }, []);

  const handleSpeedAdded = useCallback((span: Span) => {
    const id = `speed-${nextSpeedIdRef.current++}`;
    const newRegion: SpeedRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
      speed: DEFAULT_PLAYBACK_SPEED,
    };
    setSpeedRegions((prev) => [...prev, newRegion]);
    setSelectedSpeedId(id);
    setSelectedZoomId(null);
    setSelectedTrimId(null);
    setSelectedAnnotationId(null);
  }, []);

  const handleSpeedSpanChange = useCallback((id: string, span: Span) => {
    setSpeedRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              startMs: Math.round(span.start),
              endMs: Math.round(span.end),
            }
          : region,
      ),
    );
  }, []);

  const handleSpeedDelete = useCallback((id: string) => {
    setSpeedRegions((prev) => prev.filter((region) => region.id !== id));
    if (selectedSpeedId === id) {
      setSelectedSpeedId(null);
    }
  }, [selectedSpeedId]);

  const handleSelectAudio = useCallback((id: string | null) => {
    setSelectedAudioId(id);
    if (id) {
      setSelectedZoomId(null);
      setSelectedTrimId(null);
      setSelectedAnnotationId(null);
      setSelectedSpeedId(null);
    }
  }, []);

  /**
   * Opens a video made from the edit's own (the joined or rebuilt one) in place of the current one.
   * Its length is known already: until the file loads, the timeline would otherwise squeeze edits
   * that moved past the old video's end back into it.
   */
  const openRebuiltVideo = useCallback((rebuiltPath: string, playheadMs: number, totalMs: number) => {
    const rebuiltUrl = toFileUrl(rebuiltPath);
    setDuration(totalMs / 1000);
    // The new video keeps the zooms already made instead of getting new automatic ones.
    autoSuggestedVideoPathRef.current = rebuiltUrl;
    autoZoomOfferPathRef.current = null;
    pendingPlayheadRef.current = playheadMs / 1000;
    setIsPlaying(false);
    setVideoSourcePath(rebuiltPath);
    setVideoPath(rebuiltUrl);
  }, []);

  /**
   * After the video was rebuilt with its pieces in a new order, every edit moves with its piece,
   * in the undo history too, so earlier steps can still be undone. The move itself comes with the
   * new video and is not an undo step (moving the part back undoes it).
   */
  const followReorder = useCallback((reorder: Reorder) => {
    const trimId = () => `trim-${nextTrimIdRef.current++}`;
    const speedId = () => `speed-${nextSpeedIdRef.current++}`;
    const blurId = () => `blur-${nextBlurIdRef.current++}`;
    const remap = (snapshot: EditorHistorySnapshot): EditorHistorySnapshot => ({
      ...snapshot,
      zoomRegions: moveRegions(snapshot.zoomRegions, reorder),
      trimRegions: splitRegions(snapshot.trimRegions, reorder, trimId),
      speedRegions: splitRegions(snapshot.speedRegions, reorder, speedId),
      annotationRegions: moveRegions(snapshot.annotationRegions, reorder),
      audioRegions: moveRegions(snapshot.audioRegions, reorder),
      // A blur hides what is in the video there, so it goes wherever that piece goes.
      blurRegions: splitRegions(snapshot.blurRegions ?? [], reorder, blurId),
      clipSplits: reorderSplits(snapshot.clipSplits ?? [], reorder),
    });
    historyPastRef.current = historyPastRef.current.map(remap);
    historyFutureRef.current = historyFutureRef.current.map(remap);
    expectAutomaticChange('zoomRegions', 'trimRegions', 'speedRegions', 'annotationRegions', 'audioRegions', 'blurRegions', 'clipSplits');
    setZoomRegions((previous) => moveRegions(previous, reorder));
    setTrimRegions((previous) => splitRegions(previous, reorder, trimId));
    setSpeedRegions((previous) => splitRegions(previous, reorder, speedId));
    setAnnotationRegions((previous) => moveRegions(previous, reorder));
    setAudioRegions((previous) => moveRegions(previous, reorder));
    setBlurRegions((previous) => splitRegions(previous, reorder, blurId));
    setClipSplits((previous) => reorderSplits(previous, reorder));
    setVideoClips((previous) => reorderVideoClips(previous, reorder));
  }, [expectAutomaticChange]);

  /** Rebuilds `sourcePath` with its pieces in this order (progress on the "Video ekle" button). */
  const rebuildInOrder = useCallback(async (sourcePath: string, pieces: SourcePiece[]) => {
    setAddingVideo(0);
    const stopProgress = window.electronAPI.onVideoAppendProgress(({ fraction }) => setAddingVideo(fraction));
    try {
      return await window.electronAPI.reorderVideo(sourcePath, pieces);
    } catch (error) {
      return { success: false as const, error: String(error) };
    } finally {
      stopProgress();
      setAddingVideo(null);
    }
  }, []);

  /**
   * Joins a video (picked by the user when no path is given) to the edit: at the end, the start or
   * the playhead. It is joined to the end first, where every edit keeps its place, and then moved
   * with the rest of the edit following it; the added video becomes its own part on the timeline.
   */
  const appendVideo = useCallback(async (addedPath?: string, place: VideoInsertPlace = 'end') => {
    const sourcePath = videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null);
    if (!sourcePath || addingVideo !== null) return;
    pausePlayback();
    const insertAtMs = place === 'start' ? 0 : place === 'playhead' ? Math.round(currentTime * 1000) : Number.POSITIVE_INFINITY;
    setAddingVideo(0);
    const stopProgress = window.electronAPI.onVideoAppendProgress(({ fraction }) => setAddingVideo(fraction));
    try {
      const result = await window.electronAPI.appendVideo(sourcePath, addedPath);
      if (!result.success) {
        if (!result.canceled) toast.error(t('timeline.addVideo.failed', undefined, { error: result.error ?? '' }));
        return;
      }
      stopProgress();
      let videoPathToOpen = result.path;
      let reorder: Reorder | null = null;
      if (insertAtMs < result.offsetMs) {
        const pieces = insertAddedAt(Math.max(result.totalMs, result.offsetMs + result.addedDurationMs), result.offsetMs, insertAtMs);
        const moved = await rebuildInOrder(result.path, pieces);
        if (moved.success) {
          videoPathToOpen = moved.path;
          reorder = createReorder(pieces);
        } else {
          toast.error(t('timeline.move.failed', undefined, { error: moved.error ?? '' }));
        }
      }
      const fileName = (filePath: string) => filePath.split(/[\\/]/).pop() || 'Video';
      setVideoClips((previous) => [
        ...(previous.length > 1 ? previous : [{ name: fileName(sourcePath), startMs: 0 }]),
        { name: result.addedName, startMs: result.offsetMs },
      ]);
      // The added video is its own part; this comes with the new video, not as an edit to undo.
      expectAutomaticChange('clipSplits');
      setClipSplits((previous) => normalizeSplits([...previous, result.offsetMs], 0));
      if (reorder) followReorder(reorder);
      openRebuiltVideo(videoPathToOpen, reorder ? reorder.time(result.offsetMs) : result.offsetMs, reorder ? reorder.totalMs : result.totalMs);
      toast.success(t(reorder ? (insertAtMs === 0 ? 'timeline.addVideo.addedStart' : 'timeline.addVideo.addedPlayhead') : 'timeline.addVideo.added', undefined, { name: result.addedName }));
    } catch (error) {
      toast.error(t('timeline.addVideo.failed', undefined, { error: String(error) }));
    } finally {
      stopProgress();
      setAddingVideo(null);
    }
  }, [videoSourcePath, videoPath, addingVideo, currentTime, expectAutomaticChange, followReorder, openRebuiltVideo, rebuildInOrder, t]);

  /**
   * Moves the part of the video that starts at `partStartMs` (source ms) so that it comes before
   * the piece at `toIndex` (or last). The video is rebuilt in the new order.
   */
  const moveClipPart = useCallback(async (partStartMs: number, toIndex: number) => {
    const sourcePath = videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null);
    if (!sourcePath || addingVideo !== null) return;
    const pieces = piecesBetween(clipSplits, totalSourceMs);
    const from = pieces.findIndex((piece) => partStartMs >= piece.startMs && partStartMs < piece.endMs);
    if (from < 0) return;
    const order = movePiece(pieces, from, toIndex);
    if (isInOrder(order)) return;
    pausePlayback();
    const waiting = toast.loading(t('timeline.move.moving'));
    const result = await rebuildInOrder(sourcePath, order);
    if (!result.success) {
      toast.error(t('timeline.move.failed', undefined, { error: result.error ?? '' }), { id: waiting });
      return;
    }
    const reorder = createReorder(order);
    followReorder(reorder);
    const movedStart = Math.round(reorder.time(partStartMs));
    openRebuiltVideo(result.path, movedStart, reorder.totalMs);
    setSelectedClipStart(movedStart);
    toast.success(t('timeline.move.moved'), { id: waiting });
  }, [videoSourcePath, videoPath, addingVideo, clipSplits, totalSourceMs, followReorder, openRebuiltVideo, rebuildInOrder, t]);
  /** The part dropped at a piece edge of the edited timeline (`toOutMs`): it goes before what starts there. */
  const dropClipPart = useCallback((partStartMs: number, toOutMs: number) => {
    const rest = piecesBetween(clipSplits, totalSourceMs).filter((piece) => !(partStartMs >= piece.startMs && partStartMs < piece.endMs));
    void moveClipPart(partStartMs, rest.filter((piece) => toOutputMs(cutMap, piece.startMs) < toOutMs).length);
  }, [clipSplits, totalSourceMs, cutMap, moveClipPart]);

  /** "Yeni kayıt çek ve sona ekle": the recorder opens and the new recording comes back to this project's end. */
  const recordAndAppend = useCallback(async () => {
    if (!currentProjectSnapshot) return;
    pausePlayback();
    const project = { ...JSON.parse(currentProjectSnapshot), workspace: { playheadSeconds: sequenceVisible ? sequenceTime.current/1000 : currentTime } };
    const started = await window.electronAPI.recordAndAppend(project, hasUnsavedChanges);
    if (!started) toast.error(t('timeline.addVideo.failed', undefined, { error: '' }));
  }, [currentProjectSnapshot, currentTime, sequenceVisible, hasUnsavedChanges, t]);
  const handleAddVideo = useCallback((from: 'file' | 'record', place: VideoInsertPlace = 'end') => {
    if (from === 'record') void recordAndAppend();
    else void appendVideo(undefined, place);
  }, [appendVideo, recordAndAppend]);
  /** Opens the ending extension's controls in the inspector. */
  const showEndingSettings = useCallback(() => {
    setInspectorVisible(true);
    setFocusMode(false);
    setSettingsFocusRequest({ tab: "appearance", target: "ending", nonce: Date.now() });
  }, []);
  /** "Sonu uzat": holds the last frame for 3 s (unless there already is an extension) and shows its controls. */
  const extendEnding = useCallback(() => {
    setEnding((previous) => (previous.durationMs > 0 ? previous : { ...previous, durationMs: 3000 }));
    showEndingSettings();
  }, [showEndingSettings]);
  // A recording made with "Yeni kayıt çek ve sona ekle" is added once its project is open again.
  useEffect(() => {
    const recordingPath = pendingAppendRecordingRef.current;
    if (!recordingPath || duration <= 0 || !videoSourcePath) return;
    pendingAppendRecordingRef.current = null;
    void appendVideo(recordingPath);
  }, [duration, videoSourcePath, appendVideo]);

  const handleAudioAdded = useCallback((span: Span, audioPath: string, sourceDurationMs?: number) => {
    const id = `audio-${nextAudioIdRef.current++}`;
    const newRegion: AudioRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
      audioPath,
      volume: 1,
      ...(sourceDurationMs && sourceDurationMs > 0 ? { sourceDurationMs: Math.round(sourceDurationMs) } : {}),
    };
    // A new clip goes on the first track that is free where it lands.
    setAudioRegions((prev) => {
      const track = firstFreeAudioTrack(prev, audioTimelineSpan(newRegion, cutMap), cutMap);
      return [...prev, track > 0 ? { ...newRegion, track } : newRegion];
    });
    setSelectedAudioId(id);
    setSelectedZoomId(null);
    setSelectedTrimId(null);
    setSelectedAnnotationId(null);
    setSelectedSpeedId(null);
  }, [cutMap]);

  /** A clip moved or resized on the edited timeline (where cuts are already removed), possibly onto another track. */
  const handleAudioTimelineChange = useCallback((id: string, span: Span, track?: number) => {
    setAudioRegions((prev) => prev.map((region) => {
      if (region.id !== id) return region;
      const moved = applyAudioTimelineChange(region, span, cutMap);
      if (track === undefined) return moved;
      const { track: _previous, ...rest } = moved;
      return track > 0 ? { ...rest, track } : rest;
    }));
  }, [cutMap]);

  const handleAudioDelete = useCallback((id: string) => {
    setAudioRegions((prev) => prev.filter((region) => region.id !== id));
    if (selectedAudioId === id) {
      setSelectedAudioId(null);
    }
  }, [selectedAudioId]);

  const handleSpeedChange = useCallback((speed: PlaybackSpeed) => {
    if (!selectedSpeedId) return;
    setSpeedRegions((prev) =>
      prev.map((region) =>
        region.id === selectedSpeedId ? { ...region, speed } : region,
      ),
    );
  }, [selectedSpeedId]);

  const handleAnnotationAdded = useCallback((span: Span) => {
    setSelectedSpeedId(null);
    setSelectedAudioId(null);
    const id = `annotation-${nextAnnotationIdRef.current++}`;
    const zIndex = nextAnnotationZIndexRef.current++; // Assign z-index based on creation order
    const newRegion: AnnotationRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
      type: 'text',
      content: '',
      textContent: '',
      position: { ...DEFAULT_ANNOTATION_POSITION },
      size: { ...DEFAULT_ANNOTATION_SIZE },
      style: { ...DEFAULT_ANNOTATION_STYLE },
      zIndex,
    };
    setAnnotationRegions((prev) => [...prev, newRegion]);
    setSelectedAnnotationId(id);
    setSelectedZoomId(null);
    setSelectedTrimId(null);
  }, [t]);

  const handleAiCaptionsApply = useCallback((captions: { slot: CaptionSlot; text: string }[]) => {
    const preset = TEXT_STYLE_PRESETS.find((candidate) => candidate.id === 'subtitle');
    const newRegions = captions.map(({ slot, text }): AnnotationRegion => ({
      id: `annotation-${nextAnnotationIdRef.current++}`,
      startMs: slot.startMs,
      endMs: slot.endMs,
      type: 'text',
      content: text,
      textContent: text,
      position: { ...SUBTITLE_PLACEMENT.position },
      size: { ...SUBTITLE_PLACEMENT.size },
      style: { ...DEFAULT_ANNOTATION_STYLE, ...preset?.style, backgroundColor: '#000000aa' },
      zIndex: nextAnnotationZIndexRef.current++,
    }));
    setAnnotationRegions((previous) => [...previous, ...newRegions]);
    setSelectedAnnotationId(null);
  }, []);

  /** The caption look picked while there were no captions yet; captions that exist show their own. */
  const [pickedCaptionStyle, setPickedCaptionStyle] = useState<CaptionStyleChoice>(DEFAULT_CAPTION_STYLE);
  const captionStyle = useMemo(() => detectCaptionStyle(annotationRegions) ?? pickedCaptionStyle, [annotationRegions, pickedCaptionStyle]);
  /** A ready-made look for every speech caption, as one undo step (dragging the brand colour stays one step). */
  const handleCaptionStyleChange = useCallback((choice: CaptionStyleChoice) => {
    setPickedCaptionStyle(choice);
    if (choice.id !== captionStyle.id) startNewHistoryStep();
    setAnnotationRegions((previous) => applyCaptionStyle(previous, choice));
  }, [captionStyle.id, startNewHistoryStep]);

  /** Speech captions replace earlier ones as one undo step, with the subtitle preset's size and motion and the chosen look. */
  const handleAutoCaptionsApply = useCallback((cues: CaptionCue[]) => {
    const preset = TEXT_STYLE_PRESETS.find((candidate) => candidate.id === 'subtitle');
    const newRegions = cues.map((cue): AnnotationRegion => ({
      id: `annotation-${nextAnnotationIdRef.current++}`,
      startMs: cue.startMs,
      endMs: cue.endMs,
      type: 'text',
      content: cue.text,
      textContent: cue.text,
      position: { ...SUBTITLE_PLACEMENT.position },
      size: { ...SUBTITLE_PLACEMENT.size },
      style: { ...DEFAULT_ANNOTATION_STYLE, ...preset?.style, ...captionLook(captionStyle) },
      zIndex: nextAnnotationZIndexRef.current++,
      animation: preset?.animation,
      generatedBy: 'transcript',
    }));
    startNewHistoryStep();
    setAnnotationRegions((previous) => [...previous.filter((region) => region.generatedBy !== 'transcript'), ...newRegions]);
    setSelectedAnnotationId(null);
    toast.success(t('editor.autoCaptions.applied', undefined, { count: newRegions.length }), {
      id: 'auto-captions',
      duration: 8000,
      action: { label: t('editor.autoCaptions.undo'), onClick: () => handleUndo() },
    });
  }, [t, handleUndo, startNewHistoryStep, captionStyle]);

  const autoCaptions = useAutoCaptions(videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null), trimRegions, handleAutoCaptionsApply);
  const transcriptCaptionCount = useMemo(() => annotationRegions.filter((region) => region.generatedBy === 'transcript').length, [annotationRegions]);

  // The preview plays the recording at the volume it will be exported with.
  useEffect(() => {
    const video = videoPlaybackRef.current?.video;
    if (!video) return;
    video.volume = sourceAudioVolume * (1 - previewFade);
    video.muted = sourceAudioVolume === 0;
  }, [sourceAudioVolume, videoPath, duration, previewFade]);

  const agentVideoPath = videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null);
  /** What an AI agent is told about the project when a task starts. */
  const getAgentSnapshot = (): AgentProjectSnapshot | null => {
    if (!agentVideoPath || duration <= 0) return null;
    const textOf = (region: AnnotationRegion) => getAnnotationText(region).trim();
    return {
      videoPath: agentVideoPath,
      durationMs: Math.round(duration * 1000),
      language: autoCaptions.language,
      aspectRatio,
      trims: trimRegions.map(({ startMs, endMs }) => ({ startMs, endMs })),
      zooms: zoomRegions.map(({ startMs, endMs, depth, focus }) => ({ startMs, endMs, depth, focus })),
      speeds: speedRegions.map(({ startMs, endMs, speed }) => ({ startMs, endMs, speed })),
      captions: annotationRegions.filter((region) => region.type === 'text' && region.generatedBy === 'transcript' && textOf(region)).map((region) => ({ startMs: region.startMs, endMs: region.endMs, text: textOf(region) })),
      texts: annotationRegions.filter((region) => region.type === 'text' && region.generatedBy !== 'transcript' && textOf(region)).map((region) => ({ startMs: region.startMs, endMs: region.endMs, text: textOf(region) })),
    };
  };
  const agent = useAgentRun(agentVideoPath, getAgentSnapshot);
  const [agentWideOpen, setAgentWideOpen] = useState(false);

  /** The chosen agent proposals become one undoable edit. */
  const handleAgentApply = () => {
    const next = applyProposals(
      { zooms: zoomRegions, trims: trimRegions, speeds: speedRegions, annotations: annotationRegions },
      agent.proposals,
      agent.chosen,
      {
        zoom: () => `zoom-${nextZoomIdRef.current++}`,
        trim: () => `trim-${nextTrimIdRef.current++}`,
        speed: () => `speed-${nextSpeedIdRef.current++}`,
        annotation: () => `annotation-${nextAnnotationIdRef.current++}`,
        zIndex: () => nextAnnotationZIndexRef.current++,
      },
    );
    const count = agent.proposals.items.filter((item) => agent.chosen.has(item.id)).length;
    startNewHistoryStep();
    setZoomRegions(next.zooms);
    setTrimRegions(next.trims);
    setSpeedRegions(next.speeds);
    // Captions the agent writes get the same look as the others.
    setAnnotationRegions(applyCaptionStyle(next.annotations, captionStyle));
    setSelectedZoomId(null);
    setSelectedAnnotationId(null);
    agent.clearProposals();
    toast.success(t('editor.agent.applied', undefined, { count }), {
      id: 'agent-apply',
      duration: 8000,
      action: { label: t('editor.agent.undo'), onClick: () => handleUndo() },
    });
  };

  const handleAnnotationSpanChange = useCallback((id: string, span: Span) => {
    setAnnotationRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              startMs: Math.round(span.start),
              endMs: Math.round(span.end),
            }
          : region,
      ),
    );
  }, []);

  const handleAnnotationDelete = useCallback((id: string) => {
    setAnnotationRegions((prev) => prev.filter((region) => region.id !== id));
    if (selectedAnnotationId === id) {
      setSelectedAnnotationId(null);
    }
  }, [selectedAnnotationId]);

  // Copy / paste / duplicate / split / nudge for any timeline region, from the
  // context menu or keyboard. Each kind keeps its own state, id sequence and rules.
  const regionClipboardRef = useRef<{ kind: RegionKind; region: TimedRegion } | null>(null);
  const [canPasteRegion, setCanPasteRegion] = useState(false);
  const handleRegionCommand = useCallback((command: RegionCommand, target: RegionTarget | null) => {
    // Pasted or duplicated audio goes to the first track that is free where it lands.
    const onFreeAudioTrack = (region: AudioRegion): AudioRegion => {
      const free = firstFreeAudioTrack(audioRegions, audioTimelineSpan(region, cutMap), cutMap, region.id);
      const { track: _previous, ...rest } = region;
      return free > 0 ? { ...rest, track: free } : rest;
    };
    type Track = {
      regions: TimedRegion[];
      set: (update: (prev: TimedRegion[]) => TimedRegion[]) => void;
      nextId: () => string;
      remove: (id: string) => void;
      select: (id: string | null) => void;
    };
    const asTrack = <T extends TimedRegion>(
      regions: T[],
      set: Dispatch<SetStateAction<T[]>>,
      prefix: string,
      idRef: MutableRefObject<number>,
      remove: (id: string) => void,
      select: (id: string | null) => void,
    ): Track => ({
      regions,
      set: set as unknown as Track["set"],
      nextId: () => `${prefix}-${idRef.current++}`,
      remove,
      select,
    });
    const tracks: Record<RegionKind, Track> = {
      zoom: asTrack(zoomRegions, setZoomRegions, "zoom", nextZoomIdRef, handleZoomDelete, handleSelectZoom),
      trim: asTrack(trimRegions, setTrimRegions, "trim", nextTrimIdRef, handleTrimDelete, handleSelectTrim),
      speed: asTrack(speedRegions, setSpeedRegions, "speed", nextSpeedIdRef, handleSpeedDelete, handleSelectSpeed),
      annotation: asTrack(annotationRegions, setAnnotationRegions, "annotation", nextAnnotationIdRef, handleAnnotationDelete, handleSelectAnnotation),
      audio: asTrack(audioRegions, setAudioRegions, "audio", nextAudioIdRef, handleAudioDelete, handleSelectAudio),
      blur: asTrack(blurRegions, setBlurRegions, "blur", nextBlurIdRef, handleBlurDelete, handleSelectBlur),
    };
    // Texts and sounds may sit in the ending extension; video edits stay on the video.
    const totalFor = (kind: RegionKind) => (kind === "annotation" || kind === "audio" ? totalSourceMs + endingMs : totalSourceMs);
    const playheadMs = Math.round(currentTime * 1000);
    // New text copies go on top of existing texts.
    const withZIndex = (kind: RegionKind, region: TimedRegion) =>
      kind === "annotation" ? { ...region, zIndex: nextAnnotationZIndexRef.current++ } : region;

    if (command.type === "paste") {
      const clip = regionClipboardRef.current;
      if (!clip) return;
      const track = tracks[clip.kind];
      const copy = placeCopy(clip.region, track.regions, playheadMs, totalFor(clip.kind), track.nextId(), KIND_ALLOWS_OVERLAP[clip.kind]);
      if (!copy) {
        toast.info(t('timeline.regionMenu.noSpace', 'There is no free space at the playhead for this item.'));
        return;
      }
      const placed = clip.kind === "audio" ? onFreeAudioTrack(copy as AudioRegion) : copy;
      track.set((prev) => [...prev, withZIndex(clip.kind, placed)]);
      track.select(copy.id);
      return;
    }
    if (!target) return;
    const track = tracks[target.kind];
    const region = track.regions.find((item) => item.id === target.id);
    if (!region) return;

    switch (command.type) {
      case "copy":
        regionClipboardRef.current = { kind: target.kind, region: structuredClone(region) };
        setCanPasteRegion(true);
        toast.success(t('timeline.regionMenu.copied', 'Copied. Paste at the playhead with Cmd/Ctrl + V.'));
        break;
      case "duplicate": {
        const copy = placeCopy(region, track.regions, region.endMs, totalFor(target.kind), track.nextId(), KIND_ALLOWS_OVERLAP[target.kind]);
        if (!copy) {
          toast.info(t('timeline.regionMenu.noSpace', 'There is no free space at the playhead for this item.'));
          return;
        }
        const placed = target.kind === "audio" ? onFreeAudioTrack(copy as AudioRegion) : copy;
        track.set((prev) => [...prev, withZIndex(target.kind, placed)]);
        track.select(copy.id);
        break;
      }
      case "split": {
        const parts = target.kind === "audio"
          ? splitAudioRegion(region as AudioRegion, toOutputMs(cutMap, playheadMs), cutMap, track.nextId())
          : splitRegion(region, playheadMs, track.nextId());
        if (!parts) {
          toast.info(t('timeline.regionMenu.cannotSplit', 'Move the playhead inside the item to split it.'));
          return;
        }
        const [first, second] = parts;
        track.set((prev) => prev.flatMap((item) => (item.id === region.id ? [first, withZIndex(target.kind, second)] : [item])));
        break;
      }
      case "nudge": {
        const moved = nudgeRegion(region, command.deltaMs, track.regions, totalFor(target.kind), KIND_ALLOWS_OVERLAP[target.kind]);
        if (moved) track.set((prev) => prev.map((item) => (item.id === region.id ? moved : item)));
        break;
      }
      case "delete":
        track.remove(region.id);
        break;
    }
  }, [
    zoomRegions, trimRegions, speedRegions, annotationRegions, audioRegions, blurRegions, totalSourceMs, endingMs, currentTime, t, cutMap,
    handleZoomDelete, handleTrimDelete, handleSpeedDelete, handleAnnotationDelete, handleAudioDelete, handleBlurDelete,
    handleSelectZoom, handleSelectTrim, handleSelectSpeed, handleSelectAnnotation, handleSelectAudio, handleSelectBlur,
  ]);

  const handleAnnotationContentChange = useCallback((id: string, content: string) => {
    setAnnotationRegions((prev) => {
      const updated = prev.map((region) => {
        if (region.id !== id) return region;
        
        // Store content in type-specific fields
        if (region.type === 'text') {
          return { ...region, content, textContent: content };
        } else if (region.type === 'image') {
          return { ...region, content, imageContent: content };
        } else {
          return { ...region, content };
        }
      });
      return updated;
    });
  }, []);

  const handleAnnotationTypeChange = useCallback((id: string, type: AnnotationRegion['type']) => {
    setAnnotationRegions((prev) => {
      const updated = prev.map((region) => {
        if (region.id !== id) return region;
        
        const updatedRegion = { ...region, type };
        
        // Restore content from type-specific storage
        if (type === 'text') {
          updatedRegion.content = typeof region.textContent === 'string' ? region.textContent : region.type === 'text' ? getAnnotationText(region) : '';
          updatedRegion.textContent = updatedRegion.content;
        } else if (type === 'image') {
          updatedRegion.content = region.imageContent || '';
        } else if (type === 'figure') {
          updatedRegion.content = '';
          if (!region.figureData) {
            updatedRegion.figureData = { ...DEFAULT_FIGURE_DATA };
          }
        }
        
        return updatedRegion;
      });
      return updated;
    });
  }, []);

  const handleAnnotationStyleChange = useCallback((id: string, style: Partial<AnnotationRegion['style']>) => {
    setAnnotationRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? { ...region, style: { ...region.style, ...style } }
          : region,
      ),
    );
  }, []);

  const handleAnnotationAnimationChange = useCallback((id: string, animation: AnnotationAnimation | undefined) => {
    setAnnotationRegions((prev) =>
      prev.map((region) => (region.id === id ? { ...region, animation } : region)),
    );
  }, []);

  const handleAnnotationFigureDataChange = useCallback((id: string, figureData: FigureData) => {
    setAnnotationRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? { ...region, figureData }
          : region,
      ),
    );
  }, []);

  const handleAnnotationPositionChange = useCallback((id: string, position: { x: number; y: number }) => {
    setAnnotationRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? { ...region, position }
          : region,
      ),
    );
  }, []);

  const handleAnnotationSizeChange = useCallback((id: string, size: { width: number; height: number }) => {
    setAnnotationRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? { ...region, size }
          : region,
      ),
    );
  }, []);
  
  // Editor shortcuts yield to dialog controls and text fields.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (sequenceVisible || document.querySelector('[role="dialog"]')) return;
      const target = e.target as HTMLElement | null;
      const isEditableTarget =
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target?.isContentEditable;

      const usesPrimaryModifier = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();

      if (usesPrimaryModifier && !e.altKey && key === 'z') {
        if (!isEditableTarget) {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        }
        return;
      }

      if (!isMac && e.ctrlKey && !e.metaKey && !e.altKey && key === 'y') {
        if (!isEditableTarget) {
          e.preventDefault();
          handleRedo();
        }
        return;
      }

      if (matchesShortcut(e, shortcuts.playPause, isMac)) {
        // Allow space only in inputs/textareas
        if (isEditableTarget) {
          return;
        }
        e.preventDefault();
        
        const playback = videoPlaybackRef.current;
        if (playback?.video) {
          if (playback.video.paused) {
            playback.play().catch(console.error);
          } else {
            playback.pause();
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [shortcuts, isMac, handleUndo, handleRedo, sequenceVisible]);

  useEffect(() => {
    if (selectedZoomId && !zoomRegions.some((region) => region.id === selectedZoomId)) {
      setSelectedZoomId(null);
    }
  }, [selectedZoomId, zoomRegions]);

  useEffect(() => {
    if (selectedTrimId && !trimRegions.some((region) => region.id === selectedTrimId)) {
      setSelectedTrimId(null);
    }
  }, [selectedTrimId, trimRegions]);

  useEffect(() => {
    if (selectedAnnotationId && !annotationRegions.some((region) => region.id === selectedAnnotationId)) {
      setSelectedAnnotationId(null);
    }
  }, [selectedAnnotationId, annotationRegions]);

  useEffect(() => {
    if (selectedSpeedId && !speedRegions.some((region) => region.id === selectedSpeedId)) {
      setSelectedSpeedId(null);
    }
  }, [selectedSpeedId, speedRegions]);

  useEffect(() => {
    if (selectedAudioId && !audioRegions.some((region) => region.id === selectedAudioId)) {
      setSelectedAudioId(null);
    }
  }, [selectedAudioId, audioRegions]);

  // Audio playback sync: manage Audio elements that play in sync with video
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    const existing = audioElementsRef.current;
    const currentIds = new Set(audioRegions.map(r => r.id));

    // Remove old audio elements
    for (const [id, audio] of existing) {
      if (!currentIds.has(id)) {
        audio.pause();
        audio.src = '';
        existing.delete(id);
      }
    }

    // Create/update audio elements
    for (const region of audioRegions) {
      let audio = existing.get(region.id);
      if (!audio) {
        audio = new Audio();
        audio.preload = 'auto';
        existing.set(region.id, audio);
      }
      const expectedSrc = toFileUrl(region.audioPath);
      if (audio.src !== expectedSrc) {
        audio.src = expectedSrc;
      }
      audio.volume = Math.max(0, Math.min(1, region.volume));
    }

  }, [audioRegions]);

  useEffect(() => {
    const existing = audioElementsRef.current;
    return () => {
      for (const audio of existing.values()) {
        audio.pause();
        audio.src = '';
      }
      existing.clear();
    };
  }, []);

  // Sync audio playback with video currentTime and isPlaying state
  useEffect(() => {
    for (const region of audioRegions) {
      const audio = audioElementsRef.current.get(region.id);
      if (!audio) continue;

      // Added audio follows the edited timeline, so it plays on without gaps where the video is cut
      // and at its own speed where the video is sped up.
      const timelineMs = toOutputMs(cutMap, currentTime * 1000);
      const isInRegion = isAudioActive(region, timelineMs, cutMap);
      audio.volume = Math.max(0, Math.min(1, region.volume * (1 - previewFade)));

      if (isPlaying && isInRegion) {
        audio.playbackRate = 1;
        const audioOffset = audioFileOffsetSeconds(region, timelineMs, cutMap);
        // Only seek if significantly out of sync (> 200ms)
        if (Math.abs(audio.currentTime - audioOffset) > 0.2) {
          audio.currentTime = audioOffset;
        }
        if (audio.paused) {
          audio.play().catch(() => {});
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
      }
    }
  }, [isPlaying, currentTime, audioRegions, cutMap, previewFade]);

  /** "Project name 2026-10-19 17.42" for the exported file (saved in the recordings folder). */
  const exportFileBase = useCallback(() => {
    const source = currentProjectPath || videoSourcePath || (videoPath ? fromFileUrl(videoPath) : '') || 'Pro Screen AI';
    const name = source.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'Pro Screen AI';
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${name} ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}`;
  }, [currentProjectPath, videoSourcePath, videoPath]);

  const showExportSuccessToast = useCallback((filePath: string, warning?: 'audio-conversion-failed') => {
    if (warning === 'audio-conversion-failed') {
      toast.warning('Saved without audio compatibility conversion; some players (e.g. QuickTime) may not play the audio.');
    }
    toast.success(t('editor.exportSave.saved', undefined, { name: filePath.split(/[\\/]/).pop() ?? filePath }), {
      description: filePath,
      action: {
        label: t('editor.exportSave.showInFolder'),
        onClick: async () => {
          try {
            const result = await window.electronAPI.revealInFolder(filePath);
            if (!result.success) {
              const errorMessage = result.error || result.message || 'Failed to reveal item in folder.';
              toast.error(errorMessage);
            }
          } catch (err) {
            toast.error(`Error revealing in folder: ${String(err)}`);
          }
        }
      }
    });
  }, [t]);

  const handleExport = useCallback(async (settings: ExportSettings, addToSequence = false) => {
    if (!videoPath) {
      toast.error('No video loaded');
      return;
    }

    const video = videoPlaybackRef.current?.video;
    if (!video) {
      toast.error('Video not ready');
      return;
    }

    setIsExporting(true);
    setExportProgress(null);
    setExportError(null);
    pendingExportSaveRef.current = null;
    setHasPendingExportSave(false);

    let keepExportDialogOpen = false;

    try {
      const wasPlaying = isPlaying;
      const restoreTime = video.currentTime;
      if (wasPlaying) {
        pausePlayback();
      }

      const sourceWidth = video.videoWidth || 1920;
      const sourceHeight = video.videoHeight || 1080;
      const sourceAspectRatio = sourceHeight > 0 ? sourceWidth / sourceHeight : 16 / 9;
      const aspectRatioValue = getAspectRatioValue(aspectRatio, sourceAspectRatio);

      // Get preview CONTAINER dimensions for scaling
      const playbackRef = videoPlaybackRef.current;
      const containerElement = playbackRef?.containerRef?.current;
      const previewWidth = containerElement?.clientWidth || 1920;
      const previewHeight = containerElement?.clientHeight || 1080;

      if (settings.format === 'gif' && settings.gifConfig) {
        // GIF Export
        const gifExporter = new GifExporter({
          videoUrl: videoPath,
          fades,
          ending: endingMs > 0 ? ending : undefined,
          width: settings.gifConfig.width,
          height: settings.gifConfig.height,
          frameRate: settings.gifConfig.frameRate,
          loop: settings.gifConfig.loop,
          sizePreset: settings.gifConfig.sizePreset,
          wallpaper,
          trimRegions,
          speedRegions,
          showShadow: shadowIntensity > 0,
          shadowIntensity,
          backgroundBlur,
          zoomMotionBlur,
          connectZooms,
          borderRadius,
          padding,
          videoPadding: padding,
          cropRegion,
          annotationRegions,
          blurRegions,
          zoomRegions: effectiveZoomRegions,
          cursorTelemetry: effectiveCursorTelemetry,
          showCursor,
          cursorSize,
          cursorSmoothing,
          cursorMotionBlur,
          cursorClickBounce,
          previewWidth,
          previewHeight,
          onProgress: (progress: ExportProgress) => {
            setExportProgress(progress);
          },
        });

        exporterRef.current = gifExporter as unknown as VideoExporter;
        const result = await gifExporter.export();

        if (result.success && result.blob) {
          const arrayBuffer = await result.blob.arrayBuffer();
          const fileName = `${exportFileBase()}.gif`;

          const saveResult = await window.electronAPI.saveExportedVideo(arrayBuffer, fileName);

          if (saveResult.canceled) {
            pendingExportSaveRef.current = { arrayBuffer, fileName };
            setHasPendingExportSave(true);
            setExportError('Save dialog canceled. Click Save Again to save without re-rendering.');
            toast.info('Save canceled. You can save again without re-exporting.');
            keepExportDialogOpen = true;
          } else if (saveResult.success && saveResult.path) {
            showExportSuccessToast(saveResult.path);
            setExportedFilePath(saveResult.path);
          } else {
            setExportError(saveResult.message || 'Failed to save GIF');
            toast.error(saveResult.message || 'Failed to save GIF');
          }
        } else {
          setExportError(result.error || 'GIF export failed');
          toast.error(result.error || 'GIF export failed');
        }
      } else {
        // MP4 Export
        const quality = settings.quality || exportQuality;
        const dimensions = outputDimensions(sourceWidth, sourceHeight, aspectRatioValue, exportResolution, exportCustomWidth, exportCustomHeight, quality);
        const exportWidth = dimensions.width, exportHeight = dimensions.height;
        const bitrate = exportBitrate(exportWidth, exportHeight, exportFps, quality);

        const exporter = new VideoExporter({
          videoUrl: videoPath,
          width: exportWidth,
          height: exportHeight,
          frameRate: exportFps,
          bitrate,
          codec: 'avc1.640033',
          wallpaper,
          trimRegions,
          speedRegions,
          showShadow: shadowIntensity > 0,
          shadowIntensity,
          backgroundBlur,
          zoomMotionBlur,
          connectZooms,
          borderRadius,
          padding,
          cropRegion,
          annotationRegions,
          blurRegions,
          zoomRegions: effectiveZoomRegions,
          cursorTelemetry: effectiveCursorTelemetry,
          showCursor,
          cursorSize,
          cursorSmoothing,
          cursorMotionBlur,
          cursorClickBounce,
          audioRegions: addToSequence && !embedded ? [] : audioRegions,
          sourceAudioVolume,
          fades,
          ending: endingMs > 0 ? ending : undefined,
          previewWidth,
          previewHeight,
          onProgress: (progress: ExportProgress) => {
            setExportProgress(progress);
          },
        });

        exporterRef.current = exporter;
        const result = await exporter.export();

        if (result.success && result.blob) {
          const arrayBuffer = await result.blob.arrayBuffer();
          if (addToSequence && clipSession && currentProjectSnapshot) {
            const path = await window.electronAPI.storeSequenceSource(arrayBuffer);
            const {videoPath,editor} = JSON.parse(currentProjectSnapshot) as ReturnType<typeof createProjectData>;
            await clipSession.onApply(path, {videoPath,editor,sourceMs:totalSourceMs});
            return;
          }
          if (addToSequence) {
            const source = await window.electronAPI.storeSequenceSource(arrayBuffer);
            const { clip, width, height } = await inspectClip(source, 0, 0);
            const offset = sequenceEnd(sequence?.clips ?? []);
            const parts = clipSegments(cutMap, clipSplits);
            const boundaries = normalizeSplits(parts.flatMap(part => [part.outStart, part.outEnd]).map(Math.round), clip.sourceMs);
            const starts = [0, ...boundaries];
            const labels = [...videoClips].reverse();
            const sourceName = fromFileUrl(videoPath).split(/[\\/]/).pop() ?? clip.name;
            const edit = currentProjectSnapshot ? {
              videoPath: fromFileUrl(videoPath), sourceMs: totalSourceMs,
              editor: {...JSON.parse(currentProjectSnapshot).editor, audioRegions: []},
            } : undefined;
            if (edit) delete edit.editor.sequence;
            const picture: SequenceClip[] = starts.map((start, index) => ({
              ...clip, edit,
              id: crypto.randomUUID(),
              name: labels.find(item => item.startMs <= toSourceMs(cutMap, start))?.name ?? sourceName,
              start: offset + start,
              inMs: start,
              outMs: starts[index + 1] ?? clip.sourceMs,
            }));
            const sounds: SequenceClip[] = [];
            for (const region of audioRegions) {
              const span = audioTimelineSpan(region, cutMap);
              const track = -1 - (region.track ?? 0);
              const { clip: sound } = await inspectClip(region.audioPath, offset + span.start, track);
              const inMs = region.sourceStartMs ?? 0;
              const outMs = Math.min(sound.sourceMs, inMs + span.end - span.start);
              if (outMs > inMs) sounds.push({ ...sound, track, inMs, outMs, volume: region.volume });
            }
            const next = {
              width, height, fps: exportFps, ...sequence,
              clips: [...(sequence?.clips ?? []), ...picture, ...sounds],
            };
            if (!validSequence(next)) throw new Error('Klip sayısı, süre veya kurgu boyutları desteklenen sınırı aşıyor.');
            editSequence(next);
            sequenceTime.current = offset;
            setSequenceVisible(true);
            setIsPlaying(false);
            return;
          }
          const fileName = `${exportFileBase()}.mp4`;

          const saveResult = await window.electronAPI.saveExportedVideo(arrayBuffer, fileName);

          if (saveResult.canceled) {
            pendingExportSaveRef.current = { arrayBuffer, fileName };
            setHasPendingExportSave(true);
            setExportError('Save dialog canceled. Click Save Again to save without re-rendering.');
            toast.info('Save canceled. You can save again without re-exporting.');
            keepExportDialogOpen = true;
          } else if (saveResult.success && saveResult.path) {
            showExportSuccessToast(saveResult.path, saveResult.warning);
            setExportedFilePath(saveResult.path);
          } else {
            setExportError(saveResult.message || 'Failed to save video');
            toast.error(saveResult.message || 'Failed to save video');
          }
        } else {
          setExportError(result.error || 'Export failed');
          toast.error(result.error || 'Export failed');
        }
      }

      if (wasPlaying) {
        videoPlaybackRef.current?.play();
      } else {
        video.currentTime = restoreTime;
        await videoPlaybackRef.current?.refreshFrame();
      }
    } catch (error) {
      console.error('Export error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setExportError(errorMessage);
      toast.error(`Export failed: ${errorMessage}`);
    } finally {
      if (!isPlaying) {
        await videoPlaybackRef.current?.refreshFrame().catch(() => undefined);
      }
      setIsExporting(false);
      exporterRef.current = null;
      setShowExportDialog(keepExportDialogOpen);
      setExportProgress(null);
    }
  }, [embedded,clipSession,currentProjectSnapshot,totalSourceMs,sequence, editSequence, cutMap, clipSplits, videoClips, effectiveZoomRegions, exportFileBase, sourceAudioVolume, fades, ending, endingMs, videoPath, wallpaper, zoomRegions, trimRegions, speedRegions, shadowIntensity, backgroundBlur, zoomMotionBlur, connectZooms, showCursor, effectiveCursorTelemetry, cursorSize, cursorSmoothing, cursorMotionBlur, cursorClickBounce, borderRadius, padding, cropRegion, annotationRegions, blurRegions, audioRegions, isPlaying, aspectRatio, exportQuality, exportResolution, exportFps, exportCustomWidth, exportCustomHeight,showExportSuccessToast]);

  const handleStartExport = useCallback(() => {
    if (!videoPath) {
      toast.error('No video loaded');
      return;
    }

    if (hasPendingExportSave) {
      setShowExportDialog(true);
      setExportError('Save dialog canceled. Click Save Again to save without re-rendering.');
      return;
    }

    const video = videoPlaybackRef.current?.video;
    if (!video) {
      toast.error('Video not ready');
      return;
    }

    // Build export settings from current state
    const sourceWidth = video.videoWidth || 1920;
    const sourceHeight = video.videoHeight || 1080;
    const gifDimensions = getGifOutputDimensions(sourceWidth, sourceHeight, aspectRatio, gifSizePreset);

    const settings: ExportSettings = {
      format: exportFormat,
      quality: exportFormat === 'mp4' ? exportQuality : undefined,
      gifConfig: exportFormat === 'gif' ? {
        frameRate: gifFrameRate,
        loop: gifLoop,
        sizePreset: gifSizePreset,
        width: gifDimensions.width,
        height: gifDimensions.height,
      } : undefined,
    };

    setShowExportDialog(true);
    setExportError(null);

    // Start export immediately
    handleExport(settings);
  }, [videoPath, hasPendingExportSave, exportFormat, exportQuality, gifFrameRate, gifLoop, gifSizePreset, aspectRatio, handleExport]);

  const handleOpenExportDialog = useCallback(() => {
    if (hasPendingExportSave) setShowExportDialog(true);
    else if (duration > 0) { pausePlayback(); setExportSetupOpen(true); }
  }, [hasPendingExportSave, duration]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (sequenceVisible || event.defaultPrevented || document.querySelector('[role="dialog"]') || (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return;
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'e') { event.preventDefault(); handleOpenExportDialog(); }
      else if (mod && event.key === ',') { event.preventDefault(); setAiSettingsOpen(true); }
      else if (event.key === '?' || (mod && event.key === '/')) { event.preventDefault(); openConfig(); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const video = videoPlaybackRef.current?.video; if (video) video.currentTime = Math.max(0, Math.min(duration, video.currentTime + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 1 : .1))); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); const video = videoPlaybackRef.current?.video; if (video) video.currentTime = event.key === 'Home' ? 0 : duration; }
    }; window.addEventListener('keydown',key); return () => window.removeEventListener('keydown',key);
  }, [duration,isMac,openConfig,handleOpenExportDialog,sequenceVisible]);

  const handleCancelExport = useCallback(() => {
    if (exporterRef.current) {
      exporterRef.current.cancel();
      toast.info('Export canceled');
      setShowExportDialog(false);
      setIsExporting(false);
      setExportProgress(null);
      setExportError(null);
      setExportedFilePath(undefined);
    }
  }, []);

  const handleExportDialogClose = useCallback(() => {
    setShowExportDialog(false);
    setExportedFilePath(undefined);
  }, []);

  const handleRetrySaveExport = useCallback(async () => {
    const pendingSave = pendingExportSaveRef.current;
    if (!pendingSave) {
      return;
    }

    const saveResult = await window.electronAPI.saveExportedVideo(pendingSave.arrayBuffer, pendingSave.fileName);

    if (saveResult.canceled) {
      setExportError('Save dialog canceled. Click Save Again to save without re-rendering.');
      toast.info('Save canceled. You can try again.');
      return;
    }

    if (saveResult.success && saveResult.path) {
      pendingExportSaveRef.current = null;
      setHasPendingExportSave(false);
      setExportError(null);
      setExportedFilePath(saveResult.path);
      showExportSuccessToast(saveResult.path, saveResult.warning);
      setShowExportDialog(false);
      return;
    }

    const errorMessage = saveResult.message || 'Failed to save video';
    setExportError(errorMessage);
    toast.error(errorMessage);
  }, [showExportSuccessToast]);

  const openRecordingsFolder = useCallback(async () => {
    try {
      const result = await window.electronAPI.openRecordingsFolder();
      if (!result.success) {
        toast.error(result.message || result.error || 'Failed to open recordings folder.');
      }
    } catch (error) {
      toast.error(`Failed to open recordings folder: ${String(error)}`);
    }
  }, []);

  // --- Edited timeline: cut parts are removed and what follows moves up (Premiere-style). ---
  const clipParts = useMemo(() => clipSegments(cutMap, clipSplits), [cutMap, clipSplits]);
  /** Speed changes drawn on the video track, in edited-timeline time. */
  const timelineSpeedBadges = useMemo(() => speedRegions.flatMap((region) => {
    const span = spanToOutput(cutMap, { start: region.startMs, end: region.endMs });
    return span ? [{ id: region.id, speed: region.speed, outStart: span.start, outEnd: span.end }] : [];
  }), [speedRegions, cutMap]);
  const timelineMarkers = useMemo(() => cutMarkers(cutMap).map((marker) => ({ outMs: marker.outMs, cutId: marker.cut.id, lengthMs: marker.cut.endMs - marker.cut.startMs, crossfade: marker.cut.crossfade })), [cutMap]);
  const toTimeline = useCallback(<T extends { startMs: number; endMs: number }>(regions: T[]): T[] => regions.flatMap((region) => {
    const span = spanToOutput(cutMap, { start: region.startMs, end: region.endMs });
    return span ? [{ ...region, startMs: Math.round(span.start), endMs: Math.round(span.end) }] : [];
  }), [cutMap]);
  const fromTimeline = useCallback((span: Span): Span => spanToSource(cutMap, span), [cutMap]);
  const timelineZooms = useMemo(() => toTimeline(effectiveZoomRegions), [toTimeline, effectiveZoomRegions]);
  const timelineSpeeds = useMemo(() => toTimeline(speedRegions), [toTimeline, speedRegions]);
  const timelineAnnotations = useMemo(() => toTimeline(annotationRegions), [toTimeline, annotationRegions]);
  const timelineBlurs = useMemo(() => toTimeline(blurRegions), [toTimeline, blurRegions]);
  const timelineAudio = useMemo(() => audioRegions.flatMap((region) => {
    const span = audioTimelineSpan(region, cutMap);
    const end = Math.min(span.end, timelineMs);
    return end - span.start >= 1 ? [{ ...region, startMs: Math.round(span.start), endMs: Math.round(end) }] : [];
  }), [audioRegions, cutMap, timelineMs]);
  const timelineTelemetry = useMemo(
    () => effectiveCursorTelemetry
      .filter((sample) => !cutMap.cuts.some((cut) => sample.timeMs > cut.startMs && sample.timeMs < cut.endMs))
      .map((sample) => ({ ...sample, timeMs: toOutputMs(cutMap, sample.timeMs) })),
    [effectiveCursorTelemetry, cutMap],
  );

  const handleSelectClip = useCallback((startMs: number | null) => {
    setSelectedClipStart(startMs);
    if (startMs !== null) {
      setSelectedTypingStart(null);
      setSelectedZoomId(null);
      setSelectedTrimId(null);
      setSelectedSpeedId(null);
      setSelectedAnnotationId(null);
      setSelectedAudioId(null);
    }
  }, []);

  // Selecting any other item deselects the video part.
  useEffect(() => {
    if (selectedZoomId || selectedTrimId || selectedSpeedId || selectedAnnotationId || selectedAudioId || selectedBlurId) { setSelectedClipStart(null); setSelectedTypingStart(null); }
  }, [selectedZoomId, selectedTrimId, selectedSpeedId, selectedAnnotationId, selectedAudioId, selectedBlurId]);
  // Selecting any other item (or a video part) deselects the blur area.
  useEffect(() => {
    if (selectedZoomId || selectedTrimId || selectedSpeedId || selectedAnnotationId || selectedAudioId || selectedClipStart !== null) setSelectedBlurId(null);
  }, [selectedZoomId, selectedTrimId, selectedSpeedId, selectedAnnotationId, selectedAudioId, selectedClipStart]);

  // Typing found in the recording's key press times; stretches already cut out are left out.
  const typingStretches = useMemo(() => findTypingStretches(keyTimes, totalSourceMs || undefined).filter((stretch) => !isStretchCut(stretch, trimRegions)), [keyTimes, totalSourceMs, trimRegions]);
  const timelineTyping = useMemo(() => typingStretches.flatMap((stretch) => {
    const span = spanToOutput(cutMap, { start: stretch.startMs, end: stretch.endMs });
    return span ? [{ ...stretch, outStart: span.start, outEnd: span.end }] : [];
  }), [typingStretches, cutMap]);
  /** Joined videos on the edited timeline, each labelled where it starts. */
  const timelineVideos = useMemo(() => videoClips.length > 1
    ? videoClips.map((clip) => ({ name: clip.name, outStart: toOutputMs(cutMap, clip.startMs) }))
    : undefined, [videoClips, cutMap]);
  const selectedTypingIndex = timelineTyping.findIndex((stretch) => stretch.startMs === selectedTypingStart);
  const selectedTyping = selectedTypingIndex >= 0 ? timelineTyping[selectedTypingIndex] : null;
  const handleSelectTyping = useCallback((startMs: number) => {
    setSelectedTypingStart(startMs);
    setSelectedClipStart(null);
    setSelectedZoomId(null);
    setSelectedTrimId(null);
    setSelectedSpeedId(null);
    setSelectedAnnotationId(null);
    setSelectedAudioId(null);
  }, []);
  const nextSpeedId = () => `speed-${nextSpeedIdRef.current++}`;
  /** Speeds typing up (or back to 1×) using the same speed ranges as video parts. */
  const speedUpTyping = (stretches: Array<{ startMs: number; endMs: number }>, speed: PlaybackSpeed | 1) => {
    setSpeedRegions((previous) => stretches.reduce((regions, stretch) => setPartSpeed(regions, stretch, speed, nextSpeedId), previous));
  };
  /** Cuts typing out; what follows moves up, and the cut can be undone or restored from its marker. */
  const cutTyping = (stretches: Array<{ startMs: number; endMs: number }>) => {
    setTrimRegions((previous) => mergeTrims([...previous, ...stretches.map((stretch) => ({ id: `trim-${nextTrimIdRef.current++}`, startMs: stretch.startMs, endMs: stretch.endMs }))]));
    setSelectedTypingStart(null);
  };

  /** Splits the video at the playhead into two parts (C or the Cut button). */
  const handleSplitClip = useCallback(() => {
    const at = Math.round(currentTime * 1000);
    const part = clipParts.find((candidate) => at > candidate.startMs && at < candidate.endMs);
    if (!part || at - part.startMs < 100 || part.endMs - at < 100) {
      toast.info(t('timeline.clip.cannotSplit'));
      return;
    }
    startNewHistoryStep();
    setClipSplits((previous) => normalizeSplits([...previous, at], totalSourceMs));
    setSelectedClipStart(null);
  }, [currentTime, clipParts, totalSourceMs, startNewHistoryStep, t]);

  /** Cuts the selected part out; what follows moves up. */
  const handleDeleteClipPart = useCallback(() => {
    const part = clipParts.find((candidate) => candidate.startMs === selectedClipStart);
    if (!part) return;
    if (clipParts.length <= 1) {
      toast.info(t('timeline.clip.keepOne'));
      return;
    }
    startNewHistoryStep();
    setTrimRegions((previous) => mergeTrims([...previous, { id: `trim-${nextTrimIdRef.current++}`, startMs: part.startMs, endMs: part.endMs }]));
    setSelectedClipStart(null);
    handleSeek(Math.min(part.endMs, Math.max(0, totalSourceMs - 1)) / 1000);
  }, [clipParts, selectedClipStart, totalSourceMs, startNewHistoryStep, t]);

  /** Where the movable pieces start and end on the edited timeline (where a dragged part can go). */
  const clipPieces = useMemo(() => piecesBetween(clipSplits, totalSourceMs), [clipSplits, totalSourceMs]);
  const clipPieceEdges = useMemo(() => [...new Set([...clipPieces.map((piece) => Math.round(toOutputMs(cutMap, piece.startMs))), Math.round(cutMap.outputMs)])], [clipPieces, cutMap]);
  const selectedPartIndex = clipParts.findIndex((part) => part.startMs === selectedClipStart);
  const selectedPart = selectedPartIndex >= 0 ? clipParts[selectedPartIndex] : null;
  /** Gives the selected part one speed (1 removes any speed change there). */
  const handleSetPartSpeed = useCallback((speed: PlaybackSpeed | 1) => {
    const part = clipParts.find((candidate) => candidate.startMs === selectedClipStart);
    if (!part) return;
    setSpeedRegions((previous) => setPartSpeed(previous, part, speed, () => `speed-${nextSpeedIdRef.current++}`));
  }, [clipParts, selectedClipStart]);
  /** Selects the part of the video under the playhead (the speed tool and S). */
  const selectPartAtPlayhead = () => {
    const at = Math.round(currentTime * 1000);
    const part = clipParts.find((candidate) => at >= candidate.startMs && at < candidate.endMs) ?? clipParts[clipParts.length - 1];
    if (part) handleSelectClip(part.startMs);
  };

  const addEditorTool = (tool: EditorTool) => {
    if (tool === 'trim') {
      handleSplitClip();
      return;
    }
    if (tool === 'speed') {
      selectPartAtPlayhead();
      return;
    }
    const regions = tool === 'zoom' ? zoomRegions : [];
    const span = findAvailableSpan(totalSourceMs + (tool === 'text' ? endingMs : 0), Math.round(currentTime * 1000), regions, tool === 'text' ? 2500 : tool === 'zoom' ? DEFAULT_ZOOM_SPAN_MS : tool === 'blur' ? DEFAULT_BLUR_SPAN_MS : 1500);
    if (!span) { toast.info(t('timeline.zoom.existsOrNoSpace')); return; }
    const timelineSpan = { start: span.startMs, end: span.endMs };
    if (tool === 'zoom') handleZoomAdded(timelineSpan);
    if (tool === 'text') handleAnnotationAdded(timelineSpan);
    if (tool === 'blur') {
      if (isPlaying) togglePlayPause();
      handleBlurAdded(timelineSpan);
    }
    handleSeek(span.startMs / 1000);
  };
  useEffect(() => {
    const tool = initialClipTool.current;
    if (!tool || !duration || loading) return;
    // Wait for the saved source playhead before placing a new timed effect.
    const expected = Math.min(duration,clipSession?.initial.workspace?.playheadSeconds ?? 0);
    if (Math.abs(expected-currentTime) > .1 && currentTime === 0) return;
    initialClipTool.current = undefined;
    if (tool === 'voiceover') openVoiceover();
    else if (tool === 'captions' || tool === 'ai') setSettingsFocusRequest({tab:'ai', nonce:Date.now()});
    else if (tool !== 'appearance') addEditorTool(tool);
  });
  function applyClipEdit() {
    if (isExporting || duration<=0) return;
    pausePlayback();
    setShowExportDialog(true);
    void handleExport({format:'mp4', quality:exportQuality},true);
  }
  const selectedAudio = selectedAudioId ? audioRegions.find((r) => r.id === selectedAudioId) ?? null : null;
  const selectedBlur = selectedBlurId ? blurRegions.find((r) => r.id === selectedBlurId) ?? null : null;
  // Audio clips are edited in edited-timeline time, as the timeline shows them.
  const activeRegion = selectedZoomId ? zoomRegions.find((r) => r.id === selectedZoomId)
    : selectedTrimId ? trimRegions.find((r) => r.id === selectedTrimId)
    : selectedSpeedId ? speedRegions.find((r) => r.id === selectedSpeedId)
    : selectedAudioId ? timelineAudio.find((r) => r.id === selectedAudioId)
    : selectedBlur;
  /** Whether the selected audio clip could sit on `track` without overlapping another clip there. */
  const isTrackFreeForSelectedAudio = (track: number) => {
    if (!selectedAudio) return false;
    const span = audioTimelineSpan(selectedAudio, cutMap);
    return !audioRegions.some((region) => {
      if (region.id === selectedAudio.id || (region.track ?? 0) !== track) return false;
      const other = audioTimelineSpan(region, cutMap);
      return span.end > other.start && span.start < other.end;
    });
  };
  const activeRegionKind = selectedZoomId ? 'zoom' : selectedTrimId ? 'trim' : selectedSpeedId ? 'speed' : selectedAudioId ? 'audio' : 'blur';
  const updateActiveRegion = (span: TimeSpan) => {
    if (!activeRegion) return false;
    if (activeRegionKind === 'audio') {
      // Typed in edited-timeline time; the clip may run past the video's end.
      if (!(span.startMs >= 0 && span.endMs - span.startMs >= 100 && span.startMs < timelineMs)) return false;
      handleAudioTimelineChange(activeRegion.id, { start: span.startMs, end: span.endMs });
      return true;
    }
    if (activeRegionKind === 'blur') {
      // Blur areas may overlap: several fields can be hidden at once.
      if (!validRegionSpan(span, Math.round(duration * 1000), [])) return false;
      handleBlurSpanChange(activeRegion.id, { start: span.startMs, end: span.endMs });
      return true;
    }
    const others = (activeRegionKind === 'zoom' ? zoomRegions : activeRegionKind === 'trim' ? trimRegions : speedRegions).filter((r) => r.id !== activeRegion.id);
    if (!validRegionSpan(span, Math.round(duration * 1000), others)) return false;
    const change = activeRegionKind === 'zoom' ? handleZoomSpanChange : activeRegionKind === 'trim' ? handleTrimSpanChange : handleSpeedSpanChange;
    change(activeRegion.id, { start: span.startMs, end: span.endMs });
    return true;
  };
  const deleteActiveRegion = () => {
    if (!activeRegion) return;
    if (activeRegionKind === 'zoom') handleZoomDelete(activeRegion.id);
    else if (activeRegionKind === 'trim') handleTrimDelete(activeRegion.id);
    else if (activeRegionKind === 'audio') handleAudioDelete(activeRegion.id);
    else if (activeRegionKind === 'blur') handleBlurDelete(activeRegion.id);
    else handleSpeedDelete(activeRegion.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-foreground">{t('launch.sourceSelector.loadingSources')}</div>
      </div>
    );
  }
  if (error && embedded) return <div className="p-4"><p role="alert">{error}</p>
    <button onClick={()=>clipSession?.onCancel()}>{locale==='tr'?'Zaman çizelgesine dön':'Return to timeline'}</button></div>;
  if (error && !sequenceVisible) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="text-destructive">{error}</div>
          {sequence && <button onClick={()=>setSequenceVisible(true)}>{locale==='tr'?'Çok kanallı kurguya dön':'Return to multitrack editor'}</button>}
          <button type="button" onClick={() => void window.electronAPI.showHome()} className="px-3 py-1.5 rounded-md bg-white/10 text-sm">← Ana ekran</button>
          <button
            type="button"
            onClick={handleLoadProject}
            className="px-3 py-1.5 rounded-md bg-[#2563EB] text-white text-sm hover:bg-[#2563EB]/90"
          >
            {t("settings.export.loadProject")}
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="editor-workspace flex flex-col h-screen text-slate-200 overflow-hidden" data-focus={focusMode}>
      {!embedded && <div
        className="workspace-titlebar relative h-10 flex-shrink-0 flex items-center justify-center px-6 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-semibold tracking-tight text-white/90">Pro Screen AI</span>
        <div
          className="absolute right-4 flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button type="button" disabled={isExporting} onClick={() => void window.electronAPI.showHome()} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-40"><Home className="h-4 w-4" /> {t("common.app.home", "Ana ekran")}</button>
          <button type="button" onClick={() => void window.electronAPI.showRecorder()} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-white/80 hover:bg-white/10">
            <Monitor className="h-4 w-4" /> {t('launch.welcome.newRecording')}
          </button>
          <LanguageSwitcher />
          <button type="button" onClick={() => setAiSettingsOpen(true)} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-white/70 hover:bg-white/10" title="AI bağlantı ayarları"><Settings2 size={14} /> AI</button>
          <button
            type="button"
            onClick={() => void openRecordingsFolder()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-white/90 transition hover:bg-white/8 hover:text-white cursor-pointer"
            title={t("common.app.manageRecordings", "Open recordings folder")}
            aria-label={t("common.app.manageRecordings", "Open recordings folder")}
          >
            <FolderOpen className="h-4 w-4" />
            <span className="text-xs font-normal">{t("common.app.manageRecordings", "Manage recordings")}</span>
          </button>
        </div>
      </div>}

      {sequenceVisible && sequence ? <SequenceWorkspace key={projectGeneration} sequence={sequence} tr={locale==='tr'}
        name={(currentProjectPath || videoSourcePath || '').split(/[\\/]/).pop() || 'Kurgu'} dirty={hasUnsavedChanges}
        initialTime={sequenceTime.current} onTime={rememberSequenceTime} onChange={editSequence}
        onRecord={recordAndAppend} onVoiceover={insert=>{voiceInsert.current=insert;openVoiceover();}} renderEditor={session=><VideoEditor key={session.clip.id} clipSession={session}/>} onSave={handleSaveProject} onOpen={handleLoadProject}/> : <>
      {clipSession ? <div className="seq-edit-heading">
        <strong>{locale==='tr'?'Klip düzenleme':'Clip editing'}</strong><span>{clipSession.clip.name}</span>
        <button disabled={isExporting} onClick={clipSession.onCancel}>{locale==='tr'?'Vazgeç':'Cancel'}</button>
        <button data-testid="apply-clip-edits" disabled={isExporting || !duration} onClick={applyClipEdit}>{locale==='tr'?'Klibe uygula':'Apply to clip'}</button>
      </div> : <div className="flex items-center gap-3 border-b border-white/10 px-3 py-1 text-xs">
        <button disabled={isExporting || !duration} className="rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-40" onClick={()=>{
          pausePlayback();
          if(sequence) setSequenceVisible(true);
          else { setShowExportDialog(true); void handleExport({format:'mp4',quality:exportQuality},true); }
        }}>{locale==='tr'?'Video düzenleme':'Video editing'}</button>
        {sequence && <button disabled={isExporting || !duration} onClick={()=>{pausePlayback();setShowExportDialog(true);void handleExport({format:'mp4',quality:exportQuality},true);}}>
          {locale==='tr'?'Düzenlenmiş kaynağı kurguya ekle':'Add edited source to sequence'}</button>}
      </div>}
      <EditorToolbar onVoiceover={() => openVoiceover()} onShortcuts={openConfig} onAdd={addEditorTool} onAiCaptions={() => setAiCaptionsOpen(true)} onUndo={handleUndo} onRedo={handleRedo}
        canUndo={historyAvailability.canUndo} canRedo={historyAvailability.canRedo}
        onSave={clipSession?.onSave ?? handleSaveProject} onExport={handleOpenExportDialog} disabled={isExporting || !duration}
        draftState={autoDraft.state} onRetryDraft={() => void autoDraft.retry()} name={(currentProjectPath || videoSourcePath || '').split(/[\\/]/).pop() || 'Pro Screen AI'} dirty={hasUnsavedChanges} />
      <div className="workspace-body flex-1 flex min-h-0 relative">
        {/* Left Column - Video & Timeline */}
        <div className="workspace-main flex-1 flex flex-col min-w-0 h-full">
          <PanelGroup direction="vertical" className="workspace-panels">
            {/* Top section: video preview and controls */}
            <Panel className="workspace-stage-panel" defaultSize={62} minSize={30}>
              <div className="workspace-stage w-full h-full flex flex-col overflow-hidden">
                <PreviewWorkspaceBar ratio={aspectRatio} onRatioChange={setAspectRatio} guides={compositionGuides} onGuidesChange={() => setCompositionGuides(v => !v)} focus={focusMode} onFocusChange={() => setFocusMode(v => !v)} inspector={inspectorVisible} onInspectorChange={() => setInspectorVisible(v => !v)} />
                {/* Video preview */}
                <div className="workspace-preview w-full flex justify-center items-center" style={{ flex: '1 1 auto', minHeight: 0, padding: '16px' }}>
                  <div data-testid="preview-frame" className="relative" style={{ width: 'auto', height: '100%', aspectRatio: getAspectRatioValue(aspectRatio, (() => {
                    const previewVideo = videoPlaybackRef.current?.video;
                    if (previewVideo && previewVideo.videoHeight > 0) {
                      return previewVideo.videoWidth / previewVideo.videoHeight;
                    }
                    return 16 / 9;
                  })()), maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
                    {compositionGuides && <div className="workspace-guides" aria-hidden="true"><div/><div/><div/><div/><span/></div>}
                    <VideoPlayback
                      key={videoPath || 'no-video'}
                      fadeAmount={previewFade}
                      aspectRatio={aspectRatio}
                      ref={videoPlaybackRef}
                      videoPath={videoPath || ''}
                      onDurationChange={setDuration}
                      onTimeUpdate={handleVideoTime}
                      currentTime={currentTime}
                      onPlayStateChange={handleVideoPlayState}
                      hideVideo={ending.mode === 'background' && endingMs > 0 && currentTime * 1000 > totalSourceMs + 1}
                      onError={handlePreviewError}
                      wallpaper={wallpaper}
                      zoomRegions={effectiveZoomRegions}
                      selectedZoomId={selectedZoomId}
                      onSelectZoom={handleSelectZoom}
                      onZoomFocusChange={handleZoomFocusChange}
                      isPlaying={isPlaying}
                      showShadow={shadowIntensity > 0}
                      shadowIntensity={shadowIntensity}
                      backgroundBlur={backgroundBlur}
                      zoomMotionBlur={zoomMotionBlur}
                      connectZooms={connectZooms}
                      borderRadius={borderRadius}
                      padding={padding}
                      cropRegion={cropRegion}
                      trimRegions={trimRegions}
                      speedRegions={speedRegions}
                      annotationRegions={annotationRegions}
                      blurRegions={blurRegions}
                      selectedBlurId={selectedBlurId}
                      onBlurRectChange={handleBlurRectChange}
                      selectedAnnotationId={selectedAnnotationId}
                      onSelectAnnotation={handleSelectAnnotation}
                      onAnnotationPositionChange={handleAnnotationPositionChange}
                      onAnnotationSizeChange={handleAnnotationSizeChange}
                      onAnnotationContentChange={handleAnnotationContentChange}
                      cursorTelemetry={effectiveCursorTelemetry}
                      showCursor={showCursor}
                      cursorSize={cursorSize}
                      cursorSmoothing={cursorSmoothing}
                      cursorMotionBlur={cursorMotionBlur}
                      cursorClickBounce={cursorClickBounce}
                    />
                  </div>
                </div>
                {/* Playback controls */}
                <div className="workspace-transport w-full flex justify-center items-center" style={{ height: '60px', flexShrink: 0, padding: '8px 20px' }}>
                  <div style={{ width: '100%', maxWidth: '700px' }}>
                    <PlaybackControls
                      isPlaying={isPlaying}
                      currentTime={toOutputMs(cutMap, currentTime * 1000) / 1000}
                      duration={timelineMs / 1000}
                      onTogglePlayPause={togglePlayPause}
                      onSeek={(time) => handleSeek(toSourceMs(cutMap, time * 1000) / 1000)}
                    />
                  </div>
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="workspace-resize-handle h-3 flex items-center justify-center">
              <div className="w-8 h-1 bg-white/20 rounded-full"></div>
            </PanelResizeHandle>

            {/* Timeline section */}
            <Panel className="workspace-timeline-panel" defaultSize={38} minSize={25}>
              <div className="workspace-timeline h-full min-h-0 overflow-auto flex flex-col">
                <div className="workspace-timeline-heading"><strong>{locale === 'tr' ? 'Zaman çizelgesi' : 'Timeline'}</strong><span>{duration > 0 ? "1 video · " : ""}{zoomRegions.length + trimRegions.length + speedRegions.length + annotationRegions.length + audioRegions.length + blurRegions.length} {locale === 'tr' ? 'düzenleme' : 'edits'}</span><small>{locale === 'tr' ? 'Sürükle, kısalt, hikâyeni oluştur.' : 'Drag, trim, tell your story.'}</small></div>
                <TimelineEditor
              videoPath={videoSourcePath || videoPath || ''}
              videoDuration={timelineMs / 1000}
              currentTime={toOutputMs(cutMap, currentTime * 1000) / 1000}
              onSeek={(time) => handleSeek(toSourceMs(cutMap, time * 1000) / 1000)}
              cursorTelemetry={timelineTelemetry}
              zoomRegions={timelineZooms}
              onZoomAdded={(span) => handleZoomAdded(fromTimeline(span))}
              onZoomSuggested={(span, focus) => handleZoomSuggested(fromTimeline(span), focus)}
              onZoomSpanChange={(id, span) => handleZoomSpanChange(id, fromTimeline(span))}
              onZoomDelete={handleZoomDelete}
              selectedZoomId={selectedZoomId}
              onSelectZoom={handleSelectZoom}
              trimRegions={[]}
              onTrimAdded={(span) => handleTrimAdded(fromTimeline(span))}
              onTrimSpanChange={(id, span) => handleTrimSpanChange(id, fromTimeline(span))}
              onTrimDelete={handleTrimDelete}
              selectedTrimId={selectedTrimId}
              onSelectTrim={handleSelectTrim}
              speedRegions={timelineSpeeds}
              onSpeedAdded={(span) => handleSpeedAdded(fromTimeline(span))}
              onSpeedSpanChange={(id, span) => handleSpeedSpanChange(id, fromTimeline(span))}
              onSpeedDelete={handleSpeedDelete}
              selectedSpeedId={selectedSpeedId}
              onSelectSpeed={handleSelectSpeed}
              audioRegions={timelineAudio}
              onAddVideo={embedded ? undefined : handleAddVideo}
              addingVideo={addingVideo}
              onAudioAdded={(span, audioPath, sourceDurationMs) => { const start = toSourceMs(cutMap, span.start); handleAudioAdded({ start, end: start + (span.end - span.start) }, audioPath, sourceDurationMs); }}
              onAudioSpanChange={handleAudioTimelineChange}
              onAudioDelete={handleAudioDelete}
              selectedAudioId={selectedAudioId}
              onSelectAudio={handleSelectAudio}
              onRegionCommand={handleRegionCommand}
              canPasteRegion={canPasteRegion}
              annotationRegions={timelineAnnotations}
              onAnnotationAdded={(span) => handleAnnotationAdded(fromTimeline(span))}
              onAnnotationSpanChange={(id, span) => handleAnnotationSpanChange(id, fromTimeline(span))}
              onAnnotationDelete={handleAnnotationDelete}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={handleSelectAnnotation}
              blurRegions={timelineBlurs}
              onBlurSpanChange={(id, span) => handleBlurSpanChange(id, fromTimeline(span))}
              onBlurDelete={handleBlurDelete}
              selectedBlurId={selectedBlurId}
              onSelectBlur={handleSelectBlur}
              clip={{
                segments: clipParts,
                markers: timelineMarkers,
                selectedStart: selectedClipStart,
                onSelectSegment: handleSelectClip,
                speeds: timelineSpeedBadges,
                typing: timelineTyping.map((stretch) => ({ startMs: stretch.startMs, outStart: stretch.outStart, outEnd: stretch.outEnd })),
                videos: timelineVideos,
                selectedTypingStart,
                onSelectTyping: handleSelectTyping,
                onSelectSpeed: (id: string) => {
                  // A speed that fills a part selects the part; any other (from older projects) selects the speed itself.
                  const region = speedRegions.find((candidate) => candidate.id === id);
                  const part = region && clipParts.find((candidate) => candidate.startMs === region.startMs && candidate.endMs === region.endMs);
                  if (part) handleSelectClip(part.startMs); else handleSelectSpeed(id);
                },
                onSplit: handleSplitClip,
                onDeleteSegment: handleDeleteClipPart,
                move: !embedded && clipPieceEdges.length > 2 ? { edges: clipPieceEdges, busy: addingVideo !== null, onMove: dropClipPart } : undefined,
                ending: endingMs > 0 ? { durationMs: endingMs, mode: ending.mode, onSelect: showEndingSettings } : undefined,
              }}
              onExtendEnding={extendEnding}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
            />
              </div>
            </Panel>
          </PanelGroup>
        </div>

          {/* Right section: settings panel */}
          <div className="workspace-inspector" hidden={!inspectorVisible || focusMode}>
          <SettingsPanel
          focusRequest={settingsFocusRequest}
          hasSelectedClipPart={selectedPart !== null || selectedTyping !== null}
          sourceAudioVolume={sourceAudioVolume}
          onSourceAudioVolumeChange={setSourceAudioVolume}
          fades={fades}
          onFadeChange={(key, ms) => setFades((previous) => ({ ...previous, [key]: ms }))}
          ending={ending}
          onEndingChange={setEnding}
          autoZoomControls={<AutoZoomControls settings={autoZoomSettings} onChange={updateAutoZoomSettings} onRegenerate={normalizedCursorTelemetry.length >= 2 && duration > 0 ? handleRegenerateAutoZoom : undefined} />}
          presets={<StylePresets appearance={appearance} onApply={applyAppearance} />}
          selectedAudioId={selectedAudioId}
          aiPanel={<div className="space-y-3"><h2 className="text-sm font-semibold text-white">AI stüdyo</h2><AutoCaptionsSection state={autoCaptions} existingCount={transcriptCaptionCount} captionStyle={captionStyle} onCaptionStyleChange={handleCaptionStyleChange} /><AgentPanel state={agent} available={Boolean(agentVideoPath) && duration > 0} onApply={handleAgentApply} onSeek={handleSeek} onExpand={() => setAgentWideOpen(true)} /><p className="text-xs leading-relaxed text-slate-400">{locale === 'tr' ? 'Videonuz için yazılar üretin; Ema Lightning, Fish Audio veya ElevenLabs ile seslendirin.' : 'Generate captions and narrate with Ema Lightning, Fish Audio or ElevenLabs.'}</p><button onClick={() => setAiCaptionsOpen(true)} className="w-full rounded-lg bg-violet-300/15 p-3 text-left text-xs text-violet-200">{locale === 'tr' ? '✦ AI video yazıları' : '✦ AI captions'}</button><button onClick={() => openVoiceover()} className="w-full rounded-lg bg-violet-300/15 p-3 text-left text-xs text-violet-200">{locale === 'tr' ? '♫ Metni seslendir' : '♫ Text to speech'}</button><button onClick={() => setAiSettingsOpen(true)} className="w-full rounded-lg border border-white/10 p-3 text-left text-xs text-slate-400">{locale === 'tr' ? 'AI bağlantısı ve API anahtarı' : 'AI connection and API key'}</button></div>}
          header={<>
            {selectedTyping && <TypingInspector index={selectedTypingIndex} total={timelineTyping.length} stretch={selectedTyping}
              speed={speedOfPart(selectedTyping, speedRegions)} onSpeedChange={(speed) => speedUpTyping([selectedTyping], speed)}
              onCut={() => cutTyping([selectedTyping])} onSpeedAll={(speed) => speedUpTyping(timelineTyping, speed)} onCutAll={() => cutTyping(timelineTyping)} />}
            {selectedPart && <ClipPartInspector index={selectedPartIndex} part={selectedPart} speed={speedOfPart(selectedPart, speedRegions)}
              canCut={clipParts.length > 1} onSpeedChange={handleSetPartSpeed} onCut={handleDeleteClipPart}
              move={clipPieces.length > 1 ? {
                index: clipPieces.findIndex((piece) => selectedPart.startMs >= piece.startMs && selectedPart.startMs < piece.endMs),
                count: clipPieces.length,
                busy: addingVideo !== null,
                onMove: (toIndex) => void moveClipPart(selectedPart.startMs, toIndex),
              } : undefined} />}
            {activeRegion && <RegionInspector region={activeRegion}
              label={activeRegionKind === 'blur' ? (locale === 'tr' ? 'Bulanık alan' : 'Blur area') : activeRegionKind === 'zoom' ? 'Zoom' : activeRegionKind === 'trim' ? t('timeline.trim.label', undefined, { index: '' }) : activeRegionKind === 'audio' && selectedAudio ? audioClipName(selectedAudio.audioPath, locale === 'tr') : t('timeline.speed.label')}
              onChange={updateActiveRegion} onDelete={deleteActiveRegion}
              crossfade={activeRegionKind === 'trim' ? { enabled: Boolean((activeRegion as TrimRegion).crossfade), onChange: (on) => setTrimRegions((previous) => previous.map((region) => {
                if (region.id !== activeRegion.id) return region;
                const { crossfade: _previous, ...rest } = region;
                return on ? { ...rest, crossfade: true } : rest;
              })) } : undefined}>
              {activeRegionKind === 'audio' && selectedAudio && <AudioClipControls region={selectedAudio}
                trackCount={Math.min(MAX_AUDIO_TRACKS, Math.max(...audioRegions.map((region) => (region.track ?? 0) + 2)))}
                isTrackFree={isTrackFreeForSelectedAudio}
                onVolumeChange={volume => setAudioRegions(previous => previous.map(region => region.id === selectedAudio.id ? { ...region, volume } : region))}
                onTrackChange={(track) => handleAudioTimelineChange(selectedAudio.id, audioTimelineSpan(selectedAudio, cutMap), track)} />}
              {activeRegionKind === 'blur' && selectedBlur && <BlurControls region={selectedBlur}
                onChange={(patch) => setBlurRegions((previous) => previous.map((region) => (region.id === selectedBlur.id ? { ...region, ...patch } : region)))} />}
            </RegionInspector>}
          </>}
          selected={wallpaper}
          onWallpaperChange={setWallpaper}
          selectedZoomDepth={selectedZoomId ? zoomRegions.find(z => z.id === selectedZoomId)?.depth : null}
          onZoomDepthChange={(depth) => selectedZoomId && handleZoomDepthChange(depth)}
          selectedZoomId={selectedZoomId}
          onZoomDelete={handleZoomDelete}
          selectedTrimId={selectedTrimId}
          onTrimDelete={handleTrimDelete}
          shadowIntensity={shadowIntensity}
          onShadowChange={setShadowIntensity}
          backgroundBlur={backgroundBlur}
          onBackgroundBlurChange={setBackgroundBlur}
          zoomMotionBlur={zoomMotionBlur}
          onZoomMotionBlurChange={setZoomMotionBlur}
          connectZooms={connectZooms}
          onConnectZoomsChange={setConnectZooms}
          showCursor={showCursor}
          onShowCursorChange={setShowCursor}
          loopCursor={loopCursor}
          onLoopCursorChange={setLoopCursor}
          cursorSize={cursorSize}
          onCursorSizeChange={setCursorSize}
          cursorSmoothing={cursorSmoothing}
          onCursorSmoothingChange={setCursorSmoothing}
          cursorMotionBlur={cursorMotionBlur}
          onCursorMotionBlurChange={setCursorMotionBlur}
          cursorClickBounce={cursorClickBounce}
          onCursorClickBounceChange={setCursorClickBounce}
          borderRadius={borderRadius}
          onBorderRadiusChange={setBorderRadius}
          padding={padding}
          onPaddingChange={setPadding}
          cropRegion={cropRegion}
          onCropChange={setCropRegion}
          aspectRatio={aspectRatio}
          videoElement={videoPlaybackRef.current?.video || null}
          exportResolution={exportResolution} onExportResolutionChange={setExportResolution}
          exportFps={exportFps} onExportFpsChange={setExportFps}
          exportCustomWidth={exportCustomWidth} exportCustomHeight={exportCustomHeight}
          onExportCustomSizeChange={(width, height) => {
            setExportCustomWidth(width);
            setExportCustomHeight(height);
            // Only a size with a new shape changes the frame; keep the chosen ratio otherwise.
            if (!matchesRatio(width, height, getCurrentAspectRatioValue())) setAspectRatio(`${width}:${height}`);
          }}
          exportQuality={exportQuality}
          onExportQualityChange={value => { setExportQuality(value); if (exportResolution === 'legacy') setExportResolution('source'); }}
          exportFormat={exportFormat}
          onExportFormatChange={setExportFormat}
          gifFrameRate={gifFrameRate}
          onGifFrameRateChange={setGifFrameRate}
          gifLoop={gifLoop}
          onGifLoopChange={setGifLoop}
          gifSizePreset={gifSizePreset}
          onGifSizePresetChange={setGifSizePreset}
          gifOutputDimensions={getGifOutputDimensions(
            videoPlaybackRef.current?.video?.videoWidth || 1920,
            videoPlaybackRef.current?.video?.videoHeight || 1080,
            aspectRatio, gifSizePreset
          )}
          onExport={handleOpenExportDialog}
          selectedAnnotationId={selectedAnnotationId}
          annotationRegions={annotationRegions}
          onAnnotationContentChange={handleAnnotationContentChange}
          onAnnotationTypeChange={handleAnnotationTypeChange}
          onAnnotationStyleChange={handleAnnotationStyleChange}
          onAnnotationAnimationChange={handleAnnotationAnimationChange}
          onAnnotationFigureDataChange={handleAnnotationFigureDataChange}
          onAnnotationDelete={handleAnnotationDelete}
          onSaveProject={embedded ? undefined : handleSaveProject}
          onLoadProject={embedded ? undefined : handleLoadProject}
          selectedSpeedId={selectedSpeedId}
          selectedSpeedValue={selectedSpeedId ? speedRegions.find(r => r.id === selectedSpeedId)?.speed ?? null : null}
          onSpeedChange={handleSpeedChange}
          onSpeedDelete={handleSpeedDelete}
        />
          </div>
      </div>

      </>}
      {!embedded && <Toaster theme="dark" className="pointer-events-auto" />}
      <AiCaptionsPanel onSettings={() => { setAiCaptionsOpen(false); setAiSettingsOpen(true); }} onNarrate={text => { setAiCaptionsOpen(false); openVoiceover(text); }} open={aiCaptionsOpen} onOpenChange={setAiCaptionsOpen}
        durationMs={Math.round(duration * 1000)} trims={trimRegions} onApply={handleAiCaptionsApply} />
      
      <ModelionSettings open={aiSettingsOpen} onOpenChange={setAiSettingsOpen} />
      <Dialog open={agentWideOpen} onOpenChange={setAgentWideOpen}>
        <DialogContent className="flex h-[82vh] max-w-[1100px] flex-col border-white/10 bg-[#101014] text-white" data-testid="agent-wide-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm">{t('editor.agent.title')}</DialogTitle>
            <DialogDescription className="text-[11px] text-slate-400">{t('editor.agent.description')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <AgentPanel state={agent} available={Boolean(agentVideoPath) && duration > 0} onApply={handleAgentApply} onSeek={handleSeek} variant="wide" />
          </div>
        </DialogContent>
      </Dialog>
      <VoiceoverPanel open={voiceoverOpen} onOpenChange={setVoiceoverOpen} initialText={voiceoverText}
        onSettings={() => { setVoiceoverOpen(false); setAiSettingsOpen(true); }} remainingSeconds={Math.max(0, sequenceVisible && sequence ? (sequenceEnd(sequence.clips)-sequenceTime.current)/1000 : duration-currentTime)}
        takes={voiceoverTakes} onTakeCreated={take => setVoiceoverTakes(previous => addVoiceoverTake(previous, take))} onTakeRemove={id => setVoiceoverTakes(previous => previous.filter(take => take.id !== id))}
        onAdd={(path, seconds, at) => { if(sequenceVisible && voiceInsert.current){void voiceInsert.current(path,at);return;} const start = at === 'start' ? 0 : Math.min(currentTime, Math.max(0,duration-.1)); handleAudioAdded({start:Math.round(start*1000),end:Math.round((start+seconds)*1000)},path,seconds*1000); }} />
      <ExportSetupDialog open={exportSetupOpen} onOpenChange={setExportSetupOpen} onStart={() => { setExportSetupOpen(false); handleStartExport(); }}
        selected={wallpaper} onWallpaperChange={setWallpaper} aspectRatio={aspectRatio} videoElement={videoPlaybackRef.current?.video}
        exportFormat={exportFormat} onExportFormatChange={setExportFormat} exportQuality={exportQuality} onExportQualityChange={value => { setExportQuality(value); if (exportResolution === 'legacy') setExportResolution('source'); }}
        exportResolution={exportResolution} onExportResolutionChange={setExportResolution} exportFps={exportFps} onExportFpsChange={setExportFps}
        exportCustomWidth={exportCustomWidth} exportCustomHeight={exportCustomHeight} onExportCustomSizeChange={(width,height) => { setExportCustomWidth(width); setExportCustomHeight(height); if (!matchesRatio(width,height,getCurrentAspectRatioValue())) setAspectRatio(`${width}:${height}`); }}
        gifFrameRate={gifFrameRate} onGifFrameRateChange={setGifFrameRate} gifLoop={gifLoop} onGifLoopChange={setGifLoop} gifSizePreset={gifSizePreset} onGifSizePresetChange={setGifSizePreset}
        gifOutputDimensions={getGifOutputDimensions(videoPlaybackRef.current?.video?.videoWidth || 1920, videoPlaybackRef.current?.video?.videoHeight || 1080, aspectRatio, gifSizePreset)} />
      <ExportDialog
        isOpen={showExportDialog}
        onClose={handleExportDialogClose}
        progress={exportProgress}
        isExporting={isExporting}
        error={exportError}
        onCancel={handleCancelExport}
        onRetrySave={handleRetrySaveExport}
        canRetrySave={hasPendingExportSave}
        exportFormat={exportFormat}
        exportedFilePath={exportedFilePath}
      />
    </div>
  );
}
