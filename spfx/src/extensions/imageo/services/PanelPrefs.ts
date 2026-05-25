const KEY = 'imageo.panel.width';
export const PANEL_WIDTH_DEFAULT = 440;
export const PANEL_WIDTH_MIN = 360;
export const PANEL_WIDTH_MAX = 720;

export function getPanelWidth(): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return PANEL_WIDTH_DEFAULT;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return PANEL_WIDTH_DEFAULT;
    return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, n));
  } catch {
    return PANEL_WIDTH_DEFAULT;
  }
}

export function setPanelWidth(w: number): void {
  try {
    const clamped = Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, Math.round(w)));
    window.localStorage.setItem(KEY, String(clamped));
  } catch { /* quota/private-mode — non-fatal */ }
}
