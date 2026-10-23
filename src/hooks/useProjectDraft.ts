import { useCallback, useEffect, useRef, useState } from "react";
export type DraftState = "idle" | "pending" | "saving" | "saved" | "error";
/** Debounced edits plus a periodic checkpoint during uninterrupted editing. */
export function useProjectDraft(
	snapshot: string | null,
	projectPath: string | null,
	dirty: boolean,
	getPlayhead: () => number,
) {
	const [state, setState] = useState<DraftState>("idle");
	const latest = useRef({ snapshot, projectPath, dirty, getPlayhead });
	latest.current = { snapshot, projectPath, dirty, getPlayhead };
	const mounted = useRef(false);
	const inFlight = useRef(false);
	const written = useRef("");
	const flush = useCallback(async () => {
		const input = latest.current;
		if (!mounted.current || !input.dirty || !input.snapshot || inFlight.current) return;
		const key = `${input.projectPath || ""}\n${input.snapshot}`;
		if (written.current === key) return;
		inFlight.current = true;
		setState("saving");
		try {
			const project = JSON.parse(input.snapshot);
			project.workspace = { playheadSeconds: Math.max(0, input.getPlayhead()) };
			const result = await window.electronAPI.autosaveProjectDraft(
				project,
				input.projectPath ?? undefined,
			);
			if (!result.success) throw new Error(result.message);
			written.current = key;
			if (mounted.current)
				setState(
					latest.current.snapshot === input.snapshot && latest.current.dirty
						? "saved"
						: latest.current.dirty
							? "pending"
							: "idle",
				);
		} catch {
			if (mounted.current) setState("error");
		} finally {
			inFlight.current = false;
		}
	}, []);
	useEffect(() => {
		mounted.current = true;
		const interval = window.setInterval(() => {
			void flush();
		}, 10000);
		const onBlur = () => {
			void flush();
		};
		window.addEventListener("blur", onBlur);
		return () => {
			mounted.current = false;
			window.clearInterval(interval);
			window.removeEventListener("blur", onBlur);
		};
	}, [flush]);
	useEffect(() => {
		if (!dirty || !snapshot) {
			written.current = "";
			setState("idle");
			return;
		}
		setState("pending");
		const timer = window.setTimeout(() => {
			void flush();
		}, 2500);
		return () => window.clearTimeout(timer);
	}, [snapshot, projectPath, dirty, flush]);
	return { state, retry: flush };
}
