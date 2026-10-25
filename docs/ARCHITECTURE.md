# Architecture

Stayield is a Next.js (App Router, TypeScript strict) app. All business rules live in plain modules
under `src/lib`; pages and routes are thin. Everything external sits behind a **port** with a local
implementation, so moving to Supabase (or any other provider) is a configuration/adapter change.

```
src/
  app/            routes: pages, server actions (app/actions), route handlers (app/api)
  components/     UI (server components by default; "use client" only where needed)
  adapters/       implementations of the ports (+ index.ts registry)
  ports/          interfaces: storage, mailer, inbound-email, payment, auth
  db/             Drizzle schema, client (PGlite or Postgres), migrations in /drizzle
  lib/
    policies.ts   THE access rules (who may see/do what)
    data/         guarded reads (teaser, report); they call policies before returning anything
    ingest/       parsing, checks, DKIM verification, aggregation, persistence (pure + service)
    metrics/      report maths and the public income band
  i18n/           EN + HE dictionaries (every string), server/client helpers
```

## Ports and adapters

| Port | Local (dev) | Production plug-in |
| --- | --- | --- |
| `StorageAdapter` | `LocalStorage` -> `./.data/files` | S3 / Supabase Storage: implement `put/get/exists/delete/deletePrefix`, register in `adapters/index.ts` (`STORAGE_ADAPTER`) |
| `Mailer` | `OutboxMailer` -> `./.data/outbox` (+ `/dev/outbox`) | Postmark/SES/Resend: implement `send()` and return it from `getMailer()` |
| `InboundEmailProvider` | `GenericInboundProvider` (raw RFC 822 / multipart / JSON base64) | one small adapter per provider that maps its webhook to raw bytes |
| `PaymentProvider` | `MockPaymentProvider` (refuses to run in production) | `StripePaymentProvider` (Checkout, test mode with `sk_test_` keys, signed webhook) |
| `AuthAdapter` | Better Auth + magic link (`adapters/auth.ts`) | same; swap the mailer for real delivery |

## Moving to Supabase

1. **Database**: set `DATABASE_URL` to the Supabase Postgres connection string. The client uses
   `node-postgres` when it is set and applies the same Drizzle migrations from `/drizzle`
   (`pnpm db:migrate`). Everything is Postgres-dialect SQL; PGlite is only the dev/test engine.
2. **Storage**: add a Supabase Storage adapter (same five methods). Keys are already
   `photos/<propertyId>/<photoId>/{full.webp,full.jpg,thumb.webp}` and
   `private/submissions/<id>/evidence.json`; keep the `private/` prefix in a private bucket.
3. **RLS**: the same rules as `lib/policies.ts` are written out as SQL in
   [`RLS_POLICIES.md`](./RLS_POLICIES.md). Because the app talks to Postgres with its own server
   credentials, RLS is defence in depth; the application layer remains the primary enforcement.
4. **Auth**: Better Auth keeps its tables in the same database. Supabase Auth is not needed.

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

`lib/policies.ts` is the single source of rules (teaser, report, reservation rows, raw submissions,
unlock, moderation). `lib/data/*` call it before returning data and throw `ForbiddenError` otherwise;
tests cover anonymous, buyer, unlocked buyer, other buyer, owner and admin. API routes additionally
require a same-origin `Origin` for mutations. Unknown actor/status means deny.

## Security measures

- Magic-link login (Better Auth), 5 emails/minute limit; admins only via `ADMIN_EMAILS` + verified link.
- In-memory rate limits on uploads, CSV, inbound webhook, unlock, intro requests and email changes
  (`lib/rate-limit.ts`). **Single-instance only**: use Redis/Upstash behind several instances.
- Uploads validated by magic bytes, re-encoded (EXIF/GPS removed), 15 MB / 30 photos, decode limits.
- Webhooks fail closed: inbound needs `x-webhook-secret`; Stripe needs a valid signature.
- CSP, HSTS, `nosniff`, frame denial, Referrer/Permissions policy (`next.config.ts`).
  Known limitation: `script-src` allows `'unsafe-inline'` (Next.js hydration); a nonce policy is a
  later hardening.
- Open redirects blocked (`safeNext`); secrets only via env; `.env*` is git-ignored.

## Testing

- Vitest (`pnpm test`): parsing, checks, aggregation, DKIM (locally generated keys + mocked DNS),
  policies (PGlite), payments, photos, rate limiting, metrics.
- Playwright (`pnpm test:e2e`, needs `pnpm build`): journeys for buyer, seller, admin and a visual tour
  of every page in EN/HE at desktop and mobile with axe (WCAG 2.1 A/AA), overflow, `dir`/`lang` and
  console-error assertions. Screenshots land in `./screenshots`.
