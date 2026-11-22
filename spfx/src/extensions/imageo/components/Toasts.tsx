import * as React from 'react';
import { MessageBar, MessageBarType, MessageBarButton, Stack } from '@fluentui/react';
import * as strings from 'ImageoApplicationCustomizerStrings';
import { IToast } from '../models/IContracts';

export interface IToastsProps {
  toasts: IToast[];
  onDismiss: (id: string) => void;
}

function kindToType(kind: IToast['kind']): MessageBarType {
  switch (kind) {
    case 'error': return MessageBarType.error;
    case 'warning': return MessageBarType.warning;
    case 'success': return MessageBarType.success;
    default: return MessageBarType.info;
  }
}

const linkActionStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 12px',
  background: '#fff',
  color: '#0078d4',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 2,
  border: '1px solid rgba(0,0,0,0.08)',
};

export const Toasts: React.FC<IToastsProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <Stack tokens={{ childrenGap: 8 }} styles={{ root: { marginBottom: 4 } }}>
      {toasts.map((t) => (
        <MessageBar
          key={t.id}
          messageBarType={kindToType(t.kind)}
          onDismiss={() => onDismiss(t.id)}
          dismissButtonAriaLabel={strings.Close}
          actions={t.action ? (
            <div>
              {t.action.href ? (
                <a
                  href={t.action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  // Tell SharePoint's SPA router to treat this as a plain nav.
                  data-interception="off"
                  style={linkActionStyle}
                >
                  {t.action.label}
                </a>
              ) : (
                <MessageBarButton onClick={t.action.onClick}>
                  {t.action.label}
                </MessageBarButton>
              )}
            </div>
          ) : undefined}
        >
          {t.message}
          {t.serviceResponse && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{strings.ServiceResponseLabel}</summary>
              <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text' }}>
                {JSON.stringify(t.serviceResponse, undefined, 2)}
              </pre>
            </details>
          )}
        </MessageBar>
      ))}
    </Stack>
  );
};
