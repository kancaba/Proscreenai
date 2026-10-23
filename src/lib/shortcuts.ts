export const SHORTCUT_ACTIONS = [
  'addZoom',
  'addTrim',
  'addSpeed',
  'addAnnotation',
  'addKeyframe',
  'deleteSelected',
  'playPause',
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

export interface ShortcutBinding {
  key: string;
  /** Maps to Cmd on macOS, Ctrl on Windows/Linux */
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export type ShortcutsConfig = Record<ShortcutAction, ShortcutBinding>;

export interface FixedShortcut {
  label: string;
  display: string;
  bindings: ShortcutBinding[];
}

export const FIXED_SHORTCUTS: FixedShortcut[] = [
  { label: 'Dışa aktarma ayarları', display: 'Cmd/Ctrl + E', bindings: [{ key: 'e', ctrl: true }] },
  { label: 'AI bağlantısı', display: 'Cmd/Ctrl + ,', bindings: [{ key: ',', ctrl: true }] },
  { label: 'Kısayol menüsü', display: '? / Cmd/Ctrl + /', bindings: [{ key: '?', shift: true }, { key: '/', ctrl: true }] },
  { label: 'Timeline yakınlaştır / uzaklaştır', display: '+ / −', bindings: [{ key: '+', shift: true }, { key: '=' }, { key: '-' }] },
  { label: 'Videoyu timeline alanına sığdır', display: 'Shift + F', bindings: [{ key: 'f', shift: true }] },
  { label: 'İleri / geri 0.1 saniye', display: '← / →', bindings: [{ key: 'arrowleft' }, { key: 'arrowright' }] },
  { label: 'İleri / geri 1 saniye', display: 'Shift + ← / →', bindings: [{ key: 'arrowleft', shift: true }, { key: 'arrowright', shift: true }] },
  { label: 'Video başı / sonu', display: 'Home / End', bindings: [{ key: 'home' }, { key: 'end' }] },
  { label: 'Projeyi kaydet / aç', display: 'Cmd/Ctrl + S / O', bindings: [{ key: 's', ctrl: true }, { key: 's', ctrl: true, shift: true }, { key: 'o', ctrl: true }] },
  { label: 'Geri al / ileri al', display: 'Cmd/Ctrl + Z / Shift + Z', bindings: [{ key: 'z', ctrl: true }, { key: 'z', ctrl: true, shift: true }, { key: 'y', ctrl: true }] },
  { label: 'Cycle Annotations Forward',  display: 'Tab',                    bindings: [{ key: 'tab' }] },
  { label: 'Cycle Annotations Backward', display: 'Shift + Tab',            bindings: [{ key: 'tab', shift: true }] },
  { label: 'Delete Selected (alt)',      display: 'Del / ⌫',               bindings: [{ key: 'delete' }, { key: 'backspace' }] },
  { label: 'Seçili öğeyi kopyala / imlece yapıştır', display: 'Cmd/Ctrl + C / V', bindings: [{ key: 'c', ctrl: true }, { key: 'v', ctrl: true }] },
  { label: 'Seçili öğeyi çoğalt',        display: 'Cmd/Ctrl + Shift + D',   bindings: [{ key: 'd', ctrl: true, shift: true }] },
  { label: 'Seçili öğeyi imleçte böl',   display: 'Cmd/Ctrl + B',           bindings: [{ key: 'b', ctrl: true }] },
  { label: 'Seçili öğeyi kaydır (0,1 / 1 sn)', display: 'Alt + ← / → (Shift ile 1 sn)', bindings: [{ key: 'arrowleft', alt: true }, { key: 'arrowright', alt: true }, { key: 'arrowleft', alt: true, shift: true }, { key: 'arrowright', alt: true, shift: true }] },
  { label: 'Sürüklerken yapışmayı kapat', display: 'Alt basılı tut',        bindings: [] },
  { label: 'Pan Timeline',               display: 'Shift + Ctrl + Scroll',  bindings: [] },
  { label: 'Zoom Timeline',              display: 'Ctrl + Scroll',          bindings: [] },
];

export type ShortcutConflict =
  | { type: 'configurable'; action: ShortcutAction }
  | { type: 'fixed'; label: string };

export function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    !!a.ctrl === !!b.ctrl &&
    !!a.shift === !!b.shift &&
    !!a.alt === !!b.alt
  );
}

export function findConflict(
  binding: ShortcutBinding,
  forAction: ShortcutAction,
  config: ShortcutsConfig,
): ShortcutConflict | null {
  for (const fixed of FIXED_SHORTCUTS) {
    if (fixed.bindings.some((b) => bindingsEqual(b, binding))) {
      return { type: 'fixed', label: fixed.label };
    }
  }
  for (const action of SHORTCUT_ACTIONS) {
    if (action !== forAction && bindingsEqual(config[action], binding)) {
      return { type: 'configurable', action };
    }
  }
  return null;
}

export const DEFAULT_SHORTCUTS: ShortcutsConfig = {
  addZoom:        { key: 'z' },
  addTrim:        { key: 'c' },
  addSpeed:       { key: 's' },
  addAnnotation:  { key: 'a' },
  addKeyframe:    { key: 'f' },
  deleteSelected: { key: 'd', ctrl: true },
  playPause:      { key: ' ' },
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  addZoom:        'Add Zoom',
  addTrim:        'Cut (split selected / cut video)',
  addSpeed:       'Add Speed',
  addAnnotation:  'Add Annotation',
  addKeyframe:    'Add Keyframe',
  deleteSelected: 'Delete Selected',
  playPause:      'Play / Pause',
};

export function matchesShortcut(
  e: KeyboardEvent,
  binding: ShortcutBinding,
  isMacPlatform: boolean,
): boolean {
  if (e.key.toLowerCase() !== binding.key.toLowerCase()) return false;

  const primaryMod = isMacPlatform ? e.metaKey : e.ctrlKey;
  if (primaryMod !== !!binding.ctrl) return false;
  if (e.shiftKey !== !!binding.shift) return false;
  if (e.altKey !== !!binding.alt) return false;

  return true;
}

const KEY_LABELS: Record<string, string> = {
  ' ': 'Space', 'delete': 'Del', 'backspace': '⌫', 'escape': 'Esc',
  'arrowup': '↑', 'arrowdown': '↓', 'arrowleft': '←', 'arrowright': '→',
};

export function formatBinding(binding: ShortcutBinding, isMac: boolean): string {
  const parts: string[] = [];
  if (binding.ctrl)  parts.push(isMac ? '⌘' : 'Ctrl');
  if (binding.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (binding.alt)   parts.push(isMac ? '⌥' : 'Alt');
  parts.push(KEY_LABELS[binding.key] ?? binding.key.toUpperCase());
  return parts.join(' + ');
}

export function mergeWithDefaults(partial: Partial<ShortcutsConfig>): ShortcutsConfig {
  const merged = { ...DEFAULT_SHORTCUTS };
  for (const action of SHORTCUT_ACTIONS) {
    if (partial[action]) {
      merged[action] = partial[action] as ShortcutBinding;
    }
  }
  // The cut key moved from T to C; a saved copy of the old default follows it.
  if (bindingsEqual(merged.addTrim, { key: 't' })) merged.addTrim = DEFAULT_SHORTCUTS.addTrim;
  return merged;
}

