import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, Film, Magnet, Undo2, Redo2, Save, Scissors, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
	activeAt,
	clipEnd,
	placeClip,
	sequenceEnd,
	validSequence,
	type Sequence,
	type SequenceClip,
} from "@/lib/sequence";
import { SequenceGraphicDialog } from "./SequenceGraphicDialog";
import type { AnnotationRegion } from "./types";
import { getAnnotationText } from "./annotationText";
import { toFileUrl } from "./projectPersistence";
import { FADE_CHOICES_MS, NO_FADES } from "@/lib/fades";
import { ClipTransformControls } from "./ClipTransformControls";
import { SequenceExportDialog } from "./SequenceExportDialog";
import { fitCustomSizeToRatio } from "@/lib/video/outputSettings";
import { clipProject, type ClipTool, type ClipSession } from "./sequenceClipEdit";
import type { ClipEdit, SequenceOutput } from "@/lib/sequence";
import PlaybackControls from "./PlaybackControls";
import SequenceMonitor from "./SequenceMonitor";
import SequenceTracks from "./SequenceTracks";
import "./sequence.css";

export async function inspectClip(
	path: string,
	start: number,
	track: number,
): Promise<{ clip: SequenceClip; width: number; height: number; fps: 30 | 60 }> {
	if (/\.(png|jpe?g|webp)$/i.test(path)) {
		const image = new Image();
		image.src = toFileUrl(path);
		await image.decode();
		return {
			clip: {
				id: crypto.randomUUID(),
				path,
				name: path.split(/[\\/]/).pop() || path,
				still: true,
				track: Math.max(0, track),
				start,
				inMs: 0,
				outMs: 3000,
				sourceMs: 7 * 86400000,
				hasAudio: false,
				volume: 1,
			},
			width: image.naturalWidth,
			height: image.naturalHeight,
			fps: 30,
		};
	}
	const info = await window.electronAPI.inspectSequenceMedia(path);
	const clip = {
		id: crypto.randomUUID(),
		path,
		name: path.split(/[\\/]/).pop() || path,
		track: info.width ? Math.max(0, track) : Math.min(-1, track),
		start,
		inMs: 0,
		outMs: info.duration,
		sourceMs: info.duration,
		volume: 1,
		hasAudio: info.hasAudio,
	};
	return { clip, width: info.width, height: info.height, fps: info.fps > 30 ? 60 : 30 };
}

