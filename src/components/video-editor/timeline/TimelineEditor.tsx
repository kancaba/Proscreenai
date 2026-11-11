import { layoutTrackLanes } from './trackLayout';
import { EndingTrackItem, SourceVideoTrack } from './SourceVideoTrack';
import { useI18n, useScopedT } from '@/contexts/I18nContext';
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type WheelEvent } from "react";
import { useTimelineContext } from "dnd-timeline";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Scissors, ZoomIn, MessageSquare, ChevronDown, Check, Gauge, WandSparkles, Music, Film, FolderOpen, Video, LoaderCircle, Hourglass, ChevronsLeft, TextCursorInput } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import { matchesShortcut } from "@/lib/shortcuts";
import { VIDEO_FORMAT_PRESETS, ASPECT_RATIOS, type AspectRatio, getAspectRatioLabel, isCustomAspectRatio } from "@/utils/aspectRatioUtils";
import { formatShortcut } from "@/utils/platformUtils";
import { TutorialHelp } from "../TutorialHelp";
import TimelineWrapper, { type TimelineSnapScale } from "./TimelineWrapper";
import { RegionContextMenu } from "./RegionContextMenu";
import type { RegionCommand, RegionKind, RegionTarget, TimedRegion } from "./regionCommands";
import { followPlayhead, rangeForZoomLevel, zoomLevelForRange } from "./timelineView";
import Row from "./Row";
import Item from "./Item";
import KeyframeMarkers from "./KeyframeMarkers";
import type { Range, Span } from "dnd-timeline";
import type { ZoomRegion, TrimRegion, AnnotationRegion, SpeedRegion, AudioRegion, CursorTelemetryPoint, ZoomFocus, VideoInsertPlace } from "../types";
import { toFileUrl } from "../projectPersistence";
import { audioRowId, MAX_AUDIO_TRACKS, trackOfAudioRow } from "../audioRegionSpan";
import { audioClipName } from "../audioClipName";
import { detectInteractionCandidates, normalizeCursorTelemetry } from "./zoomSuggestionUtils";
import { DEFAULT_ZOOM_SPAN_MS } from "../editingTools";
import type { ClipSegment } from "./editedTime";
import type { BlurRegion } from "../blurRegions";

const ZOOM_ROW_ID = "row-zoom";
const TRIM_ROW_ID = "row-trim";
const ANNOTATION_ROW_ID = "row-annotation";
const SPEED_ROW_ID = "row-speed";
const BLUR_ROW_ID = "row-blur";
const FALLBACK_RANGE_MS = 1000;
const TARGET_MARKER_COUNT = 12;
const SUGGESTION_SPACING_MS = 1800;

interface TimelineEditorProps {
  videoPath?: string;
  videoDuration: number;
  currentTime: number;
  onSeek?: (time: number) => void;
  cursorTelemetry?: CursorTelemetryPoint[];
  zoomRegions: ZoomRegion[];
  onZoomAdded: (span: Span) => void;
  onZoomSuggested?: (span: Span, focus: ZoomFocus) => void;
  onZoomSpanChange: (id: string, span: Span) => void;
  onZoomDelete: (id: string) => void;
  selectedZoomId: string | null;
  onSelectZoom: (id: string | null) => void;
  trimRegions?: TrimRegion[];
  onTrimAdded?: (span: Span) => void;
  onTrimSpanChange?: (id: string, span: Span) => void;
  onTrimDelete?: (id: string) => void;
  selectedTrimId?: string | null;
  onSelectTrim?: (id: string | null) => void;
  annotationRegions?: AnnotationRegion[];
  onAnnotationAdded?: (span: Span) => void;
  onAnnotationSpanChange?: (id: string, span: Span) => void;
  onAnnotationDelete?: (id: string) => void;
  selectedAnnotationId?: string | null;
  onSelectAnnotation?: (id: string | null) => void;
  /** Areas of the recording that are blurred (added from the toolbar). */
  blurRegions?: BlurRegion[];
  onBlurSpanChange?: (id: string, span: Span) => void;
  onBlurDelete?: (id: string) => void;
  selectedBlurId?: string | null;
  onSelectBlur?: (id: string | null) => void;
  speedRegions?: SpeedRegion[];
  onSpeedAdded?: (span: Span) => void;
  onSpeedSpanChange?: (id: string, span: Span) => void;
  onSpeedDelete?: (id: string) => void;
  selectedSpeedId?: string | null;
  onSelectSpeed?: (id: string | null) => void;
  audioRegions?: AudioRegion[];
  onAudioAdded?: (span: Span, audioPath: string, sourceDurationMs?: number) => void;
  /** Adds a video to the edit (at the start, the playhead or the end), from a file or from a new recording. */
  onAddVideo?: (from: "file" | "record", place?: VideoInsertPlace) => void;
  /** Adds time after the video's end (or shows the controls of the one there is). */
  onExtendEnding?: () => void;
  /** Progress (0–1) while a video is being added. */
  addingVideo?: number | null;
  /** `track` is set when the clip was dropped on another audio track. */
  onAudioSpanChange?: (id: string, span: Span, track?: number) => void;
  onAudioDelete?: (id: string) => void;
  selectedAudioId?: string | null;
  /** Copy, paste, duplicate, split, delete or nudge a timeline item. */
  onRegionCommand?: (command: RegionCommand, target: RegionTarget | null) => void;
  /** Delete or move several selected items together, as one step. */
  onRegionGroupCommand?: (command: Extract<RegionCommand, { type: "delete" | "nudge" }>, targets: RegionTarget[]) => void;
  canPasteRegion?: boolean;
  /**
   * Premiere-style editing of the video track: the timeline shows the video as edited, split
   * into parts; cut points are markers. When given, there is no separate cut row.
   */
  clip?: ClipTrackProps;
  onSelectAudio?: (id: string | null) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (aspectRatio: AspectRatio) => void;
}

export interface ClipTrackProps {
  segments: ClipSegment[];
  /** Cut points on the edited timeline. */
  markers: Array<{ outMs: number; cutId: string; lengthMs: number; crossfade?: boolean }>;
  selectedStart: number | null;
  onSelectSegment: (sourceStartMs: number | null) => void;
  /** Splits the video at the playhead. */
  onSplit: () => void;
  /** Cuts the selected part out. */
  onDeleteSegment: () => void;
  /** Speed changes on the edited timeline, drawn as badges on the video track. */
  speeds?: Array<{ id: string; speed: number; outStart: number; outEnd: number }>;
  onSelectSpeed?: (id: string) => void;
  /** Stretches where the user was typing while recording, on the edited timeline. */
  typing?: Array<{ startMs: number; outStart: number; outEnd: number }>;
  selectedTypingStart?: number | null;
  onSelectTyping?: (sourceStartMs: number) => void;
  /** The videos joined into the edit, where each starts on the edited timeline (only when there are several). */
  videos?: Array<{ name: string; outStart: number }>;
  /** Dragging a part elsewhere: the piece edges (edited ms) it can be dropped at. */
  move?: { edges: number[]; busy: boolean; onMove: (partStartMs: number, toOutMs: number) => void };
  /** Time added after the video's end; clicking it opens its controls. */
  ending?: { durationMs: number; mode: "freeze" | "background"; onSelect: () => void };
}

interface TimelineScaleConfig {
	minItemDurationMs: number;
	defaultItemDurationMs: number;
	minVisibleRangeMs: number;
}

interface TimelineRenderItem {
  id: string;
  rowId: string;
  span: Span;
  label: string;
  zoomDepth?: number;
  speedValue?: number;
  variant: 'zoom' | 'trim' | 'annotation' | 'speed' | 'audio' | 'blur';
  waveform?: { audioPath: string; offsetMs: number };
}

const SCALE_CANDIDATES = [
	{ intervalSeconds: 0.05, gridSeconds: 0.01 },
	{ intervalSeconds: 0.1, gridSeconds: 0.02 },
	{ intervalSeconds: 0.25, gridSeconds: 0.05 },
	{ intervalSeconds: 0.5, gridSeconds: 0.1 },
	{ intervalSeconds: 1, gridSeconds: 0.25 },
	{ intervalSeconds: 2, gridSeconds: 0.5 },
	{ intervalSeconds: 5, gridSeconds: 1 },
	{ intervalSeconds: 10, gridSeconds: 2 },
	{ intervalSeconds: 15, gridSeconds: 3 },
	{ intervalSeconds: 30, gridSeconds: 5 },
	{ intervalSeconds: 60, gridSeconds: 10 },
	{ intervalSeconds: 120, gridSeconds: 20 },
	{ intervalSeconds: 300, gridSeconds: 30 },
	{ intervalSeconds: 600, gridSeconds: 60 },
	{ intervalSeconds: 900, gridSeconds: 120 },
	{ intervalSeconds: 1800, gridSeconds: 180 },
	{ intervalSeconds: 3600, gridSeconds: 300 },
];

function calculateAxisScale(visibleRangeMs: number): { intervalMs: number; gridMs: number } {
	const visibleSeconds = visibleRangeMs / 1000;
	const candidate =
		SCALE_CANDIDATES.find((scaleCandidate) => {
			if (visibleSeconds <= 0) {
				return true;
			}
			return visibleSeconds / scaleCandidate.intervalSeconds <= TARGET_MARKER_COUNT;
		}) ?? SCALE_CANDIDATES[SCALE_CANDIDATES.length - 1];

	return {
		intervalMs: Math.round(candidate.intervalSeconds * 1000),
		gridMs: Math.round(candidate.gridSeconds * 1000),
	};
}

function calculateTimelineScale(durationSeconds: number): TimelineScaleConfig {
	const totalMs = Math.max(0, Math.round(durationSeconds * 1000));

	const minItemDurationMs = 100;

	const defaultItemDurationMs =
		totalMs > 0
			? Math.max(minItemDurationMs, Math.min(Math.round(totalMs * 0.05), 30000))
			: Math.max(minItemDurationMs, 1000);

	const minVisibleRangeMs = 300;

	return {
		minItemDurationMs,
		defaultItemDurationMs,
		minVisibleRangeMs,
	};
}

