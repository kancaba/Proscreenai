import { useEffect, useState } from "react";
import { toFileUrl } from "../projectPersistence";

/** Small JPEGs sampled from the source. Placement changes keep the same source times. */
export function useVideoFrames(path: string, frameKey: string) {
	const [frames, setFrames] = useState<string[]>([]);
	useEffect(() => {
		let cancelled = false;
		if (!path) return;
		const video = document.createElement("video");
		video.muted = true;
		video.preload = "auto";
		video.src = toFileUrl(path);
		const canvas = document.createElement("canvas");
		canvas.width = 144;
		canvas.height = 80;
		const context = canvas.getContext("2d");
		const times = frameKey.split(",").map(Number);
		const ready = () => {
			if (!context || !Number.isFinite(video.duration) || video.duration <= 0) return;
			void (async () => {
				const next: string[] = [];
				for (const time of times) {
					if (cancelled) break;
					await new Promise<void>((resolve) => {
						const timer = setTimeout(resolve, 2500);
						video.onseeked = () => {
							clearTimeout(timer);
							resolve();
						};
						video.currentTime = Math.min(video.duration - 0.01, Number.isFinite(time) ? time : 0);
					});
					if (cancelled) break;
					try {
						context.drawImage(video, 0, 0, 144, 80);
						next.push(canvas.toDataURL("image/jpeg", 0.6));
					} catch {
						break;
					}
				}
				if (!cancelled) {
					setFrames(next);
					video.removeAttribute("src");
					video.load();
				}
			})();
		};
		video.addEventListener("loadedmetadata", ready, { once: true });
		return () => {
			cancelled = true;
			video.pause();
			video.removeEventListener("loadedmetadata", ready);
			video.removeAttribute("src");
			video.load();
		};
	}, [path, frameKey]);
	return frames;
}
