const ANIZIP_API = (process.env.ANIZIP_API_BASE || "https://hayase.ani.zip").replace(/\/+$/, "");
const CACHE_TTL_MS = Number(process.env.ANIZIP_CACHE_TTL_MS || 3600000);
const cache = new Map();
const inFlight = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return undefined; }
  return entry.value;
}
function setCached(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function getEpisodes(anilistId) {
  if (!anilistId) return null;
  const url = new URL(`${ANIZIP_API}/v1/episodes`);
  url.searchParams.set("anilist_id", String(anilistId));
  const key = url.toString();

  const cached = getCached(key);
  if (cached !== undefined) return cached;
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "AniList-Stremio-Addon/2.0" },
        signal: AbortSignal.timeout(10000)
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`AniZip HTTP ${response.status}: ${raw.slice(0, 400)}`);
      return setCached(key, JSON.parse(raw));
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task);
  return task;
}

module.exports = { ANIZIP_API, getEpisodes };
