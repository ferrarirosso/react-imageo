import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import {
  IPageSection, ISectionStats, PageLayoutType,
} from '../models/IContracts';
import { logger } from '../utils/logger';

/**
 * Deterministic page scrape via SitePages REST.
 * Reads CanvasContent1 JSON and extracts text from Text web parts grouped by section.
 *
 * This is a best-effort extraction. The editor stores web parts with
 * `controlType: 4` for Text web parts and each has `innerHTML` in
 * `properties.innerHTML` or `innerText` via `serverProcessedContent.htmlStrings.rte`.
 */

interface ICanvasControl {
  controlType?: number;
  position?: { sectionIndex?: number; zoneIndex?: number; controlIndex?: number };
  innerHTML?: string;
  webPartId?: string;
  webPartData?: unknown;
  serverProcessedContent?: { searchablePlainTexts?: Record<string, string>; htmlStrings?: Record<string, string> };
  properties?: { innerHTML?: string; title?: string; heading?: string };
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeStats(htmls: string[], hasImageControl: boolean, plainText: string): ISectionStats {
  const joined = htmls.join(' ');
  const headingCount = (joined.match(/<h[1-6][\s>]/gi) || []).length;
  const listItemCount = (joined.match(/<li[\s>]/gi) || []).length;
  const hasCallout = /<blockquote[\s>]|<aside[\s>]|class="[^"]*callout/i.test(joined);
  const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
  return {
    wordCount,
    headingCount,
    listItemCount,
    hasCallout,
    hasImages: hasImageControl || /<img[\s>]/i.test(joined),
  };
}

function extractControlText(ctrl: ICanvasControl): string {
  const fromInner = stripHtml(ctrl.innerHTML || ctrl.properties?.innerHTML || '');
  if (fromInner) return fromInner;

  const plainTexts = ctrl.serverProcessedContent?.searchablePlainTexts;
  if (plainTexts) {
    return Object.values(plainTexts).map((v) => stripHtml(v)).filter(Boolean).join('\n');
  }
  const htmlStrings = ctrl.serverProcessedContent?.htmlStrings;
  if (htmlStrings) {
    return Object.values(htmlStrings).map((v) => stripHtml(v)).filter(Boolean).join('\n');
  }
  return '';
}

export class PageAnalyzer {
  private readonly sp: SPHttpClient;
  private readonly webUrl: string;
  private readonly pageId: number;

  public constructor(sp: SPHttpClient, webUrl: string, pageId: number) {
    this.sp = sp;
    this.webUrl = webUrl.replace(/\/+$/, '');
    this.pageId = pageId;
  }

  public async extractSections(): Promise<{
    pageTitle: string;
    sections: IPageSection[];
    layout: { layoutType: PageLayoutType; hasHeroImage: boolean; hasCanvasHero: boolean };
  }> {
    const url = `${this.webUrl}/_api/sitepages/pages(${this.pageId})` +
      `?$select=Title,CanvasContent1,LayoutWebpartsContent,BannerImageUrl`;
    const res: SPHttpClientResponse = await this.sp.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Failed to load page ${this.pageId} (${res.status})`);
    }
    const json = await res.json() as {
      Title?: string;
      CanvasContent1?: string;
      LayoutWebpartsContent?: string;
      BannerImageUrl?: { Url?: string } | string | null;
    };
    const pageTitle = json.Title || '';

    const layout = parseLayout(json.LayoutWebpartsContent, json.BannerImageUrl ?? undefined);

    let canvas: ICanvasControl[];
    try {
      canvas = JSON.parse(json.CanvasContent1 || '[]') as ICanvasControl[];
    } catch (err) {
      logger.warn('Failed to parse CanvasContent1', err);
      return { pageTitle, sections: [], layout: { ...layout, hasCanvasHero: false } };
    }

    const bySection = new Map<number, ICanvasControl[]>();
    for (const ctrl of canvas) {
      const sIdx = ctrl.position?.sectionIndex;
      if (typeof sIdx !== 'number') continue;
      if (!bySection.has(sIdx)) bySection.set(sIdx, []);
      bySection.get(sIdx)!.push(ctrl);
    }

    const IMAGE_WEBPART_ID = 'd1d91016-032f-456d-98a4-721247c305e8';
    const HERO_WEBPART_ID = 'c4bd7b2f-7b6e-4599-8485-16504575f590';
    const hasCanvasHero = canvas.some(
      (c) => (c.webPartId || '').toLowerCase() === HERO_WEBPART_ID
    );

    const sections: IPageSection[] = [];
    const sortedKeys = Array.from(bySection.keys()).sort((a, b) => a - b);
    for (const sIdx of sortedKeys) {
      const controls = bySection.get(sIdx)!;
      const texts: string[] = [];
      const rawHtmls: string[] = [];
      let firstHeading = '';
      let hasImageControl = false;
      for (const ctrl of controls) {
        if (ctrl.webPartId && ctrl.webPartId.toLowerCase() === IMAGE_WEBPART_ID) {
          hasImageControl = true;
        }
        // controlType 4 = Text; 3 = web part (some text-like web parts also have text)
        if (ctrl.controlType === 4 || ctrl.controlType === 3) {
          const t = extractControlText(ctrl);
          if (t) {
            if (!firstHeading && t.length < 120) firstHeading = t;
            texts.push(t);
          }
          // Keep raw HTML for structural stats
          if (ctrl.innerHTML) rawHtmls.push(ctrl.innerHTML);
          else if (ctrl.properties?.innerHTML) rawHtmls.push(ctrl.properties.innerHTML);
        }
      }
      const joined = texts.join('\n\n').trim();
      if (joined || hasImageControl) {
        sections.push({
          id: `s${sIdx}`,
          heading: firstHeading || undefined,
          text: joined,
          stats: computeStats(rawHtmls, hasImageControl, joined),
        });
      }
    }

    return { pageTitle, sections, layout: { ...layout, hasCanvasHero } };
  }
}

interface ILayoutControl {
  properties?: {
    layoutType?: string;
    imageSourceType?: number;
    title?: string;
  };
  serverProcessedContent?: {
    imageSources?: { imageSource?: string } | Record<string, string>;
  };
}

function parseLayout(
  layoutJson: string | undefined,
  bannerImageUrl: { Url?: string } | string | undefined
): { layoutType: PageLayoutType; hasHeroImage: boolean } {
  let layoutType: PageLayoutType = 'Unknown';
  let hasHeroImage = false;

  if (typeof bannerImageUrl === 'string' && bannerImageUrl.length > 0) {
    hasHeroImage = true;
  } else if (bannerImageUrl && typeof bannerImageUrl === 'object' && bannerImageUrl.Url) {
    hasHeroImage = true;
  }

  try {
    const parsed = JSON.parse(layoutJson || '[]') as ILayoutControl[];
    const first = parsed[0];
    const lt = first?.properties?.layoutType;
    if (lt === 'FullWidthImage' || lt === 'CutInShape' || lt === 'ColorBlock' || lt === 'NoImage') {
      layoutType = lt;
    }
    const spc = first?.serverProcessedContent?.imageSources;
    if (spc) {
      if ('imageSource' in spc && typeof spc.imageSource === 'string' && spc.imageSource.length > 0) {
        hasHeroImage = true;
      } else {
        // imageSources may be a Record<string, string>
        const rec = spc as Record<string, string>;
        for (const v of Object.values(rec)) {
          if (typeof v === 'string' && v.length > 0) { hasHeroImage = true; break; }
        }
      }
    }
  } catch (err) {
    logger.warn('Failed to parse LayoutWebpartsContent', err);
  }

  return { layoutType, hasHeroImage };
}
