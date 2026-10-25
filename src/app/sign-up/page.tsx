import Link from "next/link";
import { signUpAction } from "@/app/actions/auth";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("signup.title") };
}

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; role?: string }> }) {
  const { t } = await getT();
  const { next = "/", error, role } = await searchParams;
  const chosen = role === "seller" ? "seller" : "buyer";
  const errText = error === "exists" ? t("signup.error.exists") : error === "password" ? t("signup.error.password") : error ? t("signup.error.invalid") : null;
  return (
    <div className="section">
      <div className="container narrow">
        <div className="card card-pad stack">
          <h1 style={{ fontSize: "2rem", margin: 0 }}>{t("signup.title")}</h1>
          <p className="muted" style={{ margin: 0 }}>{t("signup.sub")}</p>
          <form action={signUpAction} className="stack" style={{ ["--gap" as string]: "4px" }}>
            <input type="hidden" name="next" value={next} />
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
              <legend className="label" style={{ fontWeight: 700, marginBottom: 8 }}>{t("signup.iAm")}</legend>
              <div className="option-cards">
                {(["buyer", "seller"] as const).map((r) => (
                  <label key={r} className={`option-card${chosen === r ? " selected" : ""}`} style={{ cursor: "pointer", display: "block" }}>
                    <input type="radio" name="role" value={r} defaultChecked={chosen === r} data-testid={`role-${r}`} style={{ accentColor: "var(--green-dark)", marginInlineEnd: 8 }} />
                    <strong>{t(`signup.role.${r}`)}</strong>
                    <span className="small muted" style={{ display: "block", marginTop: 4 }}>{t(`signup.role.${r}.desc`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="name">{t("signup.name")}</label>
              <input id="name" name="name" className="input" autoComplete="name" required />
            </div>
            <div className="field">
              <label htmlFor="email">{t("auth.email")}</label>
              <input id="email" name="email" type="email" className="input" autoComplete="email" inputMode="email" required dir="ltr" />
            </div>
            <div className="field">
              <label htmlFor="password">{t("auth.password")}</label>
              <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required dir="ltr" aria-describedby="pw-hint" aria-invalid={errText ? true : undefined} />
              <span id="pw-hint" className="hint">{t("signup.passwordHint")}</span>
              {errText && <span className="error-text" role="alert">{errText}</span>}
            </div>
            <div>
              <button type="submit" className="btn btn-primary" data-testid="signup-submit">{t("signup.submit")}</button>
            </div>
          </form>
          <p className="muted" style={{ margin: 0 }}>
            {t("auth.haveAccount")} <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>{t("auth.title")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
