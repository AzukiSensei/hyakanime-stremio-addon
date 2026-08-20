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
      "User-Agent": "Hyakanime-Stremio-Addon/1.5"
    },
    signal: AbortSignal.timeout(10000)
  });

  const raw = await response.text();

  if (!response.ok) {
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

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;

      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        results[index] = null;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );

  return results;
}

async function hydrateExploreResults(items, concurrency = 6) {
  if (!Array.isArray(items) || !items.length) return [];

  const hydrated = await mapWithConcurrency(items, concurrency, async (item) => {
    if (!item?.id) return null;

    try {
      const detail = await getAnime(item.id);
      return { ...item, ...detail };
    } catch {
      return item;
    }
  });

  return hydrated.filter(Boolean);
}

module.exports = {
  API_BASE,
  explore,
  getAnime,
  getAnimeStats,
  hydrateExploreResults
};
