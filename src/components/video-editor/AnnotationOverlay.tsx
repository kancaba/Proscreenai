import { getAnnotationText, getAnnotationImage } from './annotationText';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_HIGHLIGHT_COLOR,
  getAnnotationAnimationState,
  getStroke,
  getTextShadow,
  parseRichText,
  revealRuns,
  snapToCenter,
} from "./annotationEffects";
import { Rnd } from "react-rnd";
import type { AnnotationRegion } from "./types";
import { cn } from "@/lib/utils";
import { fitFontSize, type MeasureText } from "@/lib/text/textLayout";
import { getArrowComponent } from "./ArrowSvgs";

interface AnnotationOverlayProps {
  annotation: AnnotationRegion;
  isSelected: boolean;
  containerWidth: number;
  containerHeight: number;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onSizeChange: (id: string, size: { width: number; height: number }) => void;
  onClick: (id: string) => void;
  zIndex: number;
  isSelectedBoost: boolean; // Boost z-index when selected for easy editing
  /** Playback time for enter/exit animations. */
  timeMs?: number;
  /** Selected texts are shown at rest so they stay visible while editing. */
  animate?: boolean;
  /** Visible texts can be clicked to select them (off while a zoom focus is being placed). */
  selectable?: boolean;
  onContentChange?: (id: string, content: string) => void;
}

const HANDLE_STYLE: CSSProperties = {
  width: '12px',
  height: '12px',
  backgroundColor: 'white',
  border: '2px solid #2563EB',
  borderRadius: '50%',
};
const EDGE_HANDLE_STYLES = {
  topLeft: { ...HANDLE_STYLE, left: '-6px', top: '-6px', cursor: 'nwse-resize' },
  topRight: { ...HANDLE_STYLE, right: '-6px', top: '-6px', cursor: 'nesw-resize' },
  bottomLeft: { ...HANDLE_STYLE, left: '-6px', bottom: '-6px', cursor: 'nesw-resize' },
  bottomRight: { ...HANDLE_STYLE, right: '-6px', bottom: '-6px', cursor: 'nwse-resize' },
  top: { ...HANDLE_STYLE, left: 'calc(50% - 6px)', top: '-6px', cursor: 'ns-resize' },
  bottom: { ...HANDLE_STYLE, left: 'calc(50% - 6px)', bottom: '-6px', cursor: 'ns-resize' },
  left: { ...HANDLE_STYLE, top: 'calc(50% - 6px)', left: '-6px', cursor: 'ew-resize' },
  right: { ...HANDLE_STYLE, top: 'calc(50% - 6px)', right: '-6px', cursor: 'ew-resize' },
} satisfies Record<string, CSSProperties>;

let measureContext: CanvasRenderingContext2D | null = null;

/**
 * Text shrinks to fit its box (the exporter does the same), so captions stay whole when the
 * frame is smaller, for example in 1:1 or 9:16.
 */
function useFittedFontSize(annotation: AnnotationRegion, boxWidth: number, boxHeight: number) {
  const { fontSize, fontFamily, fontWeight, fontStyle } = annotation.style;
  const text = annotation.type === "text" ? getAnnotationText(annotation) : "";
  return useMemo(() => {
    if (!text.trim() || boxWidth <= 0 || boxHeight <= 0) return fontSize;
    measureContext ??= document.createElement("canvas").getContext("2d");
    const ctx = measureContext;
    if (!ctx) return fontSize;
    const measure: MeasureText = (piece, bold, size) => {
      ctx.font = `${fontStyle === "italic" ? "italic" : "normal"} ${bold || fontWeight === "bold" ? "bold" : "normal"} ${size}px ${fontFamily}`;
      return ctx.measureText(piece).width;
    };
    return fitFontSize({ text, fontSize, boxWidth, boxHeight, measure });
  }, [text, fontSize, fontFamily, fontWeight, fontStyle, boxWidth, boxHeight]);
}

