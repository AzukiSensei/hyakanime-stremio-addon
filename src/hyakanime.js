const API_BASE = (process.env.HYAKANIME_API_BASE || "https://api-v5.hyakanime.fr").replace(/\/+$/, "");
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 300000);

const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(key, value) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
  return value;
}

async function apiGet(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const cacheKey = url.toString();
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Hyakanime-Stremio-Addon/1.0"
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Hyakanime API ${response.status} ${response.statusText}: ${body.slice(0, 250)}`
    );
  }

  const value = await response.json();
  return setCached(cacheKey, value);
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

module.exports = {
  API_BASE,
  explore,
  getAnime,
  getAnimeStats
};
