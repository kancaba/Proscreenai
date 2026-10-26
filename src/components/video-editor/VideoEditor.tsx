import { useProjectDraft } from '@/hooks/useProjectDraft';
import './editor-workspace.css';
import { PreviewWorkspaceBar } from './PreviewWorkspaceBar';
import { ModelionSettings } from './ModelionSettings';
import { VoiceoverPanel } from './VoiceoverPanel';
import { ExportSetupDialog } from './ExportSetupDialog';
import { outputDimensions, exportBitrate, fitCustomSizeToRatio, matchesRatio, type ResolutionPreset, type VideoFps } from '@/lib/video/outputSettings';
import { AudioClipControls } from './AudioInspector';
import { audioClipName } from './audioClipName';
import { ClipPartInspector } from './ClipPartInspector';
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
import { SettingsPanel } from "./SettingsPanel";
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
import { useAutoCaptions } from "./useAutoCaptions";
import { AgentPanel } from "./AgentPanel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAgentRun } from "./useAgentRun";
import { applyProposals, mergeTrims } from "./agentApply";
import { clipSegments, createCutMap, cutMarkers, normalizeSplits, spanToOutput, spanToSource, toOutputMs, toSourceMs } from "./timeline/editedTime";
import type { AgentProjectSnapshot } from "@/lib/agent/agentSnapshot";
import { TEXT_STYLE_PRESETS } from "./annotationEffects";
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
import { applyAudioTimelineChange, audioFileOffsetSeconds, audioTimelineSpan, firstFreeAudioTrack, isAudioActive, MAX_AUDIO_TRACKS, splitAudioRegion } from './audioRegionSpan';
import type { EditorAppearance } from './appearancePresets';

const LOOP_CURSOR_END_WINDOW_MS = 670;

