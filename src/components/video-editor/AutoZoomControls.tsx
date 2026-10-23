import { WandSparkles } from "lucide-react";
import { useScopedT } from "../../contexts/I18nContext";
import type { AutoZoomDensity, AutoZoomMode } from "./autoZoom";
import type { AutoZoomSettings } from "./autoZoomSettings";
import { ZOOM_DEPTH_SCALES, type ZoomDepth } from "./types";

interface AutoZoomControlsProps {
  settings: AutoZoomSettings;
  onChange: (settings: AutoZoomSettings) => void;
  /** Rebuilds the zooms from the recorded clicks; undefined when there is no click data. */
  onRegenerate?: () => void;
}

const MODES: AutoZoomMode[] = ["off", "clicks", "clicksAndPauses"];
const DENSITIES: AutoZoomDensity[] = ["low", "normal", "high"];
const DEPTHS: ZoomDepth[] = [1, 2, 3, 4, 5, 6];

function Segmented<T extends string | number>({
  options,
  value,
  label,
  onSelect,
  testId,
  columns,
}: {
  options: T[];
  value: T;
  label: (option: T) => string;
  onSelect: (option: T) => void;
  testId: string;
  columns: string;
}) {
  return (
    <div className={`grid ${columns} gap-1`} role="radiogroup" data-testid={testId}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          data-value={option}
          onClick={() => onSelect(option)}
          className={`truncate rounded-md border px-1 py-1.5 text-[11px] transition-colors ${
            option === value
              ? "border-[#2563EB] bg-[#2563EB] text-white"
              : "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
          }`}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );
}

/** Preferences for the zooms a new recording gets from its clicks. */
export function AutoZoomControls({ settings, onChange, onRegenerate }: AutoZoomControlsProps) {
  const t = useScopedT("settings");
  const off = settings.mode === "off";
  return (
    <div className="mb-4 rounded-xl border border-white/5 bg-white/[0.02] p-3" data-testid="auto-zoom-settings">
      <div className="mb-2 flex items-center gap-2">
        <WandSparkles size={14} className="text-[#2563EB]" />
        <span className="text-sm font-medium text-slate-200">{t("autoZoom.title")}</span>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-slate-400">{t("autoZoom.description")}</p>
      <Segmented
        testId="auto-zoom-mode"
        columns="grid-cols-3"
        options={MODES}
        value={settings.mode}
        label={(mode) => t(`autoZoom.mode.${mode}`)}
        onSelect={(mode) => onChange({ ...settings, mode })}
      />
      <div className={off ? "pointer-events-none opacity-40" : ""}>
        <span className="mb-1 mt-3 block text-[11px] font-medium text-slate-300">{t("autoZoom.density.label")}</span>
        <Segmented
          testId="auto-zoom-density"
          columns="grid-cols-3"
          options={DENSITIES}
          value={settings.density}
          label={(density) => t(`autoZoom.density.${density}`)}
          onSelect={(density) => onChange({ ...settings, density })}
        />
        <span className="mb-1 mt-3 block text-[11px] font-medium text-slate-300">{t("autoZoom.depth")}</span>
        <Segmented
          testId="auto-zoom-depth"
          columns="grid-cols-6"
          options={DEPTHS}
          value={settings.depth}
          label={(depth) => `${ZOOM_DEPTH_SCALES[depth]}×`}
          onSelect={(depth) => onChange({ ...settings, depth })}
        />
        <button
          type="button"
          data-testid="auto-zoom-regenerate"
          disabled={!onRegenerate}
          onClick={onRegenerate}
          className="mt-3 w-full rounded-md border border-white/10 bg-white/5 py-1.5 text-[11px] text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("autoZoom.regenerate")}
        </button>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">
          {onRegenerate ? t("autoZoom.regenerateHint") : t("autoZoom.noClickData")}
        </p>
      </div>
    </div>
  );
}
