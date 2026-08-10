import * as React from 'react';
import {
  Stack, Spinner, DefaultButton, PrimaryButton, Text, IconButton, Separator,
} from '@fluentui/react';
import * as strings from 'ImageoApplicationCustomizerStrings';

export interface ISlotState {
  id: string;
  status: 'pending' | 'ok' | 'error';
  b64?: string;
  previewUrl?: string;
  error?: string;
  prompt?: string;
  // Carried through so saved-image metadata records the generating model.
  model?: string;
  restoredFromCreatedAt?: number;
}

export type ApplyingTarget = 'assets' | 'clipboard' | undefined;

export interface IResultsGridProps {
  slots: ISlotState[];
  applyingTarget: ApplyingTarget;
  justCompleted?: ApplyingTarget;
  onCopyToClipboard: (slot: ISlotState) => void;
  onSaveToAssets: (slot: ISlotState) => void;
  onDiscard: (slot: ISlotState) => void;
  onRetry: (slot: ISlotState) => void;
}

function formatAge(createdAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (sec < 60) return strings.AgoSec.replace('{0}', String(sec));
  const min = Math.floor(sec / 60);
  if (min < 60) return strings.AgoMin.replace('{0}', String(min));
  const hr = Math.floor(min / 60);
  return strings.AgoHr.replace('{0}', String(hr)).replace('{1}', String(min % 60));
}

export const ResultsGrid: React.FC<IResultsGridProps> = (props) => {
  const visibleSlots = props.slots.filter((s) => s.status !== 'pending');
  if (visibleSlots.length === 0) return null;

  return (
    <Stack tokens={{ childrenGap: 12 }}>
      <Separator />
      {visibleSlots.map((slot) => (
        <Stack key={slot.id} tokens={{ childrenGap: 10 }}>
          {slot.status === 'ok' && slot.previewUrl && (
            <>
              {slot.restoredFromCreatedAt && (
                <Text variant="small" styles={{ root: { color: '#605e5c' } }}>
                  {strings.ResultsRestoredPrefix.replace('{0}', formatAge(slot.restoredFromCreatedAt))}
                </Text>
              )}
              <img
                src={slot.previewUrl}
                alt={slot.prompt || 'Generated'}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  borderRadius: 4,
                }}
              />
              {slot.prompt && (
                <Text
                  variant="small"
                  styles={{ root: { color: '#605e5c', fontStyle: 'italic' } }}
                  title={slot.prompt}
                >
                  <strong>{strings.ResultsGeneratedFromPrefix}</strong>
                  {slot.prompt.length > 140 ? slot.prompt.slice(0, 137) + '…' : slot.prompt}
                </Text>
              )}
              <Stack horizontal wrap tokens={{ childrenGap: 6 }} verticalAlign="center">
                <PrimaryButton
                  text={props.justCompleted === 'clipboard' ? strings.ResultsCopiedOk : strings.CopyToClipboard}
                  onClick={() => props.onCopyToClipboard(slot)}
                  disabled={!!props.applyingTarget}
                  onRenderIcon={props.applyingTarget === 'clipboard'
                    ? () => <Spinner styles={{ root: { marginRight: 6 } }} />
                    : undefined}
                />
                <DefaultButton
                  text={props.justCompleted === 'assets' ? strings.ResultsSavedOk : strings.SaveToAssets}
                  onClick={() => props.onSaveToAssets(slot)}
                  disabled={!!props.applyingTarget}
                  onRenderIcon={props.applyingTarget === 'assets'
                    ? () => <Spinner styles={{ root: { marginRight: 6 } }} />
                    : undefined}
                />
                <IconButton
                  iconProps={{ iconName: 'Delete' }}
                  title={strings.Discard}
                  ariaLabel={strings.Discard}
                  onClick={() => props.onDiscard(slot)}
                  disabled={!!props.applyingTarget}
                  styles={{ root: { marginLeft: 'auto' } }}
                />
              </Stack>
            </>
          )}

          {slot.status === 'error' && (
            <Stack tokens={{ childrenGap: 8 }}>
              <Text variant="small" styles={{ root: { color: '#a80000' } }}>
                {slot.error || 'Failed'}
              </Text>
              <Stack horizontal tokens={{ childrenGap: 6 }}>
                <DefaultButton text={strings.ResultsRetryCta} onClick={() => props.onRetry(slot)} />
                <IconButton iconProps={{ iconName: 'Delete' }} title={strings.Discard} onClick={() => props.onDiscard(slot)} />
              </Stack>
            </Stack>
          )}
        </Stack>
      ))}
    </Stack>
  );
};
