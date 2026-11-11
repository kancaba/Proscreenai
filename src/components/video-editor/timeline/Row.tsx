import { Film, ZoomIn, Scissors, Type, Gauge, AudioLines, EyeOff, ChevronDown } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRow } from "dnd-timeline";
import type { RowDefinition } from "dnd-timeline";
import { useScopedT } from "@/contexts/I18nContext";

/** Height of a collapsed row: its items stay visible as thin bars. */
export const COLLAPSED_ROW_HEIGHT = 22;
const COLLAPSED_ROWS_KEY = "screenmovie.timelineCollapsedRows";

interface CollapsedRows {
  collapsed: ReadonlySet<string>;
  toggle: (rowId: string) => void;
}

const CollapsedRowsContext = createContext<CollapsedRows>({ collapsed: new Set(), toggle: () => undefined });
/** Whether the row an item is drawn in is collapsed. */
const RowCompactContext = createContext(false);
export const useRowCompact = () => useContext(RowCompactContext);

function loadCollapsedRows(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSED_ROWS_KEY) ?? "[]");
    return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Remembers which timeline rows are collapsed, across projects and restarts. */
export function CollapsedRowsProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsedRows);
  const toggle = useCallback((rowId: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      try {
        localStorage.setItem(COLLAPSED_ROWS_KEY, JSON.stringify([...next]));
      } catch {
        // Not remembered; the row still collapses for now.
      }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ collapsed, toggle }), [collapsed, toggle]);
  return <CollapsedRowsContext.Provider value={value}>{children}</CollapsedRowsContext.Provider>;
}

interface RowProps extends RowDefinition {
  children: React.ReactNode;
  label?: string;
  hint?: string;
  isEmpty?: boolean;
  labelColor?: string;
  laneCount?: number;
}

export default function Row({ id, children, label, hint, isEmpty, labelColor = '#666', laneCount = 1 }: RowProps) {
  const { setNodeRef, setSidebarRef, rowWrapperStyle, rowStyle } = useRow({ id });
  const t = useScopedT('timeline');
  const { collapsed, toggle } = useContext(CollapsedRowsContext);
  const compact = collapsed.has(id);
  const height = compact ? COLLAPSED_ROW_HEIGHT : id === 'source-video-row' ? 60 : laneCount * 42 + 2;
  const icon = id.includes('source') ? <Film size={12}/> : id.includes('zoom') ? <ZoomIn size={12}/> : id.includes('trim') ? <Scissors size={12}/> : id.includes('speed') ? <Gauge size={12}/> : id.includes('audio') ? <AudioLines size={12}/> : id.includes('blur') ? <EyeOff size={12}/> : <Type size={12}/>;
  const action = compact ? t('rows.expand', 'Expand track') : t('rows.collapse', 'Collapse track');

  return (
    <div
      className="workspace-row border-b relative"
      data-row-id={id}
      data-collapsed={compact || undefined}
      style={{ ...rowWrapperStyle, minHeight: height, height: compact ? height : undefined, marginBottom: 2, width: '100%' }}
    >
      <div ref={setSidebarRef} onClick={event => event.stopPropagation()} className="workspace-row-label relative z-20 flex w-[100px] shrink-0 bg-[#14141b] text-[10px] font-medium" style={{ color: labelColor }}>
        <button
          type="button"
          data-testid={`row-toggle-${id}`}
          aria-expanded={!compact}
          aria-label={label ? `${action}: ${label}` : action}
          title={action}
          onClick={() => toggle(id)}
          className="group/row flex h-full w-full min-w-0 items-center border-r border-white/10 pl-1.5 pr-2 text-left hover:bg-white/[0.04]"
        >
          <ChevronDown size={11} className={`shrink-0 opacity-50 transition-transform group-hover/row:opacity-100 ${compact ? '-rotate-90' : ''}`} />
          <span className="ml-1 flex min-w-0 items-center">{icon}<span className={compact ? 'truncate whitespace-nowrap' : undefined}>{label}</span></span>
        </button>
      </div>
      {isEmpty && hint && !compact && (
        <div className="absolute inset-y-0 left-[100px] right-0 flex items-center justify-center pointer-events-none select-none z-10">
          <span className="text-[11px] text-[#91899f] font-medium">{hint}</span>
        </div>
      )}
      <div ref={setNodeRef} style={{...rowStyle,minWidth:0}}>
        <RowCompactContext.Provider value={compact}>{children}</RowCompactContext.Provider>
      </div>
    </div>
  );
}
