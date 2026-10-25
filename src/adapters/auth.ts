import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getMailer } from "@/adapters";
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
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
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
            // The address that signed in via magic link is, by definition, verified.
            await db
              .insert(schema.verifiedEmails)
              .values({ userId: user.id, email: user.email.toLowerCase(), verifiedAt: new Date() })
              .onConflictDoNothing();
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 10,
        // 5 sign-in emails per minute per client; stops mail bombing and token guessing.
        rateLimit: { window: 60, max: rateLimitOff() ? 10_000 : 5 },
        sendMagicLink: async ({ email, url }) => {
          await getMailer().send({
            to: email,
            subject: "Sign in to Stayield · התחברות ל-Stayield",
            text: `Sign in to Stayield:\n${url}\n\nהתחברות ל-Stayield:\n${url}\n\nThis link expires in 10 minutes. If you did not request it, ignore this email.`,
          });
        },
      }),
      nextCookies(),
    ],
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
    // Admins are provisioned from env only, and only for an email that completed a magic link.
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
  async sendMagicLink(email, callbackURL, headers) {
    const a = await auth();
    await a.api.signInMagicLink({ body: { email, callbackURL }, headers });
  },
  async signOut(headers) {
    const a = await auth();
    return a.api.signOut({ headers, asResponse: true });
  },
};
