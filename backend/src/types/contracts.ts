// Imageo supports square, landscape and portrait output.
export const IMAGE_SIZES = ['1024x1024', '1360x768', '768x1360', '2048x1152', '2048x2048'] as const;
export type ImageSize = typeof IMAGE_SIZES[number];

export interface GenerateImageRequest {
  prompt: string;
  brandSlang?: string;
  n?: number;
  size?: ImageSize;
  transparentBackground?: boolean;
}

export interface GeneratedImage {
  b64: string;
  revisedPrompt?: string;
  model: string;
}

export interface PartialError {
  index: number;
  message: string;
  code?: string;
  serviceResponse?: ImageServiceResponse;
}

export interface ImageServiceResponse {
  httpStatus: number;
  providerCode?: string;
  stage?: 'input' | 'output';
  category?: string;
  message?: string;
  requestId?: string;
}

export interface GenerateImageResponse {
  images: GeneratedImage[];
  partialErrors?: PartialError[];
}

export interface SectionStats {
  wordCount: number;
  headingCount: number;
  listItemCount: number;
  hasCallout: boolean;
  hasImages: boolean;
}

export interface AnalyzePageSectionInput {
  id: string;
  heading?: string;
  text: string;
  stats?: SectionStats;
}

export interface AnalyzePageRequest {
  sections: AnalyzePageSectionInput[];
  intent: 'propose-image-prompts';
  pageTitle?: string;
}

export interface AnalyzedSection {
  id: string;
  summary: string;
  suggestedPrompt: string;
}

export interface AnalyzePageResponse {
  sections: AnalyzedSection[];
}

export interface PagePalette {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

export type PageLayoutType = 'FullWidthImage' | 'CutInShape' | 'ColorBlock' | 'NoImage' | 'Unknown';

export interface PageVisualContext {
  palette?: PagePalette;
  layoutType?: PageLayoutType;
  hasHeroImage?: boolean;
}

export interface DistillScopeRequest {
  scope: 'page' | 'section';
  pageTitle?: string;
  sections: AnalyzePageSectionInput[];
  pageContext?: PageVisualContext;
  locale?: string;
}

export interface DistillChipBag {
  subject: string[];
  style: string[];
  mood: string[];
}

export interface DistillScopeResponse {
  essence: string;
  suggestedPrompt: string;
  chips: DistillChipBag;
}

export interface SuggestEditInstructionRequest {
  brief: string;
  actions?: string[];
  pageBrief?: string;
}

export interface SuggestEditInstructionResponse {
  suggestion: string;
}
