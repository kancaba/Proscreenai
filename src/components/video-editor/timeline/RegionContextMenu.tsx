import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useScopedT } from "@/contexts/I18nContext";
import type { RegionCommand } from "./regionCommands";

interface RegionContextMenuProps {
  x: number;
  y: number;
  canPaste: boolean;
  isMac: boolean;
  onCommand: (command: RegionCommand) => void;
  onClose: () => void;
}

const formatKeys = (keys: string[], isMac: boolean) =>
  keys.map((key) => (key === "mod" ? (isMac ? "⌘" : "Ctrl") : key === "Shift" ? (isMac ? "⇧" : "Shift") : key)).join(isMac ? "" : "+");

/** Right-click menu for a timeline item; closes on Escape, scroll or a click elsewhere. */
export function RegionContextMenu({ x, y, canPaste, isMac, onCommand, onClose }: RegionContextMenuProps) {
  const t = useScopedT("timeline");
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu on screen near the window edges.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.min(x, window.innerWidth - width - 8),
      top: Math.min(y, window.innerHeight - height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof MouseEvent && ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const items: Array<{ id: string; label: string; shortcut: string; command: RegionCommand; disabled?: boolean; danger?: boolean }> = [
    { id: "copy", label: t("regionMenu.copy", "Copy"), shortcut: formatKeys(["mod", "C"], isMac), command: { type: "copy" } },
    { id: "paste", label: t("regionMenu.paste", "Paste at playhead"), shortcut: formatKeys(["mod", "V"], isMac), command: { type: "paste" }, disabled: !canPaste },
    { id: "duplicate", label: t("regionMenu.duplicate", "Duplicate"), shortcut: formatKeys(["mod", "Shift", "D"], isMac), command: { type: "duplicate" } },
    { id: "split", label: t("regionMenu.split", "Split at playhead"), shortcut: formatKeys(["mod", "B"], isMac), command: { type: "split" } },
    { id: "delete", label: t("regionMenu.delete", "Delete"), shortcut: "⌫", command: { type: "delete" }, danger: true },
  ];

  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-testid="region-context-menu"
      className="fixed z-[1000] min-w-[220px] rounded-lg border border-white/10 bg-[#1c1c22] p-1 text-xs text-slate-200 shadow-2xl"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          data-command={item.id}
          disabled={item.disabled}
          onClick={() => {
            onCommand(item.command);
            onClose();
          }}
          className={`flex w-full items-center justify-between gap-6 rounded-md px-2.5 py-1.5 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 ${item.danger ? "text-red-300" : ""}`}
        >
          <span>{item.label}</span>
          <span className="text-[10px] text-slate-500">{item.shortcut}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
