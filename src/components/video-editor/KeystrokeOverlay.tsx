import { useEffect, useRef } from "react";
import {
	drawKeystrokeBadge,
	isMacPlatform,
	type KeystrokeSettings,
	type RecordedShortcut,
	shownShortcut,
} from "@/lib/keystrokes";

/** The shortcut badge over the preview, drawn exactly as the export draws it. */
export function KeystrokeOverlay({
	shortcuts,
	settings,
	timeMs,
	width,
	height,
}: {
	shortcuts: RecordedShortcut[];
	settings: KeystrokeSettings;
	timeMs: number;
	width: number;
	height: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const ratio = window.devicePixelRatio || 1;
		const pixelWidth = Math.max(1, Math.round(width * ratio));
		const pixelHeight = Math.max(1, Math.round(height * ratio));
		if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
		if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, pixelWidth, pixelHeight);
		const shown = settings.enabled ? shownShortcut(shortcuts, timeMs) : null;
		if (!shown) return;
		ctx.scale(ratio, ratio);
		drawKeystrokeBadge(ctx, shown, settings, width, height, isMacPlatform());
	}, [shortcuts, settings, timeMs, width, height]);
	return (
		<canvas
			ref={canvasRef}
			data-testid="keystroke-overlay"
			className="pointer-events-none absolute inset-0"
			style={{ width, height, zIndex: 9999 }}
		/>
	);
}
