import { Captions, LoaderCircle } from "lucide-react";
import { useScopedT } from "../../contexts/I18nContext";
import type { AutoCaptionsState } from "./useAutoCaptions";

type Language = AutoCaptionsState["language"];

interface AutoCaptionsSectionProps {
  state: AutoCaptionsState;
  /** Captions made earlier from speech; a new run replaces them. */
  existingCount: number;
}

/** Captions from the video's own speech, recognised on this Mac (no AI agent, no upload). */
export function AutoCaptionsSection({ state, existingCount }: AutoCaptionsSectionProps) {
  const t = useScopedT("editor");
  const { language, setLanguage, stage, error, start, cancel, available } = state;
  const running = stage !== null;
  const percent = stage?.stage === "transcribing" && stage.total ? Math.round(((stage.done ?? 0) / stage.total) * 100) : null;
  const stageText =
    stage?.stage === "transcribing"
      ? t("autoCaptions.stages.transcribing", undefined, { done: stage.done ?? 0, total: stage.total ?? 0 })
      : stage?.stage === "model-download"
        ? t("autoCaptions.stages.modelDownload")
        : t("autoCaptions.stages.audio");

  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-3" data-testid="auto-captions">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
        <Captions size={14} className="text-[#2563EB]" />
        {t("autoCaptions.title")}
      </div>
      <p className="text-[11px] leading-snug text-slate-400">{t("autoCaptions.description")}</p>
      <label className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
        {t("autoCaptions.language")}
        <select
          data-testid="auto-captions-language"
          value={language}
          disabled={running}
          onChange={(event) => setLanguage(event.target.value as Language)}
          className="rounded bg-white/5 px-2 py-1 text-[11px] text-slate-200 outline-none"
        >
          <option value="tr">{t("autoCaptions.languages.tr")}</option>
          <option value="en">{t("autoCaptions.languages.en")}</option>
        </select>
      </label>
      {running ? (
        <div className="space-y-1.5" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <LoaderCircle size={12} className="animate-spin" />
            <span data-testid="auto-captions-stage">{stageText}</span>
          </div>
          <div className="h-1 overflow-hidden rounded bg-white/10">
            <div className="h-full bg-[#2563EB] transition-all" style={{ width: `${percent ?? 8}%` }} />
          </div>
          <button type="button" onClick={cancel} data-testid="auto-captions-cancel" className="w-full rounded-md border border-white/10 py-1.5 text-[11px] text-slate-300 hover:bg-white/5">
            {t("autoCaptions.cancel")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="auto-captions-generate"
          disabled={!available}
          onClick={() => void start()}
          className="w-full rounded-lg bg-[#2563EB]/20 p-2.5 text-left text-xs text-blue-100 hover:bg-[#2563EB]/30 disabled:opacity-40"
        >
          {t("autoCaptions.generate")}
        </button>
      )}
      {existingCount > 0 && !running && (
        <p className="text-[10px] text-slate-500">{t("autoCaptions.replaceNote", undefined, { count: existingCount })}</p>
      )}
      {error && (
        <p className="text-[11px] text-amber-300" role="alert" data-testid="auto-captions-error">
          {error}
        </p>
      )}
    </div>
  );
}
