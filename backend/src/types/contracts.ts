export type ImageSize = '1024x1024' | '1792x1024' | '1024x1792';

export interface GenerateImageRequest {
  prompt: string;
  brandSlang?: string;
  n?: number;
  size?: ImageSize;
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
