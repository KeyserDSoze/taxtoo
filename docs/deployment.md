# Taxtoo — Deployment

## Hosting model

- **Web / PWA**: static build (`dist/`) deployed to **GitHub Pages**.
- **Custom domain**: `taxtoo.app` via `public/CNAME`. Because we use a custom domain, the Vite
  `base` stays `/` (no repo sub-path). If you ever serve from `https://<user>.github.io/taxtoo/`
  instead, set `VITE_BASE=/taxtoo/` in the workflow.
- **Android `.apk`** and **Windows `.exe`**: built in CI and attached to a GitHub Release per
  version (tag `v<version>` from `package.json`).

## DNS for taxtoo.app

1. In the domain registrar, add the GitHub Pages records for an apex domain:
   - `A` records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - (optional) `AAAA` records for IPv6.
   - `CNAME` for `www` → `<user>.github.io`.
2. In the GitHub repo: Settings → Pages → Custom domain → `taxtoo.app` → Enforce HTTPS.
3. `public/CNAME` already contains `taxtoo.app` so the domain survives each deploy.

## OAuth configuration

Set these as **build-time** env vars (in CI and in `.env` locally):
- `VITE_GOOGLE_CLIENT_ID` — Google Cloud Console → OAuth 2.0 Web client.
  - Authorized JS origins: `http://localhost:54321` (dev), `https://taxtoo.app` (prod).
  - Enable **Google Drive API**.
- `VITE_MICROSOFT_CLIENT_ID` — Entra ID app registration (SPA).
  - Redirect URIs: `http://localhost:54321`, `https://taxtoo.app`.
  - API permissions: `User.Read`, `Files.ReadWrite`.

### Native OAuth (Android / Electron)
- Android in-app browser and Electron use a redirect to `oauth-callback.html`:
  - `https://taxtoo.app/oauth-callback.html` (Android),
    `http://localhost:54321/oauth-callback.html` (Electron).
- Microsoft uses PKCE for the native flow (no MSAL redirect), Google uses the implicit token flow.

## GitHub Pages workflow

`.github/workflows/build-release.yml` runs on push to `main`:
1. Build the Windows `.exe` (Electron) — only if missing for the current version.
2. Build the Android `.apk` (Capacitor) — only if missing for the current version.
3. Build the web `dist/` and deploy to GitHub Pages.
4. Attach `.exe` / `.apk` to the `v<version>` GitHub Release.

To cut a release: bump `version` in `package.json`, commit, push to `main`.

## Local runs

```bash
npm install
npm run dev          # web/PWA dev server (http://localhost:54321)
npm run build        # type-check + Vite build → dist/
npm run preview      # serve the production build locally
npm run electron:dev # Windows desktop (Electron) in dev
npm run android:run  # Android (needs Android Studio + device/emulator)
```
