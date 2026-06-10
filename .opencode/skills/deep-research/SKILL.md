---
name: deep-research
description: Use when a task needs structured, multi-source investigation rather than a single lookup - competitor analysis, market/data-model research (e.g. IBPDI), regulatory/normative questions (bollettazione, locazioni), technology trade-off studies, or any "find out how X works and synthesize" request. Triggers on phrases like deep research, ricerca approfondita, competitor, market analysis, come funziona, confronta, state of the art.
---

# Deep Research — structured multi-source investigation

Use this workflow when one search is not enough: comparing competitors, reconstructing a
reference data model, checking regulations, or evaluating technical options for the Advance
Estate platform.

## Workflow

1. **Scope** — restate the question, list concrete sub-questions, and define what a complete
   answer looks like (entities? numbers? pros/cons? citations?).
2. **Delegate** — for anything broad or long-running, hand the work to the `researcher`
   subagent via the Task tool. Give it: the sub-questions, required output shape, and how to
   verify. This keeps the main context clean.
3. **Source** — gather from multiple independent sources. Prefer:
   - `context7` MCP for library/framework documentation (React, shadcn, EF Core, .NET, Npgsql).
   - `rystem` MCP for Rystem framework specifics.
   - `websearch` / `webfetch` for market, competitors, standards (IBPDI), regulations.
4. **Cross-check** — never trust a single source for a factual claim. Reconcile conflicts and
   note uncertainty explicitly. Distinguish verified facts from assumptions.
5. **Synthesize** — produce a concise brief: findings first, then supporting detail, with a
   source per non-obvious claim. End with open questions / what could not be confirmed.

## Standing research topics for this project

- **Competitors**: AppFolio, Yardi, Buildium, Entrata, Fluentis (Agentic ERP), Beam AI —
  feature sets, agentic capabilities, pricing posture.
- **Data model**: IBPDI Common Data Model clusters (Asset/Building, Unit, Lease, Financials,
  Documents) for real estate.
- **Regulation/domain**: Italian locazioni, indicizzazione ISTAT, bollettazione, fatturazione
  elettronica, dati catastali / visure.
- **Tech**: .NET 10 + Rystem compatibility, multi-tenant PostgreSQL (RLS, Citus), Azure
  Container Apps, document intelligence / RAG, multi-agent orchestration.

## Output rules

- Lead with the answer; keep it skimmable.
- Cite sources for any claim a stakeholder might challenge.
- Flag assumptions and gaps — do not paper over uncertainty.