function createInitialRange(totalMs: number): Range {
	if (totalMs > 0) {
		return { start: 0, end: totalMs };
	}

	return { start: 0, end: FALLBACK_RANGE_MS };
}

function normalizeWheelDeltaToPixels(delta: number, deltaMode: number) {
	if (deltaMode === 1) {
		return delta * 16;
	}

	if (deltaMode === 2) {
		return delta * 240;
	}

	return delta;
}

function formatTimeLabel(milliseconds: number, intervalMs: number) {
	const totalSeconds = milliseconds / 1000;
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	const fractionalDigits = intervalMs < 250 ? 2 : intervalMs < 1000 ? 1 : 0;

	if (hours > 0) {
		const minutesString = minutes.toString().padStart(2, "0");
		const secondsString = Math.floor(seconds).toString().padStart(2, "0");
		return `${hours}:${minutesString}:${secondsString}`;
	}

	if (fractionalDigits > 0) {
		const secondsWithFraction = seconds.toFixed(fractionalDigits);
		const [wholeSeconds, fraction] = secondsWithFraction.split(".");
		return `${minutes}:${wholeSeconds.padStart(2, "0")}.${fraction}`;
	}

	return `${minutes}:${Math.floor(seconds).toString().padStart(2, "0")}`;
}

function formatPlayheadTime(ms: number): string {
	const s = ms / 1000;
	const min = Math.floor(s / 60);
	const sec = s % 60;
	if (min > 0) return `${min}:${sec.toFixed(1).padStart(4, "0")}`;
	return `${sec.toFixed(1)}s`;
}

function PlaybackCursor({
	currentTimeMs,
	videoDurationMs,
	onSeek,
	timelineRef,
	keyframes = [],
}: {
	currentTimeMs: number;
	videoDurationMs: number;
	onSeek?: (time: number) => void;
	timelineRef: React.RefObject<HTMLDivElement>;
	keyframes?: { id: string; time: number }[];
}) {
	const { sidebarWidth, direction, range, valueToPixels, pixelsToValue } = useTimelineContext();
	const sideProperty = direction === "rtl" ? "right" : "left";
	const [isDragging, setIsDragging] = useState(false);

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!timelineRef.current || !onSeek) return;

			const rect = timelineRef.current.getBoundingClientRect();
			const clickX = e.clientX - rect.left - sidebarWidth;

			// Allow dragging outside to 0 or max, but clamp the value
			const relativeMs = pixelsToValue(clickX);
			let absoluteMs = Math.max(0, Math.min(range.start + relativeMs, videoDurationMs));

			// Snap to nearby keyframe if within threshold (150ms)
			const snapThresholdMs = 150;
			const nearbyKeyframe = keyframes.find(
				(kf) =>
					Math.abs(kf.time - absoluteMs) <= snapThresholdMs &&
					kf.time >= range.start &&
					kf.time <= range.end,
			);

			if (nearbyKeyframe) {
				absoluteMs = nearbyKeyframe.time;
			}

			onSeek(absoluteMs / 1000);
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			document.body.style.cursor = "";
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		document.body.style.cursor = "ew-resize";

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
		};
	}, [
		isDragging,
		onSeek,
		timelineRef,
		sidebarWidth,
		range.start,
		range.end,
		videoDurationMs,
		pixelsToValue,
		keyframes,
	]);

	if (videoDurationMs <= 0 || currentTimeMs < 0) {
		return null;
	}

	const clampedTime = Math.min(currentTimeMs, videoDurationMs);

	if (clampedTime < range.start || clampedTime > range.end) {
		return null;
	}

	const offset = valueToPixels(clampedTime - range.start);

	return (
		<div
			className="absolute top-0 bottom-0 z-50 group/cursor"
			style={{
				[sideProperty === "right" ? "marginRight" : "marginLeft"]: `${sidebarWidth - 1}px`,
				pointerEvents: "none", // Allow clicks to pass through to timeline, but we'll enable pointer events on the handle
			}}
		>
			<div
				className="absolute top-0 bottom-0 w-[2px] bg-[#2563EB] shadow-[0_0_10px_rgba(37,99,235,0.5)] cursor-ew-resize pointer-events-auto hover:shadow-[0_0_15px_rgba(37,99,235,0.7)] transition-shadow"
				style={{
					[sideProperty]: `${offset}px`,
				}}
				onMouseDown={(e) => {
					e.stopPropagation(); // Prevent timeline click
					setIsDragging(true);
				}}
			>
				<div
					className="absolute -top-1 left-1/2 -translate-x-1/2 hover:scale-125 transition-transform"
					style={{ width: "16px", height: "16px" }}
				>
					<div className="w-3 h-3 mx-auto mt-[2px] bg-[#2563EB] rotate-45 rounded-sm shadow-lg border border-white/20" />
				</div>
				{isDragging && (
					<div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-white/90 font-medium tabular-nums whitespace-nowrap border border-white/10 shadow-lg pointer-events-none">
						{formatPlayheadTime(clampedTime)}
					</div>
				)}
			</div>
		</div>
	);
}

