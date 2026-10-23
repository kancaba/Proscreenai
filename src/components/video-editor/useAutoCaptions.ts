import { useEffect, useRef, useState } from "react";
import { buildCaptionCues, type CaptionCue, captionsOutsideTrims } from "@/lib/captions/captionCues";
import { useI18n, useScopedT } from "../../contexts/I18nContext";
import type { TrimRegion } from "./types";

type Language = "tr" | "en";
type Stage = { stage: "audio" | "model-download" | "transcribing"; done?: number; total?: number };

export type AutoCaptionsState = ReturnType<typeof useAutoCaptions>;

/**
 * Runs speech-to-captions for the editor. Lives in the editor (not the panel) so switching
 * inspector tabs does not stop a running transcription; leaving the video does.
 */
export function useAutoCaptions(videoSourcePath: string | null, trims: TrimRegion[], onApply: (cues: CaptionCue[]) => void) {
  const t = useScopedT("editor");
  const { locale } = useI18n();
  const [language, setLanguage] = useState<Language>(locale === "en" ? "en" : "tr");
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState("");
  const requestRef = useRef<string | null>(null);
  const latest = useRef({ trims, onApply });
  latest.current = { trims, onApply };

  useEffect(() => {
    return window.electronAPI.onTranscriptionProgress((progress) => {
      if (progress.requestId === requestRef.current) setStage(progress);
    });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs again (and cancels) when the video changes
  useEffect(() => {
    setError("");
    return () => {
      if (requestRef.current) void window.electronAPI.cancelTranscription(requestRef.current);
      requestRef.current = null;
      setStage(null);
    };
  }, [videoSourcePath]);

  const start = async () => {
    if (!videoSourcePath || requestRef.current) return;
    const requestId = `captions-${Date.now()}`;
    requestRef.current = requestId;
    setError("");
    setStage({ stage: "audio" });
    try {
      const result = await window.electronAPI.transcribeVideo({ videoPath: videoSourcePath, language, requestId });
      if (requestRef.current !== requestId) return;
      if (!result.success) {
        if (result.code !== "cancelled") setError(t(`autoCaptions.errors.${result.code}`, t("autoCaptions.errors.failed")));
        return;
      }
      const cues = captionsOutsideTrims(buildCaptionCues(result.words, { locale: language }), latest.current.trims);
      if (cues.length === 0) {
        setError(t("autoCaptions.errors.no-speech"));
        return;
      }
      latest.current.onApply(cues);
    } catch {
      if (requestRef.current === requestId) setError(t("autoCaptions.errors.failed"));
    } finally {
      if (requestRef.current === requestId) {
        requestRef.current = null;
        setStage(null);
      }
    }
  };

  const cancel = () => {
    if (requestRef.current) void window.electronAPI.cancelTranscription(requestRef.current);
  };

  return { language, setLanguage, stage, error, start, cancel, available: Boolean(videoSourcePath) };
}
