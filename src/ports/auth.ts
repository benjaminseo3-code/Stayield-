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
  sendMagicLink(email: string, callbackURL: string, headers: Headers): Promise<void>;
  /** Credentials login, available only in demo mode (DEMO_MODE=true). Returns false on bad credentials. */
  signInWithPassword(email: string, password: string, headers: Headers): Promise<boolean>;
  signOut(headers: Headers): Promise<Response>;
}