function TimelineAxis({
	videoDurationMs,
	currentTimeMs,
}: {
	videoDurationMs: number;
	currentTimeMs: number;
}) {
	const { sidebarWidth, direction, range, valueToPixels } = useTimelineContext();
	const sideProperty = direction === "rtl" ? "right" : "left";

	const { intervalMs } = useMemo(
		() => calculateAxisScale(range.end - range.start),
		[range.end, range.start],
	);

	const markers = useMemo(() => {
		if (intervalMs <= 0) {
			return { markers: [], minorTicks: [] };
		}

		const maxTime = videoDurationMs > 0 ? videoDurationMs : range.end;
		const visibleStart = Math.max(0, Math.min(range.start, maxTime));
		const visibleEnd = Math.min(range.end, maxTime);
		const markerTimes = new Set<number>();

		const firstMarker = Math.ceil(visibleStart / intervalMs) * intervalMs;

		for (let time = firstMarker; time <= maxTime; time += intervalMs) {
			if (time >= visibleStart && time <= visibleEnd) {
				markerTimes.add(Math.round(time));
			}
		}

		if (visibleStart <= maxTime) {
			markerTimes.add(Math.round(visibleStart));
		}

		if (videoDurationMs > 0) {
			markerTimes.add(Math.round(videoDurationMs));
		}

		const sorted = Array.from(markerTimes)
			.filter((time) => time <= maxTime)
			.sort((a, b) => a - b);

		// Generate minor ticks (4 ticks between major intervals)
		const minorTicks = [];
		const minorInterval = intervalMs / 5;

		for (let time = firstMarker; time <= maxTime; time += minorInterval) {
			if (time >= visibleStart && time <= visibleEnd) {
				// Skip if it's close to a major marker
				const isMajor = Math.abs(time % intervalMs) < 1;
				if (!isMajor) {
					minorTicks.push(time);
				}
			}
		}

		return {
			markers: sorted.filter((time, index) => index === sorted.length - 1 || sorted[index + 1] - time >= intervalMs * 0.35).map((time) => ({
				time,
				label: formatTimeLabel(time, time === Math.round(videoDurationMs) && time % 1000 !== 0 ? 100 : intervalMs),
			})),
			minorTicks,
		};
	}, [intervalMs, range.end, range.start, videoDurationMs]);

	return (
		<div
			className="h-8 bg-[#09090b] border-b border-white/5 relative overflow-hidden select-none"
			style={{
				[sideProperty === "right" ? "marginRight" : "marginLeft"]: `${sidebarWidth}px`,
			}}
		>
			{/* Minor Ticks */}
			{markers.minorTicks.map((time) => {
				const offset = valueToPixels(time - range.start);
				return (
					<div
						key={`minor-${time}`}
						className="absolute bottom-0 h-1 w-[1px] bg-white/5"
						style={{ [sideProperty]: `${offset}px` }}
					/>
				);
			})}

			{/* Major Markers */}
			{markers.markers.map((marker) => {
				const offset = valueToPixels(marker.time - range.start);
				const markerStyle: React.CSSProperties = {
					position: "absolute",
					bottom: 0,
					height: "100%",
					display: "flex",
					flexDirection: "row",
					alignItems: "flex-end",
					[sideProperty]: `${offset}px`,
				};

				return (
					<div key={marker.time} style={markerStyle}>
						<div className="flex flex-col items-center pb-1">
							<div className="h-2 w-[1px] bg-white/20 mb-1" />
							<span
								className={cn(
									"text-[10px] font-medium tabular-nums tracking-tight",
									marker.time === currentTimeMs ? "text-[#2563EB]" : "text-slate-500",
								)}
							>
								{marker.label}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function Timeline({
  sourcePath, sourceTrims, clip,
  items,
  videoDurationMs,
  currentTimeMs,
  onSeek,
  onSelectZoom,
  onSelectTrim,
  onSelectAnnotation,
  onSelectSpeed,
  onSelectAudio,
  selectedZoomId,
  selectedTrimId,
  selectedAnnotationId,
  selectedAudioId,
  onSelectBlur,
  selectedBlurId,
  keyframes = [],
  snapScaleRef,
  onItemContextMenu,
  groupIds,
  onItemPick,
  onClearGroup,
}: {
  sourcePath: string; sourceTrims: TrimRegion[];
  clip?: ClipTrackProps;
  items: TimelineRenderItem[];
  videoDurationMs: number;
  currentTimeMs: number;
  onSeek?: (time: number) => void;
  onSelectZoom?: (id: string | null) => void;
  onSelectTrim?: (id: string | null) => void;
  onSelectAnnotation?: (id: string | null) => void;
  onSelectSpeed?: (id: string | null) => void;
  onSelectAudio?: (id: string | null) => void;
  selectedZoomId: string | null;
  selectedTrimId?: string | null;
  selectedAnnotationId?: string | null;
  selectedSpeedId?: string | null;
  selectedAudioId?: string | null;
  onSelectBlur?: (id: string | null) => void;
  selectedBlurId?: string | null;
  keyframes?: { id: string; time: number }[];
  snapScaleRef?: MutableRefObject<TimelineSnapScale>;
  onItemContextMenu?: (target: RegionTarget, event: React.MouseEvent) => void;
  /** Items selected together (Shift or Cmd/Ctrl + click). */
  groupIds?: Set<string>;
  /** True when the press was handled as a group pick, so the item is not selected on its own. */
  onItemPick?: (target: RegionTarget, event?: React.SyntheticEvent) => boolean;
  onClearGroup?: () => void;
}) {
	const { setTimelineRef, style, sidebarWidth, range, pixelsToValue } = useTimelineContext();
	// Lets drag handlers outside the timeline context convert pixels for snapping.
	if (snapScaleRef) {
		snapScaleRef.current = { msPerPx: pixelsToValue(100) / 100, sidebarWidth, rangeStart: range.start };
	}
  const t = useScopedT('timeline');
	const localTimelineRef = useRef<HTMLDivElement | null>(null);

	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			setTimelineRef(node);
			localTimelineRef.current = node;
		},
		[setTimelineRef],
	);

	const handleTimelineClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!onSeek || videoDurationMs <= 0) return;

    // Only clear selection if clicking on empty space (not on items)
    // This is handled by event propagation - items stop propagation
    onSelectZoom?.(null);
    onSelectTrim?.(null);
    onSelectAnnotation?.(null);
    onSelectSpeed?.(null);
    onSelectAudio?.(null);
    onSelectBlur?.(null);
    clip?.onSelectSegment(null);
    onClearGroup?.();

			const rect = e.currentTarget.getBoundingClientRect();
			const clickX = e.clientX - rect.left - sidebarWidth;

			if (clickX < 0) return;

			const relativeMs = pixelsToValue(clickX);
			const absoluteMs = Math.max(0, Math.min(range.start + relativeMs, videoDurationMs));
			const timeInSeconds = absoluteMs / 1000;

    onSeek(timeInSeconds);
  }, [onSeek, onSelectZoom, onSelectTrim, onSelectAnnotation, onSelectSpeed, onSelectAudio, onSelectBlur, clip, onClearGroup, videoDurationMs, sidebarWidth, range.start, pixelsToValue]);

  const zoomItems = items.filter(item => item.rowId === ZOOM_ROW_ID);
  const trimItems = items.filter(item => item.rowId === TRIM_ROW_ID);
  const annotationItems = items.filter(item => item.rowId === ANNOTATION_ROW_ID);
  const audioItems = items.filter(item => trackOfAudioRow(item.rowId) !== undefined);
  // One row per audio track in use, plus an empty one to drop a clip onto a new track.
  const audioTrackCount = Math.min(MAX_AUDIO_TRACKS, Math.max(1, ...audioItems.map((item) => (trackOfAudioRow(item.rowId) ?? 0) + 2)));
  const annotationLayout = layoutTrackLanes(annotationItems);
  const blurItems = items.filter(item => item.rowId === BLUR_ROW_ID);
  const blurLayout = layoutTrackLanes(blurItems);

	return (
		<div
			ref={setRefs}
			style={style}
			className="select-none bg-[#09090b] min-h-[140px] relative cursor-pointer group"
			onClick={handleTimelineClick}
		>
			<div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px)] bg-[length:20px_100%] pointer-events-none" />
			<TimelineAxis videoDurationMs={videoDurationMs} currentTimeMs={currentTimeMs} />
			<PlaybackCursor
				currentTimeMs={currentTimeMs}
				videoDurationMs={videoDurationMs}
				onSeek={onSeek}
				timelineRef={localTimelineRef}
				keyframes={keyframes}
			/>

			<Row id="source-video-row" label="ANA VİDEO" labelColor="#67e8f9">{clip?.ending && <EndingTrackItem startMs={videoDurationMs - clip.ending.durationMs} {...clip.ending} />}<SourceVideoTrack path={sourcePath} durationMs={videoDurationMs - (clip?.ending?.durationMs ?? 0)} trims={clip ? [] : sourceTrims} clip={clip} selectedCutId={selectedTrimId ?? null} onSelectCut={(id) => { clip?.onSelectSegment(null); onSelectTrim?.(id); }} /></Row>
      <Row label="ZOOM" labelColor="#93c5fd" id={ZOOM_ROW_ID} isEmpty={zoomItems.length === 0} hint={t('zoom.addZoom')}>
				{zoomItems.map((item) => (
					<Item
						id={item.id}
						key={item.id}
						rowId={item.rowId}
						span={item.span}
						isSelected={item.id === selectedZoomId || !!groupIds?.has(item.id)}
						onSelect={(event) => { if (!onItemPick?.({ kind: 'zoom', id: item.id }, event)) onSelectZoom?.(item.id); }}
						onContextMenu={(event) => onItemContextMenu?.({ kind: 'zoom', id: item.id }, event)}
						zoomDepth={item.zoomDepth}
						variant="zoom"
					>
						{item.label}
					</Item>
				))}
			</Row>

			{!clip && <Row label="KESME" labelColor="#fca5a5" id={TRIM_ROW_ID} isEmpty={trimItems.length === 0} hint={t('trim.addTrim')}>
				{trimItems.map((item) => (
					<Item
						id={item.id}
						key={item.id}
						rowId={item.rowId}
						span={item.span}
						isSelected={item.id === selectedTrimId || !!groupIds?.has(item.id)}
						onSelect={(event) => { if (!onItemPick?.({ kind: 'trim', id: item.id }, event)) onSelectTrim?.(item.id); }}
						onContextMenu={(event) => onItemContextMenu?.({ kind: 'trim', id: item.id }, event)}
						variant="trim"
					>
						{item.label}
					</Item>
				))}
			</Row>}

			<Row
				label="YAZI / GÖRSEL" labelColor="#fde68a" laneCount={annotationLayout.count}
        id={ANNOTATION_ROW_ID}
				isEmpty={annotationItems.length === 0}
				hint={t('annotation.addAnnotation')}
			>
				{annotationItems.map((item) => (
					<Item
						id={item.id}
						key={item.id}
						rowId={item.rowId}
						span={item.span}
						isSelected={item.id === selectedAnnotationId || !!groupIds?.has(item.id)}
						onSelect={(event) => { if (!onItemPick?.({ kind: 'annotation', id: item.id }, event)) onSelectAnnotation?.(item.id); }}
						onContextMenu={(event) => onItemContextMenu?.({ kind: 'annotation', id: item.id }, event)}
						variant="annotation" lane={annotationLayout.lanes.get(item.id)}
					>
						{item.label}
					</Item>
				))}
			</Row>

      <Row label="BULANIK" labelColor="#67e8f9" laneCount={blurLayout.count} id={BLUR_ROW_ID} isEmpty={blurItems.length === 0} hint={t('blur.addBlur', 'Hide sensitive info: Blur in the toolbar')}>
        {blurItems.map((item) => (
          <Item
            id={item.id}
            key={item.id}
            rowId={item.rowId}
            span={item.span}
            isSelected={item.id === selectedBlurId || !!groupIds?.has(item.id)}
            onSelect={(event) => { if (!onItemPick?.({ kind: 'blur', id: item.id }, event)) onSelectBlur?.(item.id); }}
            onContextMenu={(event) => onItemContextMenu?.({ kind: 'blur', id: item.id }, event)}
            variant="blur" lane={blurLayout.lanes.get(item.id)}
          >
            {item.label}
          </Item>
        ))}
      </Row>

      {/* Speed is set on parts of the video (select a part on the video track); there is no separate speed row. */}

      {Array.from({ length: audioTrackCount }, (_, track) => {
        const rowId = audioRowId(track);
        const trackItems = audioItems.filter((item) => item.rowId === rowId);
        const hint = audioItems.length === 0 ? t("audioEmptyHint") : t("audioTrackDropHint", "Drag a clip here to move it to this track");
        return (
          <Row key={rowId} label={`A${track + 1}`} labelColor="#d8b4fe" id={rowId} isEmpty={trackItems.length === 0} hint={hint}>
            {trackItems.map((item) => (
              <Item
                id={item.id}
                key={item.id}
                rowId={item.rowId}
                span={item.span}
                isSelected={item.id === selectedAudioId || !!groupIds?.has(item.id)}
                onSelect={(event) => { if (!onItemPick?.({ kind: 'audio', id: item.id }, event)) onSelectAudio?.(item.id); }}
                onContextMenu={(event) => onItemContextMenu?.({ kind: 'audio', id: item.id }, event)}
                variant="audio"
                waveform={item.waveform}
              >
                {item.label}
              </Item>
            ))}
          </Row>
        );
      })}
    </div>
  );
}

