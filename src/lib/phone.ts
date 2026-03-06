/** Normalize phone to digits-only for consistent storage and comparison */
export function normalizePhone(phone: string | undefined | null): string {
  if (!phone || typeof phone !== "string") return "";
  return phone.replace(/\D/g, "");
}
