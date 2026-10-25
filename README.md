# Stayield

Marketplace for buying and selling apartments that operate as short-term rentals. Every listing is
**locked** for investors until the owner approves their access request. See `CLAUDE.md` for product rules
and `docs/OPEN_QUESTIONS.md` for what still depends on real samples or decisions.

## Landing page

The home page (`/`) is the Stayield landing page (bilingual EN/HE, RTL), with the privacy policy at `/privacy`. Copy lives in `src/i18n/*.landing.ts`; brand files in `public/brand/` and `src/app/icon.png`. Browsing listings requires an account.

## How it works

1. **Investor signs up** and sees every listing blurred and locked (no price, address detail, income or report).
2. **Advanced verification**: the investor fills in a profile (who they are, budget, experience, funds, intent).
3. **Request access** to a specific listing, with a short note. One active request per listing; 7-day
   cooldown after a decline.
4. **The owner receives the investor profile** and decides: approve, decline, or **ask for more info**
   (the investor replies and the request returns to the owner).
5. **On approval** the investor sees the full listing, photos and the verified income report. Contact
   details are shared with the owner only after approval. The owner can revoke access at any time.

Sellers list a property, add photos and income data (signed forwarded email = `signed_email`, CSV =
`self_reported`). Admins moderate listings and can review investor profiles.

## Run locally

```bash
pnpm install
cp .env.example .env.local     # optional; defaults work for local dev
pnpm db:migrate && pnpm db:seed
pnpm dev                       # http://localhost:3000
```

With no `DATABASE_URL` the app uses embedded PGlite in `./.data/db`; `pnpm db:reset` wipes and re-seeds it.
Demo data is synthetic and marked "Demo data".

## Production (Vercel + Supabase)

- `DATABASE_URL` points at the Supabase **transaction pooler** (port 6543) with a dedicated, limited role.
  All tables live in the `stayield` schema (never `public`); RLS is enabled on every table.
- The Vercel build runs `pnpm db:migrate && pnpm db:seed && pnpm build`. Seeding is idempotent and only
  runs when the database is empty (`--force` to re-seed).
- `STORAGE_ADAPTER=database` keeps photos and evidence in Postgres (`storage_objects`), so serverless
  instances share one store. Swap for S3/Supabase Storage via the `StorageAdapter` port.
- Auth is email + password (Better Auth). Real email delivery is not wired yet (`MAILER=log`), so
  addresses are **not verified** at sign-up.

## Demo accounts (seeded)

| Role | Email | Password |
| --- | --- | --- |
| Seller | `seller@stayield.demo` | `Stayield-Demo-2026` |
| Investor | `buyer@stayield.demo` | `Stayield-Demo-2026` |

The demo investor is verified, approved for the Limassol listing and pending for Tel Aviv. The demo owner
has incoming requests from Rossi and Levy. An admin account comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:e2e                  # Playwright; needs a build first. Screenshots land in ./screenshots

# Same flows against a deployed URL (creates a few test accounts there):
E2E_BASE=https://your-app.vercel.app npx playwright test -c playwright.live.config.ts flows.spec.ts
```

After a live run, `pnpm db:cleanup-e2e` (with the production `DATABASE_URL`) removes the `@e2e.test` accounts it created.

The live run needs `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` for the admin tour and skips the two tests that depend
on the local e2e webhook secret and inbound domain.

## Configuration

See `.env.example` for every variable. Highlights:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | empty = embedded PGlite; otherwise Postgres/Supabase (schema `stayield`) |
| `DATABASE_SSL` | TLS mode for hosted Postgres (default verifies against the bundled Supabase CA) |
| `BETTER_AUTH_SECRET` | required in production (`openssl rand -base64 32`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | seeded admin account (production: set both or no admin exists) |
| `STORAGE_ADAPTER` | `local` (disk) or `database` |
| `MAILER` | `outbox` (dev, files) or `log` |
| `INBOUND_DOMAIN`, `INBOUND_WEBHOOK_SECRET` | per-property inbound address domain and webhook secret (unset = webhook rejects everything) |
| `TRUSTED_SENDER_DOMAINS` | domains whose DKIM signature is accepted as the report issuer (**confirm with a real sample**) |

## More

- `docs/ARCHITECTURE.md` - structure, ports/adapters, access model, trust model, security
- `docs/RLS_POLICIES.md` - the access rules as Postgres RLS
- `docs/OPEN_QUESTIONS.md` - what still needs real samples or decisions
