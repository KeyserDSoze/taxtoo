# AGENTS.md — Taxtoo

## What this is

**Taxtoo** is a **client-only** web app (no application server) that helps people compute
Italian **IMU** (and, later, other local taxes) with AI assistance. The user uploads cadastral
and tax documents (visura catastale, previous F24, deeds), AI extracts the data, the app
computes the IMU and generates a filled-in **F24**, and everything is saved into the user's own
**Google Drive** or **OneDrive**.

The app is multi-platform from the same React codebase:
- **PWA / web** hosted on **GitHub Pages** (custom domain `taxtoo.app`)
- **Android** native app via **Capacitor**
- **Windows** desktop app via **Electron**

Current stage: **MVP / prototype**. Bias toward a convincing, good-looking vertical slice
(login → connect Drive → upload F24/visura → AI extraction → IMU calc → F24 PDF → save to Drive)
over completeness.

> The architecture and all third-party integrations are **adapted from the sibling project**
> `C:\Users\aless\source\code\personal_assistant` (same auth, Drive/OneDrive, Azure OpenAI,
> i18n, Capacitor + Electron + PWA setup). When in doubt about how an integration works, read
> that project first and mirror its pattern.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| UI | Tailwind CSS v4 + shadcn/ui |
| State | Zustand (with `persist`) |
| i18n | i18next + react-i18next (IT / EN first) |
| PWA | vite-plugin-pwa (Workbox) |
| Android | Capacitor 8 |
| Windows | Electron + electron-builder |
| Auth | Google OAuth 2.0 (`@react-oauth/google`) + Microsoft MSAL (`@azure/msal-*`) |
| Storage | Google Drive API v3 / Microsoft Graph (OneDrive) — user's own cloud |
| AI (extraction + reasoning) | User-selected provider: Azure OpenAI / OpenAI / Google Gemini (client-side, user key). Documents read directly by the multimodal model — no separate OCR. Microsoft 365 Copilot is a selectable option (direct calls not wired yet). |
| Hosting | GitHub Pages (static) + GitHub Releases (.apk / .exe) |

## Hard rules

1. **Client-only. No backend.** All AI and storage calls go **directly from the browser**.
   Azure OpenAI / Document Intelligence keys and endpoints are entered by the user in
   **Settings** and stored in the user's own Drive (App Data / app folder), never on a server.
   This mirrors `personal_assistant`. (If a backend is ever added, it's a separate, explicit
   decision — do not introduce one silently.)
2. **The user's data lives in the user's Drive, not in any central DB.** Documents, extractions,
   calculations, F24 PDFs and `settings.json` are all written to the chosen provider
   (Google Drive or OneDrive). The app keeps only ephemeral/UI state locally (Zustand `persist`).
3. **Storage is provider-agnostic via a dispatcher.** Components import from
   `src/services/storage.ts`, never from `googleDrive.ts` / `oneDrive.ts` directly. The two
   adapters expose the **same interface** so the provider can be swapped from one field on the
   user object (`provider: 'google' | 'microsoft'`).
4. **Separate AI from the tax engine.** AI only *proposes* structured data and *explains*.
   The selected provider (Azure OpenAI / OpenAI / Gemini) reads documents directly (multimodal,
   no separate OCR). The **IMU calculation engine is deterministic, pure TypeScript**
   (`src/lib/imu/`), independent of AI, fully unit-tested. Flow is always:
   **AI proposes → user reviews/edits → engine computes → user confirms → save**.
5. **Every calculation is auditable.** Each `TaxCalculation` records its input sources, any
   manual overrides, the engine version, and a status (`draft` → `user_confirmed`).
6. **Multi-platform parity.** Any feature must work on web/PWA, Android (Capacitor) and Windows
   (Electron). Watch the native OAuth paths (PKCE redirect via `oauth-callback.html`), the
   `base` differences (`/` for custom domain, `./` for Electron), and Service Worker
   unregistration on native/desktop.
7. **i18n is non-negotiable, and it has layers.** Translate UI, error messages, AI explanations,
   contextual help, wizards and summaries. **Never translate** the F24 model, tax codes
   (`3916`, `3918`, …), `codice fiscale`, `codice comune` (e.g. `L612`), official tax names or
   legal references. Distinguish **interface language**, **AI-explanation language**,
   **document language** and **output-summary language**.
8. **Frontend must look good.** Use the `frontend-design` and `make-interfaces-feel-better`
   skills together with the `shadcn` MCP for every UI task. Polish: typography, spacing, motion,
   micro-interactions. Never ship generic "AI slop".
9. **Human-in-the-loop for agentic actions:** propose → confirm → execute. Especially before
   writing/overwriting files in the user's Drive or generating an F24.
