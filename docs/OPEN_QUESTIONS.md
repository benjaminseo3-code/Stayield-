# Open questions

Things we cannot decide until we have real samples or decisions from the owner.

## 1. Airbnb report email: attachment or download link? (blocks `signed_email` strength)
We do not know whether Airbnb's "export transaction history" email carries the CSV as an
**attachment** or only a **download link**.

- Attachment: the CSV is covered by the DKIM body hash, so a forwarded-as-attachment original message
  proves the data came from Airbnb unmodified. Tier = `signed_email`.
- Link only: the CSV is fetched separately and is *not* covered by the signature. The signature then
  only proves "Airbnb sent this person a report", not what the numbers are. We degrade to
  `self_reported` and tell the seller why.

`TODO(real-sample)`: provide a real report email as `.eml` (guest data removed) so the extractor and
the trusted sender domain (`TRUSTED_SENDER_DOMAINS`) can be confirmed.

## 2. CSV column names
Column mapping lives in `src/lib/ingest/csv-mapping.ts` and is tested only with **synthetic**
fixtures in `tests/fixtures/`. `TODO(real-sample)`: provide a real CSV export with guest columns
removed or blanked.

## 3. Inbound email provider
`/api/inbound-email` is provider-agnostic. Choose a provider (Postmark, Mailgun, SES, ...) and add an
adapter that maps its webhook to a raw RFC 822 message.

## 4. Payments
`PAYMENT_PROVIDER=mock` by default. Stripe test mode is wired behind `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET`; price per unlock is `UNLOCK_PRICE_MINOR`.

## 5. Brand assets
Placeholder SVG logo in `src/components/Logo.tsx` and `public/brand/icon.svg`.
`TODO(brand)`: drop `logo-horizontal.png`, `icon.png`, `favicon.png` from the landing project into
`/public/brand/`.

## 6. Occupancy
Self-exported data contains no blocked/available nights, so occupancy cannot be computed. The product
shows "booked nights ÷ days in period" under exactly that name.
