import { getT } from "@/i18n/server";
import { passwordSignInAction, signInAction } from "@/app/actions/auth";
import { isDemoMode } from "@/lib/app-url";
import { DEMO_BUYER_EMAIL, DEMO_PASSWORD, DEMO_SELLER_EMAIL } from "@/lib/demo-seed-constants";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("auth.title") };
}

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { t } = await getT();
  const { next = "/", error } = await searchParams;
  const demo = isDemoMode();
  return (
    <div className="section">
      <div className="container narrow stack" style={{ ["--gap" as string]: "24px" }}>
        {demo ? (
          <div className="card card-pad stack">
            <h1 style={{ fontSize: "2rem" }}>{t("auth.title")}</h1>
            <p className="notice small" data-testid="demo-credentials">
              <strong>{t("auth.demo.title")}</strong>
              <br />
              {t("auth.demo.body")}
            </p>
            <table className="table" style={{ margin: 0 }}>
              <tbody>
                {[
                  [t("auth.demo.buyer"), DEMO_BUYER_EMAIL],
                  [t("auth.demo.seller"), DEMO_SELLER_EMAIL],
                ].map(([role, mail]) => (
                  <tr key={mail}>
                    <th scope="row">{role}</th>
                    <td dir="ltr">{mail}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">{t("auth.demo.password")}</th>
                  <td dir="ltr">{DEMO_PASSWORD}</td>
                </tr>
              </tbody>
            </table>
            <form action={passwordSignInAction}>
              <input type="hidden" name="next" value={next} />
              <div className="field">
                <label htmlFor="email">{t("auth.email")}</label>
                <input id="email" name="email" type="email" className="input" autoComplete="username" required defaultValue={DEMO_BUYER_EMAIL} dir="ltr" />
              </div>
              <div className="field">
                <label htmlFor="password">{t("auth.demo.password")}</label>
                <input id="password" name="password" type="password" className="input" autoComplete="current-password" required defaultValue={DEMO_PASSWORD} dir="ltr" aria-invalid={error === "credentials" ? true : undefined} />
                {error === "credentials" && (
                  <span className="error-text" role="alert">
                    {t("auth.demo.badCredentials")}
                  </span>
                )}
              </div>
              <button type="submit" className="btn btn-primary">
                {t("auth.demo.signIn")}
              </button>
            </form>
            <p className="small muted" style={{ margin: 0 }}>{t("auth.demo.note")}</p>
          </div>
        ) : (
          <div className="card card-pad">
            <h1 style={{ fontSize: "2rem" }}>{t("auth.title")}</h1>
            <p className="muted">{t("auth.sub")}</p>
            <form action={signInAction}>
              <input type="hidden" name="next" value={next} />
              <div className="field">
                <label htmlFor="email">{t("auth.email")}</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  inputMode="email"
                  required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "email-error" : undefined}
                />
                {error && (
                  <span id="email-error" className="error-text" role="alert">
                    {t("auth.invalidEmail")}
                  </span>
                )}
              </div>
              <button type="submit" className="btn btn-primary">
                {t("auth.send")}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
