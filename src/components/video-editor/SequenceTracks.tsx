import { toFileUrl } from "./projectPersistence";
import { memo, useRef, useState, type PointerEvent } from "react";
import { clipEnd, dragClip, snapDelta, type SequenceClip, type ClipGesture } from "@/lib/sequence";

import { AudioWaveform } from "./timeline/AudioWaveform";
import { useVideoFrames } from "./timeline/useVideoFrames";

const ClipImages = memo(function ClipImages({ clip }: { clip: SequenceClip }) {
	const length = clip.outMs - clip.inMs;
	const times = [0.08, 0.51, 0.92]
		.map((t) => ((clip.inMs + length * t) / 1000).toFixed(2))
		.join(",");
	const frames = useVideoFrames(clip.path, times);
	return (
		<div className="seq-images">
			{frames.map((src, i) => (
				<img key={i} src={src} alt="" draggable={false} />
			))}
		</div>
	);
});

const ROW = 47;
interface Props {
	clips: SequenceClip[];
	selected: string | null;
	time: number;
	extent: number;
	scale: number;
	tracks: number[];
	snap: boolean;
	tr: boolean;
	disabled: boolean;
	onSelect: (id: string) => void;
	onEdit: (id: string) => void;
	onSeek: (ms: number) => void;
	onPlace: (clip: SequenceClip) => void;
	onDropFiles: (paths: string[], start: number, track: number) => void;
	onPause: () => void;
}
export default function SequenceTracks(p: Props) {
	const area = useRef<HTMLDivElement>(null);
	const scroll = useRef<HTMLDivElement>(null);
	const gesture = useRef<{
		clip: SequenceClip;
		action: ClipGesture;
		x: number;
		draft: SequenceClip;
	} | null>(null);
	const [draft, setDraft] = useState<SequenceClip | null>(null);
	const width = p.extent * p.scale;
	const tickMs =
		[100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000, 300000, 600000, 3600000].find(
			(t) => t * p.scale >= 74,
		) ?? 3600000;
	function trackAt(y: number) {
		const row = Math.floor((y - area.current!.getBoundingClientRect().top) / ROW);
		return p.tracks[Math.max(0, Math.min(p.tracks.length - 1, row))];
	}
	function begin(e: PointerEvent<HTMLDivElement>, c: SequenceClip) {
		if (p.disabled || e.button !== 0) return;
		e.stopPropagation();
		p.onPause();
		p.onSelect(c.id);
		const action = (e.target as HTMLElement).dataset.edge as ClipGesture | undefined;
		e.currentTarget.setPointerCapture(e.pointerId);
		gesture.current = {
			clip: c,
			action: action ?? "move",
			x: e.clientX - area.current!.getBoundingClientRect().left,
			draft: c,
		};
	}
	function move(e: PointerEvent<HTMLDivElement>) {
		const g = gesture.current;
		if (!g || !area.current || !scroll.current) return;
		const viewport = scroll.current.getBoundingClientRect();
		if (e.clientX > viewport.right - 22) scroll.current.scrollLeft += 18;
		if (e.clientX < viewport.left + 66) scroll.current.scrollLeft -= 18;
		let delta = (e.clientX - area.current.getBoundingClientRect().left - g.x) / p.scale;
		if (p.snap && !e.altKey) {
			const edges = p.clips.filter((c) => c.id !== g.clip.id).flatMap((c) => [c.start, clipEnd(c)]);
			delta = snapDelta(g.clip, g.action, delta, [0, p.time, ...edges], 7 / p.scale);
		}
		let track = trackAt(e.clientY);
		const audioLane = track < 0;
		if (audioLane !== g.clip.track < 0) track = g.clip.track;
		g.draft = dragClip(g.clip, g.action, delta, track);
		setDraft(g.draft);
	}
	function finish(commit: boolean) {
		const g = gesture.current;
		gesture.current = null;
		setDraft(null);
		if (
			commit &&
			g &&
			(g.draft.start !== g.clip.start ||
				g.draft.track !== g.clip.track ||
				g.draft.inMs !== g.clip.inMs ||
				g.draft.outMs !== g.clip.outMs)
		)
			p.onPlace(g.draft);
	}
	function seek(x: number) {
		if (area.current)
			p.onSeek(Math.round(Math.max(0, x - area.current.getBoundingClientRect().left) / p.scale));
	}
	const shown = p.clips.map((c) => (c.id === draft?.id ? draft : c));
	return (
		<div className="seq-scroll" ref={scroll}>
			<div className="seq-sheet" style={{ width: width + 52 }}>
				<div className="seq-labels">
					<div className="seq-ruler-spacer" />
					{p.tracks.map((t) => (
						<div key={t}>{t >= 0 ? "V" + (t + 1) : "A" + -t}</div>
					))}
				</div>
				<div className="seq-grid">
					<div
						className="seq-ruler"
						aria-label={p.tr ? "Zaman cetveli" : "Time ruler"}
						onPointerDown={(e) => {
							p.onPause();
							e.currentTarget.setPointerCapture(e.pointerId);
							seek(e.clientX);
						}}
						onPointerMove={(e) => {
							if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e.clientX);
						}}
					>
						{Array.from({ length: Math.ceil(p.extent / tickMs) }, (_, i) => (
							<span key={i} style={{ left: i * tickMs * p.scale }}>
								{Math.floor((i * tickMs) / 60000)}:
								{String(Math.floor((i * tickMs) / 1000) % 60).padStart(2, "0")}
								{tickMs < 1000 ? "." + ((i * tickMs) % 1000) / 100 : ""}
							</span>
						))}
					</div>
					<div
						ref={area}
						className="seq-lanes"
						style={{ height: p.tracks.length * ROW }}
						onPointerDown={(e) => {
							p.onPause();
							seek(e.clientX);
						}}
						onDragOver={(e) => {
							if (e.dataTransfer.types.includes("Files")) e.preventDefault();
						}}
						onDrop={(e) => {
							e.preventDefault();
							if (p.disabled) return;
							const paths = Array.from(e.dataTransfer.files)
								.map((f) => window.electronAPI.pathForDroppedFile(f))
								.filter(Boolean);
							p.onDropFiles(
								paths,
								Math.max(
									0,
									Math.round((e.clientX - area.current!.getBoundingClientRect().left) / p.scale),
								),
								trackAt(e.clientY),
							);
						}}
					>
						{shown.map((c) => {
							const covered =
								draft &&
								c.id !== draft.id &&
								c.track === draft.track &&
								c.start < clipEnd(draft) &&
								clipEnd(c) > draft.start;
							return (
								<div
									key={c.id}
									role="button"
									tabIndex={0}
									aria-label={c.name}
									aria-pressed={p.selected === c.id}
									onDoubleClick={() => {
										if (!p.disabled) p.onEdit(c.id);
									}}
									onFocus={() => p.onSelect(c.id)}
									className={`seq-clip ${c.track < 0 ? "audio" : ""} ${covered ? "covered" : ""}`}
									style={{
										left: c.start * p.scale,
										width: Math.max(2, (c.outMs - c.inMs) * p.scale),
										top: p.tracks.indexOf(c.track) * ROW + 4,
										zIndex: c.id === draft?.id ? 3 : 1,
									}}
									onPointerDown={(e) => begin(e, c)}
									onPointerMove={move}
									onPointerUp={() => finish(true)}
									onPointerCancel={() => finish(false)}
									title={c.name}
								>
									{c.track < 0 ? (
										<AudioWaveform
											audioPath={c.path}
											offsetMs={c.inMs}
											lengthMs={c.outMs - c.inMs}
										/>
									) : c.still ? (
										<img className="seq-still-thumb" alt="" src={toFileUrl(c.path)} />
									) : (
										<ClipImages
											clip={gesture.current?.clip.id === c.id ? gesture.current.clip : c}
										/>
									)}
									<i data-edge="left" />
									<span>{c.name}</span>
									<small>{((c.outMs - c.inMs) / 1000).toFixed(2)} s</small>
									<i data-edge="right" />
								</div>
							);
						})}
					</div>
					<div className="seq-head" style={{ left: p.time * p.scale }} />
				</div>
			</div>
		</div>
	);
}
