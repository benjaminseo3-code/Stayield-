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

## 4. Email delivery and verification
There is no mail provider yet (`MAILER=log`). Consequences: sign-up does not verify addresses, there is
no "forgot password", and owners/investors get no email when a request changes (the nav badge is the only
signal). The `signed_email` tier also needs a verified sender address bound to the seller. Pick a provider
(Resend, Postmark, SES) and implement `Mailer.send()`.

## 5. Brand assets
Placeholder SVG logo in `src/components/Logo.tsx` and `public/brand/icon.svg`.
`TODO(brand)`: drop `logo-horizontal.png`, `icon.png`, `favicon.png` from the landing project into
`/public/brand/`.

## 6. Occupancy
Self-exported data contains no blocked/available nights, so occupancy cannot be computed. The product
shows "booked nights ÷ days in period" under exactly that name.

## 7. Raw message storage vs. guest privacy (deviation from the brief, please decide)
The brief asks to store the raw `.eml` in private storage, but principle 3 says guest data is never
stored. The CSV inside the email contains guest columns, so keeping the raw message would store guest
data. What we do instead:
- Verify the DKIM signature at ingestion time, then keep only: the SHA-256 of the original message
  (replay protection), the verification result, and the **headers** of the original message
  (including the `DKIM-Signature`) as admin-only evidence in `private/submissions/<id>/evidence.json`.
- The CSV body is parsed in memory; guest columns are never read (allow-list mapping), and
  confirmation codes are stored only as keyed one-way hashes.
If you do want raw `.eml` retention (for disputes), it should be encrypted at rest with a short
retention period; say so and it is a small change in `src/lib/ingest/service.ts`.

## 8. Warnings vs. failures
Checks marked `warn` (short coverage, a 45-119 day gap, stale data, rate outliers) let the listing go
live with a visible note; any `fail` (duplicates, overlaps, nights mismatch, mixed currencies, ...)
sends it to admin review. Thresholds live in `src/lib/ingest/checks.ts` and are easy to tune.

## 9. Monetisation
The first version replaced pay-to-unlock with owner-approved access. Whether and where money enters
(listing fee, success fee, paid investor verification) is open; the payment port was removed until decided.

## 10. Investor verification depth
"Advanced verification" is a self-declared profile. Nothing checks identity or proof of funds yet.
Decide whether admins review profiles (the `reviewInvestorAction` hook exists), or a KYC provider is used.
