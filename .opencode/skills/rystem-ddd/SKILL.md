---
name: rystem-ddd
description: Use when writing or scaffolding any .NET / C# / backend or React-client code for the IP.advance_estate (Advance Estate) platform - building entities, repositories, APIs, auth, multitenancy, or the DDD project structure with the Rystem framework. Triggers on keywords like .NET, C#, Rystem, IRepository, repository framework, DDD, bounded context, immobile, asset, tenant, TenantId, Advance Estate.
---

# Rystem DDD — build the Advance Estate backend the Rystem way

This skill governs how to generate code for **IP.advance_estate** (project name fixed;
fancy product name "Advance Estate" may change). The platform is an AI-agentic real-estate
ERP: .NET 10 backend, React + shadcn/ui frontend, PostgreSQL multi-tenant SaaS, deployed on
Azure with containers.

## Rule 0 — Consult the Rystem MCP BEFORE writing .NET code

The `rystem` MCP server (`https://rystem.cloud/mcp`) is the source of truth for the Rystem
framework. **Always query it first** instead of guessing APIs:

- `get-rystem-docs-search(query)` to find a topic.
- `get-rystem-docs(id, value)` to read it. Useful categories/topics:
  - `install/rystem` — package names & versions
  - `ddd/single-domain` — project structure (THIS project uses single-domain)
  - `repository/setup` — repository + CQRS configuration
  - `repository/api-server` — auto-generated REST APIs
  - `repository/api-client-typescript` — React client
  - `auth/social-server`, `auth/social-typescript` — authentication
  - `content/repository-blob` — document/file storage
  - `rystem/backgroundjob` — scheduled jobs (e.g. billing runs)

Verify exact package versions against NuGet. **Compatibility caveat:** Rystem docs reference
.NET 6/7/8 and packages `9.1.3`. This project targets **.NET 10** — confirm a compatible
Rystem build exists before pinning versions; flag if not.

## Architecture: SINGLE-DOMAIN structure

Use Rystem's single-domain layout (one cohesive domain, flat layers). Namespace root:
`IP.AdvanceEstate.*`.

```
src/
├── domains/        IP.AdvanceEstate.Core      # entities, value objects, domain events, repo interfaces
├── business/       IP.AdvanceEstate.Business  # application services, use cases, DTOs, validators, mappers
├── infrastructures/IP.AdvanceEstate.Storage   # EF Core (PostgreSQL) + repository implementations + migrations
├── applications/
│   ├── IP.AdvanceEstate.Api                   # ASP.NET Core host (auto-API), MCP server, agent orchestration
│   └── ip.advanceestate.app                   # React + Vite + shadcn/ui
└── tests/          IP.AdvanceEstate.Test       # Rystem.Test.XUnit
```

## Data access — always Rystem.RepositoryFramework

- Register entities with `AddRepository<T, TKey>(...).WithEntityFramework<AppDbContext>(...)`
  using the PostgreSQL provider (`Npgsql.EntityFrameworkCore.PostgreSQL`).
- **Inject `IRepository<T, TKey>`**, never `IRepositoryPattern<T, TKey>`.
- Expose REST automatically via `AddApiFromRepositoryFramework()` + `UseApiFromRepositoryFramework()`.
  Do NOT hand-write CRUD controllers.
- React consumes APIs through the `rystem.repository.client` npm package (type-safe, token
  refresh, retry). Define raw + clean TS interfaces with mapping functions.

## Authentication & roles

- Use `Rystem.Authentication.Social` with a custom `ISocialUserProvider` backed by the
  PostgreSQL `User` repository. JWT bearer + refresh tokens.
- Three role tiers via authorization policies: `SuperAdmin`, `Admin` (tenant admin),
  `User` (tenant user with per-tenant role). Apply per-repository/per-method policies.

## Multitenancy — NON-NEGOTIABLE

Every persisted entity carries `TenantId` (GUID). Every query is tenant-scoped. Apply
defense-in-depth, all layers:

1. **Tenant resolution** from the JWT `tenant` claim into a scoped `ITenantContext`.
2. **Repository business-injection / EF Core global query filter** auto-applying
   `WHERE TenantId = @currentTenantId` on read and stamping `TenantId` on write.
3. **PostgreSQL Row-Level Security** as the last line of defense.

SuperAdmin may switch tenant context and create tenants: a tenant has a human "fancy name"
but its identity/key is always a server-generated **GUID**. Never trust a client-supplied
TenantId; derive it from the authenticated context.

## Conventions

- Entities implement `IEntity<TKey>`; keys are `Guid` unless a natural key fits.
- Encapsulate business rules in the entity/domain service, not in controllers.
- Use `Rystem.BackgroundJob` (CRON) for recurring processes such as monthly billing.
- Use `Rystem.Content` (Blob) for uploaded documents (atti, visure, contracts, Excel).
- Prefer the `realestate-domain` skill for domain terminology and entity shapes.
