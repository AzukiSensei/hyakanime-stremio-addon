const API_BASE = (process.env.HYAKANIME_API_BASE || "https://api-v5.hyakanime.fr").replace(/\/+$/, "");

const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 900000);
const STALE_CACHE_TTL_MS = Number(process.env.STALE_CACHE_TTL_MS || 21600000);
const MIN_REQUEST_GAP_MS = Number(process.env.HYAKANIME_MIN_REQUEST_GAP_MS || 250);

const cache = new Map();
const inFlight = new Map();

let blockedUntil = 0;
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFresh(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() <= entry.expiresAt) return entry.value;
  return undefined;
}

function getStale(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() <= entry.staleUntil) return entry.value;
  cache.delete(key);
  return undefined;
}

function setCached(key, value) {
  const now = Date.now();
  cache.set(key, {
    value,
    expiresAt: now + CACHE_TTL_MS,
    staleUntil: now + STALE_CACHE_TTL_MS
  });
  return value;
}

function parseRetryAfter(response, raw) {
  const header = Number(response.headers.get("retry-after") || 0);

  if (Number.isFinite(header) && header > 0) {
    return Math.ceil(header);
  }

  try {
    const body = JSON.parse(raw);
    const value = Number(body?.retryAfter || 0);
    if (Number.isFinite(value) && value > 0) return Math.ceil(value);
  } catch {}

  return 60;
}

async function waitForRequestSlot() {
  const now = Date.now();

  if (blockedUntil > now) {
    throw new Error(
      `HYAKANIME_RATE_LIMITED:${Math.ceil((blockedUntil - now) / 1000)}`
    );
  }

  const elapsed = now - lastRequestAt;

  if (elapsed < MIN_REQUEST_GAP_MS) {
    await sleep(MIN_REQUEST_GAP_MS - elapsed);
  }

  lastRequestAt = Date.now();
}

async function apiGet(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const key = url.toString();

  const fresh = getFresh(key);
  if (fresh !== undefined) return fresh;

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const task = (async () => {
    try {
      await waitForRequestSlot();

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Hyakanime-Stremio-Addon/1.7.1"
        },
        signal: AbortSignal.timeout(10000)
      });

      const raw = await response.text();

      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response, raw);
        blockedUntil = Date.now() + retryAfter * 1000;

        const stale = getStale(key);
        if (stale !== undefined) {
          console.warn(
            `[hyakanime] 429 on ${url.pathname}; serving stale cache for ${retryAfter}s`
          );
          return stale;
        }

        throw new Error(`HYAKANIME_RATE_LIMITED:${retryAfter}`);
      }

      if (!response.ok) {
        const stale = getStale(key);
        if (stale !== undefined) {
          console.warn(
            `[hyakanime] ${response.status} on ${url.pathname}; serving stale cache`
          );
          return stale;
        }

        throw new Error(
          `Hyakanime API ${response.status} ${response.statusText}: ${raw.slice(0, 300)}`
        );
      }

      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new Error(`Hyakanime returned invalid JSON: ${raw.slice(0, 300)}`);
      }

      return setCached(key, value);
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

async function explore({ search = "", page = 1 } = {}) {
  return apiGet("/explore", { search, page });
}

async function getAnime(id) {
  return apiGet(`/anime/${encodeURIComponent(String(id))}`);
}

async function getAnimeStats(id) {
  return apiGet(`/anime/stats/${encodeURIComponent(String(id))}`);
}

function getRateLimitState() {
  const remainingMs = Math.max(0, blockedUntil - Date.now());

  return {
    blocked: remainingMs > 0,
    retryAfter: Math.ceil(remainingMs / 1000),
    cacheEntries: cache.size,
    inFlight: inFlight.size
  };
}

module.exports = {
  API_BASE,
  explore,
  getAnime,
  getAnimeStats,
  getRateLimitState
};
