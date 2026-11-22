import * as React from 'react';
import { Checkbox, DefaultButton, Text } from '@fluentui/react';
import * as strings from 'ImageoApplicationCustomizerStrings';
import { ISuggestInstructionRequest, ISuggestInstructionResponse } from '../../models/IContracts';

export type RequestSuggestion = (input: ISuggestInstructionRequest, signal: AbortSignal) => Promise<ISuggestInstructionResponse>;

interface ISuggestionProps {
  brief: string;
  actions: string[];
  pageBrief?: string;
  disabled: boolean;
  request: RequestSuggestion;
  onAccept: (instruction: string) => void;
}

export const InstructionSuggestion: React.FC<ISuggestionProps> = ({ brief, actions, pageBrief, disabled, request, onAccept }) => {
  const [includePage, setIncludePage] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const pending = React.useRef<AbortController>();
  const helpId = React.useId();
  const text = brief.trim();
  const summary = includePage ? pageBrief?.trim().slice(0, 1200) : undefined;
  const tooLong = text.length > 1000 || actions.some(action => action.length > 600);
  // A late response must never replace an instruction the author has since edited.
  const draft = JSON.stringify([brief, actions, summary]);
  React.useLayoutEffect(() => {
    setLoading(false);
    setFailed(false);
    return () => {
      pending.current?.abort();
      pending.current = undefined;
    };
  }, [draft, disabled]);

  async function suggest(): Promise<void> {
    if (pending.current || disabled || tooLong || (!text && !actions.length)) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const result = await request({
        brief: text,
        ...(actions.length ? { actions } : {}),
        ...(summary ? { pageBrief: summary } : {}),
      }, controller.signal);
      if (controller.signal.aborted) return;
      const suggestion = result?.suggestion?.trim();
      if (!suggestion || suggestion.length > 500) throw new Error('Invalid instruction suggestion');
      onAccept(suggestion);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (pending.current === controller) {
        pending.current = undefined;
        setLoading(false);
      }
    }
  }

  return <div style={{ display: 'grid', gap: 6, justifyItems: 'start', minWidth: 0 }}>
    {pageBrief && <Checkbox label={strings.EditorIncludeSummary} checked={includePage} disabled={disabled}
      onChange={(_, checked) => setIncludePage(!!checked)} />}
    {summary && <Text variant="small" styles={{ root: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }}>{summary}</Text>}
    <DefaultButton text={loading ? strings.EditorSuggesting : strings.EditorSuggest} iconProps={{ iconName: 'Lightbulb' }}
      aria-describedby={helpId} disabled={disabled || loading || tooLong || (!text && !actions.length)}
      onClick={suggest} styles={{ root: { borderRadius: 6 } }} />
    <Text id={helpId} variant="small">{tooLong ? strings.EditorSuggestionLimit : strings.EditorSuggestionHelp}</Text>
    {failed && <Text role="alert" variant="small">{strings.EditorSuggestionFailed}</Text>}
  </div>;
};
