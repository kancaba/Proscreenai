import { useEffect, useRef, useState } from "react";
import { sliceWaveform, type Waveform } from "./waveformSlice";

// One decode per file for the whole editor session; clips of the same file share it.
const waveforms = new Map<string, Promise<Waveform | null>>();
function loadWaveform(audioPath: string): Promise<Waveform | null> {
	let pending = waveforms.get(audioPath);
	if (!pending) {
		pending = window.electronAPI.getAudioWaveform(audioPath).catch(() => null);
		waveforms.set(audioPath, pending);
	}
	return pending;
}

/** Waveform of the part of `audioPath` a timeline clip plays, drawn behind the clip's label. */
export function AudioWaveform({ audioPath, offsetMs, lengthMs }: { audioPath: string; offsetMs: number; lengthMs: number }) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [waveform, setWaveform] = useState<Waveform | null>(null);
	const [width, setWidth] = useState(0);

	useEffect(() => {
		let alive = true;
		void loadWaveform(audioPath).then((value) => { if (alive) setWaveform(value); });
		return () => { alive = false; };
	}, [audioPath]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !waveform || width <= 0) return;
		const ratio = window.devicePixelRatio || 1;
		const height = canvas.clientHeight || 40;
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
		const context = canvas.getContext("2d");
		if (!context) return;
		context.scale(ratio, ratio);
		context.clearRect(0, 0, width, height);
		const step = 3;
		const bars = sliceWaveform(waveform, offsetMs, lengthMs, Math.floor(width / step));
		context.fillStyle = "rgba(237, 220, 255, 0.55)";
		const middle = height / 2;
		bars.forEach((peak, index) => {
			const barHeight = Math.max(1, peak * (height - 8));
			context.fillRect(index * step, middle - barHeight / 2, step - 1, barHeight);
		});
	}, [waveform, width, offsetMs, lengthMs]);

	return <canvas ref={canvasRef} data-testid="audio-waveform" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
