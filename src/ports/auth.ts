export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "seller" | "buyer" | "admin";
};

export interface AuthAdapter {
  getSession(headers: Headers): Promise<SessionUser | null>;
  /** Mount point for the provider's own HTTP endpoints (magic-link verify, sign-out, ...). */
  handler(req: Request): Promise<Response>;
  signUp(
    input: { name: string; email: string; password: string; role: "buyer" | "seller" },
    headers: Headers,
  ): Promise<{ ok: true; userId: string } | { ok: false; error: "exists" | "invalid" }>;
  signInWithPassword(email: string, password: string, headers: Headers): Promise<boolean>;
  signOut(headers: Headers): Promise<Response>;
}
