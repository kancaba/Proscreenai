import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useScopedT } from "../../contexts/I18nContext";
import {
	captureRegionToRect,
	fitAspect,
	type Handle,
	isUsableRect,
	moveRect,
	type Point,
	type Rect,
	rectFromCorner,
	rectPixelSize,
	rectToCaptureRegion,
	resizeRect,
	type Size,
} from "../../utils/regionGeometry";

const RATIOS: Array<{ id: string; label?: string; value: number | null }> = [
	{ id: "free", value: null },
	{ id: "16:9", label: "16:9", value: 16 / 9 },
	{ id: "9:16", label: "9:16", value: 9 / 16 },
	{ id: "1:1", label: "1:1", value: 1 },
	{ id: "4:3", label: "4:3", value: 4 / 3 },
];
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_POSITION: Record<Handle, { left: string; top: string; cursor: string }> = {
	nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
	n: { left: "50%", top: "0%", cursor: "ns-resize" },
	ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
	e: { left: "100%", top: "50%", cursor: "ew-resize" },
	se: { left: "100%", top: "100%", cursor: "nwse-resize" },
	s: { left: "50%", top: "100%", cursor: "ns-resize" },
	sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
	w: { left: "0%", top: "50%", cursor: "ew-resize" },
};

type Drag =
	| { kind: "create"; anchor: Point }
	| { kind: "move"; start: Point; rect: Rect }
	| { kind: "resize"; handle: Handle; rect: Rect };

