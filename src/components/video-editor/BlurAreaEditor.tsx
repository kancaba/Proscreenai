import type React from "react";
import { useRef } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { type BlurHandle, type BlurRect, dragBlurRect, rectBetween } from "./blurRegions";

/** Below this many px a press on the video is a click, not a newly drawn area. */
const DRAW_THRESHOLD_PX = 4;

const HANDLES: Array<{ handle: Exclude<BlurHandle, "move">; className: string; cursor: string }> = [
  { handle: "nw", className: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
  { handle: "n", className: "left-1/2 -top-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { handle: "ne", className: "-right-1.5 -top-1.5", cursor: "nesw-resize" },
  { handle: "e", className: "-right-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { handle: "se", className: "-right-1.5 -bottom-1.5", cursor: "nwse-resize" },
  { handle: "s", className: "left-1/2 -bottom-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { handle: "sw", className: "-left-1.5 -bottom-1.5", cursor: "nesw-resize" },
  { handle: "w", className: "-left-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

/**
 * Edits the selected blur area on the preview: drag the box to move it, its edges and corners to
 * resize it, or drag anywhere else on the video to draw it again. The box itself is placed by the
 * preview's ticker (`boxRef`), so it stays on the area while the view zooms.
 */
export function BlurAreaEditor({ rect, boxRef, framePoint, onChange }: {
  rect: BlurRect;
  boxRef: React.RefObject<HTMLDivElement>;
  /** A point on the screen as a fraction of the recorded frame (may fall outside 0–1). */
  framePoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  onChange: (rect: BlurRect) => void;
}) {
  const { locale } = useI18n();
  const tr = locale === "tr";
  const dragRef = useRef<{ handle: BlurHandle | "draw"; start: { x: number; y: number }; client: { x: number; y: number }; rect: BlurRect } | null>(null);

  const begin = (event: React.PointerEvent<HTMLElement>, handle: BlurHandle | "draw") => {
    if (event.button !== 0) return;
    const start = framePoint(event.clientX, event.clientY);
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { handle, start, client: { x: event.clientX, y: event.clientY }, rect };
  };
  const move = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Handled once, by the element holding the pointer, not again by its parents.
    event.stopPropagation();
    const point = framePoint(event.clientX, event.clientY);
    if (!point) return;
    if (drag.handle === "draw") {
      if (Math.hypot(event.clientX - drag.client.x, event.clientY - drag.client.y) < DRAW_THRESHOLD_PX) return;
      onChange(rectBetween(drag.start, point));
      return;
    }
    onChange(dragBlurRect(drag.rect, drag.handle, point.x - drag.start.x, point.y - drag.start.y));
  };
  const end = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const pointer = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  return (
    <div data-testid="blur-area-editor" className="absolute inset-0 cursor-crosshair" style={{ pointerEvents: "auto", zIndex: 1000 }} onPointerDown={(event) => begin(event, "draw")} {...pointer}>
      <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-3 py-1 text-[11px] text-white/90 shadow">
        {tr ? "Gizlenecek alanı sürükleyerek çiz, kutuyu taşı ya da kenarından boyutlandır" : "Drag to draw the area to hide, move the box or resize it from its edges"}
      </div>
      <div
        ref={boxRef}
        data-testid="blur-area-box"
        className="absolute cursor-move rounded-[3px] border-2 border-dashed border-cyan-300 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
        style={{ display: "none" }}
        onPointerDown={(event) => begin(event, "move")}
        {...pointer}
      >
        {HANDLES.map(({ handle, className, cursor }) => (
          <span
            key={handle}
            data-testid={`blur-handle-${handle}`}
            className={`absolute h-3 w-3 rounded-sm border border-black/60 bg-cyan-200 ${className}`}
            style={{ cursor }}
            onPointerDown={(event) => begin(event, handle)}
            {...pointer}
          />
        ))}
      </div>
    </div>
  );
}
