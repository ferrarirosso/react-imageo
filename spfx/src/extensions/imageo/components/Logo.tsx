import * as React from 'react';
import { accent, fg } from '../utils/designTokens';
import logoUrl from '../../../../sharepoint/images/imageo-logo.png';

export const ImageoMark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <img src={logoUrl} alt="" aria-hidden="true" width={size} height={size}
    style={{ display: 'block', flexShrink: 0 }} />
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