type EditorHistorySnapshot = {
  appearance: EditorAppearance;
  zoomRegions: ZoomRegion[];
  trimRegions: TrimRegion[];
  speedRegions: SpeedRegion[];
  annotationRegions: AnnotationRegion[];
  audioRegions: AudioRegion[];
  sourceAudioVolume: number;
  fades: Fades;
  clipSplits: number[];
  selectedZoomId: string | null;
  selectedTrimId: string | null;
  selectedSpeedId: string | null;
  selectedAnnotationId: string | null;
  selectedAudioId: string | null;
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

export default function VideoEditor() {
  const { t, locale } = useI18n();
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const videoPathRef = useRef<string | null>(null);
  videoPathRef.current = videoPath;
  const [videoSourcePath, setVideoSourcePath] = useState<string | null>(null);
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
  // Video whose telemetry has finished loading (empty or not), so "no clicks" can be told apart from "not loaded yet".
  const [cursorTelemetryPath, setCursorTelemetryPath] = useState<string | null>(null);
  const [autoZoomSettings, setAutoZoomSettingsState] = useState<AutoZoomSettings>(loadAutoZoomSettings);
  const [settingsFocusRequest, setSettingsFocusRequest] = useState<{ tab: "motion"; target: "auto-zoom"; nonce: number } | null>(null);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [trimRegions, setTrimRegions] = useState<TrimRegion[]>([]);
  const [selectedTrimId, setSelectedTrimId] = useState<string | null>(null);
  const [speedRegions, setSpeedRegions] = useState<SpeedRegion[]>([]);
  const [selectedSpeedId, setSelectedSpeedId] = useState<string | null>(null);
  const [annotationRegions, setAnnotationRegions] = useState<AnnotationRegion[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [audioRegions, setAudioRegions] = useState<AudioRegion[]>([]);
  /** Volume of the recording's own sound, 0 (muted) to 1. */
  const [sourceAudioVolume, setSourceAudioVolume] = useState(1);
  /** Optional fade from/to black at the video's start and end. */
  const [fades, setFades] = useState<Fades>(NO_FADES);
  /** Points (source ms) where the video track is split into parts that can be cut. */
  const [clipSplits, setClipSplits] = useState<number[]>([]);
  const totalSourceMs = Math.round(duration * 1000);
  const cutMap = useMemo(() => createCutMap(trimRegions, totalSourceMs), [trimRegions, totalSourceMs]);
  /** Fade darkening at the playhead, shown over the preview and applied to the preview's sound. */
  const previewFade = fadeAmount(toOutputMs(cutMap, currentTime * 1000), cutMap.outputMs, fades);
  /** The selected video part, by its source start. */
  const [selectedClipStart, setSelectedClipStart] = useState<number | null>(null);
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
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);

  const videoPlaybackRef = useRef<VideoPlaybackRef>(null);
  const nextZoomIdRef = useRef(1);
  const nextTrimIdRef = useRef(1);
  const nextSpeedIdRef = useRef(1);
  const nextAudioIdRef = useRef(1);

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
  const openVoiceover = (text?: string) => { videoPlaybackRef.current?.pause(); setVoiceoverText(text ?? annotationRegions.filter(region => region.type === 'text' && (!selectedAnnotationId || region.id === selectedAnnotationId)).sort((a,b) => a.startMs-b.startMs).map(getAnnotationText).filter(Boolean).join(' ')); setVoiceoverOpen(true); };
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
      sourceAudioVolume: snapshot.sourceAudioVolume,
      fades: { ...snapshot.fades },
      clipSplits: [...(snapshot.clipSplits ?? [])],
      selectedZoomId: snapshot.selectedZoomId,
      selectedTrimId: snapshot.selectedTrimId,
      selectedSpeedId: snapshot.selectedSpeedId,
      selectedAnnotationId: snapshot.selectedAnnotationId,
      selectedAudioId: snapshot.selectedAudioId,
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
      sourceAudioVolume,
      fades,
      clipSplits,
      selectedZoomId,
      selectedTrimId,
      selectedSpeedId,
      selectedAnnotationId,
      selectedAudioId,
    };
  }, [
    appearance,
    zoomRegions,
    trimRegions,
    speedRegions,
    annotationRegions,
    audioRegions,
    sourceAudioVolume,
    fades,
    clipSplits,
    selectedZoomId,
    selectedTrimId,
    selectedSpeedId,
    selectedAnnotationId,
    selectedAudioId,
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
    setSourceAudioVolume(cloned.sourceAudioVolume ?? 1);
    setFades(cloned.fades ?? NO_FADES);
    setClipSplits(cloned.clipSplits ?? []);
    setSelectedClipStart(null);
    setSelectedZoomId(cloned.selectedZoomId);
    setSelectedTrimId(cloned.selectedTrimId);
    setSelectedSpeedId(cloned.selectedSpeedId);
    setSelectedAnnotationId(cloned.selectedAnnotationId);
    setSelectedAudioId(cloned.selectedAudioId);

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
    pendingPlayheadRef.current = typeof project.workspace?.playheadSeconds === 'number' && Number.isFinite(project.workspace.playheadSeconds) ? Math.max(0,project.workspace.playheadSeconds) : null;
    const sourcePath = fromFileUrl(project.videoPath);
    const normalizedEditor = normalizeProjectEditor(project.editor);

    try {
      videoPlaybackRef.current?.pause();
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
    setSourceAudioVolume(normalizedEditor.sourceAudioVolume);
    setFades(normalizedEditor.fades);
    setClipSplits(normalizedEditor.clipSplits);
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
        sourceAudioVolume,
        fades,
        clipSplits,
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
    sourceAudioVolume,
    fades,
    clipSplits,
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
        ? historyAvailability.canUndo
        : currentProjectSnapshot !== lastSavedSnapshot
    )),
  );

  const autoDraft = useProjectDraft(currentProjectSnapshot,currentProjectPath,hasUnsavedChanges,() => videoPlaybackRef.current?.video?.currentTime ?? currentTime);
  useEffect(() => {
    if (duration <= 0 || pendingPlayheadRef.current === null) return;
    const time = Math.min(duration,pendingPlayheadRef.current);
    pendingPlayheadRef.current = null;
    const video = videoPlaybackRef.current?.video;
    if (video) video.currentTime = time;
    setCurrentTime(time);
  },[duration]);

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
    async function loadInitialData() {
      try {
        const currentProjectResult = await window.electronAPI.loadCurrentProjectFile();
        if (currentProjectResult.success && currentProjectResult.project) {
          const restored = await applyLoadedProject(
            currentProjectResult.project,
            currentProjectResult.path ?? null,
            currentProjectResult.recovered ?? false,
          );
          if (restored) {
            return;
          }
        }

        const result = await window.electronAPI.getCurrentVideoPath();
        if (result.success && result.path) {
          const sourcePath = fromFileUrl(result.path);
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
        setLoading(false);
      }
    }

    loadInitialData();
  }, [applyLoadedProject]);

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

    const projectData = createProjectData(sourcePath, {
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
      sourceAudioVolume,
      fades,
      clipSplits,
      aspectRatio,
      exportQuality, exportResolution, exportFps, exportCustomWidth, exportCustomHeight,
      exportFormat,
      gifFrameRate,
      gifLoop,
      gifSizePreset,
    });

    const fileNameBase = sourcePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || `project-${Date.now()}`;
    const projectSnapshot = JSON.stringify(projectData);
    projectData.workspace = {playheadSeconds: videoPlaybackRef.current?.video?.currentTime ?? 0};
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
  }, [
    videoPath,
    videoSourcePath,
    currentProjectPath,
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
    sourceAudioVolume,
    fades,
    clipSplits,
    aspectRatio,
    exportQuality, exportResolution, exportFps, exportCustomWidth, exportCustomHeight,
    exportFormat,
    gifFrameRate,
    gifLoop,
    gifSizePreset,
  ]);

  useEffect(() => {
    window.electronAPI.setHasUnsavedChanges(hasUnsavedChanges);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const cleanup = window.electronAPI.onRequestSaveBeforeClose(async () => {
      return saveProject(false);
    });

    return () => cleanup?.();
  }, [saveProject]);

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
    const removeLoadListener = window.electronAPI.onMenuLoadProject(handleLoadProject);
    const removeSaveListener = window.electronAPI.onMenuSaveProject(handleSaveProject);
    const removeSaveAsListener = window.electronAPI.onMenuSaveProjectAs(handleSaveProjectAs);

    return () => {
      removeLoadListener?.();
      removeSaveListener?.();
      removeSaveAsListener?.();
    };
  }, [handleLoadProject, handleSaveProject, handleSaveProjectAs]);

  useEffect(() => {
    let mounted = true;

    async function loadCursorTelemetry() {
      if (!videoPath) {
        if (mounted) {
          setCursorTelemetry([]);
          setCursorTelemetryPath(null);
        }
        return;
      }

      try {
        const result = await window.electronAPI.getCursorTelemetry(fromFileUrl(videoPath));
        if (mounted) {
          setCursorTelemetry(result.success ? result.samples : []);
          setCursorTelemetryPath(videoPath);
        }
      } catch (telemetryError) {
        console.warn('Unable to load cursor telemetry:', telemetryError);
        if (mounted) {
          setCursorTelemetry([]);
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
      playback.pause();
    } else {
      playback.play().catch(err => console.error('Video play failed:', err));
    }
  }

  function handleSeek(time: number) {
    const video = videoPlaybackRef.current?.video;
    if (!video) return;
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
    const newRegions = captions.map(({ slot, text }): AnnotationRegion => ({
      id: `annotation-${nextAnnotationIdRef.current++}`,
      startMs: slot.startMs,
      endMs: slot.endMs,
      type: 'text',
      content: text,
      textContent: text,
      position: { x: 10, y: 74 },
      size: { width: 80, height: 20 },
      style: { ...DEFAULT_ANNOTATION_STYLE, fontSize: 28, backgroundColor: '#000000aa' },
      zIndex: nextAnnotationZIndexRef.current++,
    }));
    setAnnotationRegions((previous) => [...previous, ...newRegions]);
    setSelectedAnnotationId(null);
  }, []);

  /** Speech captions replace earlier ones as one undo step, styled with the subtitle preset. */
  const handleAutoCaptionsApply = useCallback((cues: CaptionCue[]) => {
    const preset = TEXT_STYLE_PRESETS.find((candidate) => candidate.id === 'subtitle');
    const newRegions = cues.map((cue): AnnotationRegion => ({
      id: `annotation-${nextAnnotationIdRef.current++}`,
      startMs: cue.startMs,
      endMs: cue.endMs,
      type: 'text',
      content: cue.text,
      textContent: cue.text,
      // Room for two lines of subtitle text.
      position: { x: 10, y: 74 },
      size: { width: 80, height: 20 },
      style: { ...DEFAULT_ANNOTATION_STYLE, ...preset?.style },
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
  }, [t, handleUndo, startNewHistoryStep]);

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
    setAnnotationRegions(next.annotations);
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
    };
    const totalMs = Math.round(duration * 1000);
    const playheadMs = Math.round(currentTime * 1000);
    // New text copies go on top of existing texts.
    const withZIndex = (kind: RegionKind, region: TimedRegion) =>
      kind === "annotation" ? { ...region, zIndex: nextAnnotationZIndexRef.current++ } : region;

    if (command.type === "paste") {
      const clip = regionClipboardRef.current;
      if (!clip) return;
      const track = tracks[clip.kind];
      const copy = placeCopy(clip.region, track.regions, playheadMs, totalMs, track.nextId(), KIND_ALLOWS_OVERLAP[clip.kind]);
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
        const copy = placeCopy(region, track.regions, region.endMs, totalMs, track.nextId(), KIND_ALLOWS_OVERLAP[target.kind]);
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
        const moved = nudgeRegion(region, command.deltaMs, track.regions, totalMs, KIND_ALLOWS_OVERLAP[target.kind]);
        if (moved) track.set((prev) => prev.map((item) => (item.id === region.id ? moved : item)));
        break;
      }
      case "delete":
        track.remove(region.id);
        break;
    }
  }, [
    zoomRegions, trimRegions, speedRegions, annotationRegions, audioRegions, duration, currentTime, t, cutMap,
    handleZoomDelete, handleTrimDelete, handleSpeedDelete, handleAnnotationDelete, handleAudioDelete,
    handleSelectZoom, handleSelectTrim, handleSelectSpeed, handleSelectAnnotation, handleSelectAudio,
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
      if (document.querySelector('[role="dialog"]')) return;
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
  }, [shortcuts, isMac, handleUndo, handleRedo]);

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

      // Added audio follows the edited timeline, so it plays on without gaps where the video is cut.
      const timelineMs = toOutputMs(cutMap, currentTime * 1000);
      const isInRegion = isAudioActive(region, timelineMs, cutMap);
      audio.volume = Math.max(0, Math.min(1, region.volume * (1 - previewFade)));

      if (isPlaying && isInRegion) {
        audio.playbackRate = videoPlaybackRef.current?.video?.playbackRate ?? 1;
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

  const handleExport = useCallback(async (settings: ExportSettings) => {
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
        videoPlaybackRef.current?.pause();
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
          zoomRegions: effectiveZoomRegions,
          cursorTelemetry: effectiveCursorTelemetry,
          showCursor,
          cursorSize,
          cursorSmoothing,
          cursorMotionBlur,
          cursorClickBounce,
          audioRegions,
          sourceAudioVolume,
          fades,
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
  }, [exportFileBase, sourceAudioVolume, fades, videoPath, wallpaper, zoomRegions, trimRegions, speedRegions, shadowIntensity, backgroundBlur, zoomMotionBlur, connectZooms, showCursor, effectiveCursorTelemetry, cursorSize, cursorSmoothing, cursorMotionBlur, cursorClickBounce, borderRadius, padding, cropRegion, annotationRegions, audioRegions, isPlaying, aspectRatio, exportQuality, exportResolution, exportFps, exportCustomWidth, exportCustomHeight,showExportSuccessToast]);

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
    else if (duration > 0) { videoPlaybackRef.current?.pause(); setExportSetupOpen(true); }
  }, [hasPendingExportSave, duration]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"]') || (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return;
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'e') { event.preventDefault(); handleOpenExportDialog(); }
      else if (mod && event.key === ',') { event.preventDefault(); setAiSettingsOpen(true); }
      else if (event.key === '?' || (mod && event.key === '/')) { event.preventDefault(); openConfig(); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const video = videoPlaybackRef.current?.video; if (video) video.currentTime = Math.max(0, Math.min(duration, video.currentTime + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 1 : .1))); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); const video = videoPlaybackRef.current?.video; if (video) video.currentTime = event.key === 'Home' ? 0 : duration; }
    }; window.addEventListener('keydown',key); return () => window.removeEventListener('keydown',key);
  }, [duration,isMac,openConfig,handleOpenExportDialog]);

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
  const timelineAudio = useMemo(() => audioRegions.flatMap((region) => {
    const span = audioTimelineSpan(region, cutMap);
    const end = Math.min(span.end, cutMap.outputMs);
    return end - span.start >= 1 ? [{ ...region, startMs: span.start, endMs: Math.round(end) }] : [];
  }), [audioRegions, cutMap]);
  const timelineTelemetry = useMemo(
    () => effectiveCursorTelemetry
      .filter((sample) => !cutMap.cuts.some((cut) => sample.timeMs > cut.startMs && sample.timeMs < cut.endMs))
      .map((sample) => ({ ...sample, timeMs: toOutputMs(cutMap, sample.timeMs) })),
    [effectiveCursorTelemetry, cutMap],
  );

  const handleSelectClip = useCallback((startMs: number | null) => {
    setSelectedClipStart(startMs);
    if (startMs !== null) {
      setSelectedZoomId(null);
      setSelectedTrimId(null);
      setSelectedSpeedId(null);
      setSelectedAnnotationId(null);
      setSelectedAudioId(null);
    }
  }, []);

  // Selecting any other item deselects the video part.
  useEffect(() => {
    if (selectedZoomId || selectedTrimId || selectedSpeedId || selectedAnnotationId || selectedAudioId) setSelectedClipStart(null);
  }, [selectedZoomId, selectedTrimId, selectedSpeedId, selectedAnnotationId, selectedAudioId]);

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
    const span = findAvailableSpan(Math.round(duration * 1000), Math.round(currentTime * 1000), regions, tool === 'text' ? 2500 : tool === 'zoom' ? DEFAULT_ZOOM_SPAN_MS : 1500);
    if (!span) { toast.info(t('timeline.zoom.existsOrNoSpace')); return; }
    const timelineSpan = { start: span.startMs, end: span.endMs };
    if (tool === 'zoom') handleZoomAdded(timelineSpan);
    if (tool === 'text') handleAnnotationAdded(timelineSpan);
    handleSeek(span.startMs / 1000);
  };
  const selectedAudio = selectedAudioId ? audioRegions.find((r) => r.id === selectedAudioId) ?? null : null;
  // Audio clips are edited in edited-timeline time, as the timeline shows them.
  const activeRegion = selectedZoomId ? zoomRegions.find((r) => r.id === selectedZoomId)
    : selectedTrimId ? trimRegions.find((r) => r.id === selectedTrimId)
    : selectedSpeedId ? speedRegions.find((r) => r.id === selectedSpeedId)
    : selectedAudioId ? timelineAudio.find((r) => r.id === selectedAudioId) : null;
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
  const activeRegionKind = selectedZoomId ? 'zoom' : selectedTrimId ? 'trim' : selectedSpeedId ? 'speed' : 'audio';
  const updateActiveRegion = (span: TimeSpan) => {
    if (!activeRegion) return false;
    if (activeRegionKind === 'audio') {
      // Typed in edited-timeline time; the clip may run past the video's end.
      if (!(span.startMs >= 0 && span.endMs - span.startMs >= 100 && span.startMs < cutMap.outputMs)) return false;
      handleAudioTimelineChange(activeRegion.id, { start: span.startMs, end: span.endMs });
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
    else handleSpeedDelete(activeRegion.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-foreground">{t('launch.sourceSelector.loadingSources')}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="text-destructive">{error}</div>
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
      <div 
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
      </div>

      <EditorToolbar onVoiceover={() => openVoiceover()} onShortcuts={openConfig} onAdd={addEditorTool} onAiCaptions={() => setAiCaptionsOpen(true)} onUndo={handleUndo} onRedo={handleRedo}
        canUndo={historyAvailability.canUndo} canRedo={historyAvailability.canRedo}
        onSave={handleSaveProject} onExport={handleOpenExportDialog} disabled={isExporting || !duration}
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
                      onTimeUpdate={setCurrentTime}
                      currentTime={currentTime}
                      onPlayStateChange={setIsPlaying}
                      onError={setError}
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
                      duration={cutMap.outputMs / 1000}
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
                <div className="workspace-timeline-heading"><strong>{locale === 'tr' ? 'Zaman çizelgesi' : 'Timeline'}</strong><span>{duration > 0 ? "1 video · " : ""}{zoomRegions.length + trimRegions.length + speedRegions.length + annotationRegions.length + audioRegions.length} {locale === 'tr' ? 'düzenleme' : 'edits'}</span><small>{locale === 'tr' ? 'Sürükle, kısalt, hikâyeni oluştur.' : 'Drag, trim, tell your story.'}</small></div>
                <TimelineEditor
              videoPath={videoSourcePath || videoPath || ''}
              videoDuration={cutMap.outputMs / 1000}
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
              clip={{
                segments: clipParts,
                markers: timelineMarkers,
                selectedStart: selectedClipStart,
                onSelectSegment: handleSelectClip,
                speeds: timelineSpeedBadges,
                onSelectSpeed: (id: string) => {
                  // A speed that fills a part selects the part; any other (from older projects) selects the speed itself.
                  const region = speedRegions.find((candidate) => candidate.id === id);
                  const part = region && clipParts.find((candidate) => candidate.startMs === region.startMs && candidate.endMs === region.endMs);
                  if (part) handleSelectClip(part.startMs); else handleSelectSpeed(id);
                },
                onSplit: handleSplitClip,
                onDeleteSegment: handleDeleteClipPart,
              }}
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
          hasSelectedClipPart={selectedPart !== null}
          sourceAudioVolume={sourceAudioVolume}
          onSourceAudioVolumeChange={setSourceAudioVolume}
          fades={fades}
          onFadeChange={(key, ms) => setFades((previous) => ({ ...previous, [key]: ms }))}
          autoZoomControls={<AutoZoomControls settings={autoZoomSettings} onChange={updateAutoZoomSettings} onRegenerate={normalizedCursorTelemetry.length >= 2 && duration > 0 ? handleRegenerateAutoZoom : undefined} />}
          presets={<StylePresets appearance={appearance} onApply={applyAppearance} />}
          selectedAudioId={selectedAudioId}
          aiPanel={<div className="space-y-3"><h2 className="text-sm font-semibold text-white">AI stüdyo</h2><AutoCaptionsSection state={autoCaptions} existingCount={transcriptCaptionCount} /><AgentPanel state={agent} available={Boolean(agentVideoPath) && duration > 0} onApply={handleAgentApply} onSeek={handleSeek} onExpand={() => setAgentWideOpen(true)} /><p className="text-xs leading-relaxed text-slate-400">{locale === 'tr' ? 'Videonuz için yazılar üretin; Ema Lightning, Fish Audio veya ElevenLabs ile seslendirin.' : 'Generate captions and narrate with Ema Lightning, Fish Audio or ElevenLabs.'}</p><button onClick={() => setAiCaptionsOpen(true)} className="w-full rounded-lg bg-violet-300/15 p-3 text-left text-xs text-violet-200">{locale === 'tr' ? '✦ AI video yazıları' : '✦ AI captions'}</button><button onClick={() => openVoiceover()} className="w-full rounded-lg bg-violet-300/15 p-3 text-left text-xs text-violet-200">{locale === 'tr' ? '♫ Metni seslendir' : '♫ Text to speech'}</button><button onClick={() => setAiSettingsOpen(true)} className="w-full rounded-lg border border-white/10 p-3 text-left text-xs text-slate-400">{locale === 'tr' ? 'AI bağlantısı ve API anahtarı' : 'AI connection and API key'}</button></div>}
          header={<>
            {selectedPart && <ClipPartInspector index={selectedPartIndex} part={selectedPart} speed={speedOfPart(selectedPart, speedRegions)}
              canCut={clipParts.length > 1} onSpeedChange={handleSetPartSpeed} onCut={handleDeleteClipPart} />}
            {activeRegion && <RegionInspector region={activeRegion}
              label={activeRegionKind === 'zoom' ? 'Zoom' : activeRegionKind === 'trim' ? t('timeline.trim.label', undefined, { index: '' }) : activeRegionKind === 'audio' && selectedAudio ? audioClipName(selectedAudio.audioPath, locale === 'tr') : t('timeline.speed.label')}
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
          onSaveProject={handleSaveProject}
          onLoadProject={handleLoadProject}
          selectedSpeedId={selectedSpeedId}
          selectedSpeedValue={selectedSpeedId ? speedRegions.find(r => r.id === selectedSpeedId)?.speed ?? null : null}
          onSpeedChange={handleSpeedChange}
          onSpeedDelete={handleSpeedDelete}
        />
          </div>
      </div>

      <Toaster theme="dark" className="pointer-events-auto" />
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
        onSettings={() => { setVoiceoverOpen(false); setAiSettingsOpen(true); }} remainingSeconds={Math.max(0, duration-currentTime)}
        onAdd={(path, seconds) => { const start = Math.min(currentTime, Math.max(0,duration-.1)); handleAudioAdded({start:Math.round(start*1000),end:Math.round((start+seconds)*1000)},path,seconds*1000); }} />
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
