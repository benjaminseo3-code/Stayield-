"use client";

/** Last-resort boundary: replaces the whole document, so it carries both languages and inline styles. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#F6F3EC", color: "#14213a", fontFamily: "system-ui, sans-serif", padding: 16 }}>
        <div role="alert" style={{ maxWidth: 520, textAlign: "center" }}>
          <h1>Something went wrong · משהו השתבש</h1>
          <p>An unexpected error occurred. Please try again.</p>
          <p dir="rtl">אירעה שגיאה בלתי צפויה. נסו שוב.</p>
          <button type="button" onClick={reset} style={{ background: "#17B77F", color: "#0B1C30", border: 0, borderRadius: 999, padding: "12px 28px", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
            Try again · ניסיון חוזר
          </button>
        </div>
      </body>
    </html>
  );
}
