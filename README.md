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