interface Props {
	sequence: Sequence;
	tr: boolean;
	name: string;
	dirty: boolean;
	initialTime: number;
	onChange: (s: Sequence) => void;
	onTime: (ms: number) => void;
	renderEditor: (session: ClipSession) => ReactNode;
	onRecord: () => Promise<void>;
	onVoiceover: (insert: (path: string, at: "start" | "playhead") => Promise<void>) => void;
	onSave: () => Promise<void>;
	onOpen: () => Promise<void>;
}
export default function SequenceWorkspace({
	sequence,
	tr,
	name,
	dirty,
	initialTime,
	onChange,
	onTime,
	renderEditor,
	onRecord,
	onVoiceover,
	onSave,
	onOpen,
}: Props) {
	const label = (turkish: string, english: string) => (tr ? turkish : english);
	const [selectedId, setSelected] = useState<string | null>(null);
	const [time, setTime] = useState(initialTime);
	const clock = useRef(time);
	const [playing, setPlaying] = useState(false);
	const [snap, setSnap] = useState(true);
	const [zoom, setZoom] = useState(1);
	const [busy, setBusy] = useState<"import" | "export" | null>(null);
	const [progress, setProgress] = useState(0);
	const [previewError, setPreviewError] = useState("");
	const gate = useRef(false);
	const alive = useRef(true);
	const past = useRef<Sequence[]>([]),
		future = useRef<Sequence[]>([]);
	const timeline = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(800);
	const { clips } = sequence;
	const selected = clips.find((c) => c.id === selectedId);
	const [drawing, setDrawing] = useState<{ clip?: SequenceClip } | null>(null);
	const [exportSetup, setExportSetup] = useState(false);
	const [session, setSession] = useState(() => {
		const pending = sequence.pendingEdit;
		const clip = pending && clips.find((c) => c.id === pending.clipId);
		return clip && pending
			? {
					clip,
					tool: "appearance" as ClipTool,
					initial: clipProject(clip, sequence, initialTime, pending.edit),
				}
			: null;
	});
	const target =
		selected ??
		[...clips]
			.filter((c) => c.track >= 0 && activeAt(c, time))
			.sort((a, b) => b.track - a.track)[0] ??
		clips.find((c) => c.track >= 0);
	const baseSequence = () => {
		const { pendingEdit: _, ...base } = sequence;
		return base;
	};
	async function insertVoice(path: string, at: "start" | "playhead") {
		try {
			const { clip } = await inspectClip(path, at === "start" ? 0 : Math.round(clock.current), -1);
			if (!alive.current) return;
			const track = Array.from({ length: 8 }, (_, i) => -1 - i).find(
				(t) =>
					!clips.some((c) => c.track === t && c.start < clipEnd(clip) && clipEnd(c) > clip.start),
			);
			if (track === undefined) throw Error(label("Boş ses kanalı yok.", "No free audio track."));
			commit([...clips, { ...clip, track }]);
			setSelected(clip.id);
		} catch (e) {
			toast.error(String(e));
		}
	}
	async function saveGraphic(data: ArrayBuffer, graphic: AnnotationRegion) {
		const old = drawing?.clip;
		const start = old?.start ?? Math.round(clock.current);
		const end = start + 3000;
		const highest = Math.max(
			0,
			...clips.filter((c) => c.start < end && clipEnd(c) > start).map((c) => c.track),
		);
		const track = old?.track ?? highest + 1;
		if (track > 7)
			throw Error(
				label("Bu zamanda üst video kanalı dolu.", "No upper video track is available here."),
			);
		const path = await window.electronAPI.storeSequenceGraphic(data);
		if (!alive.current) return;
		const name =
			graphic.type === "text"
				? getAnnotationText(graphic).slice(0, 100)
				: label("Grafik", "Graphic");
		const layer: SequenceClip = {
			start,
			track,
			inMs: 0,
			outMs: 3000,
			sourceMs: 7 * 86400000,
			volume: 1,
			hasAudio: false,
			id: crypto.randomUUID(),
			...old,
			name,
			graphic,
			still: true,
			path,
		};
		commit(placeClip(clips, layer));
		setSelected(layer.id);
		setDrawing(null);
	}
	function openTool(tool: ClipTool) {
		if (!target || target.track < 0 || target.still || gate.current) return;
		setPlaying(false);
		setSelected(target.id);
		setSession({ clip: target, tool, initial: clipProject(target, sequence, time) });
	}
	function draft(edit: ClipEdit) {
		if (session) onChange({ ...sequence, pendingEdit: { clipId: session.clip.id, edit } });
	}
	function cancelEdit() {
		if (sequence.pendingEdit) onChange(baseSequence());
		setSession(null);
	}
	async function applyEdit(path: string, edit: ClipEdit) {
		if (!session) return;
		const { clip: rendered } = await inspectClip(path, session.clip.start, session.clip.track);
		if (!alive.current) return;
		// Extending a clip can use a gap. Other clips keep their positions and source ranges.
		const nextStart = Math.min(
			Infinity,
			...clips
				.filter(
					(c) =>
						c.id !== session.clip.id &&
						c.track === session.clip.track &&
						c.start >= session.clip.start,
				)
				.map((c) => c.start),
		);
		const outMs = Math.min(rendered.sourceMs, nextStart - session.clip.start);
		const changed = {
			...session.clip,
			path,
			edit,
			inMs: 0,
			outMs,
			sourceMs: rendered.sourceMs,
			hasAudio: rendered.hasAudio,
		};
		commit(clips.map((c) => (c.id === changed.id ? changed : c)));
		if (outMs < rendered.sourceMs)
			toast.info(
				label(
					"Klip sonraki klibin başında kırpıldı. Boşluk açarak kenarını uzatabilirsin.",
					"The next clip limits this edit. Make room to extend its edge.",
				),
			);
		setSelected(changed.id);
		setSession(null);
	}
	const end = sequenceEnd(clips);
	const videoCount = Math.max(sequence.videoTracks ?? 2, ...clips.map((c) => c.track + 1));
	const audioCount = Math.max(sequence.audioTracks ?? 1, ...clips.map((c) => -c.track));
	const tracks = [
		...Array.from({ length: videoCount }, (_, i) => videoCount - 1 - i),
		...Array.from({ length: audioCount }, (_, i) => -i - 1),
	];
	const extent = Math.max(10000, end * 1.25, end + 2000);
	const scale = Math.max(0.00001, (width - 54) / extent) * zoom;
	const seek = useCallback(
		(ms: number) => {
			clock.current = Math.min(end, Math.max(0, ms));
			setTime(clock.current);
			onTime(clock.current);
		},
		[end, onTime],
	);
	useEffect(() => {
		seek(clock.current);
	}, [seek]);
	useEffect(() => {
		if (!playing) return;
		const origin = performance.now() - clock.current;
		let frame = 0;
		function tick() {
			seek(performance.now() - origin);
			if (clock.current >= end) setPlaying(false);
			else frame = requestAnimationFrame(tick);
		}
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [playing, end, seek]);
	useEffect(() => {
		alive.current = true;
		const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
		if (timeline.current) observer.observe(timeline.current);
		const stop = window.electronAPI.onSequenceExportProgress(setProgress);
		return () => {
			alive.current = false;
			observer.disconnect();
			stop();
		};
	}, []);
	const failPreview = useCallback((message: string) => {
		setPlaying(false);
		setPreviewError(message);
	}, []);
	function commit(
		next: SequenceClip[],
		settings: Partial<
			Pick<
				Sequence,
				"fps" | "videoTracks" | "audioTracks" | "width" | "height" | "output" | "fades"
			>
		> = {},
	) {
		const value = { ...baseSequence(), clips: next, ...settings };
		if (!validSequence(value)) {
			toast.error(label("Klip sınırı veya süresi geçersiz.", "Invalid clip count or duration."));
			return;
		}
		setPlaying(false);
		setPreviewError("");
		past.current = [...past.current.slice(-79), baseSequence()];
		future.current = [];
		onChange(value);
	}
	function history(redo: boolean) {
		const from = redo ? future.current : past.current,
			to = redo ? past.current : future.current;
		const next = from.pop();
		if (next) {
			to.push(sequence);
			setPlaying(false);
			setPreviewError("");
			onChange(next);
		}
	}
	function toggle() {
		if (!end) return;
		if (clock.current >= end) seek(0);
		setPlaying((v) => !v);
	}
	function split() {
		const at = Math.round(clock.current);
		const c = selected ?? [...clips].sort((a, b) => b.track - a.track).find((c) => activeAt(c, at));
		if (!c || at <= c.start || at >= clipEnd(c)) return;
		const cut = c.inMs + at - c.start;
		commit(
			clips.flatMap((item) =>
				item.id !== c.id
					? [item]
					: [
							{ ...item, outMs: cut },
							{ ...item, id: crypto.randomUUID(), start: at, inMs: cut },
						],
			),
		);
	}
	function duplicate() {
		if (!selected) return;
		const copy = {
			...selected,
			id: crypto.randomUUID(),
			start: sequenceEnd(clips.filter((c) => c.track === selected.track)),
		};
		commit([...clips, copy]);
		setSelected(copy.id);
	}
	function closeGap() {
		if (!selected) return;
		const previousEnd = sequenceEnd(
			clips.filter((c) => c.track === selected.track && clipEnd(c) <= selected.start),
		);
		const gap = selected.start - previousEnd;
		if (gap > 0)
			commit(
				clips.map((c) =>
					c.track === selected.track && c.start >= selected.start
						? { ...c, start: c.start - gap }
						: c,
				),
			);
	}
	function detach() {
		if (!selected?.hasAudio || selected.track < 0 || !selected.volume) return;
		const track = Array.from({ length: 8 }, (_, i) => -i - 1).find(
			(t) =>
				!clips.some(
					(c) => c.track === t && c.start < clipEnd(selected) && clipEnd(c) > selected.start,
				),
		);
		if (track === undefined) {
			toast.error(label("Boş ses kanalı yok.", "No free audio track."));
			return;
		}
		const audio = { ...selected, id: crypto.randomUUID(), track };
		commit([...clips.map((c) => (c.id === selected.id ? { ...c, volume: 0 } : c)), audio]);
		setSelected(audio.id);
	}
	async function add(paths?: string[], start = end, track = 0) {
		if (gate.current) return;
		gate.current = true;
		setBusy("import");
		setPlaying(false);
		try {
			const files = paths ?? (await window.electronAPI.pickSequenceMedia());
			if (!files.length) return;
			let next = clips,
				last = "";
			for (const file of files) {
				const { clip } = await inspectClip(file, start, track);
				next = placeClip(next, clip);
				start = clipEnd(clip);
				last = clip.id;
			}
			if (alive.current) {
				commit(next);
				setSelected(last);
			}
		} catch (e) {
			if (alive.current) toast.error(String(e));
		} finally {
			gate.current = false;
			if (alive.current) setBusy(null);
		}
	}
	async function relink() {
		if (!selected || gate.current) return;
		gate.current = true;
		setBusy("import");
		setPlaying(false);
		try {
			const [file] = await window.electronAPI.pickSequenceMedia();
			if (!file) return;
			const { clip: replacement, width } = await inspectClip(file, 0, 0);
			const affected = clips.filter((c) => c.path === selected.path);
			if (
				affected.some(
					(c) =>
						!!c.still !== !!replacement.still ||
						c.outMs > replacement.sourceMs ||
						(c.track >= 0 && !width) ||
						(c.track < 0 && !replacement.hasAudio),
				)
			) {
				throw new Error(
					label(
						"Dosya bu kliplerin görüntü, ses veya süre gereksinimini karşılamıyor.",
						"The file does not cover the video, audio or duration of these clips.",
					),
				);
			}
			if (alive.current)
				commit(
					clips.map((c) =>
						c.path === selected.path
							? {
									...c,
									path: file,
									name: replacement.name,
									sourceMs: replacement.sourceMs,
									hasAudio: replacement.hasAudio,
								}
							: c,
					),
				);
		} catch (e) {
			if (alive.current) toast.error(String(e));
		} finally {
			gate.current = false;
			if (alive.current) setBusy(null);
		}
	}
	async function exportVideo(output: SequenceOutput, fps: 30 | 60) {
		setExportSetup(false);
		if (!end || gate.current) return;
		gate.current = true;
		setBusy("export");
		setProgress(0);
		setPlaying(false);
		try {
			const next = { ...sequence, output, fps };
			if (!validSequence(next)) throw new Error("Invalid export settings");
			if (JSON.stringify(sequence.output) !== JSON.stringify(output) || fps !== sequence.fps)
				commit(clips, { output, fps });
			const saved = await window.electronAPI.exportSequence(next);
			if (saved) toast.success(label("Video kaydedildi", "Video saved"), { description: saved });
		} catch (e) {
			toast.error(String(e));
		} finally {
			gate.current = false;
			if (alive.current) setBusy(null);
		}
	}
	function remove() {
		if (selected) {
			commit(clips.filter((c) => c.id !== selected.id));
			setSelected(null);
		}
	}
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (
				session ||
				gate.current ||
				document.querySelector('[role="dialog"]') ||
				(e.target as HTMLElement)?.closest("input,select,textarea,[contenteditable=true]")
			)
				return;
			const mod = e.ctrlKey || e.metaKey;
			let handled = true;
			if (mod && e.key.toLowerCase() === "d") duplicate();
			else if (mod && e.key.toLowerCase() === "z") history(e.shiftKey);
			else if (mod && e.key.toLowerCase() === "y") history(true);
			else if (mod && e.key.toLowerCase() === "e") {
				setPlaying(false);
				setExportSetup(true);
			} else if (e.code === "Space") toggle();
			else if (e.key === "Delete" || e.key === "Backspace") remove();
			else if (e.key.toLowerCase() === "s" && !mod) split();
			else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
				setPlaying(false);
				seek(
					clock.current +
						(e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 1000 : 1000 / (sequence.fps ?? 30)),
				);
			} else handled = false;
			if (handled) {
				e.preventDefault();
				e.stopPropagation();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	});
	return (
		<section className="seq-workspace">
			<header className="seq-top">
				<strong>{label("Video düzenleme", "Video editing")}</strong>
				<span>
					{name}
					{dirty ? " •" : ""}
				</span>
				{!session && (
					<button
						disabled={!!busy}
						onClick={() => {
							setPlaying(false);
							void onRecord();
						}}
					>
						{label("Ekran kaydı ekle", "Add screen recording")}
					</button>
				)}
				<button disabled={!!busy || !!session} onClick={onOpen}>
					{label("Proje aç", "Open project")}
				</button>
				<button onClick={onSave}>
					<Save size={15} />
					{label("Kaydet", "Save")}
				</button>
				<select
					aria-label={label("Sahne oranı", "Canvas ratio")}
					disabled={!!session || !!busy}
					value={`${sequence.width}:${sequence.height}`}
					onChange={(e) => {
						const [w, h] = e.target.value.split(":").map(Number);
						commit(clips, fitCustomSizeToRatio(sequence.width, sequence.height, w / h));
					}}
				>
					<option value={`${sequence.width}:${sequence.height}`}>
						{sequence.width} × {sequence.height}
					</option>
					{["16:9", "9:16", "1:1", "4:3", "4:5"].map((r) => (
						<option key={r} value={r}>
							{r}
						</option>
					))}
				</select>
				<button
					className="seq-primary"
					disabled={!end || !!busy || !!session}
					onClick={() => {
						setPlaying(false);
						setExportSetup(true);
					}}
				>
					<Download size={15} />
					{busy === "export" ? Math.round(progress * 100) + "%" : label("Dışa aktar", "Export")}
				</button>
				{busy === "export" && (
					<button onClick={() => window.electronAPI.cancelSequenceExport()}>
						{label("İptal", "Cancel")}
					</button>
				)}
			</header>
			{session ? (
				<div className="seq-clip-pane">
					{renderEditor({
						initial: session.initial,
						clip: session.clip,
						tool: session.tool,
						onDraft: draft,
						onApply: applyEdit,
						onCancel: cancelEdit,
						onSave,
					})}
				</div>
			) : (
				<>
					<div
						className="seq-effect-tools"
						role="toolbar"
						aria-label={label("Klip araçları", "Clip tools")}
					>
						<details className="seq-transform seq-fades">
							<summary>{label("Açılış ve kapanış", "Fades")}</summary>
							<div>
								{(["fadeInMs", "fadeOutMs"] as const).map((key, i) => (
									<label key={key}>
										{i ? label("Kapanış", "Fade out") : label("Açılış", "Fade in")}
										<select
											value={sequence.fades?.[key] ?? 0}
											disabled={!!busy}
											onChange={(e) =>
												commit(clips, {
													fades: { ...(sequence.fades ?? NO_FADES), [key]: Number(e.target.value) },
												})
											}
										>
											{FADE_CHOICES_MS.map((ms) => (
												<option key={ms} value={ms}>
													{ms / 1000} s
												</option>
											))}
										</select>
									</label>
								))}
							</div>
						</details>
						<button
							data-testid="add-sequence-graphic"
							disabled={!!busy}
							onClick={() => {
								setPlaying(false);
								setDrawing({});
							}}
						>
							{label("Başlık katmanı", "Title layer")}
						</button>
						{(
							[
								["appearance", label("Görünüm", "Appearance")],
								["zoom", "Zoom"],
								["speed", label("Hız", "Speed")],
								["text", label("Metin ve görsel", "Text and graphics")],
								["blur", label("Bulanıklaştır", "Blur")],
								["captions", label("Altyazı", "Captions")],
								["ai", "AI"],
							] as const
						).map(([tool, title]) => (
							<button
								key={tool}
								data-testid={`sequence-tool-${tool}`}
								disabled={!target || target.track < 0 || target.still || !!busy}
								onClick={() => openTool(tool)}
							>
								{title}
							</button>
						))}
						<button
							disabled={!!busy}
							onClick={() => {
								setPlaying(false);
								onVoiceover(insertVoice);
							}}
						>
							{label("Seslendirme", "Voiceover")}
						</button>
					</div>
					<SequenceMonitor
						sequence={sequence}
						time={Math.min(time, Math.max(0, end - 1))}
						playing={playing}
						onError={failPreview}
					/>
					{previewError && (
						<div role="alert">
							{label("Medya açılamadı", "Cannot play media")} · {previewError}
						</div>
					)}
					<div className="seq-transport">
						<PlaybackControls
							isPlaying={playing}
							currentTime={time / 1000}
							duration={end / 1000}
							onTogglePlayPause={toggle}
							onSeek={(s) => {
								setPlaying(false);
								seek(s * 1000);
							}}
						/>
					</div>
				</>
			)}
			<div className={session ? "seq-timeline seq-reference" : "seq-timeline"} ref={timeline}>
				{!session && (
					<fieldset disabled={!!busy} className="seq-tools">
						<button onClick={() => add()}>
							<Film size={15} />
							{label("Medya ekle", "Add media")}
						</button>
						<button
							onClick={() => history(false)}
							disabled={!past.current.length}
							aria-label={label("Geri al", "Undo")}
						>
							<Undo2 size={15} />
						</button>
						<button
							onClick={() => history(true)}
							disabled={!future.current.length}
							aria-label={label("Yinele", "Redo")}
						>
							<Redo2 size={15} />
						</button>
						<button onClick={split}>
							<Scissors size={15} />
							{label("Böl", "Split")}
						</button>
						<button disabled={!selected} onClick={remove} aria-label={label("Sil", "Delete")}>
							<Trash2 size={15} />
						</button>
						<button disabled={!selected} onClick={closeGap}>
							{label("Önceki boşluğu kapat", "Close preceding gap")}
						</button>
						<button
							disabled={!selected?.hasAudio || selected.track < 0 || !selected.volume}
							onClick={detach}
						>
							{label("Sesi ayır", "Detach audio")}
						</button>
						<button aria-pressed={snap} onClick={() => setSnap(!snap)}>
							<Magnet size={15} />
							{label("Mıknatıs", "Snap")}
						</button>
						<button
							disabled={videoCount >= 8}
							onClick={() => commit(clips, { videoTracks: videoCount + 1 })}
						>
							+ V
						</button>
						<button
							disabled={audioCount >= 8}
							onClick={() => commit(clips, { audioTracks: audioCount + 1 })}
						>
							+ A
						</button>
						<label>
							{label("Ölçek", "Zoom")}{" "}
							<input
								type="range"
								min={0.5}
								max={12}
								step={0.25}
								value={zoom}
								onChange={(e) => setZoom(Number(e.target.value))}
							/>
						</label>
					</fieldset>
				)}
				<SequenceTracks
					clips={clips}
					time={time}
					extent={Math.max(extent, width / scale)}
					scale={scale}
					selected={selectedId}
					tracks={tracks}
					disabled={!!busy || !!session}
					tr={tr}
					snap={snap}
					onSelect={setSelected}
					onSeek={seek}
					onPause={() => setPlaying(false)}
					onPlace={(c) => commit(placeClip(clips, c))}
					onEdit={(id) => {
						const clip = clips.find((c) => c.id === id);
						if (clip?.graphic && !session && !busy) {
							setPlaying(false);
							setDrawing({ clip });
							return;
						}
						if (clip && !clip.still && clip.track >= 0 && !session && !busy) {
							setPlaying(false);
							setSession({ clip, tool: "appearance", initial: clipProject(clip, sequence, time) });
						}
					}}
					onDropFiles={(files, start, track) => void add(files, start, track)}
				/>
				{selected && !session && (
					<fieldset className="seq-details" disabled={!!busy}>
						<strong>{selected.name}</strong>
						<label>
							{label("Başlangıç (sn)", "Start (s)")}{" "}
							<input
								key={selected.id + ":" + selected.start}
								type="number"
								min="0"
								step=".001"
								defaultValue={selected.start / 1000}
								onKeyDown={(e) => {
									if (e.key === "Enter") e.currentTarget.blur();
								}}
								onBlur={(e) => {
									const ms = Math.round(e.currentTarget.valueAsNumber * 1000);
									if (Number.isSafeInteger(ms) && ms >= 0 && ms !== selected.start)
										commit(placeClip(clips, { ...selected, start: ms }));
								}}
							/>
						</label>
						{selected.hasAudio && (
							<label>
								{label("Ses düzeyi", "Volume")}{" "}
								<input
									type="number"
									min={0}
									max={100}
									key={selected.id + "gain" + selected.volume}
									defaultValue={Math.round(selected.volume * 100)}
									onBlur={(e) => {
										const gain = e.currentTarget.valueAsNumber / 100;
										if (Number.isFinite(gain) && gain >= 0 && gain <= 1 && gain !== selected.volume)
											commit(clips.map((c) => (c.id === selected.id ? { ...c, volume: gain } : c)));
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter") e.currentTarget.blur();
									}}
								/>
								%
							</label>
						)}
						{selected.track >= 0 && (
							<ClipTransformControls
								tr={tr}
								value={selected.transform}
								onChange={(transform) =>
									commit(clips.map((c) => (c.id === selected.id ? { ...c, transform } : c)))
								}
							/>
						)}
						{selected.graphic && (
							<button
								onClick={() => {
									setPlaying(false);
									setDrawing({ clip: selected });
								}}
							>
								{label("Katmanı düzenle", "Edit layer")}
							</button>
						)}
						<button onClick={duplicate}>{label("Çoğalt", "Duplicate")}</button>
						<button disabled={!!selected.graphic} onClick={relink}>
							{label("Kaynağı yeniden bağla", "Relink source")}
						</button>
						<span>
							{(selected.inMs / 1000).toFixed(2)} – {(selected.outMs / 1000).toFixed(2)} s
						</span>
					</fieldset>
				)}
			</div>
			{drawing && (
				<SequenceGraphicDialog
					initial={drawing.clip?.graphic}
					width={sequence.width}
					height={sequence.height}
					tr={tr}
					close={() => setDrawing(null)}
					save={saveGraphic}
				/>
			)}
			{exportSetup && (
				<SequenceExportDialog
					sequence={sequence}
					close={() => setExportSetup(false)}
					start={exportVideo}
				/>
			)}
		</section>
	);
}
