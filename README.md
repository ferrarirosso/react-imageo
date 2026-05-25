# imageo

A SharePoint SPFx 1.23 Application Customizer that turns the content of a modern
page into brand-styled images, using **Microsoft Foundry MAI-Image-2-efficient**
for generation and **GPT-5 mini** for page analysis.

A publisher opens a modern page, clicks the floating launcher, and the panel reads
the page (or the sections they pick), distils its essence, and generates images
that fit the content. A generated image is saved to the site's image library (or
copied to the clipboard) — the publisher then places it with the standard Image
web part. imageo never modifies the page itself.

<p align="center">
  <img src="./assets/imageo-demo.gif" alt="imageo generating a page-aware image inside SharePoint" width="360" />
</p>

## Architecture

- **`backend/`** — Azure Functions v4 (Node 22, TypeScript). Three HTTP endpoints:
  `/api/generate-image` (MAI-Image-2-efficient, parallel N), `/api/analyze-page`
  and `/api/distill-scope` (GPT-5 mini, JSON).
- **`spfx/`** — SPFx 1.23 (Heft toolchain) Application Customizer. A floating
  launcher in the bottom placeholder opens a Fluent UI panel. Page content is
  read via SharePoint REST; generated images are written to the Site Assets
  library via PnPjs. The page itself is never modified.
- **`spfx/deploy.config.json`** — deployment is handled by the shared
  [`spfx-foundry-deploy`](https://github.com/ferrarirosso/spfx-foundry-deploy)
  (multi-model profile: the two model deployments + an Easy-Auth-protected Function
  proxy). Idempotent; state is written to `.deploy-output.json` (gitignored).

## What gets provisioned

`spfx-foundry-deploy` provisions the full footprint in one resource group — the
Foundry account, the Function proxy, Easy Auth, managed identity + roles, storage,
App Insights, and hardening (see its
[README](https://github.com/ferrarirosso/spfx-foundry-deploy)). imageo's only
addition over a single-model deploy is its `spfx/deploy.config.json`, which declares
**two model deployments**: MAI-Image-2-efficient (image) and GPT-5 mini (analysis).

## Quick start

```bash
# 1. Provision Azure (interactive; discovers tenant/subscription via az).
#    Creates both model deployments + the Easy-Auth-protected Function proxy
#    and writes .deploy-output.json at the repo root.
npx -y github:ferrarirosso/spfx-foundry-deploy deploy --config ./spfx/deploy.config.json

# 2. Build the package — the webpack patch reads .deploy-output.json and bakes
#    the backend URL + API resource into the bundle.
cd spfx && npm install && npm run build   # -> sharepoint/solution/imageo.sppkg
```

Upload `imageo.sppkg` to the App Catalog, approve the API permission request
(SharePoint admin → API access), and add the extension. No property-pane step —
the backend coordinates are compiled in (see *Configuration*).

## Local development

The extension reads its backend coordinates from build-time constants, so to run
the workbench against a local backend, set them when serving:

```bash
cd backend && npm install && npm run build && func start
cd spfx && IMAGEO_BACKEND_URL=http://localhost:7071/api \
  IMAGEO_BACKEND_RESOURCE=api://<backend-aad-app-id> npm start
```

Without the overrides, `npm start` builds against the deployed backend from
`.deploy-output.json`. Locally the backend uses an API key and permits anonymous
calls; in Azure it uses managed identity and requires an Entra token. No key or
tenant identifier is committed — only `*.example` templates are tracked.

## Security posture

The proxy's auth and hardening come from the deployer —
[`spfx-foundry-deploy`](https://github.com/ferrarirosso/spfx-foundry-deploy)
sets up Easy Auth (Entra-required), managed identity to Foundry (no key in
deployed config), tenant-scoped CORS, and platform hardening (HTTPS-only,
TLS 1.2, FTP off, App Insights). The auth chain:
`AadTokenProvider.getToken(backendApiResource)` → `Authorization: Bearer …` →
Easy Auth (audience-pinned) → Function code → managed identity → Foundry.
No function key in the browser bundle.

imageo-specific: hex / RGB color codes in user-typed fields are translated to
color names before reaching the image model (so they don't render as literal
text), and per-section + aggregate request-size caps bound each analysis call.

## Prerequisites

- Node 22 (`>=22.14.0 <23`)
- Azure CLI (`az`), signed in to the target tenant
- Azure Functions Core Tools v4 (`func`)
- Capacity for MAI-Image-2-efficient and GPT-5 mini in the chosen region
  (defaults to Sweden Central)

## Configuration

The deployer discovers tenant + subscription via `az` and prompts for the rest;
no identifiers are hardcoded. It writes the role-named app settings on the Function
App (`AZURE_OPENAI_DEPLOYMENT_IMAGE` / `_ANALYZE`, per-role API versions, shared
endpoint, auth flags) and records the front-end coordinates in `.deploy-output.json`.

**How the backend URL reaches the extension.** An Application Customizer has no
property pane, so the backend coordinates are compiled into the bundle at build
time. The chain is:

1. **Deploy** writes `.deploy-output.json` (`backendUrl`, `backendApiResource`).
2. **`npm run build`** runs the Heft webpack patch (`config/webpack-patch/env-inject.js`),
   which reads `.deploy-output.json` and, via webpack `DefinePlugin`, replaces the
   `process.env.SPFX_IMAGEO_*` references with string literals.
3. At runtime `utils/env.ts` derives the three routes from `backendUrl` and uses
   `backendApiResource` as the AAD token resource (customizer → Fab → Panel →
   `BackendClient`).

Because the values are compiled in, each tenant builds its own `.sppkg` with its
own backend URL — expected for a single-tenant solution. `.deploy-output.json` and
the built `.sppkg` are gitignored. `IMAGEO_DEBUG=true` enables verbose backend
logging (off by default).

## Working within SharePoint's model

imageo stays inside SharePoint's supported extensibility guardrails. It **never
modifies the page** — no DOM manipulation, no writes to a page's internal
`CanvasContent1` canvas. The only thing it persists to SharePoint is the generated
image, written to the **Site Assets** library (`SiteAssets/AIImages`), a first-class
SharePoint store. The publisher then places it with the standard Image web part (or
pastes it from the clipboard). Staying out of the page's canvas avoids the editor's
client-side React state and co-authoring locks entirely.

## Teardown

```bash
npm run teardown
```

Deletes the resource group and the Entra app registration. Cognitive Services
soft-delete lasts 48 h; the purge command is printed.

## License

MIT — see [LICENSE](./LICENSE).