/** Full-display overlay for drawing the area to record, modelled on macOS Cmd+Shift+5. */
export function RegionSelectorOverlay() {
	const t = useScopedT("launch");
	const [bounds, setBounds] = useState<Size>({ width: window.innerWidth, height: window.innerHeight });
	const [scaleFactor, setScaleFactor] = useState(window.devicePixelRatio || 1);
	const [rect, setRect] = useState<Rect | null>(null);
	const [ratioId, setRatioId] = useState("free");
	const drag = useRef<Drag | null>(null);
	const aspect = RATIOS.find((ratio) => ratio.id === ratioId)?.value ?? null;

	useEffect(() => {
		let alive = true;
		window.electronAPI.getRegionSelectorContext().then((context) => {
			if (!alive || !context) return;
			const size = { width: context.width, height: context.height };
			setBounds(size);
			setScaleFactor(context.scaleFactor || 1);
			if (context.initialRegion) setRect(captureRegionToRect(context.initialRegion, size));
		});
		return () => {
			alive = false;
		};
	}, []);

	const finish = useCallback(
		(selection: Rect | null) => {
			const region = selection ? rectToCaptureRegion(selection, bounds) : null;
			void window.electronAPI.finishRegionSelection(region);
		},
		[bounds],
	);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				finish(null);
			} else if (event.key === "Enter" && isUsableRect(rect)) {
				event.preventDefault();
				finish(rect);
			} else if (rect && event.key.startsWith("Arrow")) {
				event.preventDefault();
				const step = event.shiftKey ? 10 : 1;
				const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
				const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
				setRect(moveRect(rect, dx, dy, bounds));
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [bounds, finish, rect]);

	const pointer = (event: ReactPointerEvent) => ({ x: event.clientX, y: event.clientY });

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { kind: "create", anchor: pointer(event) };
		setRect(null);
	};
	const startMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0 || !rect) return;
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { kind: "move", start: pointer(event), rect };
	};
	const startResize = (handle: Handle) => (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0 || !rect) return;
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { kind: "resize", handle, rect };
	};
	const onPointerMove = (event: ReactPointerEvent) => {
		const current = drag.current;
		if (!current) return;
		const p = pointer(event);
		if (current.kind === "create") setRect(rectFromCorner(current.anchor, p, bounds, aspect));
		else if (current.kind === "move") setRect(moveRect(current.rect, p.x - current.start.x, p.y - current.start.y, bounds));
		else setRect(resizeRect(current.rect, current.handle, p, bounds, aspect));
	};
	const onPointerUp = () => {
		drag.current = null;
		setRect((value) => (isUsableRect(value) ? value : null));
	};

	const chooseRatio = (id: string) => {
		setRatioId(id);
		const value = RATIOS.find((ratio) => ratio.id === id)?.value;
		if (value && rect) setRect(fitAspect(rect, value, bounds));
	};

	const pixels = rect ? rectPixelSize(rect, scaleFactor) : null;
	const labelBelow = rect ? rect.y + rect.height + 40 < bounds.height : true;
	const usable = isUsableRect(rect);

	return (
		<div
			className="fixed inset-0 select-none overflow-hidden"
			style={{ cursor: "crosshair", background: rect ? "transparent" : "rgba(0,0,0,0.35)" }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
		>
			{!rect && (
				<div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-white drop-shadow">
					<p className="text-lg font-medium">{t("regionSelector.hint", "Drag to select the area to record")}</p>
					<p className="mt-1 text-xs text-white/70">{t("regionSelector.keys", "Esc to cancel · Enter to confirm")}</p>
				</div>
			)}

			{rect && (
				<div
					role="region"
					aria-label={t("regionSelector.selection", "Selected recording area")}
					className="absolute"
					style={{
						left: rect.x,
						top: rect.y,
						width: rect.width,
						height: rect.height,
						cursor: "move",
						border: "1px solid rgba(255,255,255,0.95)",
						boxShadow: "0 0 0 100vmax rgba(0,0,0,0.45)",
					}}
					onPointerDown={startMove}
				>
					{HANDLES.map((handle) => (
						<div
							key={handle}
							data-handle={handle}
							className="absolute h-3 w-3 rounded-full border border-black/40 bg-white"
							style={{ ...HANDLE_POSITION[handle], transform: "translate(-50%, -50%)" }}
							onPointerDown={startResize(handle)}
						/>
					))}
					{pixels && (
						<div
							data-testid="region-size"
							className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-2 py-0.5 text-xs tabular-nums text-white"
							style={labelBelow ? { top: "calc(100% + 8px)" } : { bottom: "calc(100% + 8px)" }}
						>
							{pixels.width} × {pixels.height} px
						</div>
					)}
				</div>
			)}

			<div
				role="toolbar"
				aria-label={t("regionSelector.toolbar", "Area selection tools")}
				className="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/15 bg-[#1c1c22]/95 px-3 py-2 text-xs text-white shadow-2xl"
				style={{ cursor: "default" }}
				onPointerDown={(event) => event.stopPropagation()}
			>
				<span className="text-white/60">{t("regionSelector.ratio", "Aspect ratio")}</span>
				{RATIOS.map((ratio) => (
					<button
						key={ratio.id}
						type="button"
						aria-pressed={ratio.id === ratioId}
						className={`rounded-md px-2 py-1 ${ratio.id === ratioId ? "bg-white text-black" : "text-white/80 hover:bg-white/10"}`}
						onClick={() => chooseRatio(ratio.id)}
					>
						{ratio.label ?? t("regionSelector.free", "Free")}
					</button>
				))}
				<span className="mx-1 h-5 w-px bg-white/15" />
				<button
					type="button"
					className="rounded-md px-2 py-1 text-white/80 hover:bg-white/10"
					onClick={() => setRect(aspect ? fitAspect({ x: 0, y: 0, ...bounds }, aspect, bounds) : { x: 0, y: 0, ...bounds })}
				>
					{t("regionSelector.fullScreen", "Full screen")}
				</button>
				<button type="button" className="rounded-md px-2 py-1 text-white/80 hover:bg-white/10" onClick={() => finish(null)}>
					{t("regionSelector.cancel", "Cancel")}
				</button>
				<button
					type="button"
					disabled={!usable}
					className="rounded-md bg-[#2563EB] px-3 py-1 font-medium text-white disabled:opacity-40"
					onClick={() => finish(rect)}
				>
					{t("regionSelector.confirm", "Record this area")}
				</button>
			</div>
		</div>
	);
}
