declare interface IImageoApplicationCustomizerStrings {
  Title: string;
  FabLabel: string;
  PanelTitle: string;
  PanelSubtitle: string;
  FooterHtml: string;
  FooterLinkLabel: string;
  FooterLinkHref: string;
  GenerateButton: string;
  CancelButton: string;
  Close: string;
  PromptLabel: string;
  PromptPlaceholder: string;
  AnalyzeToggle: string;
  BrandSlangLabel: string;
  BrandSlangPlaceholder: string;
  BrandSlangSaved: string;
  CopyToClipboard: string;
  ToastClipboardOk: string;
  ToastClipboardFail: string;
  SaveToAssets: string;
  Discard: string;
  ToastGenerated: string;
  ToastSaved: string;
  ToastUrlCopied: string;
  ToastImageCopyFail: string;
  ToastQuotaError: string;
  NoSections: string;

  // Panel / Composer — UI labels
  EssenceTitle: string;
  PaletteLabel: string;
  AnalyzeToggleLabel: string;
  AnalyzeToggleHelp: string;
  SectionsHeading: string;
  ThisPageFallback: string;
  NSectionsNSelected: string;
  SelectAllCta: string;
  ClearCta: string;
  NoTextSections: string;
  AnalyzeCta: string;
  ReAnalyzeCta: string;
  AnalyzingCta: string;
  PromptFieldLabel: string;
  PromptFieldPlaceholder: string;
  ChipSubject: string;
  ChipStyle: string;
  ChipMood: string;
  HideCta: string;
  BrandSlangAddCta: string;
  BrandSlangEditPrefix: string;
  BrandSlangHexTip: string;
  GeneratingCta: string;
  ReadingPageLabel: string;
  ReadingPageDesc: string;

  // Phase tickers
  AnalyzePhase1: string;
  AnalyzePhase2: string;
  AnalyzePhase3: string;
  GeneratePhase1: string;
  GeneratePhase2: string;
  GeneratePhase3: string;

  // FAB / Panel header
  FabSubtitle: string;
  PreviewBadge: string;
  PanelSubtitleFull: string;

  // Panel toasts / actions
  ToastRestored: string;
  ToastExtractFailed: string;
  ToastOpenInLibrary: string;

  // Results grid
  ResultsRestoredPrefix: string;
  ResultsGeneratedFromPrefix: string;
  ResultsCopiedOk: string;
  ResultsSavedOk: string;
  ResultsRetryCta: string;
  AgoSec: string;
  AgoMin: string;
  AgoHr: string;

  // Image browser
  LibraryHeading: string;
  LibraryEmptyHtml: string;

  // Section stats
  StatsWords: string;
  StatsHeadings: string;
  StatsListItems: string;
  StatsCallout: string;
  StatsImages: string;

  // Resize handle
  ResizePanelAria: string;

  // Generate-error surfacing
  ToastContentSafetyTitle: string;
  ToastContentSafetyBody: string;
  ToastGenerateFailed: string;
  ToastInvalidPrompt: string;
  ToastViewDetails: string;
}

declare module 'ImageoApplicationCustomizerStrings' {
  const strings: IImageoApplicationCustomizerStrings;
  export = strings;
}