10. **Privacy first.** Sensitive data (codice fiscale, addresses, property data, tax documents).
    No tracking/analytics. Explicit consent before any AI processing. Drive scope limited to the
    app folder where possible. Provide export and delete.

## Domain (IMU MVP)

Priority demo scenario (must work end-to-end):

> Alessandro signs in, connects Google Drive, uploads an IMU F24; the app recognizes the
> taxpayer, codice comune **L612**, tax codes **3916** and **3918**, year **2026**, amounts
> **35,00** and **24,00**, total **59,00**; it saves the structured data and the PDF in the
> right folder; then it can (re)generate the IMU summary.

Core entities: `Taxpayer`, `Property`, `TaxDocument`, `Extraction`, `TaxCalculation`, `F24`.
Practice states: `draft → documents_uploaded → extraction_done → data_to_verify → data_verified
→ calculation_generated → f24_generated → paid → archived → error`.

See `docs/` for the full functional analysis, data models, Drive folder layout and backlog.

## Drive folder layout (per provider, same shape)

```
/Taxtoo
  /settings            ← settings.json (Google: App Data Folder; OneDrive: app folder)
  /taxpayers
    /<FISCAL_CODE>
      profile.json
      /properties/<COMUNE>_<id>/property.json + documents + extractions + calcoli + f24
      /payments/<year>/f24_...pdf
```

## Tooling

- MCP `context7` — up-to-date library docs (React, shadcn, Vite, MSAL, Graph, Drive, i18next).
- MCP `shadcn` — UI component generation.
- Skills: `frontend-design`, `make-interfaces-feel-better` (use for every UI task),
  `deep-research` for broad investigation.
- **Reference project**: `C:\Users\aless\source\code\personal_assistant` — copy integration
  patterns (auth, Drive/OneDrive, Azure OpenAI, i18n, Capacitor/Electron/PWA, CI workflow).

## Layout

```
docs/                       functional analysis, data models, backlog, deploy notes
index.html
package.json                React/Vite/Capacitor/Electron scripts + deps
vite.config.ts              base '/', PWA manifest (Taxtoo), version define
capacitor.config.ts         appId com.taxtoo.app
tsconfig*.json / eslint.config.js
.env.example                VITE_GOOGLE_CLIENT_ID, VITE_MICROSOFT_CLIENT_ID
public/                     icons, favicon, CNAME (taxtoo.app), oauth-callback.html
electron/                   Electron main + preload (Windows)
src/
  main.tsx, App.tsx         HashRouter, providers, auth restore, token refresh
  config/msal.ts            MSAL config + scopes
  store/useStore.ts         Zustand store (taxpayers/properties/documents/calculations)
  types/index.ts            domain types
  services/
    googleDrive.ts          Google Drive API v3 adapter
    oneDrive.ts             Microsoft Graph (OneDrive) adapter (same interface)
    storage.ts              provider dispatcher (import this from components)
    aiClient.ts             AI provider dispatch (Azure OpenAI / OpenAI / Gemini), multimodal
    ai.ts                   fiscal/property extraction + chat + summary (reads files directly)
  lib/imu/                  deterministic IMU engine (pure, unit-tested) + tax-code dictionary
  i18n/                     i18next setup + locales (it, en, …)
  hooks/                    useTheme, useTokenRefresh, useInstallPrompt, …
  components/
    Auth/ Layout/ Dashboard/ Documents/ Calculations/ Settings/ Assistant/ Legal/ Download/
.github/workflows/          CI: build & deploy Pages + release .apk/.exe
```

## Run locally (after `npm install`)

```bash
npm run dev            # Vite dev server (web/PWA)
npm run build          # type-check + Vite build → dist/
npm run android:run    # build + sync + run on Android (needs Android Studio)
npm run electron:dev   # Vite + Electron (Windows desktop)
```

## Deployment

- **Web**: push to `main` → GitHub Actions builds and deploys `dist/` to GitHub Pages.
  Custom domain `taxtoo.app` via `public/CNAME`; Vite `base` stays `/`.
- **Android `.apk` / Windows `.exe`**: built in CI and attached to a GitHub Release per version.

## Conventions

- App name is **Taxtoo**; package/app ids use `taxtoo` (`com.taxtoo.app`). Bump `version` in
  `package.json` for every release (drives PWA update + release tags).
- New features ship with tests where it matters most: the **IMU engine** and any data mapping
  get unit tests; integration of Drive/OneDrive adapters is verified manually against a real
  account for the MVP.
- Italian and English copy live in `src/i18n/locales/`. Add a key to **all** active locales.