export default function TimelineEditor({
  videoPath = '',
  videoDuration,
  currentTime,
  onSeek,
  cursorTelemetry = [],
  zoomRegions,
  onZoomAdded,
  onZoomSuggested,
  onZoomSpanChange,
  onZoomDelete,
  selectedZoomId,
  onSelectZoom,
  trimRegions = [],
  onTrimAdded,
  onTrimSpanChange,
  onTrimDelete,
  selectedTrimId,
  onSelectTrim,
  annotationRegions = [],
  onAnnotationAdded,
  onAnnotationSpanChange,
  onAnnotationDelete,
  selectedAnnotationId,
  onSelectAnnotation,
  blurRegions = [],
  onBlurSpanChange,
  onBlurDelete,
  selectedBlurId,
  onSelectBlur,
  speedRegions = [],
  onSpeedAdded,
  onSpeedSpanChange,
  onSpeedDelete,
  selectedSpeedId,
  onSelectSpeed,
  audioRegions = [],
  onAudioAdded,
  onAddVideo,
  onExtendEnding,
  addingVideo = null,
  onAudioSpanChange,
  onAudioDelete,
  selectedAudioId,
  onSelectAudio,
  aspectRatio,
  onAspectRatioChange,
  onRegionCommand,
  onRegionGroupCommand,
  canPasteRegion = false,
  clip,
}: TimelineEditorProps) {
  const totalMs = useMemo(() => Math.max(0, Math.round(videoDuration * 1000)), [videoDuration]);
  const currentTimeMs = useMemo(() => Math.round(currentTime * 1000), [currentTime]);
  const timelineScale = useMemo(() => calculateTimelineScale(videoDuration), [videoDuration]);
  const safeMinDurationMs = useMemo(
    () => (totalMs > 0 ? Math.min(timelineScale.minItemDurationMs, totalMs) : timelineScale.minItemDurationMs),
    [timelineScale.minItemDurationMs, totalMs],
  );

  const [range, setRange] = useState<Range>(() => createInitialRange(totalMs));
  const [keyframes, setKeyframes] = useState<{ id: string; time: number }[]>([]);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [customAspectWidth, setCustomAspectWidth] = useState('16');
  const [customAspectHeight, setCustomAspectHeight] = useState('9');
  const [scrollLabels, setScrollLabels] = useState({
    pan: 'Shift + Ctrl + Scroll',
    zoom: 'Ctrl + Scroll'
  });
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const { shortcuts: keyShortcuts, isMac } = useShortcuts();
  const tTimeline = useScopedT('timeline');
  const { locale } = useI18n();
  const snapScaleRef = useRef<TimelineSnapScale>({ msPerPx: 0, sidebarWidth: 0, rangeStart: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: RegionTarget } | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openContextMenu = useCallback((target: RegionTarget, event: React.MouseEvent) => {
    if (!onRegionCommand) return;
    setContextMenu({ x: event.clientX, y: event.clientY, target });
  }, [onRegionCommand]);

  // The item the keyboard commands act on: same priority as Delete.
  const selectedRegionTarget = useMemo<RegionTarget | null>(() => {
    const pick = (kind: RegionKind, id: string | null | undefined) => (id ? { kind, id } : null);
    return pick('zoom', selectedZoomId) ?? pick('trim', selectedTrimId) ?? pick('annotation', selectedAnnotationId)
      ?? pick('speed', selectedSpeedId) ?? pick('audio', selectedAudioId) ?? pick('blur', selectedBlurId);
  }, [selectedZoomId, selectedTrimId, selectedAnnotationId, selectedSpeedId, selectedAudioId, selectedBlurId]);

  // Several items selected together (Shift or Cmd/Ctrl + click): deleted or moved as a group.
  const [group, setGroup] = useState<RegionTarget[]>([]);
  const regionsOfKind = useMemo<Record<RegionKind, TimedRegion[]>>(() => ({
    zoom: zoomRegions, trim: trimRegions, speed: speedRegions, annotation: annotationRegions, audio: audioRegions, blur: blurRegions,
  }), [zoomRegions, trimRegions, speedRegions, annotationRegions, audioRegions, blurRegions]);
  // Items deleted elsewhere (undo, the inspector) leave the group.
  const liveGroup = useMemo(() => group.filter((target) => regionsOfKind[target.kind].some((region) => region.id === target.id)), [group, regionsOfKind]);
  const groupIds = useMemo(() => new Set(liveGroup.map((target) => target.id)), [liveGroup]);
  const lastGroupMoveRef = useRef(0);
  const clearGroup = useCallback(() => setGroup([]), []);
  const clearSingleSelection = useCallback(() => {
    onSelectZoom(null);
    onSelectTrim?.(null);
    onSelectAnnotation?.(null);
    onSelectSpeed?.(null);
    onSelectAudio?.(null);
    onSelectBlur?.(null);
  }, [onSelectZoom, onSelectTrim, onSelectAnnotation, onSelectSpeed, onSelectAudio, onSelectBlur]);
  const pickItem = useCallback((target: RegionTarget, event?: React.SyntheticEvent) => {
    const native = event?.nativeEvent as MouseEvent | undefined;
    const toggle = !!native && (native.shiftKey || (isMac ? native.metaKey : native.ctrlKey));
    if (toggle) {
      // Handled once, on the press; the click that follows is ignored.
      if (event?.type !== 'pointerdown') return true;
      const base = liveGroup.length > 0 ? liveGroup : selectedRegionTarget ? [selectedRegionTarget] : [];
      const next = base.some((item) => item.id === target.id) ? base.filter((item) => item.id !== target.id) : [...base, target];
      clearSingleSelection();
      setGroup(next);
      return true;
    }
    if (groupIds.has(target.id)) {
      // Pressing a grouped item keeps the group so it can be dragged; a click without dragging picks that item alone.
      if (event?.type === 'click' && Date.now() - lastGroupMoveRef.current > 400) {
        setGroup([]);
        return false;
      }
      return true;
    }
    if (liveGroup.length > 0) setGroup([]);
    return false;
  }, [isMac, liveGroup, groupIds, selectedRegionTarget, clearSingleSelection]);

  useEffect(() => {
    if (!onRegionCommand) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return;
      const mod = isMac ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();
      let command: RegionCommand | null = null;
      if (mod && !event.shiftKey && !event.altKey && key === 'c' && selectedRegionTarget) command = { type: 'copy' };
      else if (mod && !event.shiftKey && !event.altKey && key === 'v' && canPasteRegion) command = { type: 'paste' };
      else if (mod && event.shiftKey && key === 'd' && selectedRegionTarget) command = { type: 'duplicate' };
      else if (mod && !event.shiftKey && !event.altKey && key === 'b' && selectedRegionTarget) command = { type: 'split' };
      else if (event.altKey && !mod && (key === 'arrowleft' || key === 'arrowright') && liveGroup.length > 0) {
        event.preventDefault();
        lastGroupMoveRef.current = Date.now();
        onRegionGroupCommand?.({ type: 'nudge', deltaMs: (key === 'arrowleft' ? -1 : 1) * (event.shiftKey ? 1000 : 100) }, liveGroup);
        return;
      }
      else if (event.altKey && !mod && (key === 'arrowleft' || key === 'arrowright') && selectedRegionTarget) {
        command = { type: 'nudge', deltaMs: (key === 'arrowleft' ? -1 : 1) * (event.shiftKey ? 1000 : 100) };
      }
      else if (mod && !event.shiftKey && !event.altKey && key === 'a' && (liveGroup[0] ?? selectedRegionTarget)) {
        // Every item of the selected kind (all captions, all blurs …).
        event.preventDefault();
        const kind = (liveGroup[0] ?? selectedRegionTarget)?.kind as RegionKind;
        clearSingleSelection();
        setGroup(regionsOfKind[kind].map((region) => ({ kind, id: region.id })));
        return;
      }
      else if (key === 'escape' && liveGroup.length > 0) {
        setGroup([]);
        return;
      }
      if (!command) return;
      // Captured first so the editor's own arrow/seek keys do not also act.
      event.preventDefault();
      onRegionCommand(command, selectedRegionTarget);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onRegionCommand, onRegionGroupCommand, selectedRegionTarget, canPasteRegion, isMac, liveGroup, regionsOfKind, clearSingleSelection]);

  useEffect(() => {
    if (aspectRatio === 'native') {
      return;
    }
    const [width, height] = aspectRatio.split(':');
    if (width && height) {
      setCustomAspectWidth(width);
      setCustomAspectHeight(height);
    }
  }, [aspectRatio]);

  const applyCustomAspectRatio = useCallback(() => {
    const width = Number.parseInt(customAspectWidth, 10);
    const height = Number.parseInt(customAspectHeight, 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      toast.error('Custom aspect ratio must be positive numbers.');
      return;
    }
    onAspectRatioChange(`${width}:${height}` as AspectRatio);
  }, [customAspectHeight, customAspectWidth, onAspectRatioChange]);

  const handleCustomAspectRatioKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    // Prevent Radix DropdownMenu typeahead from selecting preset items while typing.
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      applyCustomAspectRatio();
    }
  }, [applyCustomAspectRatio]);

  useEffect(() => {
    formatShortcut(['shift', 'mod', 'Scroll']).then(pan => {
      formatShortcut(['mod', 'Scroll']).then(zoom => {
        setScrollLabels({ pan, zoom });
      });
    });
  }, []);

  // Add keyframe at current playhead position
  const addKeyframe = useCallback(() => {
    if (totalMs === 0) return;
    const time = Math.max(0, Math.min(currentTimeMs, totalMs));
    if (keyframes.some(kf => Math.abs(kf.time - time) < 1)) return;
    setKeyframes(prev => [...prev, { id: crypto.randomUUID(), time }]);
  }, [currentTimeMs, totalMs, keyframes]);

  // Delete selected keyframe
  const deleteSelectedKeyframe = useCallback(() => {
    if (!selectedKeyframeId) return;
    setKeyframes(prev => prev.filter(kf => kf.id !== selectedKeyframeId));
    setSelectedKeyframeId(null);
  }, [selectedKeyframeId]);

  // Move keyframe to new time position
  const handleKeyframeMove = useCallback((id: string, newTime: number) => {
    setKeyframes(prev => prev.map(kf => kf.id === id ? { ...kf, time: Math.max(0, Math.min(newTime, totalMs)) } : kf));
  }, [totalMs]);

  // Delete selected zoom item
  const deleteSelectedZoom = useCallback(() => {
    if (!selectedZoomId) return;
    onZoomDelete(selectedZoomId);
    onSelectZoom(null);
  }, [selectedZoomId, onZoomDelete, onSelectZoom]);

  // Delete selected trim item
  const deleteSelectedTrim = useCallback(() => {
    if (!selectedTrimId || !onTrimDelete || !onSelectTrim) return;
    onTrimDelete(selectedTrimId);
    onSelectTrim(null);
  }, [selectedTrimId, onTrimDelete, onSelectTrim]);

  const deleteSelectedAnnotation = useCallback(() => {
    if (!selectedAnnotationId || !onAnnotationDelete || !onSelectAnnotation) return;
    onAnnotationDelete(selectedAnnotationId);
    onSelectAnnotation(null);
  }, [selectedAnnotationId, onAnnotationDelete, onSelectAnnotation]);

  const deleteSelectedSpeed = useCallback(() => {
    if (!selectedSpeedId || !onSpeedDelete || !onSelectSpeed) return;
    onSpeedDelete(selectedSpeedId);
    onSelectSpeed(null);
  }, [selectedSpeedId, onSpeedDelete, onSelectSpeed]);

  const deleteSelectedBlur = useCallback(() => {
    if (!selectedBlurId || !onBlurDelete || !onSelectBlur) return;
    onBlurDelete(selectedBlurId);
    onSelectBlur(null);
  }, [selectedBlurId, onBlurDelete, onSelectBlur]);

  const deleteSelectedAudio = useCallback(() => {
    if (!selectedAudioId || !onAudioDelete || !onSelectAudio) return;
    onAudioDelete(selectedAudioId);
    onSelectAudio(null);
  }, [selectedAudioId, onAudioDelete, onSelectAudio]);

  useEffect(() => {
    setRange(createInitialRange(totalMs));
  }, [totalMs]);

  // Normalize regions only when timeline bounds change (not on every region edit).
  // Using refs to read current regions avoids a dependency-loop that re-fires
  // this effect on every drag/resize and races with dnd-timeline's internal state.
  const zoomRegionsRef = useRef(zoomRegions);
  const trimRegionsRef = useRef(trimRegions);
  const speedRegionsRef = useRef(speedRegions);
  const audioRegionsRef = useRef(audioRegions);
  zoomRegionsRef.current = zoomRegions;
  trimRegionsRef.current = trimRegions;
  speedRegionsRef.current = speedRegions;
  audioRegionsRef.current = audioRegions;

  useEffect(() => {
    if (totalMs === 0 || safeMinDurationMs <= 0) {
      return;
    }

    zoomRegionsRef.current.forEach((region) => {
      const clampedStart = Math.max(0, Math.min(region.startMs, totalMs));
      const minEnd = clampedStart + safeMinDurationMs;
      const clampedEnd = Math.min(totalMs, Math.max(minEnd, region.endMs));
      const normalizedStart = Math.max(0, Math.min(clampedStart, totalMs - safeMinDurationMs));
      const normalizedEnd = Math.max(minEnd, Math.min(clampedEnd, totalMs));

      if (normalizedStart !== region.startMs || normalizedEnd !== region.endMs) {
        onZoomSpanChange(region.id, { start: normalizedStart, end: normalizedEnd });
      }
    });

    trimRegionsRef.current.forEach((region) => {
      const clampedStart = Math.max(0, Math.min(region.startMs, totalMs));
      const minEnd = clampedStart + safeMinDurationMs;
      const clampedEnd = Math.min(totalMs, Math.max(minEnd, region.endMs));
      const normalizedStart = Math.max(0, Math.min(clampedStart, totalMs - safeMinDurationMs));
      const normalizedEnd = Math.max(minEnd, Math.min(clampedEnd, totalMs));

      if (normalizedStart !== region.startMs || normalizedEnd !== region.endMs) {
        onTrimSpanChange?.(region.id, { start: normalizedStart, end: normalizedEnd });
      }
    });

    speedRegionsRef.current.forEach((region) => {
      const clampedStart = Math.max(0, Math.min(region.startMs, totalMs));
      const minEnd = clampedStart + safeMinDurationMs;
      const clampedEnd = Math.min(totalMs, Math.max(minEnd, region.endMs));
      const normalizedStart = Math.max(0, Math.min(clampedStart, totalMs - safeMinDurationMs));
      const normalizedEnd = Math.max(minEnd, Math.min(clampedEnd, totalMs));

      if (normalizedStart !== region.startMs || normalizedEnd !== region.endMs) {
        onSpeedSpanChange?.(region.id, { start: normalizedStart, end: normalizedEnd });
      }
    });

    audioRegionsRef.current.forEach((region) => {
      const clampedStart = Math.max(0, Math.min(region.startMs, totalMs));
      const minEnd = clampedStart + safeMinDurationMs;
      const clampedEnd = Math.min(totalMs, Math.max(minEnd, region.endMs));
      const normalizedStart = Math.max(0, Math.min(clampedStart, totalMs - safeMinDurationMs));
      const normalizedEnd = Math.max(minEnd, Math.min(clampedEnd, totalMs));

      if (normalizedStart !== region.startMs || normalizedEnd !== region.endMs) {
        onAudioSpanChange?.(region.id, { start: normalizedStart, end: normalizedEnd });
      }
    });
    // Only re-run when the timeline scale changes, not on every region edit
  }, [totalMs, safeMinDurationMs, onZoomSpanChange, onTrimSpanChange, onSpeedSpanChange, onAudioSpanChange]);

  const hasOverlap = useCallback((newSpan: Span, excludeId?: string, rowId?: string): boolean => {
    // Determine which row the item belongs to
    const isZoomItem = zoomRegions.some(r => r.id === excludeId);
    const isTrimItem = trimRegions.some(r => r.id === excludeId);
    const isAnnotationItem = annotationRegions.some(r => r.id === excludeId);
    const isSpeedItem = speedRegions.some(r => r.id === excludeId);
    const isAudioItem = audioRegions.some(r => r.id === excludeId);

    if (isAnnotationItem) {
      return false;
    }

    // Clips on one audio track never overlap (like Premiere); other tracks are free.
    if (isAudioItem) {
      const track = trackOfAudioRow(rowId) ?? audioRegions.find((region) => region.id === excludeId)?.track ?? 0;
      return audioRegions.some((region) => region.id !== excludeId && (region.track ?? 0) === track && newSpan.end > region.startMs && newSpan.start < region.endMs);
    }

    // Helper to check overlap against a specific set of regions
    const checkOverlap = (regions: (ZoomRegion | TrimRegion | SpeedRegion | AudioRegion)[]) => {
      return regions.some((region) => {
        if (region.id === excludeId) return false;
        // True overlap: regions actually intersect (not just adjacent)
        return newSpan.end > region.startMs && newSpan.start < region.endMs;
      });
    };

    if (isZoomItem) {
      return checkOverlap(zoomRegions);
    }

    if (isTrimItem) {
      return checkOverlap(trimRegions);
    }

    if (isSpeedItem) {
      return checkOverlap(speedRegions);
    }

    if (isAudioItem) {
      return checkOverlap(audioRegions);
    }

    return false;
  }, [zoomRegions, trimRegions, annotationRegions, speedRegions, audioRegions]);

  // Keep newly added timeline regions at the original short default instead of
  // scaling them with the full recording length.
  const defaultRegionDurationMs = useMemo(
    () => Math.min(1000, totalMs),
    [totalMs],
  );

  const handleAddZoom = useCallback(() => {
    if (!videoDuration || videoDuration === 0 || totalMs === 0) {
      return;
    }

    const defaultDuration = Math.min(DEFAULT_ZOOM_SPAN_MS, totalMs);
    if (defaultDuration <= 0) {
      return;
    }

    // Always place zoom at playhead
    const startPos = Math.max(0, Math.min(currentTimeMs, totalMs));
    // Find the next zoom region after the playhead
    const sorted = [...zoomRegions].sort((a, b) => a.startMs - b.startMs);
    const nextRegion = sorted.find(region => region.startMs > startPos);
    const gapToNext = nextRegion ? nextRegion.startMs - startPos : totalMs - startPos;

    // Check if playhead is inside any zoom region
    const isOverlapping = sorted.some(region => startPos >= region.startMs && startPos < region.endMs);
    if (isOverlapping || gapToNext <= 0) {
      toast.error("Cannot place zoom here", {
        description: "Zoom already exists at this location or not enough space available.",
      });
      return;
    }

    const actualDuration = Math.min(DEFAULT_ZOOM_SPAN_MS, gapToNext);
    onZoomAdded({ start: startPos, end: startPos + actualDuration });
  }, [videoDuration, totalMs, currentTimeMs, zoomRegions, onZoomAdded]);

  const handleSuggestZooms = useCallback(() => {
    if (!videoDuration || videoDuration === 0 || totalMs === 0) {
      return;
    }

    if (!onZoomSuggested) {
      toast.error("Zoom suggestion handler unavailable");
      return;
    }

    if (cursorTelemetry.length < 2) {
      toast.info("No cursor telemetry available", {
        description: "Record a screencast first to generate cursor-based suggestions.",
      });
      return;
    }

    const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
    if (defaultDuration <= 0) {
      return;
    }

    const reservedSpans = [...zoomRegions]
      .map((region) => ({ start: region.startMs, end: region.endMs }))
      .sort((a, b) => a.start - b.start);

    const normalizedSamples = normalizeCursorTelemetry(cursorTelemetry, totalMs);

    if (normalizedSamples.length < 2) {
      toast.info("No usable cursor telemetry", {
        description: "The recording does not include enough cursor movement data.",
      });
      return;
    }

    const dwellCandidates = detectInteractionCandidates(normalizedSamples);

    if (dwellCandidates.length === 0) {
      toast.info("No clear interaction moments found", {
        description: "Try a recording with pauses or clicks around important actions.",
      });
      return;
    }

    const sortedCandidates = [...dwellCandidates].sort((a, b) => b.strength - a.strength);
    const acceptedCenters: number[] = [];

    let addedCount = 0;

    sortedCandidates.forEach((candidate) => {
      const tooCloseToAccepted = acceptedCenters.some(
        (center) => Math.abs(center - candidate.centerTimeMs) < SUGGESTION_SPACING_MS,
      );

      if (tooCloseToAccepted) {
        return;
      }

      const centeredStart = Math.round(candidate.centerTimeMs - defaultDuration / 2);
      const candidateStart = Math.max(0, Math.min(centeredStart, totalMs - defaultDuration));
      const candidateEnd = candidateStart + defaultDuration;
      const hasOverlap = reservedSpans.some(
        (span) => candidateEnd > span.start && candidateStart < span.end,
      );

      if (hasOverlap) {
        return;
      }

      reservedSpans.push({ start: candidateStart, end: candidateEnd });
      acceptedCenters.push(candidate.centerTimeMs);
      onZoomSuggested({ start: candidateStart, end: candidateEnd }, candidate.focus);
      addedCount += 1;
    });

    if (addedCount === 0) {
      toast.info("No auto-zoom slots available", {
        description: "Detected dwell points overlap existing zoom regions.",
      });
      return;
    }

    toast.success(`Added ${addedCount} interaction-based zoom suggestion${addedCount === 1 ? "" : "s"}`);
  }, [videoDuration, totalMs, defaultRegionDurationMs, zoomRegions, onZoomSuggested, cursorTelemetry]);

  const handleAddTrim = useCallback(() => {
    if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onTrimAdded) {
      return;
    }

    const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
    if (defaultDuration <= 0) {
      return;
    }

    // Always place trim at playhead
    const startPos = Math.max(0, Math.min(currentTimeMs, totalMs));
    // Find the next trim region after the playhead
    const sorted = [...trimRegions].sort((a, b) => a.startMs - b.startMs);
    const nextRegion = sorted.find(region => region.startMs > startPos);
    const gapToNext = nextRegion ? nextRegion.startMs - startPos : totalMs - startPos;

    // Check if playhead is inside any trim region
    const isOverlapping = sorted.some(region => startPos >= region.startMs && startPos < region.endMs);
    if (isOverlapping || gapToNext <= 0) {
      toast.error("Cannot place trim here", {
        description: "Trim already exists at this location or not enough space available.",
      });
      return;
    }

    const actualDuration = Math.min(defaultRegionDurationMs, gapToNext);
    onTrimAdded({ start: startPos, end: startPos + actualDuration });
  }, [videoDuration, totalMs, currentTimeMs, trimRegions, onTrimAdded, defaultRegionDurationMs]);

  const handleAddSpeed = useCallback(() => {
    // With video parts, S selects the part under the playhead and its card sets the speed.
    if (clip) {
      const part = clip.segments.find((segment) => currentTimeMs >= segment.outStart && currentTimeMs < segment.outEnd) ?? clip.segments[clip.segments.length - 1];
      if (part) clip.onSelectSegment(part.startMs);
      return;
    }
    if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onSpeedAdded) {
      return;
    }

    const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
    if (defaultDuration <= 0) {
      return;
    }

    // Always place speed region at playhead
    const startPos = Math.max(0, Math.min(currentTimeMs, totalMs));
    // Find the next speed region after the playhead
    const sorted = [...speedRegions].sort((a, b) => a.startMs - b.startMs);
    const nextRegion = sorted.find(region => region.startMs > startPos);
    const gapToNext = nextRegion ? nextRegion.startMs - startPos : totalMs - startPos;

    // Check if playhead is inside any speed region
    const isOverlapping = sorted.some(region => startPos >= region.startMs && startPos < region.endMs);
    if (isOverlapping || gapToNext <= 0) {
      toast.error("Cannot place speed here", {
        description: "Speed region already exists at this location or not enough space available.",
      });
      return;
    }

    const actualDuration = Math.min(defaultRegionDurationMs, gapToNext);
    onSpeedAdded({ start: startPos, end: startPos + actualDuration });
  }, [clip, videoDuration, totalMs, currentTimeMs, speedRegions, onSpeedAdded, defaultRegionDurationMs]);

  const handleAddAudio = useCallback(async () => {
    if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onAudioAdded) {
      return;
    }

    const result = await (window as any).electronAPI.openAudioFilePicker();
    if (!result?.success || !result.path) {
      return;
    }

    // Load the audio file to get its full duration
    const audioDurationMs = await new Promise<number>((resolve) => {
      const audio = new Audio(toFileUrl(result.path));
      audio.addEventListener('loadedmetadata', () => {
        resolve(Math.round(audio.duration * 1000));
      });
      audio.addEventListener('error', () => {
        resolve(0);
      });
    });

    if (audioDurationMs <= 0) {
      toast.error("Could not read audio file", {
        description: "The selected file may be corrupted or in an unsupported format.",
      });
      return;
    }

    const startPos = Math.max(0, Math.min(currentTimeMs, totalMs));
    const actualDuration = Math.min(audioDurationMs, totalMs - startPos);
    if (actualDuration > 0) onAudioAdded({ start: startPos, end: startPos + actualDuration }, result.path, audioDurationMs);
  }, [videoDuration, totalMs, currentTimeMs, audioRegions, onAudioAdded]);

  const handleAddAnnotation = useCallback(() => {
    if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onAnnotationAdded) {
      return;
    }

    const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
    if (defaultDuration <= 0) {
      return;
    }

    // Multiple annotations can exist at the same timestamp
    const startPos = Math.max(0, Math.min(currentTimeMs, totalMs));
    const endPos = Math.min(startPos + defaultDuration, totalMs);

    onAnnotationAdded({ start: startPos, end: endPos });
  }, [videoDuration, totalMs, currentTimeMs, onAnnotationAdded, defaultRegionDurationMs]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (matchesShortcut(e, keyShortcuts.addKeyframe, isMac)) {
        addKeyframe();
      }
      if (matchesShortcut(e, keyShortcuts.addZoom, isMac)) {
        handleAddZoom();
      }
      if (matchesShortcut(e, keyShortcuts.addTrim, isMac)) {
        // Cut key: splits the selected item at the playhead, otherwise cuts the video there.
        const regionsByKind: Record<RegionKind, Array<{ id: string; startMs: number; endMs: number }>> = {
          zoom: zoomRegions, trim: trimRegions, annotation: annotationRegions, speed: speedRegions, audio: audioRegions, blur: blurRegions,
        };
        const selected = selectedRegionTarget && regionsByKind[selectedRegionTarget.kind].find((region) => region.id === selectedRegionTarget.id);
        if (selected && onRegionCommand && currentTimeMs > selected.startMs && currentTimeMs < selected.endMs) {
          onRegionCommand({ type: 'split' }, selectedRegionTarget);
        } else if (clip) {
          clip.onSplit();
        } else {
          handleAddTrim();
        }
      }
      if (matchesShortcut(e, keyShortcuts.addAnnotation, isMac)) {
        handleAddAnnotation();
      }
      if (matchesShortcut(e, keyShortcuts.addSpeed, isMac)) {
        handleAddSpeed();
      }

      // Tab: Cycle through overlapping annotations at current time
      if (e.key === 'Tab' && (e.target as HTMLElement)?.closest('[data-timeline-body]') && annotationRegions.length > 0) {
        const currentTimeMs = Math.round(currentTime * 1000);
        const overlapping = annotationRegions
          .filter(a => currentTimeMs >= a.startMs && currentTimeMs <= a.endMs)
          .sort((a, b) => a.zIndex - b.zIndex); // Sort by z-index

        if (overlapping.length > 0) {
          e.preventDefault();

          if (!selectedAnnotationId || !overlapping.some(a => a.id === selectedAnnotationId)) {
            onSelectAnnotation?.(overlapping[0].id);
          } else {
            // Cycle to next annotation
            const currentIndex = overlapping.findIndex(a => a.id === selectedAnnotationId);
            const nextIndex = e.shiftKey
              ? (currentIndex - 1 + overlapping.length) % overlapping.length // Shift+Tab = backward
              : (currentIndex + 1) % overlapping.length; // Tab = forward
            onSelectAnnotation?.(overlapping[nextIndex].id);
          }
        }
      }
      // Delete key or Ctrl+D / Cmd+D
      if (e.key === 'Delete' || e.key === 'Backspace' || matchesShortcut(e, keyShortcuts.deleteSelected, isMac)) {
        if (liveGroup.length > 0 && onRegionGroupCommand) {
          e.preventDefault();
          onRegionGroupCommand({ type: 'delete' }, liveGroup);
          setGroup([]);
        } else if (selectedKeyframeId) {
          deleteSelectedKeyframe();
        } else if (selectedZoomId) {
          deleteSelectedZoom();
        } else if (selectedTrimId) {
          deleteSelectedTrim();
        } else if (selectedAnnotationId) {
          deleteSelectedAnnotation();
        } else if (selectedSpeedId) {
          deleteSelectedSpeed();
        } else if (selectedAudioId) {
          deleteSelectedAudio();
        } else if (selectedBlurId) {
          deleteSelectedBlur();
        } else if (clip && clip.selectedStart !== null) {
          e.preventDefault();
          clip.onDeleteSegment();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addKeyframe, handleAddZoom, handleAddTrim, handleAddAnnotation, handleAddSpeed, deleteSelectedKeyframe, deleteSelectedZoom, deleteSelectedTrim, deleteSelectedAnnotation, deleteSelectedSpeed, deleteSelectedAudio, deleteSelectedBlur, selectedKeyframeId, selectedZoomId, selectedTrimId, selectedAnnotationId, selectedSpeedId, selectedAudioId, selectedBlurId, annotationRegions, currentTime, onSelectAnnotation, keyShortcuts, isMac, selectedRegionTarget, onRegionCommand, zoomRegions, trimRegions, speedRegions, audioRegions, blurRegions, currentTimeMs, clip, liveGroup, onRegionGroupCommand]);

  const clampedRange = useMemo<Range>(() => {
    if (totalMs === 0) {
      return range;
    }

    return {
      start: Math.max(0, Math.min(range.start, totalMs)),
      end: Math.min(range.end, totalMs),
    };
  }, [range, totalMs]);

  const timelineItems = useMemo<TimelineRenderItem[]>(() => {
    const zooms: TimelineRenderItem[] = zoomRegions.map((region, index) => ({
      id: region.id,
      rowId: ZOOM_ROW_ID,
      span: { start: region.startMs, end: region.endMs },
      label: `Zoom ${index + 1}`,
      zoomDepth: region.depth,
      variant: 'zoom',
    }));

    const trims: TimelineRenderItem[] = trimRegions.map((region, index) => ({
      id: region.id,
      rowId: TRIM_ROW_ID,
      span: { start: region.startMs, end: region.endMs },
      label: `Trim ${index + 1}`,
      variant: 'trim',
    }));

    const annotations: TimelineRenderItem[] = annotationRegions.map((region) => {
      let label: string;

      if (region.type === 'text') {
        // Show text preview
        const preview = region.content.trim() || 'Empty text';
        label = preview.length > 20 ? `${preview.substring(0, 20)}...` : preview;
      } else if (region.type === 'image') {
        label = 'Image';
      } else {
        label = 'Annotation';
      }

      return {
        id: region.id,
        rowId: ANNOTATION_ROW_ID,
        span: { start: region.startMs, end: region.endMs },
        label,
        variant: 'annotation',
      };
    });

    const speeds: TimelineRenderItem[] = speedRegions.map((region, index) => ({
      id: region.id,
      rowId: SPEED_ROW_ID,
      span: { start: region.startMs, end: region.endMs },
      label: `Speed ${index + 1}`,
      speedValue: region.speed,
      variant: 'speed',
    }));

    const audios: TimelineRenderItem[] = audioRegions.map((region) => {
      return {
        id: region.id,
        rowId: audioRowId(region.track ?? 0),
        span: { start: region.startMs, end: region.endMs },
        label: audioClipName(region.audioPath, locale === 'tr'),
        variant: 'audio',
        waveform: { audioPath: region.audioPath, offsetMs: region.sourceStartMs ?? 0 },
      };
    });

    const blurs: TimelineRenderItem[] = [...blurRegions].sort((a, b) => a.startMs - b.startMs).map((region, index) => ({
      id: region.id,
      rowId: BLUR_ROW_ID,
      span: { start: region.startMs, end: region.endMs },
      label: tTimeline('blur.label', 'Blur {{index}}', { index: String(index + 1) }),
      variant: 'blur',
    }));

    return [...zooms, ...trims, ...annotations, ...speeds, ...audios, ...blurs];
  }, [zoomRegions, trimRegions, annotationRegions, speedRegions, audioRegions, blurRegions, locale, tTimeline]);

  // Flat list of all non-annotation region spans for neighbour-clamping during drag/resize
  const allRegionSpans = useMemo(() => {
    const zooms = zoomRegions.map((r) => ({ id: r.id, rowId: r.id.split('-')[0], start: r.startMs, end: r.endMs }));
    const trims = trimRegions.map((r) => ({ id: r.id, rowId: r.id.split('-')[0], start: r.startMs, end: r.endMs }));
    const speeds = speedRegions.map((r) => ({ id: r.id, rowId: r.id.split('-')[0], start: r.startMs, end: r.endMs }));
    const audios = audioRegions.map((r) => ({ id: r.id, rowId: audioRowId(r.track ?? 0), start: r.startMs, end: r.endMs }));
    return [...zooms, ...trims, ...speeds, ...audios];
  }, [zoomRegions, trimRegions, speedRegions, audioRegions]);

  // Cut points and part boundaries of the video are snap targets too.
  const cutSnapTimes = useMemo(() => [...(clip?.markers.map((marker) => marker.outMs) ?? []), ...(clip?.segments.map((segment) => segment.outStart) ?? [])], [clip]);

  const handleItemSpanChange = useCallback((id: string, span: Span, rowId?: string) => {
    // Dragging one item of a group moves the whole group; resizing changes only that item.
    if (liveGroup.length > 1 && groupIds.has(id) && onRegionGroupCommand) {
      const target = liveGroup.find((item) => item.id === id);
      const region = target && regionsOfKind[target.kind].find((item) => item.id === id);
      if (region && Math.abs((span.end - span.start) - (region.endMs - region.startMs)) <= 1) {
        const deltaMs = Math.round(span.start - region.startMs);
        if (deltaMs !== 0) {
          lastGroupMoveRef.current = Date.now();
          onRegionGroupCommand({ type: 'nudge', deltaMs }, liveGroup);
        }
        return;
      }
    }
    // Check if it's a zoom, trim, speed, or annotation item
    if (zoomRegions.some(r => r.id === id)) {
      onZoomSpanChange(id, span);
    } else if (trimRegions.some(r => r.id === id)) {
      onTrimSpanChange?.(id, span);
    } else if (speedRegions.some(r => r.id === id)) {
      onSpeedSpanChange?.(id, span);
    } else if (annotationRegions.some(r => r.id === id)) {
      onAnnotationSpanChange?.(id, span);
    } else if (audioRegions.some(r => r.id === id)) {
      onAudioSpanChange?.(id, span, trackOfAudioRow(rowId));
    } else if (blurRegions.some(r => r.id === id)) {
      onBlurSpanChange?.(id, span);
    }
  }, [zoomRegions, trimRegions, speedRegions, annotationRegions, audioRegions, blurRegions, onZoomSpanChange, onTrimSpanChange, onSpeedSpanChange, onAnnotationSpanChange, onAudioSpanChange, onBlurSpanChange, liveGroup, groupIds, regionsOfKind, onRegionGroupCommand]);

  // Follow the playhead while it moves (on by default; remembered per user).
  const [followPlayheadEnabled, setFollowPlayheadEnabled] = useState(() => {
    try { return localStorage.getItem('screenmovie.timeline.followPlayhead') !== '0'; } catch { return true; }
  });
  const toggleFollowPlayhead = useCallback(() => {
    setFollowPlayheadEnabled((value) => {
      try { localStorage.setItem('screenmovie.timeline.followPlayhead', value ? '0' : '1'); } catch { /* per-viewer convenience only */ }
      return !value;
    });
  }, []);
  // Only playhead movement pages the view; scrolling by hand is left alone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately runs on playhead changes only
  useEffect(() => {
    if (!followPlayheadEnabled || totalMs <= 0) return;
    setRange((previous) => followPlayhead(previous, currentTimeMs, totalMs) ?? previous);
  }, [currentTimeMs]);

  const zoomLevel = zoomLevelForRange(range, totalMs, timelineScale.minVisibleRangeMs);
  const setZoomLevel = useCallback((level: number) => {
    setRange(rangeForZoomLevel(level, totalMs, timelineScale.minVisibleRangeMs, currentTimeMs));
  }, [totalMs, timelineScale.minVisibleRangeMs, currentTimeMs]);

  const zoomTimeline = useCallback((factor: number) => {
    setRange(previous => { const span = Math.max(timelineScale.minVisibleRangeMs, Math.min(totalMs, (previous.end-previous.start)/factor)); const start = Math.max(0, Math.min(currentTimeMs - span/2, totalMs-span)); return {start,end:start+span} })
  }, [currentTimeMs, totalMs, timelineScale.minVisibleRangeMs]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.defaultPrevented || (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]') || document.querySelector('[role="dialog"]')) return; if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomTimeline(1.4) } else if (event.key === '-') { event.preventDefault(); zoomTimeline(.7) } else if (event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); setRange({start:0,end:totalMs}) } }; window.addEventListener('keydown',key); return () => window.removeEventListener('keydown',key) }, [zoomTimeline,totalMs]);

  const panTimelineRange = useCallback((deltaMs: number) => {
    if (!Number.isFinite(deltaMs) || deltaMs === 0 || totalMs <= 0) {
      return;
    }

    setRange((previous) => {
      const visibleSpan = Math.max(1, previous.end - previous.start);
      const maxStart = Math.max(0, totalMs - visibleSpan);
      const nextStart = Math.max(0, Math.min(previous.start + deltaMs, maxStart));

      return {
        start: nextStart,
        end: nextStart + visibleSpan,
      };
    });
  }, [totalMs]);

  const handleTimelineWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || totalMs <= 0) {
      return;
    }

    const rawHorizontalDelta = Math.abs(event.deltaX) > 0
      ? event.deltaX
      : event.shiftKey && Math.abs(event.deltaY) > 0
        ? event.deltaY
        : 0;

    if (rawHorizontalDelta === 0) {
      return;
    }

    const containerWidth = timelineContainerRef.current?.clientWidth ?? 0;
    const visibleRangeMs = clampedRange.end - clampedRange.start;

    if (containerWidth <= 0 || visibleRangeMs <= 0) {
      return;
    }

    event.preventDefault();

    const horizontalDeltaPx = normalizeWheelDeltaToPixels(rawHorizontalDelta, event.deltaMode);
    const deltaMs = (horizontalDeltaPx / containerWidth) * visibleRangeMs;

    panTimelineRange(deltaMs);
  }, [clampedRange.end, clampedRange.start, panTimelineRange, totalMs]);

  const emptyStateT = useScopedT("timeline");
  if (!videoDuration || videoDuration === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center rounded-lg bg-[#09090b] gap-3">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
          <Plus className="w-6 h-6 text-slate-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-300">{emptyStateT("emptyVideoTitle")}</p>
          <p className="text-xs text-slate-500 mt-1">{emptyStateT("emptyVideoHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#09090b] overflow-auto">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-[#09090b]">
        <div className="workspace-timeline-actions flex items-center gap-1">
          <Button
            onClick={handleAddZoom}
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-[#2563EB] hover:bg-[#2563EB]/10 transition-all"
            title="Add Zoom (Z)"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleSuggestZooms}
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-[#2563EB] hover:bg-[#2563EB]/10 transition-all"
            title="İmleç hareketlerine göre zoom öner" aria-label="Otomatik zoom öner"
          >
            <WandSparkles className="w-4 h-4" /><span className="workspace-timeline-action-label">Oto zoom</span>
          </Button>
          <Button
            onClick={handleAddTrim}
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-all"
            title="Add Trim (T)"
          >
            <Scissors className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleAddAnnotation}
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-[#B4A046] hover:bg-[#B4A046]/10 transition-all"
            title="Add Annotation (A)"
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleAddSpeed}
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-[#d97706] hover:bg-[#d97706]/10 transition-all"
            title="Add Speed (S)"
          >
            <Gauge className="w-4 h-4" />
          </Button>
          {onAddVideo && <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={addingVideo !== null}
                data-testid="add-video"
                className="workspace-timeline-action h-7 w-7 text-slate-400 hover:text-cyan-300 hover:bg-cyan-300/10 transition-all"
                title={tTimeline('addVideo.title')} aria-label={tTimeline('addVideo.title')}
              >
                {addingVideo !== null ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                <span className="workspace-timeline-action-label">{addingVideo !== null ? `${Math.round(addingVideo * 100)}%` : tTimeline('addVideo.button')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-[#1a1a1a] border-white/10">
              <DropdownMenuItem data-testid="add-video-file-start" onClick={() => onAddVideo("file", "start")} className="text-slate-300 cursor-pointer gap-2"><ChevronsLeft className="w-4 h-4" />{tTimeline('addVideo.fromFileStart')}</DropdownMenuItem>
              <DropdownMenuItem data-testid="add-video-file-playhead" onClick={() => onAddVideo("file", "playhead")} className="text-slate-300 cursor-pointer gap-2"><TextCursorInput className="w-4 h-4" />{tTimeline('addVideo.fromFilePlayhead')}</DropdownMenuItem>
              <DropdownMenuItem data-testid="add-video-file" onClick={() => onAddVideo("file", "end")} className="text-slate-300 cursor-pointer gap-2"><FolderOpen className="w-4 h-4" />{tTimeline('addVideo.fromFile')}</DropdownMenuItem>
              <DropdownMenuItem data-testid="add-video-record" onClick={() => onAddVideo("record")} className="text-slate-300 cursor-pointer gap-2"><Video className="w-4 h-4" />{tTimeline('addVideo.record')}</DropdownMenuItem>
              {onExtendEnding && <DropdownMenuItem data-testid="extend-ending" onClick={onExtendEnding} className="text-slate-300 cursor-pointer gap-2"><Hourglass className="w-4 h-4" />{tTimeline('ending.extend')}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>}
          <Button
            onClick={handleAddAudio}
            variant="ghost"
            size="icon"
            className="workspace-timeline-action h-7 w-7 text-slate-400 hover:text-[#a855f7] hover:bg-[#a855f7]/10 transition-all"
            title="Ses dosyası ekle" aria-label="Ses dosyası ekle"
          >
            <Music className="w-4 h-4" /><span className="workspace-timeline-action-label">Ses ekle</span>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-all gap-1"
              >
                <span className="font-medium">{getAspectRatioLabel(aspectRatio)}</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10 max-h-[70vh] overflow-y-auto">
              <div className="px-2 py-1 text-xs text-zinc-500">Video boyutu · Sosyal medya</div>
              {VIDEO_FORMAT_PRESETS.map(preset => <DropdownMenuItem key={preset.label} onClick={() => onAspectRatioChange(preset.ratio)} className="text-slate-300 cursor-pointer flex justify-between gap-4"><span>{preset.label}</span><span className="text-xs text-zinc-500">{preset.ratio} · {preset.size}</span></DropdownMenuItem>)}
              <div className="mx-1 my-1 h-px bg-white/10"/>
              {ASPECT_RATIOS.map((ratio) => (
                <DropdownMenuItem
                  key={ratio}
                  onClick={() => onAspectRatioChange(ratio)}
                  className="text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer flex items-center justify-between gap-3"
                >
                  <span>{getAspectRatioLabel(ratio)}</span>
                  {aspectRatio === ratio && <Check className="w-3 h-3 text-[#2563EB]" />}
                </DropdownMenuItem>
              ))}
              <div className="mx-1 my-1 h-px bg-white/10" />
              <div className="px-2 py-1.5 flex items-center gap-2 text-slate-300">
                <span className="text-sm">Custom</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customAspectWidth}
                  onChange={(event) => setCustomAspectWidth(event.target.value.replace(/\D/g, ''))}
                  onKeyDown={handleCustomAspectRatioKeyDown}
                  className="w-12 h-7 rounded border border-white/15 bg-black/20 px-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  aria-label="Custom aspect width"
                />
                <span className="text-slate-500">:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customAspectHeight}
                  onChange={(event) => setCustomAspectHeight(event.target.value.replace(/\D/g, ''))}
                  onKeyDown={handleCustomAspectRatioKeyDown}
                  className="w-12 h-7 rounded border border-white/15 bg-black/20 px-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  aria-label="Custom aspect height"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={applyCustomAspectRatio}
                  className="h-7 px-2 text-xs text-slate-300 hover:text-white hover:bg-white/10"
                >
                  Set
                </Button>
                {isCustomAspectRatio(aspectRatio) && <Check className="w-3 h-3 text-[#2563EB] ml-auto" />}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="w-[1px] h-4 bg-white/10" />
          <TutorialHelp />
        </div>
        <div className="flex-1" />
        {liveGroup.length > 1 && onRegionGroupCommand && (
          <div data-testid="timeline-group-bar" className="mr-2 flex items-center gap-1.5 rounded-md bg-[#2563EB]/20 px-2 py-1 text-[11px] text-slate-100" title={tTimeline('group.hint', 'Shift or {{mod}} + click adds or removes an item · {{mod}}+A selects all of a kind · drag or Alt+←/→ moves them together', { mod: isMac ? '⌘' : 'Ctrl' })}>
            <span>{tTimeline('group.count', '{{count}} items selected', { count: String(liveGroup.length) })}</span>
            <button type="button" data-testid="timeline-group-delete" onClick={() => { onRegionGroupCommand({ type: 'delete' }, liveGroup); setGroup([]); }} className="rounded bg-white/10 px-1.5 py-0.5 hover:bg-red-500/40">{tTimeline('group.delete', 'Delete')}</button>
            <button type="button" data-testid="timeline-group-clear" onClick={clearGroup} className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-white/10">{tTimeline('group.clear', 'Clear')}</button>
          </div>
        )}
        <div className="flex items-center gap-1 text-[11px] text-slate-400" title={`${scrollLabels.pan} · ${scrollLabels.zoom}`}>
          <button type="button" title="Uzaklaştır (-)" aria-label="Timeline uzaklaştır" onClick={() => zoomTimeline(.7)} className="rounded bg-white/5 px-2 py-1">−</button>
          <button type="button" title="Videoyu sığdır (Shift+F)" onClick={() => setRange({start:0,end:totalMs})} className="rounded bg-white/5 px-2 py-1">Sığdır</button>
          <Slider
            min={0}
            max={1000}
            step={1}
            value={[Math.round(zoomLevel * 1000)]}
            onValueChange={([value]) => setZoomLevel(value / 1000)}
            aria-label={tTimeline('view.zoomSlider', 'Timeline zoom')}
            title={tTimeline('view.zoomSlider', 'Timeline zoom')}
            data-testid="timeline-zoom-slider"
            className="w-24 mx-1"
          />
          <button type="button" title="Yakınlaştır (+)" aria-label="Timeline yakınlaştır" onClick={() => zoomTimeline(1.4)} className="rounded bg-white/5 px-2 py-1">+</button>
          <button
            type="button"
            aria-pressed={followPlayheadEnabled}
            data-testid="timeline-follow-playhead"
            title={tTimeline('view.followPlayheadHint', 'Keep the playhead in view while playing')}
            onClick={toggleFollowPlayhead}
            className={`ml-1 rounded px-2 py-1 ${followPlayheadEnabled ? 'bg-[#2563EB]/30 text-white' : 'bg-white/5'}`}
          >
            {tTimeline('view.followPlayhead', 'Follow')}
          </button>
          <span className="ml-2 tabular-nums">{(currentTimeMs/1000).toFixed(1)} / {(totalMs/1000).toFixed(1)}s</span>
        </div>
      </div>
      <div
        ref={timelineContainerRef}
        data-timeline-body
        className="flex-1 min-h-0 overflow-auto bg-[#09090b] relative"
        onClick={() => setSelectedKeyframeId(null)}
        onWheel={handleTimelineWheel}
      >
        <TimelineWrapper
          range={clampedRange}
          videoDuration={videoDuration}
          hasOverlap={hasOverlap}
          onRangeChange={setRange}
          minItemDurationMs={timelineScale.minItemDurationMs}
          minVisibleRangeMs={timelineScale.minVisibleRangeMs}
          onItemSpanChange={handleItemSpanChange}
          allRegionSpans={allRegionSpans}
          playheadMs={currentTimeMs}
          snapTimes={cutSnapTimes}
          snapScaleRef={snapScaleRef}
        >
          <KeyframeMarkers
            keyframes={keyframes}
            selectedKeyframeId={selectedKeyframeId}
            setSelectedKeyframeId={setSelectedKeyframeId}
            onKeyframeMove={handleKeyframeMove}
            videoDurationMs={totalMs}
            timelineRef={timelineContainerRef}
          />
          <Timeline
            sourcePath={videoPath} sourceTrims={trimRegions} clip={clip}
            items={timelineItems}
            videoDurationMs={totalMs}
            currentTimeMs={currentTimeMs}
            onSeek={onSeek}
            onSelectZoom={onSelectZoom}
            onSelectTrim={onSelectTrim}
            onSelectAnnotation={onSelectAnnotation}
            onSelectSpeed={onSelectSpeed}
            onSelectAudio={onSelectAudio}
            selectedZoomId={selectedZoomId}
            selectedTrimId={selectedTrimId}
            selectedAnnotationId={selectedAnnotationId}
            selectedSpeedId={selectedSpeedId}
            selectedAudioId={selectedAudioId}
            onSelectBlur={onSelectBlur}
            selectedBlurId={selectedBlurId}
            keyframes={keyframes}
            snapScaleRef={snapScaleRef}
            onItemContextMenu={openContextMenu}
            groupIds={groupIds}
            onItemPick={onRegionGroupCommand ? pickItem : undefined}
            onClearGroup={clearGroup}
          />
        </TimelineWrapper>
      </div>
      {contextMenu && onRegionCommand && (
        <RegionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canPaste={canPasteRegion}
          isMac={isMac}
          onCommand={(command) => onRegionCommand(command, contextMenu.target)}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
