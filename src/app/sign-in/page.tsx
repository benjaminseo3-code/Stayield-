import Link from "next/link";
import { signInAction } from "@/app/actions/auth";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("auth.title") };
}

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { t } = await getT();
  const { next = "/", error } = await searchParams;
  return (
    <div className="section">
      <div className="container narrow">
        <div className="card card-pad stack">
          <h1 style={{ fontSize: "2rem", margin: 0 }}>{t("auth.title")}</h1>
          <form action={signInAction} className="stack" style={{ ["--gap" as string]: "4px" }}>
            <input type="hidden" name="next" value={next} />
            <div className="field">
              <label htmlFor="email">{t("auth.email")}</label>
              <input id="email" name="email" type="email" className="input" autoComplete="username" inputMode="email" required dir="ltr" aria-invalid={error ? true : undefined} aria-describedby={error ? "signin-error" : undefined} />
            </div>
            <div className="field">
              <label htmlFor="password">{t("auth.password")}</label>
              <input id="password" name="password" type="password" className="input" autoComplete="current-password" required dir="ltr" aria-invalid={error ? true : undefined} />
              {error && (
                <span id="signin-error" className="error-text" role="alert">
                  {error === "credentials" ? t("auth.badCredentials") : t("auth.invalidEmail")}
                </span>
              )}
            </div>
            <div>
              <button type="submit" className="btn btn-primary" data-testid="signin-submit">{t("auth.signIn")}</button>
            </div>
          </form>
          <p className="muted" style={{ margin: 0 }}>
            {t("auth.noAccount")} <Link href={`/sign-up?next=${encodeURIComponent(next)}`}>{t("auth.createAccount")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
