# Stayield — project rules

## Product
Stayield is a marketplace for buying and selling apartments that operate as short-term rentals (Airbnb-style). Sellers prove an apartment's income history; paying buyers unlock a verified revenue report. Two sides: **Seller** (lists the property, supplies photos and income data) and **Buyer** (browses, pays to unlock the report).

## Non-negotiable principles
1. **No scraping, ever.** Airbnb's ToS bans bots/scrapers. Never fetch or parse Airbnb/Booking pages. A seller may paste their public listing URL, which we store and show only as an outbound "View original listing" link.
2. **Do not invent Airbnb's file formats.** The CSV column names and email structure are unknown until the owner provides real samples. Build a configurable column-mapping layer, test with clearly labeled *synthetic* fixtures, and leave a `TODO(real-sample)` where a real file is needed.
3. **Guest privacy.** Guest names or contact details are never stored, logged or shown. Strip them at parse time. Buyers only ever see aggregates, never reservation rows.
4. **Honest metrics.** Self-exported data has no blocked/available nights, so we cannot compute occupancy. Show "booked nights ÷ days in period" and name it exactly that. Never label it "occupancy". Also show gross vs net (after host fees) separately, and always show the data coverage dates.
5. **Trust tiers, always visible:** `signed_email` (DKIM-verified), `self_reported` (CSV upload), `api_verified` (reserved for a future Hospitable Connect adapter; not built now, only the enum value and a disabled "Coming soon" option).
6. **Fail closed** on anything security-related.

## Stack (no Supabase yet; must be swappable later)
- Next.js (App Router) + TypeScript strict, CSS variables, pnpm.
- Postgres-compatible from day one: **Drizzle ORM + PGlite** (embedded Postgres, persisted to `./.data/db`) for local dev; production uses `DATABASE_URL` (Supabase Postgres will be plugged in later). Keep all SQL Postgres-dialect.
- **Ports & adapters** for everything external, each with a local dev implementation: `StorageAdapter` (local disk `./.data/files`, later S3/Supabase Storage), `Mailer` (writes to `./.data/outbox`), `InboundEmailProvider`, `PaymentProvider` (mock + Stripe test mode), `AuthAdapter`.
- Auth: Better Auth with the Drizzle/Postgres adapter, email magic-link login. Do not hand-roll auth.
- Email parsing/verification: `mailparser` and `mailauth` (both maintained as of 2026-10). DNS lookups go through an injectable resolver so tests can mock them.
- Tests: Vitest for logic (parser, DKIM, metrics, policies), Playwright for flows and screenshots.

## Brand and design (must feel like the existing Stayield landing page)
- Colors: navy `#0B1C30`, green `#17B77F`, dark green `#0e8a5f`, paper `#F6F3EC`, card `#fff`, line `#e3ddd0`, ink `#14213a`, muted `#5b6679`.
- Fonts: **Frank Ruhl Libre** (headings, 500/700) + **Heebo** (body, 400/500/700), from Google Fonts.
- Style: white sticky top bar with logo, navy hero sections, rounded 18px cards, green pill buttons with dark text, bar charts (navy bars, green for recent months), generous spacing, calm and premium, not "dashboard-y".
- **Bilingual EN/HE with a toggle (RTL for Hebrew)**, remembered in localStorage (wrapped in try/catch). All strings in dictionaries, none hardcoded in components. Default: English, or Hebrew if `navigator.language` starts with `he`.
- Mobile-first; no horizontal scroll at 360px; keyboard focus visible; contrast AA.
- Logo assets are in `/public/brand/` (copy `logo-horizontal.png`, `icon.png`, `favicon.png` from the landing project if provided; otherwise placeholders and a TODO).

## Conventions
- Small commits per step, conventional messages. Never commit secrets; `.env.example` only.
- Money stored as integer minor units + ISO currency. Dates as `date`, timestamps as `timestamptz` UTC.
- Before finishing any phase: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, plus Playwright screenshots (desktop 1280 and mobile 390, EN and HE) of every new page, and look at them.
- Ask before destructive actions (deleting data, dropping tables, force pushes).
- Next.js here is a newer major than most training data: read `node_modules/next/dist/docs/` before using an unfamiliar API (see `AGENTS.md`).
