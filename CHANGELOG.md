# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/spec/v2.0.0.html).

## [0.5.6] — Unreleased

- SharePoint package `1.4.1.5` recognises modern pages from SharePoint’s page context. Opening a site at its root, using a different welcome-page name, or navigating back from a library honours the same launcher rules.
- Imageo mounts in a visible SharePoint placeholder and reacts when SharePoint finishes navigating or replaces the placeholder.
- When saving a picture, Imageo asks the current web for its Site Assets library and default view. Last-generation recovery uses the web, library, item and user to identify a page.
- Browsing a library hides its system Forms folder. An ordinary folder named Forms inside another folder remains available.

## [0.5.5] — 2026-11-22

- SharePoint package `1.4.1.4` makes **File type** a gallery filter. Select PNG or JPEG across the current site or inside a library folder.
- The image editor explains each selection tool and shows the brush size. **Resize image** sets the saved PNG dimensions in pixels. The browser can crop and resize a copy in one operation.
- Imageo Function `0.5.2` adds **Suggest an instruction**. GPT-6 Luna drafts editable text from the author's brief, completed model instructions, and an optional page summary. The author reviews the suggestion and chooses **Send** to start the edit.

## [0.5.4] — 2026-11-22

- SharePoint package `1.4.1.3` adds a pulsing outline around the selected area in the image editor. If you have reduced motion enabled, the outline stays still.
- Choosing a preset immediately adds a read-only instruction. Changing the preset settings updates its text. Authors can remove an instruction or type their own in **Additional instruction**, either on its own or alongside a preset. Crop and background fills appear under **Browser actions**.

## [0.5.3] — 2026-11-22

- SharePoint package `1.4.1.2` marks the selected pixels with light and dark diagonal stripes. A thumbnail beside **Instructions** shows the same area while the edit is queued.

## [0.5.2] — 2026-11-22

- The Imageo Function (0.5.1) can refine saved PNGs that contain extra bytes after the image end marker. Existing pictures in Site Assets can be edited directly.

- SharePoint package `1.4.1.1` guides authors through picking a replacement colour, selecting the object, queuing the instruction and sending the edit. The editor also preserves the service response when Foundry blocks an edit.

## [0.5.1] — 2026-11-22

- SharePoint package `1.4.1.0` opens a gallery of PNG and JPEG files from the current site. Search by name, title, or creator, sort by date or creator, and select a picture to refine. Thumbnails paginate as the pane changes size.
- The image editor groups its controls under Object, Background and Image. The selection and brush tools sit directly above the canvas.

## [0.5.0] — 2026-11-22

- SharePoint package `1.4.0.1` adds an image editor for generated pictures and PNG or JPEG files from the current site, and an app catalog icon shared with the Imageo launcher.
- Click to select a subject, correct its outline with brushes, and queue instructions to remove it, recolour it, or replace the scene. Guided edits send a clean PNG and a marked reference to the existing Foundry deployment.
- Make a cutout, choose a solid background, and crop in the browser. Compare, undo, and save the result as a new PNG in Site Assets.

## [0.4.3] — 2026-11-20

- SharePoint package `1.3.2.0` clears the previous image notification as soon as Generate, Retry, or Apply edit starts. On a failed request, expand **Service response** to inspect the status and diagnostic details available from Foundry.

## [0.4.2] — 2026-11-20

- The Function reports when Foundry blocks a generated image during output screening. The pane now explains why no image was returned.

## [0.4.1] — 2026-11-20

- SharePoint package `1.3.1.0` positions the Imageo launcher above the SharePoint Copilot button.

## [0.4.0] — 2026-11-20

- SharePoint package `1.3.0.0` adds three image sizes to the Imageo pane. Choose a 1024×1024 or 2048×2048 square, or a 2048×1152 banner. Enable **Transparent background** to request a PNG cutout.
- **Retry** generates a fresh image with the original prompt, size and background setting. **Refine** sends the selected PNG and an edit instruction to the new `/api/refine-image` endpoint.

## [0.3.1] — 2026-11-20

- SharePoint package `1.2.1.0` builds the Application Customizer with SPFx `1.24.1` and React `18.3.1`.

## [0.3.0] — 2026-11-20

- The image role now requests `MAI-Image-2.7-Flash` version `2026-11-02`.
  The analysis role requests `gpt-6-luna` version `2026-09-22` through Azure OpenAI v1.
- The panel displays the image model reported by the backend after generation.
  Images restored from the local cache retain their model label when available.
- The local settings example uses the deployment names and batch limit from the current configuration.

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
