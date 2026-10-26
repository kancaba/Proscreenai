import type { Span } from "dnd-timeline";
import { useItem, useTimelineContext } from "dnd-timeline";
import { Gauge, MessageSquare, Music, Scissors, ZoomIn } from "lucide-react";
import { useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { AudioWaveform } from "./AudioWaveform";
import glassStyles from "./ItemGlass.module.css";

interface ItemProps {
  id: string;
  span: Span;
  rowId: string;
  children: React.ReactNode;
  isSelected?: boolean;
  onSelect?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  lane?: number;
  zoomDepth?: number;
  speedValue?: number;
  variant?: 'zoom' | 'trim' | 'annotation' | 'speed' | 'audio';
  /** Audio clips: the file and where in it the clip starts, for the waveform. */
  waveform?: { audioPath: string; offsetMs: number };
}

// Map zoom depth to multiplier labels
const ZOOM_LABELS: Record<number, string> = {
	1: "1.25×",
	2: "1.5×",
	3: "1.8×",
	4: "2.2×",
	5: "3.5×",
	6: "5×",
};

function formatMs(ms: number): string {
	const totalSeconds = ms / 1000;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes > 0) {
		return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
	}
	return `${seconds.toFixed(1)}s`;
}

export default function Item({
	id,
	span,
	rowId,
	isSelected = false,
	onSelect,
	onContextMenu,
	lane = 0,
	zoomDepth = 1,
	speedValue,
	variant = "zoom",
	waveform,
	children,
}: ItemProps) {
	// The edges trim and the middle moves. On a short clip the trim zones shrink so at least
	// its middle third can always be grabbed to move it (the library default is 10 px per edge).
	const { valueToPixels } = useTimelineContext();
	const widthPx = valueToPixels(span.end - span.start);
	const resizeHandleWidth = Math.max(6, Math.min(20, widthPx / 3));
	const { setNodeRef, attributes, listeners, itemStyle, itemContentStyle } = useItem({
		id,
		span,
		data: { rowId },
		resizeHandleWidth,
	});
	const gripWidth = Math.max(4, resizeHandleWidth / 2);

  const isZoom = variant === 'zoom';
  const isTrim = variant === 'trim';
  const isSpeed = variant === 'speed';
  const isAudio = variant === 'audio';

  const glassClass = isZoom
    ? glassStyles.glassGreen
    : isTrim
    ? glassStyles.glassRed
    : isSpeed
    ? glassStyles.glassAmber
    : isAudio
    ? glassStyles.glassPurple
    : glassStyles.glassYellow;

  const endCapColor = isZoom
    ? '#2563EB'
    : isTrim
    ? '#ef4444'
    : isSpeed
    ? '#d97706'
    : isAudio
    ? '#a855f7'
    : '#B4A046';

	const timeLabel = useMemo(
		() => `${formatMs(span.start)} – ${formatMs(span.end)}`,
		[span.start, span.end],
	);

	const MIN_ITEM_PX = 6;
	const localRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (isSelected) localRef.current?.scrollIntoView({block:'nearest',inline:'nearest'}) }, [isSelected]);
  const safeItemStyle = { ...itemStyle, top: lane * 42, height: 40, minWidth: MIN_ITEM_PX };

  return (
    <div
      ref={node => { setNodeRef(node); localRef.current = node }}
      style={safeItemStyle}
      {...listeners}
      {...attributes}
      onPointerDownCapture={() => onSelect?.()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect?.();
        onContextMenu?.(event);
      }}
      className="group"
    >
      <div style={{ ...itemContentStyle, minWidth: 24 }}>
        <div
          className={cn(
            glassClass,
            "w-full h-full overflow-hidden flex items-center justify-center gap-1.5 cursor-grab active:cursor-grabbing relative",
            isSelected && glassStyles.selected
          )}
          style={{ height: 40, color: '#fff', minWidth: 24 }}
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.();
          }}
        >
          {(['left', 'right'] as const).map((side) => (
            <div
              key={side}
              data-testid={`trim-handle-${side}`}
              className={cn(glassStyles.zoomEndCap, glassStyles[side], "flex items-center justify-center gap-[2px]")}
              style={{ cursor: 'ew-resize', pointerEvents: 'auto', width: gripWidth, opacity: isSelected ? 1 : 0.85, background: endCapColor }}
              title={side === 'left' ? 'Trim start' : 'Trim end'}
            >
              {gripWidth >= 7 && <><span className="h-3 w-px rounded bg-white/70" /><span className="h-3 w-px rounded bg-white/70" /></>}
            </div>
          ))}
          {isAudio && waveform && <AudioWaveform audioPath={waveform.audioPath} offsetMs={waveform.offsetMs} lengthMs={span.end - span.start} />}
          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-center text-white/90 opacity-80 group-hover:opacity-100 transition-opacity select-none overflow-hidden">
            <div className="flex items-center gap-1.5">
              {isZoom ? (
                <>
                  <ZoomIn className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
                    {ZOOM_LABELS[zoomDepth] || `${zoomDepth}×`}
                  </span>
                </>
              ) : isTrim ? (
                <>
                  <Scissors className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
                    Trim
                  </span>
                </>
              ) : isSpeed ? (
                <>
                  <Gauge className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
                    {speedValue !== undefined ? `${speedValue}×` : 'Speed'}
                  </span>
                </>
              ) : isAudio ? (
                <>
                  <Music className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-semibold tracking-tight truncate max-w-full">
                    {children}
                  </span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
                    {children}
                  </span>
                </>
              )}
            </div>
            <span
              className={`text-[9px] tabular-nums tracking-tight whitespace-nowrap transition-opacity ${
                isSelected ? 'opacity-60' : 'opacity-0 group-hover:opacity-40'
              }`}
            >
              {timeLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
