import { fadeAmount, NO_FADES } from "@/lib/fades";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	DEFAULT_TRANSFORM,
	sequenceEnd,
	activeAt,
	clipEnd,
	type Sequence,
	type SequenceClip,
} from "@/lib/sequence";
import { toFileUrl } from "./projectPersistence";

const previews = new Map<string, Promise<string>>();

function MediaLayer({
	ratio,
	gain,
	clip,
	time,
	playing,
	onError,
}: {
	clip: SequenceClip;
	ratio: number;
	gain: number;
	time: number;
	playing: boolean;
	onError: (error: string) => void;
}) {
	const ref = useRef<HTMLVideoElement>(null);
	const [proxy, setProxy] = useState("");
	const [ready, setReady] = useState(false);
	const live = useRef(true);
	const active = activeAt(clip, time);
	useEffect(() => {
		live.current = true;
		return () => {
			live.current = false;
		};
	}, []);
	useLayoutEffect(() => {
		const node = ref.current;
		if (!ready || !node) return;
		const target =
			(clip.inMs + Math.max(0, Math.min(time - clip.start, clip.outMs - clip.inMs - 1))) / 1000;
		node.volume = gain * clip.volume;
		if (Math.abs(node.currentTime - target) > (playing && !node.paused ? 0.14 : 0.001))
			node.currentTime = target;
		if (playing && active) {
			if (node.paused && !node.ended)
				void node.play().catch((e) => {
					if (e.name !== "AbortError") onError(String(e));
				});
		} else if (!node.paused) node.pause();
	}, [clip, time, playing, ready, active, onError, gain]);
	async function recover() {
		setReady(false);
		if (proxy) {
			onError(clip.name);
			return;
		}
		try {
			let request = previews.get(clip.path);
			if (!request) {
				request = window.electronAPI.sequencePreviewCopy(clip.path);
				previews.set(clip.path, request);
			}
			const file = await request;
			if (live.current) setProxy(file);
		} catch (error) {
			previews.delete(clip.path);
			if (live.current) onError(String(error));
		}
	}
	const transform = clip.transform ?? DEFAULT_TRANSFORM;
	const turned = transform.turns % 2 === 1;
	const style: React.CSSProperties = {
		visibility: active && clip.track >= 0 ? "visible" : "hidden",
		zIndex: Math.max(0, clip.track),
		opacity: transform.opacity,
		left: transform.x * 100 + "%",
		top: transform.y * 100 + "%",
		width: transform.scale * (turned ? 1 / ratio : 1) * 100 + "%",
		height: transform.scale * (turned ? ratio : 1) * 100 + "%",
		transform: `translate(-50%,-50%) rotate(${transform.turns * 90}deg) scaleX(${transform.flip ? -1 : 1})`,
	};
	if (clip.still)
		return (
			<img src={toFileUrl(clip.path)} alt="" style={style} onError={() => onError(clip.name)} />
		);
	return (
		<video
			ref={ref}
			playsInline
			preload="auto"
			src={toFileUrl(proxy || clip.path)}
			onLoadedMetadata={() => setReady(true)}
			onError={() => void recover()}
			style={style}
			aria-hidden="true"
		/>
	);
}

export default function SequenceMonitor({
	sequence,
	time,
	playing,
	onError,
}: {
	sequence: Sequence;
	time: number;
	playing: boolean;
	onError: (error: string) => void;
}) {
	const gain = 1 - fadeAmount(time, sequenceEnd(sequence.clips), sequence.fades ?? NO_FADES);
	return (
		<div className="seq-monitor">
			<div
				className="seq-picture"
				style={{
					aspectRatio: sequence.width / sequence.height,
					width: `min(100cqw, calc(100cqh * ${sequence.width / sequence.height}))`,
				}}
			>
				{sequence.clips
					.filter((c) => c.start <= time + 1000 && clipEnd(c) >= time - 100)
					.map((c) => (
						<MediaLayer
							key={c.id + c.path}
							clip={c}
							gain={gain}
							ratio={sequence.width / sequence.height}
							time={time}
							playing={playing}
							onError={onError}
						/>
					))}
				{gain < 1 && (
					<div
						aria-hidden="true"
						style={{
							position: "absolute",
							inset: 0,
							zIndex: 10,
							background: "black",
							opacity: 1 - gain,
							pointerEvents: "none",
						}}
					/>
				)}
			</div>
		</div>
	);
}
