import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useI18n, useScopedT } from "../../contexts/I18nContext";
import {
  DEFAULT_HIGHLIGHT_COLOR,
  ENTER_ANIMATIONS,
  EXIT_ANIMATIONS,
  MAX_ANIMATION_MS,
  MIN_ANIMATION_MS,
  TEXT_STYLE_PRESETS,
  type TextStylePreset,
} from "./annotationEffects";
import {
  type AnnotationAnimation,
  type AnnotationEnterAnimation,
  type AnnotationExitAnimation,
  type AnnotationTextShadow,
  type AnnotationTextStyle,
  DEFAULT_ANNOTATION_ANIMATION,
} from "./types";

const selectClass = "h-8 bg-white/5 border-white/10 text-slate-200 text-xs";
const labelClass = "text-xs font-medium text-slate-200 mb-1.5 block";

/** One-click looks; applying one changes style and animation, never the text. */
export function TextPresetPicker({ onApply }: { onApply: (preset: TextStylePreset) => void }) {
  const t = useScopedT("editor");
  const { locale } = useI18n();
  return (
    <div>
      <span className={labelClass}>{t("annotations.effects.presets", "Ready-made styles")}</span>
      <div className="grid grid-cols-3 gap-1.5">
        {TEXT_STYLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            data-testid={`text-preset-${preset.id}`}
            onClick={() => onApply(preset)}
            className="h-9 truncate rounded-md border border-white/10 px-1.5 text-[11px] hover:border-[#2563EB]"
            style={{
              color: preset.style.color,
              background: preset.style.backgroundColor && preset.style.backgroundColor !== "transparent" ? preset.style.backgroundColor : "#2a2a33",
              fontWeight: preset.style.fontWeight,
              WebkitTextStroke: preset.style.strokeWidth ? `1px ${preset.style.strokeColor}` : undefined,
            }}
          >
            {locale === "tr" ? preset.tr : preset.en}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-400">
        {t("annotations.effects.markupHint", "Tip: **bold** and ==highlight== format single words.")}
      </p>
    </div>
  );
}

interface TextEffectsControlsProps {
  style: AnnotationTextStyle;
  animation: AnnotationAnimation | undefined;
  onStyleChange: (style: Partial<AnnotationTextStyle>) => void;
  onAnimationChange?: (animation: AnnotationAnimation | undefined) => void;
}

/** Shadow, outline, highlight colour and enter/exit animation of a text. */
export function TextEffectsControls({ style, animation, onStyleChange, onAnimationChange }: TextEffectsControlsProps) {
  const t = useScopedT("editor");
  const current = animation ?? DEFAULT_ANNOTATION_ANIMATION;
  const updateAnimation = (patch: Partial<AnnotationAnimation>) => {
    const next = { ...current, ...patch };
    onAnimationChange?.(next.enter === "none" && next.exit === "none" ? undefined : next);
  };
  const strokeWidth = style.strokeWidth ?? 0;

  return (
    <div className="space-y-3 border-t border-white/10 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={labelClass}>{t("annotations.effects.shadow", "Shadow")}</span>
          <Select value={style.textShadow ?? "none"} onValueChange={(value) => onStyleChange({ textShadow: value as AnnotationTextShadow })}>
            <SelectTrigger className={selectClass} aria-label={t("annotations.effects.shadow", "Shadow")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("annotations.effects.none", "None")}</SelectItem>
              <SelectItem value="soft">{t("annotations.effects.soft", "Soft")}</SelectItem>
              <SelectItem value="strong">{t("annotations.effects.strong", "Strong")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className={labelClass}>{t("annotations.effects.highlightColor", "Highlight colour")}</span>
          <input
            type="color"
            aria-label={t("annotations.effects.highlightColor", "Highlight colour")}
            value={style.highlightColor || DEFAULT_HIGHLIGHT_COLOR}
            onChange={(event) => onStyleChange({ highlightColor: event.target.value })}
            className="h-8 w-full cursor-pointer rounded-md border border-white/10 bg-white/5 p-1"
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-200">{t("annotations.effects.outline", "Outline")}</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-slate-400">{strokeWidth}px</span>
            <input
              type="color"
              aria-label={t("annotations.effects.outlineColor", "Outline colour")}
              value={style.strokeColor || "#000000"}
              onChange={(event) => onStyleChange({ strokeColor: event.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-white/5 p-0.5"
            />
          </div>
        </div>
        <Slider
          aria-label={t("annotations.effects.outline", "Outline")}
          value={[strokeWidth]}
          min={0}
          max={8}
          step={1}
          onValueChange={([value]) => onStyleChange({ strokeWidth: value, strokeColor: style.strokeColor || "#000000" })}
        />
      </div>

      {onAnimationChange && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className={labelClass}>{t("annotations.effects.enter", "Enter")}</span>
              <Select value={current.enter} onValueChange={(value) => updateAnimation({ enter: value as AnnotationEnterAnimation })}>
                <SelectTrigger className={selectClass} aria-label={t("annotations.effects.enter", "Enter")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTER_ANIMATIONS.map((id) => (
                    <SelectItem key={id} value={id}>{t(`annotations.effects.animations.${id}`, id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className={labelClass}>{t("annotations.effects.exit", "Exit")}</span>
              <Select value={current.exit} onValueChange={(value) => updateAnimation({ exit: value as AnnotationExitAnimation })}>
                <SelectTrigger className={selectClass} aria-label={t("annotations.effects.exit", "Exit")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXIT_ANIMATIONS.map((id) => (
                    <SelectItem key={id} value={id}>{t(`annotations.effects.animations.${id}`, id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(current.enter !== "none" || current.exit !== "none") && (
            <div>
              <div className="mb-1.5 flex justify-between">
                <span className="text-xs font-medium text-slate-200">{t("annotations.effects.duration", "Animation length")}</span>
                <span className="text-[11px] tabular-nums text-slate-400">{(current.durationMs / 1000).toFixed(1)} s</span>
              </div>
              <Slider
                aria-label={t("annotations.effects.duration", "Animation length")}
                value={[current.durationMs]}
                min={MIN_ANIMATION_MS}
                max={MAX_ANIMATION_MS}
                step={50}
                onValueChange={([value]) => updateAnimation({ durationMs: value })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
