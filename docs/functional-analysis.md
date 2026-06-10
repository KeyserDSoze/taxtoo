# Taxtoo — Functional analysis (MVP)

> Client-only web app (GitHub Pages, domain `taxtoo.app`) that helps people compute Italian
> **IMU** and generate a filled-in **F24**, with AI assistance, saving everything in the user's
> own **Google Drive** or **OneDrive**. Multi-platform (PWA + Android + Windows) from one React
> codebase. Integrations adapted from the sibling project `personal_assistant`.

## 1. Vision

> "I upload a visura catastale, a previous F24 or property documents; the app reads the data,
> helps me complete them, computes the IMU and generates the F24, saving everything in my Drive."

The MVP validates three things:
1. Users are willing to upload cadastral/fiscal documents.
2. AI can extract useful data from those documents.
3. The system can produce a reviewable IMU calculation and F24.

Direct payment is **out of scope** for the first MVP — we generate a ready-to-pay document.

## 2. Target users

- **Private owner** (second home, land/building area, Italian resident abroad, foreign owner of
  an Italian property).
- **Accountant / advisor** — not in MVP, but anticipated (multi-taxpayer).
- **Non-Italian user** — owns property in Italy, speaks English → IT/EN multilingual.

## 3. Architecture (client-only)

- **Frontend**: React + TypeScript + Vite + Tailwind v4 + shadcn/ui, hosted on GitHub Pages.
- **No backend.** AI (Azure OpenAI + Document Intelligence) and storage (Drive/OneDrive) are
  called **directly from the browser**. The Azure endpoint + key are entered by the user in
  **Settings** and stored in their own Drive — never on a server. (Mirrors `personal_assistant`.)
- **Storage**: the user's data lives in **their** Google Drive or OneDrive, not in a central DB.
- **Multi-platform**: Capacitor (Android `.apk`) + Electron (Windows `.exe`), same code.

### Three AI levels
1. **OCR / Document Intelligence** — read F24, visure, scanned PDFs → text, tables, key-value.
   Provider: **Azure Document Intelligence**.
2. **Fiscal LLM assist** — explain data, help the user, map fields, suggest what's missing.
   Provider: **Azure OpenAI**.
3. **Copilot-like chat** — side assistant: "Why am I paying €59?", "What is tax code 3918?",
   "What data is missing?", "Generate the summary in English." Implemented as an internal chat
   powered by Azure OpenAI (no deep Microsoft Copilot integration in MVP).

## 4. Tax engine (separate from AI)

AI **proposes** data, the engine **computes**, the user **confirms**. The IMU engine is
deterministic, pure TypeScript (`src/lib/imu/`), independent of AI, unit-tested.

- **Input**: rendita catastale, categoria, coefficiente, rivalutazione, aliquota, quota possesso,
  mesi possesso, detrazioni, riduzioni, acconto/saldo, anno, comune, codice tributo.
- **Output**: base imponibile, imposta annua, quota dovuta, acconto, saldo, righe F24,
  arrotondamenti, avvisi.
- **Audit**: each calculation records `input_sources`, `manual_overrides`, engine version and a
  `status` (`draft` → `user_confirmed`).

## 5. Multilingual (IT/EN first; ES/FR/DE later)

Translate: interface, error messages, AI explanations, contextual help, compilation wizard,
calculation summary. **Never translate**: F24 model, tax codes (`3916`, `3918`…), codice fiscale,
codice comune (`L612`…), legal references, official tax names.

Distinguish four language layers: **interface**, **AI explanation**, **document**, **output
summary**. Example: interface EN, Italian fiscal documents, AI explanation EN, F24 always IT.

## 6. Privacy & security

Handles sensitive data (codice fiscale, addresses, property data, tax documents). Minimum:
OAuth, no API keys in a server, optional file encryption, explicit consent before AI processing,
ability to delete data, transparent logs, no training on user documents, Drive scope limited to
the app folder where possible, audit of AI actions, account export & delete.

> The app does not keep your documents on its own servers. Documents are saved in your Google
> Drive or OneDrive. AI processing happens only when you request it.

## 7. Core workflows

**First access**: open app → choose language → sign in (Google/Microsoft) → connect Drive →
choose root folder → enter taxpayer data → dashboard.

**New IMU calculation**: "New IMU" → pick year → upload visura / previous F24 → AI analyzes →
review extracted data → fill missing data → engine computes → generate F24 rows → confirm →
save to Drive → generate F24 PDF.

**Reopen practice**: dashboard → select "IMU 2026" → see original documents, extracted data,
calculation, F24, notes, payment status → download / regenerate / edit.

## 8. Practice states

`draft → documents_uploaded → extraction_done → data_to_verify → data_verified →
calculation_generated → f24_generated → paid → archived → error`.

## 9. Edge cases to handle

Unreadable document; visura without rendita; property with multiple owners; missing ownership
share / months owned; unrecognized comune; aliquota unavailable; inconsistent year; previous F24
but no visura; foreign user without codice fiscale; already-paid amount; acconto vs saldo;
ambiguous tax code; duplicate file in Drive.

## 10. Demo target (must work end-to-end)

> Alessandro signs in, connects Google Drive, uploads the IMU F24; the app recognizes the
> taxpayer, codice comune **L612**, tax codes **3916** and **3918**, year **2026**, amounts
> **35,00** and **24,00**, total **59,00**; it saves structured data + PDF in the right folder;
> then it can (re)generate the IMU summary.
