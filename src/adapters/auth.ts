import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { appUrl } from "@/lib/app-url";
import type { AuthAdapter, SessionUser } from "@/ports/auth";

function authSecret(): string {
  const fromEnv = process.env.BETTER_AUTH_SECRET;
  if (fromEnv) return fromEnv;
  // Fail closed in production: never run with a guessable or per-process secret.
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET must be set in production");
  }
  const file = path.join(process.cwd(), ".data", "auth-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const secret = randomBytes(32).toString("base64");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** Rate limiting is always on; only the e2e suite (many sign-ins from one IP) may turn it off. */
const rateLimitOff = () => process.env.RATE_LIMIT_DISABLED === "true" && process.env.NODE_ENV !== "development";

async function build() {
  const db = await getDb();
  return betterAuth({
    rateLimit: { enabled: !rateLimitOff(), window: 60, max: 60 },
    secret: authSecret(),
    baseURL: appUrl(),
    trustedOrigins: [appUrl(), ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []), ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : [])],
    // Email + password. Real email delivery is not wired yet, so addresses are not verified at
    // sign-up (the sender-email binding for signed reports needs a verified address; see account page).
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true, requireEmailVerification: false },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "buyer", input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Only an address that was proven (email verified) may bind signed reports to this account.
            if (user.emailVerified) {
              await db
                .insert(schema.verifiedEmails)
                .values({ userId: user.id, email: user.email.toLowerCase(), verifiedAt: new Date() })
                .onConflictDoNothing();
            }
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = Awaited<ReturnType<typeof build>>;
const g = globalThis as unknown as { __stayieldAuth?: Promise<Auth> };
const auth = (): Promise<Auth> => (g.__stayieldAuth ??= build());

export const betterAuthAdapter: AuthAdapter = {
  async getSession(headers) {
    const a = await auth();
    const s = await a.api.getSession({ headers });
    if (!s) return null;
    let role = (s.user as { role?: string }).role as SessionUser["role"] | undefined;
    // Admins are provisioned from env only, and only for an email marked verified.
    if (role !== "admin" && s.user.emailVerified && adminEmails().includes(s.user.email.toLowerCase())) {
      const db = await getDb();
      await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, s.user.id));
      role = "admin";
    }
    return { id: s.user.id, email: s.user.email, name: s.user.name, role: role ?? "buyer" };
  },
  async handler(req) {
    return (await auth()).handler(req);
  },
  async signUp(input, headers) {
    const a = await auth();
    try {
      const res = await a.api.signUpEmail({ body: { email: input.email, password: input.password, name: input.name }, headers });
      const userId = res.user.id;
      // Role is chosen from a fixed list here and can never be "admin" via sign-up.
      const db = await getDb();
      await db.update(schema.users).set({ role: input.role }).where(eq(schema.users.id, userId));
      return { ok: true as const, userId };
    } catch (e) {
      const msg = String((e as { message?: string }).message ?? "").toLowerCase();
      return { ok: false as const, error: msg.includes("exist") ? ("exists" as const) : ("invalid" as const) };
    }
  },
  async signInWithPassword(email, password, headers) {
    const a = await auth();
    try {
      await a.api.signInEmail({ body: { email, password }, headers });
      return true;
    } catch {
      return false;
    }
  },
  async signOut(headers) {
    const a = await auth();
    return a.api.signOut({ headers, asResponse: true });
  },
};
