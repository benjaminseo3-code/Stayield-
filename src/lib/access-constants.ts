/** Option lists shared by the browser (profile form) and the server (validation). No server-only imports. */
export const INVESTOR_TYPES = ["individual", "family_office", "company", "fund"] as const;
export const EXPERIENCE = ["first_time", "one_to_three", "four_to_ten", "ten_plus"] as const;
export const FINANCING = ["cash", "mortgage", "mixed"] as const;
export const TIMELINES = ["now", "three_months", "six_to_twelve_months", "exploring"] as const;
export const PROFILE_CURRENCIES = ["USD", "EUR", "GBP", "ILS"] as const;
