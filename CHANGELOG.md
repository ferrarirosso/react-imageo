# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-08-09

Migration off a retiring model. Microsoft retires **MAI-Image-2e** on
**2026-08-15**; its documented replacement is **MAI-Image-2.5-Flash**.

### Changed
- Image generation moves from MAI-Image-2-efficient to **MAI-Image-2.5-Flash**
  (`2026-06-02`). The request and response shapes are unchanged, so this is a
  deployment swap rather than a rewrite.
- `skuCapacity` for the image deployment raised 1 → 2, the maximum a default
  subscription is granted for this model. Capacity equals requests per minute.
- `IMAGE_MAX_N` default lowered 6 → 2 to match that ceiling. The previous default
  guaranteed `429`s on the surplus of any multi-image request.
- The reported model name is overridable via `IMAGE_MODEL_LABEL` and carried
  through to saved-image metadata, rather than restated as a constant in the panel.
- `AZURE_OPENAI_API_VERSION_IMAGE` is now read by the backend. It was written as
  an app setting but ignored, while the code hardcoded `api-version=preview`;
  the setting is honoured and may be set empty to omit the parameter entirely.

### Fixed
- Removed the `1792x1024` and `1024x1792` sizes — both exceed the 1,056,768 px
  ceiling MAI image models enforce and were rejected with `400`. Replaced with
  `1360x768` and `768x1360`. The panel only ever requested `1024x1024`.
- Dropped the `n` field from the upstream request body. The API accepts it and
  still returns exactly one image; N images has always required N requests.

## [0.1.0] — 2026-05-25

First public release.

### Added
- SPFx 1.23 Application Customizer. A floating launcher on modern pages opens a
  side panel that reads the current page (or selected sections), distils its
  essence, and generates brand-styled images with Microsoft Foundry
  **MAI-Image-2-efficient**.
- Page analysis with **GPT-5 mini**: distils selected sections into a one-line
  essence, a suggested prompt, and Subject / Style / Mood chips — all grounded
  in the page content, none hardcoded.
- Two actions on a generated image: copy to clipboard, and save to the site's image
  library (SiteAssets/AIImages). imageo never modifies the page — the publisher
  places the saved image with the standard Image web part.
- Localization in English, German, French, and Italian. The UI and the distilled
  essence / chips / prompt all follow the user's SharePoint locale.
- Resizable side panel with the chosen width persisted per user.
- Azure Functions v4 (Node 22, TypeScript) backend: `/api/generate-image`,
  `/api/analyze-page`, `/api/distill-scope`.

### Security
- Easy Auth (Entra-required, Return401) in front of the Function App; no function
  key in the browser path — SPFx acquires the token via `AadTokenProvider`.
- Managed identity to Microsoft Foundry in production; no API key in deployed config.
- Tenant-scoped CORS, HTTPS-only, TLS 1.2, FTP disabled.
- Hex/RGB color codes in user input are translated to color names before reaching
  the image model, so they don't surface as literal text on the canvas.
- Content-safety and other model failures are surfaced to the user with a clear,
  localized message instead of a bare status code.

[0.1.0]: https://github.com/ferrarirosso/react-imageo/releases/tag/v0.1.0
