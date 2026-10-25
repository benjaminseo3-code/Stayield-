# Architecture

Stayield is a Next.js (App Router, TypeScript strict) app. All business rules live in plain modules
under `src/lib`; pages and routes are thin. Everything external sits behind a **port** with a local
implementation, so moving to Supabase (or any other provider) is a configuration/adapter change.

```
src/
  app/            routes: pages, server actions (app/actions), route handlers (app/api)
  components/     UI (server components by default; "use client" only where needed)
  adapters/       implementations of the ports (+ index.ts registry)
  ports/          interfaces: storage, mailer, inbound-email, auth
  db/             Drizzle schema, client (PGlite or Postgres), migrations in /drizzle
  lib/
    policies.ts   THE access rules (who may see/do what)
    access.ts     access-request state machine (pending, info_requested, approved, declined, withdrawn, revoked)
    data/         guarded reads (locked/full listing, report); they call policies before returning anything
    ingest/       parsing, checks, DKIM verification, aggregation, persistence (pure + service)
    metrics/      report maths and the public income band
  i18n/           EN + HE dictionaries (every string), server/client helpers
```

## Ports and adapters

| Port | Local (dev) | Production plug-in |
| --- | --- | --- |
| `StorageAdapter` | `LocalStorage` -> `./.data/files` | `DatabaseStorage` (`storage_objects` table, used on Vercel). S3 / Supabase Storage: implement `put/get/exists/delete/deletePrefix`, register in `adapters/index.ts` (`STORAGE_ADAPTER`) |
| `Mailer` | `OutboxMailer` -> `./.data/outbox`; `LogMailer` (`MAILER=log`) | Postmark/SES/Resend: implement `send()` and return it from `getMailer()` |
| `InboundEmailProvider` | `GenericInboundProvider` (raw RFC 822 / multipart / JSON base64) | one small adapter per provider that maps its webhook to raw bytes |
| `AuthAdapter` | Better Auth, email + password (`adapters/auth.ts`) | same; add email verification once a mailer is wired |

## Supabase (production setup)

1. **Database**: `DATABASE_URL` is the Supabase transaction pooler (port 6543) for a dedicated role
   `stayield_app` that owns nothing outside the `stayield` schema. All tables, enums and the Drizzle
   migration table live in `stayield` (`pgSchema("stayield")`), so the app can share a Supabase project
   with other tables in `public` without touching them. TLS verifies against the bundled Supabase CA
   (`certs/`). The pool is small (`DATABASE_POOL_MAX`, default 3) because every serverless instance
   opens its own.
2. **Migrations**: `pnpm db:migrate` runs at build time. `0001_enable_rls.sql` enables RLS on every table
   with no policies, i.e. the Supabase Data API (anon/authenticated) can read nothing. The Data API is
   also switched off on the project.
3. **Storage**: photos, blurred variants and evidence live in `storage_objects` (bytea). Keys are
   `photos/<propertyId>/<photoId>/{full.webp,full.jpg,thumb.webp,blur.webp}` and
   `private/submissions/<id>/evidence.json`.
4. **Auth**: Better Auth keeps its tables in the same schema. Supabase Auth is not used.

## Trust model and data flow

```
seller ──forward-as-attachment──▶ p-<token>@inbound.<domain>
                                   │  provider webhook  POST /api/inbound-email  (secret, rate limit)
                                   ▼
        verifyForwardedReport:  original message extracted ─▶ DKIM verified now (injectable DNS)
        checks: trusted+aligned sender · From/Date/To signed · whole body signed (no l=)
                Date ≤ 7 days · signed To ∈ seller's verified emails · never seen before (sha256)
                                   ▼
        CSV from the SIGNED body ─▶ allow-list parser (guest columns never read) ─▶ reliability checks
                                   ▼
        persistSubmission: hashed reservations + monthly aggregates + teaser band + evidence headers
                                   ▼
        evaluatePropertyStatus: live (pass/warn + consent) · review (any fail) · data_pending
```

- `signed_email`: DKIM-verified at ingestion. `self_reported`: CSV rows cleaned in the browser and
  re-validated/re-checked on the server. `api_verified`: reserved enum value, disabled in the UI.
- **Guest data is never stored**: the parser reads only mapped columns; rows with extra fields are
  rejected by the server schema; confirmation codes are stored as keyed one-way hashes; the raw message
  is not kept (only its SHA-256 and the original *headers*) - see `docs/OPEN_QUESTIONS.md` #7.
- **Honest metrics**: "booked nights ÷ days in period", gross and net separately, coverage dates and
  trust tier always shown; there is no occupancy figure anywhere.

## Access control

`lib/policies.ts` is the single source of rules. `lib/data/*` call it before returning data and throw
`ForbiddenError` otherwise. Unknown actor/status means deny.

- **Locked listing** (anyone who is not owner/admin/approved investor): the server returns a different
  shape with price, neighbourhood, size, description, listing URL, income and report set to null, decoy
  values on screen, and only the pre-blurred `blur.webp` photo variant is served. Nothing private is
  sent to the browser and then hidden with CSS.
- **Full listing and report**: owner and admin always; an investor only with an `approved` request and a
  `live` property.
- **Request access** (`canRequestAccess`): role buyer, not the owner, property live, investor profile
  submitted or verified, no active request, 7-day cooldown after a decline.
- **Decide** (`canDecideRequest`): the owner only. The owner sees the investor profile; phone and email
  are visible only after approval. Admins can review profiles for trust and safety.
- Investor replies to an info request move it back to `pending`.

API routes additionally require a same-origin `Origin` for mutations.

## Security measures

- Email + password (Better Auth, 8-128 chars), rate limited; sign-up can only create buyer or seller roles; admins only from env/seed.
- In-memory rate limits on uploads, CSV, inbound webhook, access requests and email changes
  (`lib/rate-limit.ts`). **Single-instance only**: use Redis/Upstash behind several instances.
- Uploads validated by magic bytes, re-encoded (EXIF/GPS removed), 15 MB / 30 photos, decode limits.
- Webhooks fail closed: inbound needs `x-webhook-secret`.
- CSP, HSTS, `nosniff`, frame denial, Referrer/Permissions policy (`next.config.ts`).
  Known limitation: `script-src` allows `'unsafe-inline'` (Next.js hydration); a nonce policy is a
  later hardening.
- Open redirects blocked (`safeNext`); secrets only via env; `.env*` is git-ignored.

## Testing

- Vitest (`pnpm test`): parsing, checks, aggregation, DKIM (locally generated keys + mocked DNS),
  policies and access state machine (PGlite), photos, rate limiting, metrics.
- Playwright (`pnpm test:e2e`, needs `pnpm build`): journeys for investor, seller, admin and a visual tour
  of every page in EN/HE at desktop and mobile with axe (WCAG 2.1 A/AA), overflow, `dir`/`lang` and
  console-error assertions. Screenshots land in `./screenshots`.
