import * as React from 'react';

// Use inline strokes so the editing tools also render before SharePoint loads its icon font.
const paths = {
  gallery: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  create: 'M3 15l8-8 6 6 M3 19h13 M15 4h6 M18 1v6 M3 11v9h18v-8',
  select: 'M4 8V4h4 M12 4h3 M19 4h1v4 M4 12v3 M4 19v1h4 M11 10l9 5-4 1.2-1.3 4.2z',
  colour: 'M14 4a2.1 2.1 0 013 0l3 3a2.1 2.1 0 010 3l-3 3 M10 6l8 8 M12 8l-8 8-.8 4.8 4.8-.8 8-8',
  add: 'M15 4c2-2 5-.5 4 2l-6 8-4-3z M10 13c-4-1-3 5-7 5 5 3 10 0 10-3 M18 17h5 M20.5 14.5v5',
  erase: 'M3.5 13.5l9-9a2 2 0 013 0l4 4a2 2 0 010 3L11 20H8l-4.5-4.5a1.5 1.5 0 010-2z M8 9l7 7 M12 20h9',
  clear: 'M4 8V4h4 M11 4h3 M17 4h3v4 M4 11v3 M4 17v3h4 M12 12l9 9 M21 12l-9 9',
  resize: 'M10 4H4v16h16v-6 M13 4h7v7 M20 4l-9 9',
  remove: 'M3 7h3 M4.5 5.5v3 M16 3h4 M18 1v4 M5 18l9-10 4 4-9 10z M11 11l4 4',
  recolour: 'M12 2s-6.5 7.5-6.5 11.8a6.5 6.5 0 0013 0C18.5 9.5 12 2 12 2z M9 15a3 3 0 003 3',
  transparent: 'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18 M3 3l6 6 M15 3l6 6 M9 9l6 6 M3 15l6 6 M15 15l6 6',
  solid: 'M4 12l8-8 8 8-8 7z M8 2l7 7 M5 13h13 M19 16s-2 2.2-2 3.5a2 2 0 004 0C21 18.2 19 16 19 16z',
  scene: 'M3 4h18v16H3z M3 17l5-5 4 4 3-3 6 6 M16 8h.01',
  crop: 'M6 2v14a2 2 0 002 2h14 M2 6h14a2 2 0 012 2v14 M18 6l3-3',
  custom: 'M5 21l1-5L17 5l3 3L9 19z M15 7l3 3 M4 4h6 M4 8h3',
  back: 'M10 5l-7 7 7 7 M4 12h17',
  plus: 'M12 5v14 M5 12h14'
};

export type StudioIconName = keyof typeof paths;
export function StudioIcon({ name, size = 20 }: { name: StudioIconName; size?: number }): React.ReactElement {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0 }}><path d={paths[name]} /></svg>;
}
