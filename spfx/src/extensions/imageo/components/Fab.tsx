import * as React from 'react';
import { TooltipHost } from '@fluentui/react';
import * as strings from 'ImageoApplicationCustomizerStrings';
import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import { Panel } from './Panel';
import { accent, fg, ease } from '../utils/designTokens';
import { ImageoMark, ImageoWordmark } from './Logo';
import { IImageoEndpoints } from '../utils/env';

export interface IFabProps {
  ctx: ApplicationCustomizerContext;
  endpoints: IImageoEndpoints;
}

export const Fab: React.FC<IFabProps> = ({ ctx, endpoints }) => {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);

  const hiddenShadow = '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(76,61,184,0.15), 0 0 0 1px rgba(0,0,0,0.04)';
  const hoverShadow = '0 2px 4px rgba(0,0,0,0.08), 0 12px 32px rgba(76,61,184,0.28), 0 0 0 1px rgba(108,92,231,0.18)';

  const btn: React.CSSProperties = {
    height: 52,
    padding: '0 18px 0 8px',
    background: '#ffffff',
    color: fg.primary,
    borderRadius: 26,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    border: 'none',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '-0.005em',
    boxShadow: hover ? hoverShadow : hiddenShadow,
    transformOrigin: 'bottom right',
    transform: open ? 'scale(0.3) translate(12px, 12px)' : 'none',
    opacity: open ? 0 : 1,
    pointerEvents: open ? 'none' : 'auto',
    transition: `transform 260ms ${ease.out}, box-shadow 200ms ${ease.std}, opacity 200ms ${ease.std}`,
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          // Leave the bottom row available for SharePoint's Copilot launcher.
          bottom: 'calc(104px + env(safe-area-inset-bottom, 0px))',
          right: 'calc(clamp(12px, 4vw, 24px) + env(safe-area-inset-right, 0px))',
          zIndex: 10000,
        }}
      >
        <TooltipHost content={strings.FabLabel}>
          <button
            type="button"
            aria-label={strings.FabLabel}
            onClick={() => setOpen(true)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={btn}
          >
            <ImageoMark size={40} />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, alignItems: 'flex-start' }}>
              <ImageoWordmark size={13} />
              <span style={{ fontSize: 10, fontWeight: 500, color: accent.fg, opacity: 0.7 }}>
                {strings.FabSubtitle}
              </span>
            </span>
          </button>
        </TooltipHost>
      </div>
      <Panel open={open} onDismiss={() => setOpen(false)} ctx={ctx} endpoints={endpoints} />
    </>
  );
};
