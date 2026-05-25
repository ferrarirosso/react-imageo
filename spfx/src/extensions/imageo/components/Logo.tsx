import * as React from 'react';
import { accent, fg } from '../utils/designTokens';

export interface IImageoMarkProps {
  size?: number;
  animated?: boolean;
}

const MARK_STYLES = `
@keyframes imageo-twinkle {
  0%, 92%, 100% { opacity: 1; transform: scale(1); }
  96% { opacity: 0.35; transform: scale(0.85); }
}
.imageo-mark .imageo-sparkle {
  transform-origin: 33px 11px;
}
.imageo-mark.animated .imageo-sparkle {
  animation: imageo-twinkle 3.2s ease-in-out infinite;
}
.imageo-mark {
  transition: transform 200ms cubic-bezier(0.1, 0.9, 0.2, 1), filter 200ms ease;
}
.imageo-mark:hover {
  transform: scale(1.04) rotate(-2deg);
  filter: drop-shadow(0 4px 12px rgba(91, 75, 214, 0.35));
}
`;

export const ImageoMark: React.FC<IImageoMarkProps> = ({ size = 40, animated = true }) => (
  <>
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={'imageo-mark' + (animated ? ' animated' : '')}
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="imageo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8B7CF6" />
          <stop offset="100%" stopColor="#5B4BD6" />
        </linearGradient>
        <linearGradient id="imageo-field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FBE6B8" />
          <stop offset="55%" stopColor="#F5A97B" />
          <stop offset="100%" stopColor="#C24F8A" />
        </linearGradient>
        <radialGradient id="imageo-sun" cx="0.7" cy="0.35" r="0.3">
          <stop offset="0%" stopColor="#FFF6D6" stopOpacity="1" />
          <stop offset="100%" stopColor="#FFF6D6" stopOpacity="0" />
        </radialGradient>
        <clipPath id="imageo-clip">
          <rect x="6" y="6" width="36" height="36" rx="9" />
        </clipPath>
      </defs>
      <rect x="4" y="4" width="40" height="40" rx="11" fill="url(#imageo-bg)" />
      <g clipPath="url(#imageo-clip)">
        <rect x="6" y="6" width="36" height="36" fill="url(#imageo-field)" />
        <rect x="6" y="6" width="36" height="36" fill="url(#imageo-sun)" />
        <path
          d="M6 30 Q 14 22, 22 26 T 42 24 L 42 42 L 6 42 Z"
          fill="#6B3A5E"
          opacity="0.85"
        />
        <path
          d="M6 34 Q 16 28, 26 32 T 42 30 L 42 42 L 6 42 Z"
          fill="#3D1F36"
          opacity="0.7"
        />
      </g>
      <rect
        x="6"
        y="6"
        width="36"
        height="36"
        rx="9"
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="1"
      />
      <g className="imageo-sparkle" transform="translate(33 11)">
        <path
          d="M0 -5 L1.1 -1.1 L5 0 L1.1 1.1 L0 5 L-1.1 1.1 L-5 0 L-1.1 -1.1 Z"
          fill="white"
        />
        <circle cx="0" cy="0" r="1.2" fill="#FFF6D6" />
      </g>
    </svg>
    <style>{MARK_STYLES}</style>
  </>
);

export interface IImageoWordmarkProps {
  /** Font size in px for the 'image' part. The trailing 'o' is colored with the accent. */
  size?: number;
  color?: string;
}

export const ImageoWordmark: React.FC<IImageoWordmarkProps> = ({ size = 16, color = fg.primary }) => (
  <span
    style={{
      fontSize: size,
      fontWeight: 600,
      letterSpacing: '-0.02em',
      color,
      display: 'inline-flex',
      alignItems: 'baseline',
    }}
  >
    image<span style={{ color: accent[600] }}>o</span>
  </span>
);
