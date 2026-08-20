const JIKAN_API = "https://api.jikan.moe/v4";
const CACHE_TTL_MS = Number(process.env.JIKAN_CACHE_TTL_MS || 3600000);

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
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGet(path, attempt = 0) {
  const url = `${JIKAN_API}${path}`;
  const cached = getCached(url);
  if (cached !== undefined) return cached;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Hyakanime-Stremio-Addon/1.6"
    },
    signal: AbortSignal.timeout(12000)
  });

  if (response.status === 429 && attempt < 3) {
    await sleep(1200 * (attempt + 1));
    return apiGet(path, attempt + 1);
  }

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Jikan ${response.status}: ${raw.slice(0, 300)}`);
  }

  const data = JSON.parse(raw);
  return setCached(url, data);
}

async function getEpisodes(malId, expectedCount = 0) {
  if (!malId) return [];

  const all = [];
  let page = 1;

  // Jikan paginates long-running series. 30 pages is intentionally generous.
  while (page <= 30) {
    const payload = await apiGet(`/anime/${malId}/episodes?page=${page}`);
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    all.push(...rows);

    const hasNext = Boolean(payload?.pagination?.has_next_page);
    if (!hasNext) break;
    if (expectedCount && all.length >= expectedCount) break;

    page += 1;
    // Keep a small gap to be respectful of Jikan's public API.
    await sleep(350);
  }

  return all;
}

module.exports = {
  JIKAN_API,
  getEpisodes
};
