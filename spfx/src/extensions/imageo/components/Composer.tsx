import * as React from 'react';
import {
  Stack, TextField, PrimaryButton, ActionButton,
  Text, Toggle, Separator, Icon, ProgressIndicator,
} from '@fluentui/react';
import * as strings from 'ImageoApplicationCustomizerStrings';
import { IDistillChips, IPageSection, IPalette } from '../models/IContracts';
import { accent, bg, border, fg } from '../utils/designTokens';

export interface IComposerState {
  prompt: string;
  brandSlang: string;
  n: number;
  selectedSectionIds: string[];
  analyzeOn: boolean;
  extracting: boolean;
  essence?: string;
  chips?: IDistillChips;
}

export interface IComposerProps {
  pageTitle: string;
  sections: IPageSection[];
  mapLoading: boolean;
  mapError?: string;
  state: IComposerState;
  onChange: (patch: Partial<IComposerState>) => void;
  onExtract: () => void;
  onSaveBrandSlang: () => void;
  onGenerate: () => void;
  busy?: boolean;
  palette?: IPalette;
}

interface IPromptChipsProps {
  title: string;
  items: string[];
  prompt: string;
  onToggle: (word: string) => void;
}

const PromptChips: React.FC<IPromptChipsProps> = ({ title, items, prompt, onToggle }) => {
  const lower = prompt.toLowerCase();
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: fg.secondary,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((w) => {
          const selected = lower.includes(w.toLowerCase());
          return (
            <button
              key={w}
              type="button"
              onClick={() => onToggle(w)}
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: 13,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                background: selected ? accent[600] : '#ffffff',
                color: selected ? '#ffffff' : fg.secondary,
                border: `1px solid ${selected ? accent[600] : border.default}`,
                transition: 'background 120ms, color 120ms, border-color 120ms',
              }}
            >
              {w}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface IEssenceCardProps {
  essence: string;
  palette?: IPalette;
}

const EssenceCard: React.FC<IEssenceCardProps> = ({ essence, palette }) => {
  const swatches: { c: string; n: string }[] = [];
  if (palette) {
    if (palette.primary) swatches.push({ c: palette.primary, n: 'primary' });
    if (palette.accent) swatches.push({ c: palette.accent, n: 'accent' });
    if (palette.secondary) swatches.push({ c: palette.secondary, n: 'secondary' });
    if (palette.text) swatches.push({ c: palette.text, n: 'text' });
    if (palette.background) swatches.push({ c: palette.background, n: 'background' });
  }
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${accent[50]} 0%, #ffffff 100%)`,
        border: `1px solid ${accent[200]}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -30,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accent[200]} 0%, transparent 70%)`,
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            color: accent.fg,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 8,
          }}
        >
          <Icon iconName="Sparkle" styles={{ root: { fontSize: 12 } }} />
          {strings.EssenceTitle}
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.45,
            fontWeight: 500,
            color: fg.primary,
            letterSpacing: '-0.005em',
            marginBottom: swatches.length > 0 ? 12 : 0,
          }}
        >
          {essence}
        </div>
        {swatches.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: fg.secondary }}>{strings.PaletteLabel}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {swatches.map((s) => (
                <div
                  key={s.n}
                  title={`${s.n} · ${s.c}`}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: s.c,
                    border: '1px solid rgba(0,0,0,0.08)',
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function sectionTitle(s: IPageSection): string {
  if (s.heading && s.heading.trim()) return s.heading.trim().slice(0, 60);
  const text = (s.text || '').trim();
  if (!text) return `Section ${s.id}`;
  const firstLine = text.split(/\n+/)[0].trim();
  const preview = firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine;
  return preview || `Section ${s.id}`;
}

function sectionPreview(s: IPageSection): string {
  const text = (s.text || '').trim();
  if (!text) return '';
  const firstLine = text.split(/\n+/)[0].trim();
  return firstLine.length > 80 ? firstLine.slice(0, 77) + '…' : firstLine;
}

function statsSummary(s: IPageSection): string {
  const stats = s.stats;
  if (!stats) return '';
  const parts: string[] = [];
  if (stats.wordCount) parts.push(strings.StatsWords.replace('{0}', String(stats.wordCount)));
  if (stats.headingCount) parts.push(strings.StatsHeadings.replace('{0}', String(stats.headingCount)));
  if (stats.listItemCount) parts.push(strings.StatsListItems.replace('{0}', String(stats.listItemCount)));
  if (stats.hasCallout) parts.push(strings.StatsCallout);
  if (stats.hasImages) parts.push(strings.StatsImages);
  return parts.join(' · ');
}

const ANALYZE_PHASES = [strings.AnalyzePhase1, strings.AnalyzePhase2, strings.AnalyzePhase3];
const GENERATE_PHASES = [strings.GeneratePhase1, strings.GeneratePhase2, strings.GeneratePhase3];

function togglePromptWord(prompt: string, word: string): string {
  const lower = prompt.toLowerCase();
  const w = word.toLowerCase();
  if (lower.indexOf(w) === -1) {
    const trimmed = prompt.trim();
    if (!trimmed) return word;
    return trimmed.endsWith(',') ? `${trimmed} ${word}` : `${trimmed}, ${word}`;
  }
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Safe: `escaped` has all regex metacharacters escaped on the line above.
  // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
  const re = new RegExp(`(?:\\s*,\\s*)?\\b${escaped}\\b(?:\\s*,\\s*)?`, 'i');
  return prompt
    .replace(re, (match) => (match.includes(',') ? ', ' : ' '))
    .replace(/\s*,\s*,\s*/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .replace(/\s+/g, ' ');
}

function usePhaseTicker(active: boolean, phases: string[], phaseMs = 3000): number {
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => {
    if (!active) { setIndex(0); return; }
    const id = window.setInterval(() => {
      setIndex((i) => Math.min(i + 1, phases.length - 1));
    }, phaseMs);
    return () => window.clearInterval(id);
  }, [active, phases.length, phaseMs]);
  return index;
}

interface ISectionRowProps {
  section: IPageSection;
  selected: boolean;
  onToggle: () => void;
}

const SectionRow: React.FC<ISectionRowProps> = ({ section, selected, onToggle }) => {
  const preview = sectionPreview(section);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
      style={{
        padding: 12,
        borderTop: `1px solid ${border.subtle}`,
        display: 'flex',
        gap: 10,
        cursor: 'pointer',
        background: selected ? accent[50] : '#ffffff',
        transition: 'background 120ms',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `1.5px solid ${selected ? accent[600] : border.strong}`,
          background: selected ? accent[600] : '#ffffff',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {selected && (
          <Icon iconName="CheckMark" styles={{ root: { color: '#ffffff', fontSize: 10, fontWeight: 800 } }} />
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.03em',
            color: fg.primary,
          }}
        >
          {sectionTitle(section)}
        </div>
        {preview && preview !== sectionTitle(section) && (
          <div
            style={{
              fontSize: 12,
              color: fg.secondary,
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {preview}
          </div>
        )}
        <div style={{ fontSize: 11, color: fg.tertiary, marginTop: 4 }}>
          {statsSummary(section)}
        </div>
      </div>
    </div>
  );
};

export const Composer: React.FC<IComposerProps> = (props) => {
  const { pageTitle, sections, mapLoading, mapError, state, onChange, onExtract, onSaveBrandSlang, onGenerate, busy, palette } = props;
  const [brandOpen, setBrandOpen] = React.useState<boolean>(!!state.brandSlang);

  const analyzePhase = usePhaseTicker(!!state.extracting, ANALYZE_PHASES);
  const generatePhase = usePhaseTicker(!!busy, GENERATE_PHASES);

  const selectedCount = state.selectedSectionIds.length;
  const allSelected = sections.length > 0 && selectedCount === sections.length;
  const pageHasSections = sections.length > 0;

  const toggleSection = (id: string): void => {
    const next = state.selectedSectionIds.includes(id)
      ? state.selectedSectionIds.filter((x) => x !== id)
      : [...state.selectedSectionIds, id];
    onChange({ selectedSectionIds: next });
  };

  const selectAll = (): void => {
    onChange({
      selectedSectionIds: allSelected ? [] : sections.map((s) => s.id),
    });
  };

  return (
    <Stack tokens={{ childrenGap: 16 }}>
      <Stack tokens={{ childrenGap: 2 }}>
        <Toggle
          label={strings.AnalyzeToggleLabel}
          checked={state.analyzeOn}
          onChange={(_, checked) => onChange({ analyzeOn: !!checked })}
          inlineLabel
          styles={{ root: { marginBottom: 0 } }}
        />
        <Text variant="small" styles={{ root: { color: fg.secondary } }}>
          {strings.AnalyzeToggleHelp}
        </Text>
      </Stack>

      {state.analyzeOn && (
        <Stack tokens={{ childrenGap: 10 }}>
          {mapLoading && (
            <ProgressIndicator label={strings.ReadingPageLabel} description={strings.ReadingPageDesc} />
          )}
          {mapError && (
            <Text variant="small" styles={{ root: { color: '#a80000' } }}>{mapError}</Text>
          )}
          {!mapLoading && !mapError && (
            <>
              <Text variant="small" styles={{ root: { fontWeight: 600, color: fg.primary } }}>
                {strings.SectionsHeading}
              </Text>
              <div
                style={{
                  border: `1px solid ${border.default}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#ffffff',
                }}
              >
                <div
                  style={{
                    padding: '10px 12px',
                    borderBottom: `1px solid ${border.subtle}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: bg.subtle,
                  }}
                >
                  <Icon iconName="Page" styles={{ root: { fontSize: 14, color: accent[600] } }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: fg.primary }}>
                      {pageTitle || strings.ThisPageFallback}
                    </div>
                    <div style={{ fontSize: 11, color: fg.tertiary }}>
                      {strings.NSectionsNSelected.replace('{0}', String(sections.length)).replace('{1}', String(selectedCount))}
                    </div>
                  </div>
                  {sections.length > 0 && (
                    <button
                      type="button"
                      onClick={selectAll}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        height: 24,
                        padding: '0 10px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 500,
                        background: bg.subtle,
                        color: fg.primary,
                        border: `1px solid ${border.subtle}`,
                        cursor: 'pointer',
                      }}
                    >
                      {allSelected ? strings.ClearCta : strings.SelectAllCta}
                    </button>
                  )}
                </div>
                {sections.map((s) => (
                  <SectionRow
                    key={s.id}
                    section={s}
                    selected={state.selectedSectionIds.includes(s.id)}
                    onToggle={() => toggleSection(s.id)}
                  />
                ))}
                {sections.length === 0 && (
                  <div style={{ padding: 14, fontSize: 12, color: fg.tertiary }}>
                    {strings.NoTextSections}
                  </div>
                )}
              </div>
            </>
          )}

          {state.extracting && (
            <ProgressIndicator
              label={ANALYZE_PHASES[analyzePhase]}
              description={`Step ${analyzePhase + 1} of ${ANALYZE_PHASES.length}`}
            />
          )}

          <Stack horizontal horizontalAlign="end">
            <PrimaryButton
              text={state.extracting ? strings.AnalyzingCta : state.essence ? strings.ReAnalyzeCta : strings.AnalyzeCta}
              onClick={onExtract}
              disabled={state.extracting || !pageHasSections || !!busy}
            />
          </Stack>

          {state.essence && !state.extracting && (
            <EssenceCard essence={state.essence} palette={palette} />
          )}
        </Stack>
      )}

      <Separator />

      <TextField
        label={strings.PromptFieldLabel}
        placeholder={strings.PromptFieldPlaceholder}
        multiline
        autoAdjustHeight
        rows={3}
        value={state.prompt}
        onChange={(_, v) => onChange({ prompt: v || '' })}
      />

      {state.chips && (state.chips.subject.length + state.chips.style.length + state.chips.mood.length > 0) && (
        <div>
          {state.chips.subject.length > 0 && (
            <PromptChips
              title={strings.ChipSubject}
              items={state.chips.subject}
              prompt={state.prompt}
              onToggle={(w) => onChange({ prompt: togglePromptWord(state.prompt, w) })}
            />
          )}
          {state.chips.style.length > 0 && (
            <PromptChips
              title={strings.ChipStyle}
              items={state.chips.style}
              prompt={state.prompt}
              onToggle={(w) => onChange({ prompt: togglePromptWord(state.prompt, w) })}
            />
          )}
          {state.chips.mood.length > 0 && (
            <PromptChips
              title={strings.ChipMood}
              items={state.chips.mood}
              prompt={state.prompt}
              onToggle={(w) => onChange({ prompt: togglePromptWord(state.prompt, w) })}
            />
          )}
        </div>
      )}

      {brandOpen ? (
        <Stack tokens={{ childrenGap: 4 }}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
            <Text variant="medium" styles={{ root: { fontWeight: 600 } }}>
              {strings.BrandSlangLabel}
            </Text>
            <ActionButton
              iconProps={{ iconName: 'ChevronUp' }}
              onClick={() => setBrandOpen(false)}
              styles={{ root: { height: 24, padding: 0 } }}
            >
              {strings.HideCta}
            </ActionButton>
          </Stack>
          <TextField
            placeholder={strings.BrandSlangPlaceholder}
            multiline
            rows={2}
            value={state.brandSlang}
            onChange={(_, v) => onChange({ brandSlang: v || '' })}
            onBlur={onSaveBrandSlang}
          />
          <Text variant="small" styles={{ root: { color: fg.secondary } }}>
            {strings.BrandSlangHexTip}
          </Text>
        </Stack>
      ) : (
        <ActionButton
          iconProps={{ iconName: state.brandSlang ? 'Edit' : 'Add' }}
          onClick={() => setBrandOpen(true)}
          styles={{ root: { alignSelf: 'flex-start', paddingLeft: 0 } }}
        >
          {state.brandSlang
            ? strings.BrandSlangEditPrefix.replace('{0}', state.brandSlang.length > 60 ? state.brandSlang.slice(0, 57) + '…' : state.brandSlang)
            : strings.BrandSlangAddCta}
        </ActionButton>
      )}

      {busy && (
        <ProgressIndicator
          label={GENERATE_PHASES[generatePhase]}
          description={`Step ${generatePhase + 1} of ${GENERATE_PHASES.length}`}
        />
      )}
      <Stack horizontal horizontalAlign="end">
        <PrimaryButton
          text={busy ? strings.GeneratingCta : strings.GenerateButton}
          onClick={onGenerate}
          disabled={!state.prompt.trim() || !!busy}
        />
      </Stack>
    </Stack>
  );
};
