// Mirrors backend/src/types/contracts.ts.
export type ImageSize = '1024x1024' | '1360x768' | '768x1360' | '2048x2048' | '2048x1152';

export interface IGenerateRequest {
  prompt: string;
  brandSlang?: string;
  n: number;
  size: ImageSize;
  transparentBackground?: boolean;
}

export interface IRefineRequest {
  imageBase64: string;
  guideBase64?: string;
  instruction: string;
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
  serviceResponse?: IImageServiceResponse;
}

export interface IImageServiceResponse {
  httpStatus: number;
  providerCode?: string;
  stage?: 'input' | 'output';
  category?: string;
  message?: string;
  requestId?: string;
}

export interface IGenerateResponse {
  images: IGeneratedImage[];
  partialErrors?: IPartialError[];
}

export interface IRefineResponse {
  image: IGeneratedImage;
}

export interface ISuggestInstructionRequest {
  brief: string;
  actions?: string[];
  pageBrief?: string;
}

export interface ISuggestInstructionResponse {
  suggestion: string;
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

export interface IToast {
  id: string;
  kind: 'success' | 'error' | 'warning' | 'info';
  message: string;
  clearOnNextImage?: boolean;
  serviceResponse?: IImageServiceResponse;
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
    // The SPFx ES5 build calls Error as a function, which returns a plain Error.
    Object.setPrototypeOf(this, new.target.prototype);
    this.status = status;
    this.code = code;
    this.body = body;
    this.name = 'BackendError';
  }
}
