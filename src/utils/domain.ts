/**
 * Extracts and normalizes destination domain from a URL string for per-domain rate limiting.
 * Returns normalized lower-case hostname without port or query string.
 */
export function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.toLowerCase();
  } catch {
    throw new Error(`Invalid destination URL: ${urlStr}`);
  }
}