export function AnnotationOverlay({
  annotation,
  isSelected,
  containerWidth,
  containerHeight,
  onPositionChange,
  onSizeChange,
  onClick,
  zIndex,
  isSelectedBoost,
  timeMs,
  animate = false,
  selectable = false,
  onContentChange,
}: AnnotationOverlayProps) {
  const fittedFontSize = useFittedFontSize(annotation, (annotation.size.width / 100) * containerWidth, (annotation.size.height / 100) * containerHeight);
  const x = (annotation.position.x / 100) * containerWidth;
  const y = (annotation.position.y / 100) * containerHeight;
  const width = (annotation.size.width / 100) * containerWidth;
  const height = (annotation.size.height / 100) * containerHeight;

  const isDraggingRef = useRef(false);
  const [guides, setGuides] = useState({ x: false, y: false });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isSelected) setEditing(false);
  }, [isSelected]);
  useEffect(() => {
    if (editing) editorRef.current?.focus();
  }, [editing]);

  const startEditing = () => {
    if (annotation.type !== 'text' || !onContentChange) return;
    setDraft(getAnnotationText(annotation));
    setEditing(true);
  };
  const commitEdit = () => {
    if (!editing) return;
    setEditing(false);
    if (draft !== getAnnotationText(annotation)) onContentChange?.(annotation.id, draft);
  };

  const motion = animate && timeMs !== undefined
    ? getAnnotationAnimationState(annotation, timeMs)
    : { opacity: 1, offsetY: 0, scale: 1, reveal: 1 };

  const renderArrow = () => {
    const direction = annotation.figureData?.arrowDirection || 'right';
    const color = annotation.figureData?.color || '#2563EB';
    const strokeWidth = annotation.figureData?.strokeWidth || 4;

    const ArrowComponent = getArrowComponent(direction);
    return <ArrowComponent color={color} strokeWidth={strokeWidth} />;
  };

  const renderContent = () => {
    switch (annotation.type) {
      case 'text': {
        const style = annotation.style;
        const shadow = getTextShadow(style.textShadow);
        const stroke = getStroke(style);
        const textStyle: CSSProperties = {
          color: style.color,
          backgroundColor: style.backgroundColor,
          fontSize: `${fittedFontSize}px`,
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          textDecoration: style.textDecoration,
          textAlign: style.textAlign,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
          padding: '0.1em 0.2em',
          borderRadius: '4px',
          lineHeight: '1.4',
          // Same order as the exporter: outline first, letters on top.
          ...(stroke ? { WebkitTextStroke: `${stroke.width * 2}px ${stroke.color}`, paintOrder: 'stroke fill' } : {}),
          ...(shadow ? { textShadow: `0 ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}` } : {}),
        };
        const { visible, hidden } = revealRuns(parseRichText(getAnnotationText(annotation)), motion.reveal);
        const runStyle = (run: { bold: boolean; highlight: boolean }): CSSProperties => ({
          ...(run.bold ? { fontWeight: 'bold' } : {}),
          ...(run.highlight ? { color: style.highlightColor || DEFAULT_HIGHLIGHT_COLOR } : {}),
        });
        return (
          <div
            className="w-full h-full flex items-center p-2 overflow-hidden"
            style={{
              justifyContent: style.textAlign === 'left' ? 'flex-start' :
                            style.textAlign === 'right' ? 'flex-end' : 'center',
              alignItems: 'center',
              opacity: editing ? 1 : motion.opacity,
              transform: !editing && (motion.offsetY || motion.scale !== 1)
                ? `translateY(${motion.offsetY * height}px) scale(${motion.scale})`
                : undefined,
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              startEditing();
            }}
          >
            {editing ? (
              <textarea
                ref={editorRef}
                aria-label="Yazıyı düzenle"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitEdit}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setEditing(false);
                  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    commitEdit();
                  }
                }}
                className="w-full h-full resize-none bg-black/30 outline-none"
                style={{ ...textStyle, backgroundColor: 'rgba(0,0,0,0.3)', cursor: 'text' }}
              />
            ) : (
              <span style={textStyle}>
                {visible.map((run, index) => <span key={`v${index}`} style={runStyle(run)}>{run.text}</span>)}
                {hidden.map((run, index) => <span key={`h${index}`} style={{ ...runStyle(run), visibility: 'hidden' }}>{run.text}</span>)}
              </span>
            )}
          </div>
        );
      }

      case 'image':
        if (getAnnotationImage(annotation).startsWith('data:image')) {
          return (
            <img
              src={getAnnotationImage(annotation)}
              alt="Annotation"
              className="w-full h-full object-contain"
              draggable={false}
            />
          );
        }
        return (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
            No image
          </div>
        );

      case 'figure':
        if (!annotation.figureData) {
          return (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
              No arrow data
            </div>
          );
        }

        return (
          <div className="w-full h-full flex items-center justify-center p-2">
            {renderArrow()}
          </div>
        );

      default:
        return null;
    }
  };

  const container = { width: containerWidth, height: containerHeight };
  return (
    <>
    {guides.x && <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-px bg-pink-500" style={{ left: containerWidth / 2, zIndex: 3000 }} />}
    {guides.y && <div aria-hidden className="pointer-events-none absolute left-0 right-0 h-px bg-pink-500" style={{ top: containerHeight / 2, zIndex: 3000 }} />}
    <Rnd
      position={{ x, y }}
      size={{ width, height }}
      onDragStart={() => {
        isDraggingRef.current = true;
      }}
      onDrag={(_e, d) => {
        const snap = snapToCenter(d, { width, height }, container);
        if (snap.snappedX !== guides.x || snap.snappedY !== guides.y) setGuides({ x: snap.snappedX, y: snap.snappedY });
      }}
      onDragStop={(_e, d) => {
        setGuides({ x: false, y: false });
        const snapped = snapToCenter(d, { width, height }, container);
        const xPercent = (snapped.x / containerWidth) * 100;
        const yPercent = (snapped.y / containerHeight) * 100;
        onPositionChange(annotation.id, { x: xPercent, y: yPercent });
        
        // Reset dragging flag after a short delay to prevent click event
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 100);
      }}
      onResizeStop={(_e, _direction, ref, _delta, position) => {
        const xPercent = (position.x / containerWidth) * 100;
        const yPercent = (position.y / containerHeight) * 100;
        const widthPercent = (ref.offsetWidth / containerWidth) * 100;
        const heightPercent = (ref.offsetHeight / containerHeight) * 100;
        onPositionChange(annotation.id, { x: xPercent, y: yPercent });
        onSizeChange(annotation.id, { width: widthPercent, height: heightPercent });
      }}
      onClick={() => {
        if (isDraggingRef.current) return;
        onClick(annotation.id);
      }}
      bounds="parent"
      className={cn(
        isSelected ? "cursor-move transition-all" : "cursor-pointer transition-all",
        isSelected && "ring-2 ring-[#2563EB] ring-offset-2 ring-offset-transparent"
      )}
      style={{
        zIndex: isSelectedBoost ? zIndex + 1000 : zIndex, // Boost selected annotation to ensure it's on top
        pointerEvents: isSelected || (selectable && annotation.type === 'text') ? 'auto' : 'none',
        border: isSelected ? '2px solid rgba(37, 99, 235, 0.8)' : 'none',
        backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
        boxShadow: isSelected ? '0 0 0 1px rgba(37, 99, 235, 0.35)' : 'none',
      }}
      enableResizing={isSelected && !editing}
      disableDragging={!isSelected || editing}
      resizeHandleStyles={isSelected ? EDGE_HANDLE_STYLES : undefined}
    >
      <div
        className={cn(
          "w-full h-full rounded-lg",
          annotation.type === 'text' && "bg-transparent",
          annotation.type === 'image' && "bg-transparent",
          annotation.type === 'figure' && "bg-transparent",
          isSelected && "shadow-lg"
        )}
      >
        {renderContent()}
      </div>
    </Rnd>
    </>
  );
}

