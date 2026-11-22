import { mergeStyleSets } from '@fluentui/react';
import { accent } from '../../utils/designTokens';

const focus = { outline: '2px solid #7668df', outlineOffset: 2 };
const button = { fontFamily: 'inherit', fontSize: 13, color: 'inherit', cursor: 'pointer' };
const buttonStates = {
  ':focus-visible': focus,
  ':disabled': { opacity: 0.52, cursor: 'default' },
  '@media (forced-colors: active)': { selectors: { '&[aria-pressed="true"]': { outline: '2px solid Highlight', outlineOffset: -3 } } }
};

export const studio = mergeStyleSets({
  header: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', flex: 1, minWidth: 0 },
  navigation: { display: 'flex', gap: 4, padding: 3, borderRadius: 10, background: '#f2f1f6', flexShrink: 0 },
  navButton: {
    ...button, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '7px 12px',
    minHeight: 34, border: '1px solid transparent', borderRadius: 7, background: 'transparent', fontWeight: 600, flex: 1,
    selectors: { ...buttonStates, ':hover': { background: '#eae8f3' },
      '&[aria-pressed="true"]': { color: accent.fg, background: '#fff', borderColor: '#e3dff0', boxShadow: '0 1px 3px #27214116' } }
  },
  fileName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#625d72', fontSize: 12 },
  stage: { borderRadius: 12, background: '#252435', color: '#fff', overflow: 'hidden', border: '1px solid #393747' },
  dock: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 4px', minHeight: 38, padding: '6px 8px', borderBottom: '1px solid #474557' },
  toolGroup: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 },
  toolHelp: { flexBasis: '100%', padding: '2px 3px 3px', fontSize: 12, lineHeight: '16px', color: '#dddbe8' },
  brushControl: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '4px 2px',
    boxSizing: 'border-box', fontSize: 12, selectors: { input: { flex: 1, minWidth: 38, maxWidth: 190, accentColor: '#b8aaff' },
      span: { fontVariantNumeric: 'tabular-nums', minWidth: 30 } } },
  sizeControl: { marginInlineStart: 'auto' },
  sizeToggle: { ...button, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '2px 6px', borderRadius: 6,
    border: '1px solid #655e79', background: '#343045', color: '#fff', textAlign: 'start', fontSize: 11, fontWeight: 600,
    selectors: { ...buttonStates, ':hover:enabled': { background: '#494159' }, small: { display: 'block', color: '#d9d6e7', fontSize: 10, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } },
  sizeFields: { flexBasis: '100%', minWidth: 0, display: 'grid', gap: 8, padding: 8, borderRadius: 6, fontSize: 12,
    background: '#383447', color: '#fff', selectors: { 'input[type="checkbox"]': { accentColor: '#b8aaff', verticalAlign: 'middle' } } },
  sizePair: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8,
    selectors: { label: { display: 'grid', gap: 3 }, input: { width: '100%', minWidth: 0, height: 30, boxSizing: 'border-box',
      paddingInline: 6, border: '1px solid #aaa4bc', borderRadius: 4, color: '#231f31', background: '#fff', font: 'inherit' } } },
  sizeActions: { display: 'flex', gap: 6, flexWrap: 'wrap', selectors: { button: { ...button, minHeight: 28, padding: '3px 10px',
    border: '1px solid #b1a9c5', borderRadius: 4, color: '#fff', background: 'transparent', selectors: {
      ...buttonStates, ':first-child': { background: '#e4ddff', color: '#282037' } } } } },
  tool: {
    ...button, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
    border: '1px solid transparent', borderRadius: 7, background: 'transparent', color: '#e2dff1',
    selectors: { ...buttonStates, '&[aria-disabled="true"]': { opacity: 0.52, cursor: 'default' },
      '&:hover[aria-disabled="false"]': { background: '#444154' }, '&[aria-pressed="true"]': { color: '#fff', background: '#5b4bd6', borderColor: '#a99aff' } }
  },
  desk: { padding: 10, backgroundColor: '#302e40', backgroundImage: 'radial-gradient(#494658 1px, transparent 1px)', backgroundSize: '10px 10px' },
  hint: { fontSize: 12, lineHeight: '17px', margin: '6px 1px 0', color: '#625d72' },
  guidance: { fontSize: 13, lineHeight: '18px', color: accent.fg, background: accent[50],
    borderInlineStart: '3px solid ' + accent[400], borderRadius: 4, margin: '2px 0 6px', padding: '7px 9px' },
  queueHeader: { display: 'flex', alignItems: 'stretch', gap: 12, justifyContent: 'space-between',
    selectors: { h3: { display: 'flex', alignItems: 'center', margin: 0, fontSize: 16 } } },
  instructions: { display: 'flex', flexDirection: 'column', gap: 8,
    selectors: { h4: { fontSize: 13, margin: '4px 0 0' } } },
  instructionList: { padding: 0, margin: 0, listStyle: 'none', display: 'grid', gap: 6 },
  instruction: { position: 'relative', border: '1px solid #dedbe7', borderRadius: 8, minHeight: 30,
    boxSizing: 'border-box', padding: '8px 35px 8px 10px', lineHeight: '19px', fontSize: 13, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap',
    selectors: { button: { ...button, position: 'absolute', top: 2, right: 2, fontSize: 20, lineHeight: '20px',
      width: 28, height: 28, padding: 0, borderRadius: 5, border: 'none', background: 'transparent', color: '#625d72',
      selectors: { ...buttonStates, ':hover:enabled': { background: accent[50], color: accent.fg } } } } },
  queuePreview: { display: 'grid', justifyItems: 'center', alignSelf: 'center', gap: 2, margin: 0,
    selectors: { canvas: { outline: '1px solid #ddd9e5', borderRadius: 4 },
      figcaption: { color: '#625d72', fontSize: 11, lineHeight: '16px' } } },
  inspector: { padding: 12, border: '1px solid #e6e2ee', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  groups: { display: 'flex', gap: 3, borderBottom: '1px solid #e6e2ee' },
  group: {
    ...button, border: 0, borderBottom: '2px solid transparent', background: 'transparent', padding: '6px 10px 8px', fontWeight: 600,
    selectors: { ...buttonStates, ':hover:enabled': { color: accent[600] }, '&[aria-pressed="true"]': { color: accent[700], borderBottomColor: accent[600] } }
  },
  actions: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 95px), 1fr))', gap: 6 },
  action: {
    ...button, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
    minHeight: 58, padding: '8px 10px', textAlign: 'start', lineHeight: '16px', fontWeight: 600, background: '#fff', border: '1px solid #ddd9e5', borderRadius: 8,
    selectors: { ...buttonStates, ':hover:enabled': { background: '#f5f3fa', borderColor: '#afa5d0' },
      '&[aria-pressed="true"]': { background: accent[50], color: accent.fg, borderColor: accent[500] } }
  },
  colourPicker: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end', fontSize: 12,
    selectors: { label: { display: 'grid', gap: 4 }, input: { height: 32, boxSizing: 'border-box', borderRadius: 5, border: '1px solid #c8c3d4', padding: 3 } } },
  footer: { marginTop: 'auto', borderTop: '1px solid #e9e6ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', fontSize: 11, color: '#625d72', flexShrink: 0 }
});
