import { Captions, LoaderCircle } from "lucide-react";
import type { CSSProperties } from "react";
import { useI18n, useScopedT } from "../../contexts/I18nContext";
import { getStroke, getTextShadow } from "./annotationEffects";
import { CAPTION_STYLES, type CaptionStyleChoice, captionLook, DEFAULT_BRAND_COLOR } from "./captionStyles";
import type { AutoCaptionsState } from "./useAutoCaptions";

type Language = AutoCaptionsState["language"];

interface AutoCaptionsSectionProps {
  state: AutoCaptionsState;
  /** Captions made earlier from speech; a new run replaces them. */
  existingCount: number;
  /** The look the captions have (or new ones will get). */
  captionStyle: CaptionStyleChoice;
  onCaptionStyleChange: (choice: CaptionStyleChoice) => void;
}

/** A small "Aa" drawn the way a caption with this look is drawn in the preview and the export. */
function lookSample(choice: CaptionStyleChoice): CSSProperties {
  const look = captionLook(choice);
  const stroke = getStroke({ ...look, fontSize: 0, fontFamily: "", fontStyle: "normal", textDecoration: "none", textAlign: "center" });
  const shadow = getTextShadow(look.textShadow);
  return {
    color: look.color,
    backgroundColor: look.backgroundColor,
    fontWeight: look.fontWeight,
    padding: "0.1em 0.3em",
    borderRadius: 4,
    // The sample is small, so the outline is drawn thinner than on the video.
    ...(stroke ? { WebkitTextStroke: `${Math.min(3, stroke.width)}px ${stroke.color}`, paintOrder: "stroke fill" } : {}),
    ...(shadow ? { textShadow: `0 ${shadow.offsetY / 2}px ${shadow.blur / 2}px ${shadow.color}` } : {}),
  };
}

/** Captions from the video's own speech, recognised on this Mac (no AI agent, no upload). */
export function AutoCaptionsSection({ state, existingCount, captionStyle, onCaptionStyleChange }: AutoCaptionsSectionProps) {
  const t = useScopedT("editor");
  const { locale } = useI18n();
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
      <div className="space-y-1.5 border-t border-white/5 pt-2" data-testid="caption-styles">
        <p className="text-[11px] text-slate-300">{t("autoCaptions.style.title")}</p>
        <div role="radiogroup" aria-label={t("autoCaptions.style.title")} className="grid grid-cols-3 gap-1.5">
          {CAPTION_STYLES.map((style) => {
            const choice: CaptionStyleChoice = style.id === "brand" ? { id: "brand", brandColor: captionStyle.brandColor ?? DEFAULT_BRAND_COLOR } : { id: style.id };
            const selected = captionStyle.id === style.id;
            return (
              <button
                key={style.id}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`caption-style-${style.id}`}
                onClick={() => onCaptionStyleChange(choice)}
                className={`flex flex-col items-center gap-1 rounded-md border p-1.5 text-[10px] ${selected ? "border-[#2563EB] bg-[#2563EB]/15 text-white" : "border-white/5 bg-white/[0.03] text-slate-400 hover:border-white/15"}`}
              >
                {/* A video-like backdrop so light and see-through looks read as they will. */}
                <span className="flex h-8 w-full items-center justify-center rounded bg-gradient-to-br from-slate-500 via-slate-700 to-slate-900 text-[13px]">
                  {/* Vurgulu differs from Sinema in its highlighted words, so the sample shows one. */}
                  <span style={lookSample(choice)}>A{style.id === "highlight" ? <span style={{ color: captionLook(choice).highlightColor }}>a</span> : "a"}</span>
                </span>
                {locale === "tr" ? style.tr : style.en}
              </button>
            );
          })}
        </div>
        {captionStyle.id === "brand" && (
          <label className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
            {t("autoCaptions.style.brandColor")}
            <input
              type="color"
              data-testid="caption-brand-color"
              value={captionStyle.brandColor ?? DEFAULT_BRAND_COLOR}
              onChange={(event) => onCaptionStyleChange({ id: "brand", brandColor: event.target.value })}
              className="h-6 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
            />
          </label>
        )}
        <p className="text-[10px] leading-snug text-slate-500">{t("autoCaptions.style.hint")} {captionStyle.id === "highlight" ? t("autoCaptions.style.highlightTip") : ""}</p>
      </div>
      {error && (
        <p className="text-[11px] text-amber-300" role="alert" data-testid="auto-captions-error">
          {error}
        </p>
      )}
    </div>
  );
}
