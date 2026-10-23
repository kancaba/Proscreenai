import { Film, ZoomIn, Scissors, Type, Gauge, AudioLines } from "lucide-react";
import { useRow } from "dnd-timeline";
import type { RowDefinition } from "dnd-timeline";

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

  return (
    <div
      className="workspace-row border-b relative"
      style={{ ...rowWrapperStyle, minHeight: id === 'source-video-row' ? 60 : laneCount * 42 + 2, marginBottom: 2, width: '100%' }}
    >
      <div ref={setSidebarRef} onClick={event => event.stopPropagation()} className="workspace-row-label relative z-20 flex w-[100px] shrink-0 bg-[#14141b] text-[10px] font-medium" style={{ color: labelColor }}>
        <span className="flex h-full w-full items-center border-r border-white/10 px-3">{id.includes('source') ? <Film size={12}/> : id.includes('zoom') ? <ZoomIn size={12}/> : id.includes('trim') ? <Scissors size={12}/> : id.includes('speed') ? <Gauge size={12}/> : id.includes('audio') ? <AudioLines size={12}/> : <Type size={12}/>}<span>{label}</span></span>
      </div>
      {isEmpty && hint && (
        <div className="absolute inset-y-0 left-[100px] right-0 flex items-center justify-center pointer-events-none select-none z-10">
          <span className="text-[11px] text-[#91899f] font-medium">{hint}</span>
        </div>
      )}
      <div ref={setNodeRef} style={{...rowStyle,minWidth:0}}>
        {children}
      </div>
    </div>
  );
}

