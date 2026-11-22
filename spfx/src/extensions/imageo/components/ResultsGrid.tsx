import * as React from 'react';
import {
  Stack, Spinner, DefaultButton, PrimaryButton, Text, TextField, IconButton, Separator,
} from '@fluentui/react';
import * as strings from 'ImageoApplicationCustomizerStrings';
import { IGenerateRequest } from '../models/IContracts';
import { ILastGeneration } from '../services/LastGenerationDB';

export interface ISlotState {
  id: string;
  status: 'pending' | 'ok' | 'error';
  b64?: string;
  previewUrl?: string;
  error?: string;
  request: IGenerateRequest;
  pageContext: Pick<ILastGeneration, 'essence' | 'chips' | 'selectedSectionIds'>;
  editInstruction?: string;
  model?: string;
  restoredFromCreatedAt?: number;
}

export type ApplyingTarget = 'assets' | 'clipboard' | undefined;

export interface IResultsGridProps {
  slots: ISlotState[];
  applyingTarget: ApplyingTarget;
  justCompleted?: ApplyingTarget;
  refining: boolean;
  onCopyToClipboard: (slot: ISlotState) => void;
  onSaveToAssets: (slot: ISlotState) => void;
  onDiscard: (slot: ISlotState) => void;
  onRetry: (slot: ISlotState) => void;
  onRefine: (slot: ISlotState, instruction: string) => Promise<boolean>;
  onOpenEditor: (slot: ISlotState) => void;
}

const RefineAction: React.FC<{
  busy: boolean;
  disabled: boolean;
  onApply: (instruction: string) => Promise<boolean>;
}> = ({ busy, disabled, onApply }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [instruction, setInstruction] = React.useState('');

  if (!expanded) {
    return <DefaultButton text={strings.RefineCta} disabled={disabled} onClick={() => setExpanded(true)} />;
  }

  return (
    <Stack tokens={{ childrenGap: 6 }}>
      <TextField
        label={strings.RefineInstruction}
        multiline
        rows={2}
        autoFocus
        value={instruction}
        maxLength={4000}
        disabled={busy}
        onChange={(_, value) => setInstruction(value || '')}
      />
      <Stack horizontal wrap tokens={{ childrenGap: 6 }}>
        <PrimaryButton
          text={strings.RefineApply}
          disabled={disabled || !instruction.trim()}
          onClick={async () => {
            if (await onApply(instruction.trim())) {
              setExpanded(false);
              setInstruction('');
            }
          }}
        />
        <DefaultButton text={strings.CancelButton} disabled={busy} onClick={() => setExpanded(false)} />
        {busy && <Spinner label={strings.RefiningCta} />}
      </Stack>
    </Stack>
  );
};

function formatAge(createdAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (sec < 60) return strings.AgoSec.replace('{0}', String(sec));
  const min = Math.floor(sec / 60);
  if (min < 60) return strings.AgoMin.replace('{0}', String(min));
  const hr = Math.floor(min / 60);
  return strings.AgoHr.replace('{0}', String(hr)).replace('{1}', String(min % 60));
}

export const ResultsGrid: React.FC<IResultsGridProps> = (props) => {
  const disabled = !!props.applyingTarget || props.refining;
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
                alt={slot.editInstruction || slot.request.prompt}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  borderRadius: 4,
                }}
              />
              {slot.request.prompt && (
                <Text
                  variant="small"
                  styles={{ root: { color: '#605e5c', fontStyle: 'italic' } }}
                  title={slot.request.prompt}
                >
                  <strong>{strings.ResultsGeneratedFromPrefix}</strong>
                  {slot.request.prompt.length > 140 ? slot.request.prompt.slice(0, 137) + '…' : slot.request.prompt}
                </Text>
              )}
              {slot.editInstruction && <Text variant="small">{strings.LastEdit.replace('{0}', slot.editInstruction)}</Text>}
              <Stack horizontal wrap tokens={{ childrenGap: 6 }} verticalAlign="center">
                <PrimaryButton
                  text={props.justCompleted === 'clipboard' ? strings.ResultsCopiedOk : strings.CopyToClipboard}
                  onClick={() => props.onCopyToClipboard(slot)}
                  disabled={disabled}
                  onRenderIcon={props.applyingTarget === 'clipboard'
                    ? () => <Spinner styles={{ root: { marginRight: 6 } }} />
                    : undefined}
                />
                <DefaultButton
                  text={props.justCompleted === 'assets' ? strings.ResultsSavedOk : strings.SaveToAssets}
                  onClick={() => props.onSaveToAssets(slot)}
                  disabled={disabled}
                  onRenderIcon={props.applyingTarget === 'assets'
                    ? () => <Spinner styles={{ root: { marginRight: 6 } }} />
                    : undefined}
                />
                <DefaultButton
                  text={strings.ResultsRetryCta}
                  title={strings.RetryHelp}
                  disabled={disabled}
                  onClick={() => props.onRetry(slot)}
                />
                <IconButton
                  iconProps={{ iconName: 'Delete' }}
                  title={strings.Discard}
                  ariaLabel={strings.Discard}
                  onClick={() => props.onDiscard(slot)}
                  disabled={disabled}
                  styles={{ root: { marginLeft: 'auto' } }}
                />
              </Stack>
              <DefaultButton
                text={strings.OpenAssistedEditor}
                iconProps={{ iconName: 'EditPhoto' }}
                disabled={disabled}
                onClick={() => props.onOpenEditor(slot)}
              />
              <RefineAction
                busy={props.refining}
                disabled={disabled}
                onApply={(instruction) => props.onRefine(slot, instruction)}
              />
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
