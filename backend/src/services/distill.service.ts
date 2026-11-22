/**
 * Distill a chosen scope (whole page or single section) into one
 * image-generation prompt that captures its essence AND matches the
 * visual language of the page when pageContext signals are provided.
 *
 * The system prompt is intentionally style-agnostic: genre, palette,
 * and tone are driven by the publisher (via brand slang on the
 * frontend) and by the page's own visual signals (palette, layout,
 * hasHeroImage) — not by hardcoded defaults.
 */

import { getChatClient, getAnalyzeDeployment } from './foundry.service';
import {
  AnalyzePageSectionInput,
  DistillScopeRequest,
  DistillScopeResponse,
  PageVisualContext,
} from '../types/contracts';

const SYSTEM_PROMPT = `You turn SharePoint page content into a single image-generation prompt for a hero illustration that fits the page.

You may receive "pageContext" with visual signals about the page:
- palette: hex colors of the site theme (primary, secondary, accent, background, text)
- layoutType: banner composition (FullWidthImage | CutInShape | ColorBlock | NoImage | Unknown)
- hasHeroImage: true if the page already has a banner photo

Pick the visual genre from these signals (in priority order):
1. hasHeroImage=true OR layoutType=FullWidthImage → editorial/documentary photography style. Real subjects in situ. Natural light. No text, no logos.
2. layoutType=ColorBlock → clean conceptual illustration with strong color blocks.
3. List-heavy text (many list items) → structured infographic composition.
4. Short narrative text with no visual signals → conceptual illustration.
5. Otherwise → neutral photographic or illustrative — let the essence decide.

Output rules:
- "essence": ≤ 25 words. Core ideas in plain language. Keep the active verbs and qualifiers ("empowering", "step-by-step", "celebrating"), not just topic nouns.
- "suggestedPrompt": 30–60 words, structured in this order:
    1. Scene (15–30 words): describe a natural photographic composition with a clear focal subject or action. Write as if describing a single photograph the reader is looking at. Do NOT enumerate multiple subjects doing different things ("a volunteer A doing X, volunteer B doing Y") — that phrasing makes image models split the canvas into panels. Do NOT use the words "single", "one", "solo", "a lone" — describe the subject naturally (e.g. "A volunteer kneels to offer…" not "A single volunteer kneels…").
    2. Genre + medium (4–8 words): chosen per the rules above, e.g. "documentary editorial photography" or "flat vector illustration".
    3. Palette + mood (6–12 words): translate pageContext.palette hex codes into natural color names (e.g. #5c2d91 → "deep purple", #8b66b5 → "soft lavender", #FFFFFF → "white", #242424 → "near-black"). Describe the palette in English: "deep purple and lavender with cream highlights, optimistic and professional". NEVER output the '#' character or hex codes — image models literalize them as text-in-image.
- "chips": three short flat arrays that the user can toggle to refine the prompt. Each entry is a single lowercase word or short two-word noun/adjective, no punctuation, no hex codes.
    - "subject": 4–7 items. Concrete focal subjects, objects, roles, or setting words drawn from this page's content (e.g. "volunteers", "kitchen", "children", "outdoors"). Must be grounded in the text — not generic fillers.
    - "style": 4–6 items. Visual/medium descriptors consistent with the genre you chose (e.g. "documentary", "editorial", "warm light", "film grain", "flat illustration", "line art"). Pick items that would plausibly pair with the scene; do not contradict the genre.
    - "mood": 3–5 items. Tone words consistent with the essence (e.g. "hopeful", "warm", "focused", "celebratory", "grounded"). No hex codes or color names here.
    - Never repeat the same word across multiple categories. Never include brand or trademark names.
- Never include readable text-in-image, brand logos, or trademarks. Never use "another", "and then", "alongside a separate".
- Respond ONLY with valid JSON matching the schema.`;

function statsLabel(s: AnalyzePageSectionInput): string {
  const stats = s.stats;
  if (!stats) return '';
  const parts: string[] = [`~${stats.wordCount} words`];
  if (stats.headingCount > 0) parts.push(`${stats.headingCount} heading(s)`);
  if (stats.listItemCount > 0) parts.push(`${stats.listItemCount} list item(s)`);
  if (stats.hasCallout) parts.push('callouts');
  if (stats.hasImages) parts.push('images');
  return `[structure: ${parts.join(', ')}]`;
}

