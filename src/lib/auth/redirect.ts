const DEFAULT_AUTH_REDIRECT = "/notices";

export function normalizeAuthRedirect(value: unknown, fallback = DEFAULT_AUTH_REDIRECT) {
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\r\n]/.test(raw)) {
    return fallback;
  }

  try {
    const parsed = new URL(raw, "http://app.local");
    if (parsed.origin !== "http://app.local") {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
