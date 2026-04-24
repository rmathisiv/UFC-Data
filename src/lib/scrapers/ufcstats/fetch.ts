const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type FetchOptions = {
  userAgent?: string;
  timeoutMs?: number;
};

/**
 * Fetch a UFCStats page as HTML. Throws on non-2xx. Callers are responsible
 * for rate-limiting between requests — UFCStats has no rate limit docs, but
 * be polite: 500–1000ms between requests is plenty.
 */
export async function fetchHtml(
  url: string,
  opts: FetchOptions = {},
): Promise<string> {
  const { userAgent = DEFAULT_UA, timeoutMs = 15_000 } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
    }

    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract the stable UFCStats id (last url segment) from a fighter or fight
 * detail URL, e.g. `.../fighter-details/07c55e76efe5ea25` → `07c55e76efe5ea25`.
 */
export function extractSourceId(url: string): string | null {
  const m = url.match(/-details\/([a-f0-9]+)/i);
  return m ? m[1] : null;
}
