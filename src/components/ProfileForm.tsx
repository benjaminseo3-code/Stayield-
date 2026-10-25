"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveProfileAction, type ProfileState } from "@/app/actions/requests";
import { COUNTRIES, countryLabel, parseCountries } from "@/lib/countries";
import { useT } from "@/i18n/client";
import { EXPERIENCE, FINANCING, INVESTOR_TYPES, PROFILE_CURRENCIES, TIMELINES } from "@/lib/access-constants";

export type ProfileValues = {
  fullName: string;
  phone: string;
  investorType: string;
  entityName: string;
  country: string;
  budgetMin: string;
  budgetMax: string;
  currency: string;
  targetCountries: string;
  experience: string;
  financing: string;
  timeline: string;
  about: string;
  website: string;
};

/** The investor's "advanced verification" form. Errors are shown per field. */
export function ProfileForm({ initial, next }: { initial: ProfileValues; next?: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfileAction, { status: "idle", fields: [] });
  const bad = (f: string) => (state.fields.includes(f) ? true : undefined);
  const err = (f: string) => state.fields.includes(f) && <span className="error-text" id={`${f}-err`} role="alert">{t(`profile.error.${f}` as "profile.error.fullName")}</span>;
  const opt = (group: string, v: string) => <option key={v} value={v}>{t(`profile.${group}.${v}` as "profile.type.individual")}</option>;

  return (
    <form action={action} noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {state.status === "saved" && (
        <div className="notice ok" role="status" data-testid="profile-saved" style={{ marginBottom: 16 }}>
          <strong>{t("profile.saved")}</strong>{" "}
          <Link href={state.next ?? "/properties"}>{state.next ? t("profile.backToListing") : t("profile.browse")}</Link>
        </div>
      )}
      {state.status === "suspended" && <p className="notice error" role="alert">{t("access.suspended")}</p>}
      {state.status === "error" && state.fields.length > 0 && <p className="notice error" role="alert">{t("basics.invalid")}</p>}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="fullName">{t("profile.fullName")}</label>
          <input id="fullName" name="fullName" className="input" defaultValue={initial.fullName} autoComplete="name" aria-invalid={bad("fullName")} aria-describedby="fullName-err" required />
          {err("fullName")}
        </div>
        <div className="field">
          <label htmlFor="phone">{t("profile.phone")}</label>
          <input id="phone" name="phone" className="input" type="tel" defaultValue={initial.phone} autoComplete="tel" dir="ltr" aria-invalid={bad("phone")} aria-describedby="phone-err phone-hint" required />
          <span id="phone-hint" className="hint">{t("profile.phoneHint")}</span>
          {err("phone")}
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="investorType">{t("profile.type")}</label>
          <select id="investorType" name="investorType" className="input" defaultValue={initial.investorType || "individual"} aria-invalid={bad("investorType")}>
            {INVESTOR_TYPES.map((v) => opt("type", v))}
          </select>
          {err("investorType")}
        </div>
        <div className="field">
          <label htmlFor="entityName">{t("profile.entityName")}</label>
          <input id="entityName" name="entityName" className="input" defaultValue={initial.entityName} aria-invalid={bad("entityName")} aria-describedby="entityName-err entity-hint" />
          <span id="entity-hint" className="hint">{t("profile.entityHint")}</span>
          {err("entityName")}
        </div>
        <div className="field">
          <label htmlFor="country">{t("profile.country")}</label>
          <input id="country" name="country" className="input" defaultValue={initial.country} autoComplete="country-name" aria-invalid={bad("country")} aria-describedby="country-err" required />
          {err("country")}
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="budgetMin">{t("profile.budgetMin")}</label>
          <input id="budgetMin" name="budgetMin" className="input" type="number" inputMode="numeric" min={0} defaultValue={initial.budgetMin} dir="ltr" aria-invalid={bad("budgetMin")} aria-describedby="budgetMin-err" required />
          {err("budgetMin")}
        </div>
        <div className="field">
          <label htmlFor="budgetMax">{t("profile.budgetMax")}</label>
          <input id="budgetMax" name="budgetMax" className="input" type="number" inputMode="numeric" min={0} defaultValue={initial.budgetMax} dir="ltr" aria-invalid={bad("budgetMax")} aria-describedby="budgetMax-err" required />
          {err("budgetMax")}
        </div>
        <div className="field">
          <label htmlFor="currency">{t("basics.currency")}</label>
          <select id="currency" name="currency" className="input" defaultValue={initial.currency || "USD"}>
            {PROFILE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="experience">{t("profile.experience")}</label>
          <select id="experience" name="experience" className="input" defaultValue={initial.experience || "first_time"} aria-invalid={bad("experience")}>
            {EXPERIENCE.map((v) => opt("experience", v))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="financing">{t("profile.financing")}</label>
          <select id="financing" name="financing" className="input" defaultValue={initial.financing || "cash"}>
            {FINANCING.map((v) => opt("financing", v))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="timeline">{t("profile.timeline")}</label>
          <select id="timeline" name="timeline" className="input" defaultValue={initial.timeline || "exploring"}>
            {TIMELINES.map((v) => opt("timeline", v))}
          </select>
        </div>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }} aria-describedby="target-hint">
        <legend>{t("profile.targetCountries")}</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
          {COUNTRIES.map((c) => (
            <label key={c} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="targetCountries" value={c} defaultChecked={parseCountries(initial.targetCountries).includes(c)} data-testid={`target-${c}`} />
              {countryLabel(t, c)}
            </label>
          ))}
        </div>
        <span id="target-hint" className="hint">{t("profile.targetHint")}</span>
      </fieldset>
      <div className="field">
        <label htmlFor="about">{t("profile.about")}</label>
        <textarea id="about" name="about" className="input" defaultValue={initial.about} maxLength={1500} aria-invalid={bad("about")} aria-describedby="about-err about-hint" required />
        <span id="about-hint" className="hint">{t("profile.aboutHint")}</span>
        {err("about")}
      </div>
      <div className="field">
        <label htmlFor="website">{t("profile.website")}</label>
        <input id="website" name="website" className="input" type="url" dir="ltr" placeholder="https://" defaultValue={initial.website} aria-invalid={bad("website")} aria-describedby="website-err" />
        {err("website")}
      </div>
      <p className="small muted">{t("profile.privacy")}</p>
      <button type="submit" className="btn btn-primary" disabled={pending} data-testid="profile-submit">
        {pending ? t("wizard.saving") : t("profile.submit")}
      </button>
    </form>
  );
}
