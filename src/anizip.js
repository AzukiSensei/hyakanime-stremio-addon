const ANIZIP_API = (process.env.ANIZIP_API_BASE || "https://hayase.ani.zip").replace(/\/+$/, "");
const CACHE_TTL_MS = Number(process.env.ANIZIP_CACHE_TTL_MS || 3600000);
const cache = new Map();
const inFlight = new Map();

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

async function requestJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 AniList-Stremio-Addon/2.1",
      Referer: "https://anilist.co/"
    },
    signal: AbortSignal.timeout(10000)
  });

  const raw = await response.text();

  if (!response.ok) {
    const cloudflare = response.status === 403 && /cloudflare|attention required/i.test(raw);
    const error = new Error(
      cloudflare
        ? "AniZip blocked by Cloudflare from this server"
        : `AniZip HTTP ${response.status}: ${raw.slice(0, 300)}`
    );
    error.status = response.status;
    error.cloudflare = cloudflare;
    throw error;
  }

  return JSON.parse(raw);
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
      return setCached(key, await requestJson(url));
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

async function healthCheck(testId = 113415) {
  const started = Date.now();

  try {
    const data = await getEpisodes(testId);
    const count =
      data?.episodes && typeof data.episodes === "object"
        ? Object.keys(data.episodes).length
        : 0;

    return {
      ok: true,
      status: "healthy",
      latencyMs: Date.now() - started,
      testId,
      episodeCount: count
    };
  } catch (error) {
    return {
      ok: false,
      status: error?.cloudflare ? "blocked_by_cloudflare" : "unavailable",
      latencyMs: Date.now() - started,
      testId,
      httpStatus: error?.status || null,
      error: error?.message || String(error)
    };
  }
}

module.exports = {
  ANIZIP_API,
  getEpisodes,
  healthCheck
};
