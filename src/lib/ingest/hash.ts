import { createHmac } from "node:crypto";

/**
 * One-way, keyed hash of a confirmation code. Scoped to the property so the same code on two
 * listings does not collide. The code itself is never stored or logged.
 */
export function hashConfirmation(code: string, propertyId: string, key: string): string {
  return createHmac("sha256", key).update(`${propertyId}:${code.trim().toUpperCase()}`).digest("hex");
}
