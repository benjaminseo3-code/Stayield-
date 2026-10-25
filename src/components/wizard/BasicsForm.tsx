"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveBasics, type BasicsInput } from "@/app/actions/sell";
import { useT } from "@/i18n/client";
import { COUNTRIES, countryLabel, isCountry } from "@/lib/countries";

type State = {
  country: string;
  city: string;
  neighborhood: string;
  askingPrice: string;
  currency: "USD" | "EUR" | "GBP" | "ILS";
  sqm: string;
  bedrooms: string;
  bathrooms: string;
  description: string;
  originalListingUrl: string;
};

const num = (v: string): number | null => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

function toInput(s: State): BasicsInput {
  return {
    country: isCountry(s.country) ? s.country : "",
    city: s.city,
    neighborhood: s.neighborhood,
    askingPrice: num(s.askingPrice),
    currency: s.currency,
    sqm: num(s.sqm) == null ? null : Math.round(num(s.sqm)!),
    bedrooms: num(s.bedrooms) == null ? null : Math.round(num(s.bedrooms)!),
    bathrooms: num(s.bathrooms) == null ? null : Math.round(num(s.bathrooms)!),
    description: s.description,
    originalListingUrl: s.originalListingUrl,
  };
}

export function BasicsForm({ propertyId, initial, nextHref }: { propertyId: string; initial: State; nextHref: string }) {
  const t = useT();
  const router = useRouter();
  const [s, setS] = useState<State>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [invalid, setInvalid] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(state: State): Promise<boolean> {
    setStatus("saving");
    try {
      const res = await saveBasics(propertyId, toInput(state));
      if (res.ok) {
        setInvalid([]);
        setStatus("saved");
        return true;
      }
      setInvalid(res.fields);
      setStatus("error");
    } catch {
      setStatus("error");
    }
    return false;
  }

  function update<K extends keyof State>(key: K, value: State[K]) {
    const next = { ...s, [key]: value };
    setS(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 700); // autosave
  }

  async function onContinue(e: React.FormEvent) {
    e.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    if (await save(s)) router.push(nextHref);
  }

  const bad = (k: string) => (invalid.includes(k) ? true : undefined);

  return (
    <form onSubmit={onContinue} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="country">{t("basics.country")}</label>
          <select id="country" className="input" value={s.country} onChange={(e) => update("country", e.target.value)} aria-invalid={bad("country")}>
            <option value="">{t("country.choose")}</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{countryLabel(t, c)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="city">{t("basics.city")}</label>
          <input id="city" className="input" value={s.city} onChange={(e) => update("city", e.target.value)} aria-invalid={bad("city")} />
        </div>
        <div className="field">
          <label htmlFor="neighborhood">{t("basics.neighborhood")}</label>
          <input id="neighborhood" className="input" value={s.neighborhood} onChange={(e) => update("neighborhood", e.target.value)} aria-invalid={bad("neighborhood")} />
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="price">{t("basics.price")}</label>
          <input id="price" className="input" type="number" inputMode="decimal" min={0} value={s.askingPrice} onChange={(e) => update("askingPrice", e.target.value)} aria-invalid={bad("askingPrice")} dir="ltr" />
        </div>
        <div className="field">
          <label htmlFor="currency">{t("basics.currency")}</label>
          <select id="currency" className="input" value={s.currency} onChange={(e) => update("currency", e.target.value as State["currency"])}>
            {["USD", "EUR", "GBP", "ILS"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="sqm">{t("basics.sqm")}</label>
          <input id="sqm" className="input" type="number" inputMode="numeric" min={0} value={s.sqm} onChange={(e) => update("sqm", e.target.value)} aria-invalid={bad("sqm")} dir="ltr" />
        </div>
        <div className="field">
          <label htmlFor="bedrooms">{t("basics.bedrooms")}</label>
          <input id="bedrooms" className="input" type="number" inputMode="numeric" min={0} value={s.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} aria-invalid={bad("bedrooms")} dir="ltr" />
        </div>
        <div className="field">
          <label htmlFor="bathrooms">{t("basics.bathrooms")}</label>
          <input id="bathrooms" className="input" type="number" inputMode="numeric" min={0} value={s.bathrooms} onChange={(e) => update("bathrooms", e.target.value)} aria-invalid={bad("bathrooms")} dir="ltr" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="description">{t("basics.description")}</label>
        <textarea id="description" className="input" value={s.description} onChange={(e) => update("description", e.target.value)} aria-describedby="desc-hint" />
        <span id="desc-hint" className="hint">{t("basics.descriptionHint")}</span>
      </div>
      <div className="field">
        <label htmlFor="url">{t("basics.listingUrl")}</label>
        <input id="url" className="input" type="url" dir="ltr" value={s.originalListingUrl} onChange={(e) => update("originalListingUrl", e.target.value)} aria-invalid={bad("originalListingUrl")} aria-describedby="url-hint" placeholder="https://" />
        <span id="url-hint" className="hint">{t("basics.listingUrlHint")}</span>
      </div>

      {invalid.length > 0 && <p className="error-text" role="alert">{t("basics.invalid")}</p>}
      <div className="row between" style={{ marginTop: 24 }}>
        <span className="small muted" role="status" aria-live="polite" data-testid="save-status">
          {status === "saving" && t("wizard.saving")}
          {status === "saved" && t("wizard.saved")}
          {status === "error" && invalid.length === 0 && t("wizard.saveError")}
        </span>
        <button type="submit" className="btn btn-primary">{t("wizard.next")}</button>
      </div>
    </form>
  );
}
