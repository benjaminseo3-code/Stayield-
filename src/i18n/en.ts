import { enAccess } from "./en.access";
import { enBuyer } from "./en.buyer";
import { enSell } from "./en.sell";

/** English dictionary. Keys are the source of truth; `he.ts` must define every key. */
export const en = {
  ...enSell,
  ...enBuyer,
  ...enAccess,
  "brand.name": "Stayield",
  "brand.tagline": "Buy apartments with proven short-term-rental income",

  "nav.browse": "Browse",
  "nav.sell": "Sell",
  "nav.signIn": "Sign in",
  "nav.account": "Account",
  "nav.menu": "Menu",
  "nav.admin": "Admin",
  "nav.skip": "Skip to content",
  "lang.toggle": "עברית",
  "lang.toggleLabel": "Switch language to Hebrew",

  "footer.disclaimer":
    "Stayield is an independent marketplace and is not affiliated with Airbnb or Booking.com.",
  "footer.rights": "© {year} Stayield",
  "footer.privacy": "Guest names and contact details are never stored or shown.",

  "common.demoData": "Demo data",
  "common.loading": "Loading…",
  "common.save": "Save",
  "common.back": "Back",
  "common.next": "Next",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.perYear": "/ yr",
  "common.bedrooms": "{n} bd",
  "common.bathrooms": "{n} ba",
  "common.sqm": "{n} m²",
  "common.viewOriginal": "View original listing",
  "common.optional": "Optional",
  "common.required": "Required",
  "common.error": "Something went wrong. Please try again.",

  "trust.signed_email": "Signed",
  "trust.self_reported": "Self-reported",
  "trust.api_verified": "API-verified",
  "trust.signed_email.desc":
    "Income data came from an email whose digital signature (DKIM) was verified against the sender's domain.",
  "trust.self_reported.desc":
    "Income data was exported and uploaded by the owner. It has not been independently verified.",
  "trust.api_verified.desc": "Income data was pulled directly from the booking platform.",
  "trust.label": "Data trust level",

  "home.hero.title": "Apartments with income you can verify",
  "home.hero.sub":
    "Browse short-term-rental apartments with the details blurred. Create an investor profile, request access, and the owner decides who sees the price, photos and verified income.",
  "home.hero.ctaBrowse": "Browse apartments",
  "home.hero.ctaSell": "List your apartment",
  "home.how.title": "How it works",
  "home.how.1.title": "Create your investor profile",
  "home.how.1.body":
    "Sign up and complete advanced verification: who you are, your budget and what you are looking for.",
  "home.how.2.title": "Request access to a listing",
  "home.how.2.body":
    "Photos, prices and income stay blurred until the owner approves. Send a request with a short message.",
  "home.how.3.title": "The owner decides",
  "home.how.3.body":
    "Owners see your profile and approve, decline or ask for more information. Once approved you see the full listing and the verified income report.",
  "home.featured.title": "Featured apartments",
  "home.featured.all": "See all",

  "demo.banner": "This is demo data created for development.",

  "error.title": "Something went wrong",
  "error.body": "An unexpected error occurred. Please try again. If it keeps happening, come back in a few minutes.",
  "error.retry": "Try again",
  "error.home": "Back to the home page",
  "error.rate": "Too many requests. Please wait a moment and try again.",
  "notfound.title": "Page not found",
  "notfound.body": "The page you are looking for does not exist or is no longer available.",
} as const;

export type DictKey = keyof typeof en;
