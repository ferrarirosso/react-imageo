/**
 * Page analysis using the configured analyze deployment.
 *
 * One call, batched over all sections, JSON-mode response. Produces
 * for each section a short summary and a suggested image-generation prompt
 * aimed at a hero/illustrative SharePoint context.
 */

import { getChatClient, getAnalyzeDeployment } from './foundry.service';
import {
  AnalyzePageSectionInput,
  AnalyzedSection,
} from '../types/contracts';

const SYSTEM_PROMPT = `You are a SharePoint publishing assistant. You receive page sections (plain text) and must propose image-generation prompts for each.

Rules:
- Each "summary" must be ≤ 20 words, capturing the section's point.
- Each "suggestedPrompt" must be an image-generation prompt optimized for a corporate intranet hero illustration: clean, modern, brand-neutral by default, ~12–25 words.
- Avoid photorealistic faces, brand logos, and text-in-image.
- Respond ONLY with valid JSON matching the schema.`;

interface LlmResponse {
  sections: AnalyzedSection[];
}

function buildUserPrompt(pageTitle: string | undefined, sections: AnalyzePageSectionInput[]): string {
  const head = pageTitle ? `Page title: ${pageTitle}\n\n` : '';
  const body = sections
    .map((s, i) => {
      const h = s.heading ? ` (heading: ${s.heading})` : '';
      const clipped = s.text.length > 2000 ? s.text.slice(0, 2000) + '…' : s.text;
      return `Section ${i + 1} [id=${s.id}]${h}:\n${clipped}`;
    })
    .join('\n\n');

  const schema = `\n\nReturn JSON with this shape exactly:
{
  "sections": [
    { "id": "<section id>", "summary": "<≤20 words>", "suggestedPrompt": "<image prompt>" }
  ]
}`;

  return head + body + schema;
}

export async function analyzePage(
  sections: AnalyzePageSectionInput[],
  pageTitle?: string
): Promise<AnalyzedSection[]> {
  const client = getChatClient();
  const deployment = getAnalyzeDeployment();

  const completion = await client.chat.completions.create({
    model: deployment,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(pageTitle, sections) },
    ],
    response_format: { type: 'json_object' },
  });

  const content = completion.choices?.[0]?.message?.content || '';
  if (!content) {
    throw new Error('Analyze model returned empty content');
  }

  let parsed: LlmResponse;
  try {
    parsed = JSON.parse(content) as LlmResponse;
  } catch (err) {
    throw new Error(`Analyze model returned invalid JSON: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed.sections)) {
    throw new Error('Analyze response missing sections array');
  }

  const byId = new Map(parsed.sections.map((s) => [s.id, s]));
  return sections.map((input) => {
    const found = byId.get(input.id);
    return {
      id: input.id,
      summary: found?.summary || '',
      suggestedPrompt: found?.suggestedPrompt || '',
    };
  });
}
