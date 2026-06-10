---
name: realestate-domain
description: Use when modeling entities, writing functional analysis, designing data models, or building features for the Advance Estate real-estate ERP - covers immobili/assets, unità immobiliari, dati catastali/visure, contratti di locazione, canoni, bollettazione (ciclo attivo), ciclo passivo, locatari, società/fondi. Triggers on Italian real-estate terms like immobile, asset, locazione, canone, bolletta, catasto, visura, locatario, SGR.
---

# Real Estate Domain — Advance Estate glossary & rules

Domain knowledge for an Italian institutional real-estate ERP (target: SGR, asset/property
managers, istituzional investors). Use this when shaping entities, DTOs, analisi funzionale,
or agent prompts. Keep terminology consistent with this glossary.

## Core entities (single-domain, all carry TenantId: GUID)

- **Immobile / Asset** — the building or property. Key fields: indirizzo, città, tipologia
  (ufficio, residenziale, commerciale, industriale), superficie (mq), dati catastali,
  rendita catastale, società proprietaria / fondo, stato (a reddito, sfitto, in ristrutturazione).
- **Unità immobiliare** — sub-unit of an immobile (appartamento, piano, negozio). Has its own
  superficie, dati catastali (foglio, particella, subalterno), categoria catastale.
- **Dati catastali** — foglio, particella, subalterno, categoria, classe, consistenza,
  rendita catastale, comune censuario. Extracted from **visura catastale** or **atto notarile**.
- **Società proprietaria / Fondo** — legal owner / investment vehicle holding assets.
- **Locatario (Tenant/Conduttore)** — the lessee. NOTE: disambiguate from the SaaS *tenant*
  (use "Locatario" for the lessee, "Tenant" only for the multi-tenant SaaS owner).
- **Contratto di locazione (Lease)** — links immobile/unità to a locatario. Fields: data inizio,
  data fine, durata, canone (importo, periodicità), indicizzazione ISTAT, deposito cauzionale,
  rinnovi/proroghe, stato (attivo, scaduto, disdettato).
- **Canone** — recurring rent amount tied to a contratto; periodicità (mensile/trimestrale),
  scadenze, indicizzazione.
- **Bolletta / Fattura (ciclo attivo)** — billing issued TO the locatario for canoni and
  spese accessorie. Fields: periodo di competenza, importo, IVA, scadenza, stato pagamento.
- **Ciclo passivo** — costs paid BY the owner: utenze, manutenzioni, spese condominiali,
  fornitori. Linked to immobile.
- **Documento** — uploaded file (atto di apporto, atto notarile, visura, contratto, Excel).
  Stored via Content Repository; subject to AI extraction into structured entities.

## Reference data model

Inspired by the **IBPDI Common Data Model** for real estate (Asset/Building → Unit →
Lease → Financials → Documents). When in doubt about clusters/relationships, research IBPDI
via the `deep-research` skill rather than inventing structure.

## Priority use cases (mock-up demo, 4 weeks)

1. **Conversational portfolio search** — "Mostrami gli immobili a Milano del Centro Alfa" →
   filter assets by città/tipologia/portafoglio, return table + map.
2. **Asset ingestion from document** — upload atto notarile / visura / Excel → AI extracts
   indirizzo, mq, dati catastali, proprietario → creates/updates the Immobile (with
   human-in-the-loop confirmation).
3. **Billing run** — "Emetti le bollette di aprile per questi immobili" → fetch active
   contratti, compute canoni, generate preview bollette to confirm before emission.

## Interaction principles

- **Agentic-first UI**: chat as primary modality; optional right-side chat widget; optional
  classic back-office toggle.
- **Human-in-the-loop**: agents PROPOSE (preview form/table), user CONFIRMS, system EXECUTES.
  Critical operations (emission, anagrafica updates) always require confirmation.
- Operations are tenant-scoped and audit-logged.
