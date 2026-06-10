# Taxtoo — Backlog (MVP)

## Must have
- Login Google / Microsoft
- Choose Google Drive or OneDrive
- Create ordered folder structure
- Upload documents + save to Drive
- Taxpayer profile
- Property sheet
- Data extraction from F24 (AI)
- Basic extraction from visura
- Manual / assisted IMU calculation
- Generate F24 PDF
- IT/EN multilingual
- AI assistant chat
- Calculation audit
- JSON export

## Should have
- Compare with previous-year F24
- Deadline management
- Acconto/saldo reminders
- Bilingual PDF summary
- Missing-data validator
- Document search in Drive
- Automatic backup

## Could have
- Ravvedimento operoso
- Direct payment
- Accountant / multi-taxpayer management
- TARI, IMU declaration
- pagoPA integration

## Not MVP
- Direct bank payment
- Binding automated fiscal advice
- Full coverage of all local taxes
- Digital signature, SPID/CIE

## Build order (this scaffold)
1. ✅ AGENTS.md + docs
2. App config (package.json, vite, ts, capacitor, electron, eslint, index.html)
3. Integration services (googleDrive, oneDrive, storage, msal)
4. AI services (azureOpenAI chat/extraction, documentIntelligence)
5. Domain (types, store, lib/imu engine + tax codes)
6. i18n IT/EN
7. UI (Auth, Layout, Dashboard, Documents, Calculations, Settings, Assistant, Legal)
8. public (CNAME, oauth-callback, icons) + deploy workflow
9. README + install/build verify

## Open items / next steps after scaffold
- Real F24 PDF generation (pdf-lib template matching the official model layout).
- IMU calculation formula refinement per comune aliquote (rates sheet ingestion).
- App icons / branding assets (replace placeholders).
- OAuth client IDs (Google + Microsoft) for taxtoo.app + localhost.
- DNS for taxtoo.app → GitHub Pages.
