import type { DictKey } from "./en";
import { heLanding } from "./he.landing";
import { heAccess } from "./he.access";
import { heBuyer } from "./he.buyer";
import { heSell } from "./he.sell";

export const he: Record<DictKey, string> = {
  ...heSell,
  ...heBuyer,
  ...heAccess,
  ...heLanding,
  "brand.name": "Stayield",
  "brand.tagline": "קונים דירות עם הכנסה מוכחת מהשכרה לטווח קצר",

  "nav.browse": "דירות",
  "nav.sell": "מכירה",
  "nav.signIn": "התחברות",
  "nav.account": "החשבון שלי",
  "nav.menu": "תפריט",
  "nav.admin": "ניהול",
  "nav.skip": "דלג לתוכן",
  "lang.toggle": "English",
  "lang.toggleLabel": "החלפת שפה לאנגלית",

  "footer.disclaimer": "Stayield היא פלטפורמה עצמאית ואינה קשורה ל-Airbnb או ל-Booking.com.",
  "footer.rights": "© {year} Stayield",
  "footer.privacy": "שמות ופרטי קשר של אורחים לא נשמרים ולא מוצגים לעולם.",

  "common.demoData": "נתוני דמו",
  "common.loading": "טוען…",
  "common.save": "שמירה",
  "common.back": "חזרה",
  "common.next": "המשך",
  "common.cancel": "ביטול",
  "common.delete": "מחיקה",
  "common.edit": "עריכה",
  "common.perYear": "/ שנה",
  "common.bedrooms": "{n} חד׳",
  "common.bathrooms": "{n} אמבט׳",
  "common.sqm": "{n} מ״ר",
  "common.viewOriginal": "צפייה במודעה המקורית",
  "common.optional": "לא חובה",
  "common.required": "חובה",
  "common.error": "משהו השתבש. נסו שוב.",

  "trust.signed_email": "חתום",
  "trust.self_reported": "דיווח עצמי",
  "trust.api_verified": "מאומת ב-API",
  "trust.signed_email.desc":
    "נתוני ההכנסה הגיעו ממייל שהחתימה הדיגיטלית שלו (DKIM) אומתה מול הדומיין של השולח.",
  "trust.self_reported.desc":
    "נתוני ההכנסה יוצאו והועלו על ידי הבעלים. הם לא אומתו באופן עצמאי.",
  "trust.api_verified.desc": "נתוני ההכנסה נמשכו ישירות מפלטפורמת ההזמנות.",
  "trust.label": "רמת אמינות הנתונים",

  "home.featured.title": "דירות מומלצות",
  "home.featured.all": "לכל הדירות",

  "demo.banner": "אלה נתוני דמו שנוצרו לצורכי פיתוח.",

  "error.title": "משהו השתבש",
  "error.body": "אירעה שגיאה בלתי צפויה. נסו שוב. אם זה חוזר, חזרו בעוד כמה דקות.",
  "error.retry": "ניסיון חוזר",
  "error.home": "חזרה לדף הבית",
  "error.rate": "יותר מדי בקשות. המתינו רגע ונסו שוב.",
  "notfound.title": "הדף לא נמצא",
  "notfound.body": "הדף שחיפשתם לא קיים או שאינו זמין עוד.",
};