function pageContextBlock(pc?: PageVisualContext): string {
  if (!pc) return '';
  const lines: string[] = ['', 'pageContext:'];
  if (pc.palette) {
    const p = pc.palette;
    const palette = [
      p.primary && `primary=${p.primary}`,
      p.secondary && `secondary=${p.secondary}`,
      p.accent && `accent=${p.accent}`,
      p.background && `background=${p.background}`,
      p.text && `text=${p.text}`,
    ].filter(Boolean).join(', ');
    if (palette) lines.push(`  palette: ${palette}`);
  }
  if (pc.layoutType) lines.push(`  layoutType: ${pc.layoutType}`);
  if (pc.hasHeroImage !== undefined) lines.push(`  hasHeroImage: ${pc.hasHeroImage}`);
  return lines.join('\n');
}

function languageNameFor(locale: string | undefined): string {
  if (!locale) return 'English';
  const base = locale.slice(0, 2).toLowerCase();
  if (base === 'de') return 'German';
  if (base === 'fr') return 'French';
  if (base === 'it') return 'Italian';
  return 'English';
}

function localeDirective(locale: string | undefined): string {
  const lang = languageNameFor(locale);
  return `\n\nRespond in ${lang}. Write the "essence" sentence, every entry inside "chips" (subject/style/mood), and the entire "suggestedPrompt" in ${lang}, regardless of the language of the source page content. Keep the JSON keys themselves in English.`;
}

function buildUserPrompt(req: DistillScopeRequest): string {
  const head = req.pageTitle ? `Page title: ${req.pageTitle}\n` : '';
  const scopeLabel = req.scope === 'page' ? 'Whole page' : 'Single section';
  const body = req.sections
    .map((s) => {
      const h = s.heading ? ` (heading: ${s.heading})` : '';
      const stats = statsLabel(s);
      const clipped = s.text.length > 3000 ? s.text.slice(0, 3000) + '…' : s.text;
      return `Section [id=${s.id}]${h} ${stats}:\n${clipped}`;
    })
    .join('\n\n');

  const context = pageContextBlock(req.pageContext);

  const schema = `\n\nReturn JSON:
{
  "essence": "<≤25 words>",
  "suggestedPrompt": "<30–60 word image prompt>",
  "chips": {
    "subject": ["<4–7 items>"],
    "style": ["<4–6 items>"],
    "mood": ["<3–5 items>"]
  }
}`;

  return `${head}Scope: ${scopeLabel}${context}\n\n${body}${schema}`;
}

export async function distillScope(req: DistillScopeRequest): Promise<DistillScopeResponse> {
  const client = getChatClient();
  const deployment = getAnalyzeDeployment();
  const userPrompt = buildUserPrompt(req);

  const t0 = Date.now();
  console.log(
    `[distill] → ${deployment} scope=${req.scope} sections=${req.sections.length} ` +
    `pageContext=${req.pageContext ? 'yes' : 'no'} ` +
    `locale=${req.locale || 'en-US'} lang=${languageNameFor(req.locale)} ` +
    `systemChars=${SYSTEM_PROMPT.length} userChars=${userPrompt.length}`
  );

  const completion = await client.chat.completions.create({
    model: deployment,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + localeDirective(req.locale) },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    reasoning_effort: 'low',
  });

  const dt = Date.now() - t0;
  const usage = completion.usage;
  console.log(
    `[distill] ← ${dt}ms prompt_tokens=${usage?.prompt_tokens ?? '?'} ` +
    `completion_tokens=${usage?.completion_tokens ?? '?'} ` +
    `total=${usage?.total_tokens ?? '?'} finish=${completion.choices?.[0]?.finish_reason ?? '?'}`
  );

  const content = completion.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('Distill model returned empty content');

  let parsed: DistillScopeResponse;
  try {
    parsed = JSON.parse(content) as DistillScopeResponse;
  } catch (err) {
    throw new Error(`Distill model returned invalid JSON: ${(err as Error).message}`);
  }

  const essence = (parsed.essence || '').trim();
  const suggestedPrompt = (parsed.suggestedPrompt || '').trim();
  if (!suggestedPrompt) throw new Error('Distill model returned no suggestedPrompt');

  const chips = sanitizeChips(parsed.chips);

  return { essence, suggestedPrompt, chips };
}

function sanitizeChips(raw: unknown): { subject: string[]; style: string[]; mood: string[] } {
  const empty = { subject: [], style: [], mood: [] };
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Record<string, unknown>;
  const clean = (arr: unknown, max: number): string[] => {
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const w = item.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ');
      if (!w || w.length > 24 || seen.has(w)) continue;
      seen.add(w);
      out.push(w);
      if (out.length >= max) break;
    }
    return out;
  };
  return {
    subject: clean(obj.subject, 7),
    style: clean(obj.style, 6),
    mood: clean(obj.mood, 5),
  };
}
