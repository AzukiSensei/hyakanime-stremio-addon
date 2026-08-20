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
      "User-Agent": "Hyakanime-Stremio-Addon/1.2"
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

async function explorePages({
  search = "",
  startPage = 1,
  maxPages = 10,
  wanted = 20,
  predicate = () => true
} = {}) {
  const found = [];
  const seen = new Set();

  for (let page = startPage; page < startPage + maxPages; page += 1) {
    const result = await explore({ search, page });

    if (!Array.isArray(result) || result.length === 0) {
      break;
    }

    for (const anime of result) {
      if (!anime || anime.id == null || seen.has(anime.id)) continue;
      seen.add(anime.id);

      if (predicate(anime)) {
        found.push(anime);
      }

      if (found.length >= wanted) {
        return found;
      }
    }
  }

  return found;
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
  explorePages,
  getAnime,
  getAnimeStats
};
