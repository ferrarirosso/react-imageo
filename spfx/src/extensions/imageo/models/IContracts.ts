export type ImageSize = '1024x1024' | '1792x1024' | '1024x1792';

export interface IGenerateRequest {
  prompt: string;
  brandSlang?: string;
  n: number;
  size: ImageSize;
}

export interface IGeneratedImage {
  b64: string;
  revisedPrompt?: string;
  model: string;
}

export interface IPartialError {
  index: number;
  message: string;
  code?: string;
}

export interface IGenerateResponse {
  images: IGeneratedImage[];
  partialErrors?: IPartialError[];
}

export interface ISectionStats {
  wordCount: number;
  headingCount: number;
  listItemCount: number;
  hasCallout: boolean;
  hasImages: boolean;
}

export interface IPageSection {
  id: string;
  heading?: string;
  text: string;
  stats?: ISectionStats;
}

export interface IPalette {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

export type PageLayoutType = 'FullWidthImage' | 'CutInShape' | 'ColorBlock' | 'NoImage' | 'Unknown';

export interface IPageVisualContext {
  palette?: IPalette;
  layoutType?: PageLayoutType;
  hasHeroImage?: boolean;
}

export interface IDistillRequest {
  scope: 'page' | 'section';
  pageTitle?: string;
  sections: IPageSection[];
  pageContext?: IPageVisualContext;
  locale?: string;
}

export interface IDistillChips {
  subject: string[];
  style: string[];
  mood: string[];
}

export interface IDistillResponse {
  essence: string;
  suggestedPrompt: string;
  chips: IDistillChips;
}

export interface IAnalyzedSection {
  id: string;
  summary: string;
  suggestedPrompt: string;
}

export interface IAnalyzeRequest {
  sections: IPageSection[];
  intent: 'propose-image-prompts';
  pageTitle?: string;
}

export interface IAnalyzeResponse {
  sections: IAnalyzedSection[];
}

export interface IBrowserTile {
  name: string;
  serverRelativeUrl: string;
  timeLastModified: string;
  length: number;
  title?: string;
}

export interface IToast {
  id: string;
  kind: 'success' | 'error' | 'warning' | 'info';
  message: string;
  action?: {
    label: string;
    onClick?: () => void;
    /** If set, renders as <a href=...> with target=_blank + data-interception="off"
     *  so SharePoint's SPA navigation doesn't swallow the click. */
    href?: string;
  };
  stickyUntilDismiss?: boolean;
}

export class BackendError extends Error {
  public status: number;
  public code?: string;
  public body?: unknown;
  public constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
    this.name = 'BackendError';
  }
}
