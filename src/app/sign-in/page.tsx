import { getT } from "@/i18n/server";
import { signInAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { t } = await getT();
  const { next = "/", error } = await searchParams;
  return (
    <div className="section">
      <div className="container narrow">
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
      </div>
    </div>
  );
}
