# Taxtoo

**Taxtoo** is a client-only web app that helps people compute the Italian **IMU** tax and
generate a filled-in **F24**, with AI assistance — saving everything in the user's own
**Google Drive** or **OneDrive**. Multi-platform from one React codebase: PWA/web on GitHub
Pages (`taxtoo.app`), Android via Capacitor, Windows via Electron.

> Integrations (auth, Drive/OneDrive, Azure OpenAI, i18n, Capacitor/Electron/PWA) are adapted
> from the sibling project `personal_assistant`.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| UI | Tailwind CSS v4 |
| State | Zustand (persist) |
| i18n | i18next (IT / EN) |
| PWA | vite-plugin-pwa |
| Android | Capacitor 8 |
| Windows | Electron + electron-builder |
| Auth | Google OAuth + Microsoft MSAL |
| Storage | Google Drive API v3 / Microsoft Graph (OneDrive) |
| AI | Azure OpenAI + Azure Document Intelligence (client-side, user key) |

## Architecture

- **Client-only.** All AI and storage calls go directly from the browser. The user enters their
  Azure OpenAI / Document Intelligence endpoint + key in **Settings**; these are stored in their
  own Drive, never on a server.
- **Provider-agnostic storage** via `src/services/storage.ts`, dispatching to `googleDrive.ts`
  or `oneDrive.ts` (same interface).
- **Deterministic IMU engine** in `src/lib/imu/` (pure TypeScript, unit-tested), separate from
  AI. Flow: AI proposes → user reviews → engine computes → user confirms → save.

See `docs/` for the full functional analysis, data models, Drive layout, backlog and deployment.

## Setup

```bash
npm install
cp .env.example .env   # fill VITE_GOOGLE_CLIENT_ID and VITE_MICROSOFT_CLIENT_ID
npm run dev            # http://localhost:54321
```

OAuth setup:
- **Google**: Cloud Console → OAuth 2.0 Web client. JS origins `http://localhost:54321`,
  `https://taxtoo.app`. Enable the Google Drive API.
- **Microsoft**: Entra ID SPA app registration. Redirect URIs `http://localhost:54321`,
  `https://taxtoo.app`. Permissions `User.Read`, `Files.ReadWrite`.

## Scripts

```bash
npm run dev            # web/PWA dev server
npm run build          # type-check + Vite build -> dist/
npm run preview        # serve the production build
npm run test           # IMU engine unit tests (vitest)
npm run electron:dev   # Windows desktop (Electron) dev
npm run android:run    # Android (needs Android Studio)
```

## Deployment

Push to `main` → GitHub Actions builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`).
Custom domain `taxtoo.app` via `public/CNAME`. Native binaries (`.exe`/`.apk`) are built by
`.github/workflows/release.yml` on a `v*` tag and attached to the GitHub Release.

Required repo secrets: `VITE_GOOGLE_CLIENT_ID`, `VITE_MICROSOFT_CLIENT_ID` (+ Android keystore
secrets for the APK). See `docs/deployment.md`.

## Status

MVP scaffold. Working vertical slice: login → connect Drive → upload document → AI extraction →
IMU calculation → F24 PDF → save to Drive → assistant chat. Follow-ups in `docs/backlog.md`
(official F24 layout, per-comune rates, app icons, real OAuth client IDs, DNS).
