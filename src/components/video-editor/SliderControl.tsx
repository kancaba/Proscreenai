import { useState, useRef, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { RotateCcw } from "lucide-react";

interface SliderControlProps {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
  parseInput: (text: string) => number | null;
  accentColor?: "purple" | "blue";
}

export function SliderControl({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  onChange,
  formatValue,
  parseInput,
  accentColor = "blue",
}: SliderControlProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const editOpen = useRef(false);
  const isModified = value !== defaultValue;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitEdit = () => {
    if (!editOpen.current) return;
    editOpen.current = false;
    const parsed = parseInput(editText);
    if (parsed != null && !isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    editOpen.current = false;
    setEditing(false);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <div className="flex min-w-0 items-center gap-1">
          <div title={label} className="min-w-0 truncate text-[10px] font-medium text-slate-300">{label}</div>
          {isModified && (
            <button
              type="button"
              onClick={() => onChange(defaultValue)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              title={`${label} · Varsayılana döndür`} aria-label={`${label} · Varsayılana döndür`}
            >
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
        {editing ? (
          <input
            ref={inputRef}
            aria-label={`${label} değeri`}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            className="w-14 shrink-0 text-[10px] text-right font-mono bg-white/10 border border-white/20 rounded px-1 py-0 text-slate-200 outline-none focus:border-white/40"
          />
        ) : (
          <button
            type="button"
            aria-label={`${label} değerini düzenle`}
            className="shrink-0 whitespace-nowrap text-[10px] text-slate-500 font-mono cursor-text hover:text-slate-300 transition-colors"
            onClick={() => {
              editOpen.current = true;
              setEditText(formatValue(value));
              setEditing(true);
            }}
          >
            {formatValue(value)}
          </button>
        )}
      </div>
      <Slider
        aria-label={label}
        value={[value]}
        onValueChange={(values) => onChange(values[0])}
        min={min}
        max={max}
        step={step}
        className={
          accentColor === "purple"
            ? "w-full [&_[role=slider]]:bg-[#8b5cf6] [&_[role=slider]]:border-[#8b5cf6] [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            : "w-full [&_[role=slider]]:bg-[#2563EB] [&_[role=slider]]:border-[#2563EB] [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
        }
      />
    </>
  );
}
