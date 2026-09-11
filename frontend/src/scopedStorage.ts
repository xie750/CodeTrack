import { getAccessToken } from "./authSession";

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return window.atob(padded);
}

export function currentUserStorageScope() {
  if (typeof window === "undefined") return "anonymous";
  try {
    const token = getAccessToken();
    const payload = token?.split(".")[1];
    if (!payload) return "anonymous";
    const parsed = JSON.parse(decodeBase64Url(payload)) as { sub?: unknown };
    return typeof parsed.sub === "string" && parsed.sub ? parsed.sub : "anonymous";
  } catch {
    return "anonymous";
  }
}

export function scopedStorageKey(baseKey: string, ...parts: Array<string | number | null | undefined>) {
  const suffix = [currentUserStorageScope(), ...parts.filter((part) => part !== null && part !== undefined && part !== "")]
    .map((part) => encodeURIComponent(String(part)))
    .join(":");
  return `${baseKey}:${suffix}`;
}
