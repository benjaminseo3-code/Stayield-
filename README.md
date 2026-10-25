# Stayield

Marketplace for buying and selling apartments that operate as short-term rentals. Sellers prove their
income history; paying buyers unlock a verified revenue report. See `CLAUDE.md` for product rules and
`docs/OPEN_QUESTIONS.md` for what still depends on real samples.

## Run locally

```bash
pnpm install
cp .env.example .env.local     # optional; defaults work for local dev
pnpm db:migrate && pnpm db:seed
pnpm dev                       # http://localhost:3000
```

Data lives in `./.data` (PGlite database, uploaded files, dev email outbox). `pnpm db:reset` wipes and
re-seeds it. Demo properties are synthetic and marked "Demo data".

Magic-link sign-in emails are written to `./.data/outbox` (and shown at `/dev/outbox` in development).

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:e2e                  # Playwright; needs a build first. Screenshots land in ./screenshots
```

## Configuration

See `.env.example` for every variable. Highlights:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | empty = embedded PGlite in `./.data/db`; otherwise Postgres/Supabase |
| `BETTER_AUTH_SECRET` | required in production (`openssl rand -base64 32`) |
| `ADMIN_EMAILS` | comma-separated emails that become admins after a verified sign-in |
| `INBOUND_DOMAIN`, `INBOUND_WEBHOOK_SECRET` | per-property inbound address domain and the webhook secret (unset = webhook rejects everything) |
| `TRUSTED_SENDER_DOMAINS` | domains whose DKIM signature is accepted as the report issuer (**confirm with a real sample**) |
| `PAYMENT_PROVIDER`, `STRIPE_*`, `UNLOCK_PRICE_MINOR` | `mock` (dev only) or `stripe` (test mode with `sk_test_`) |

## Trying the email path locally

Real DKIM verification needs a real signed message and live DNS, so the end-to-end proof lives in the
unit tests (`tests/unit/ingest-*.test.ts`, with locally generated keys and a mocked resolver). To post a
message to a running app: `curl -X POST localhost:3000/api/inbound-email -H "x-webhook-secret: $INBOUND_WEBHOOK_SECRET" -H "content-type: message/rfc822" --data-binary @forwarded.eml`.

## More

- `docs/ARCHITECTURE.md` - structure, ports/adapters, Supabase move, trust model, security
- `docs/RLS_POLICIES.md` - the access rules as Postgres RLS
- `docs/OPEN_QUESTIONS.md` - what still needs real samples or decisions
