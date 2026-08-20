const KITSU_API = "https://kitsu.io/api/edge";
const CACHE_TTL_MS = Number(process.env.KITSU_CACHE_TTL_MS || 3600000);

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

async function apiGet(url) {
  const cached = getCached(url);
  if (cached !== undefined) return cached;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.api+json",
      "User-Agent": "Hyakanime-Stremio-Addon/1.7"
    },
    signal: AbortSignal.timeout(10000)
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Kitsu ${response.status}: ${raw.slice(0, 300)}`);
  }

  const data = JSON.parse(raw);
  return setCached(url, data);
}

async function malToKitsu(malId) {
  if (!malId) return null;

  const params = new URLSearchParams();
  params.set("filter[externalSite]", "myanimelist/anime");
  params.set("filter[externalId]", String(malId));
  params.set("include", "item");
  params.set("fields[item]", "id");

  const payload = await apiGet(`${KITSU_API}/mappings?${params.toString()}`);
  const included = Array.isArray(payload?.included) ? payload.included : [];
  const anime = included.find((item) => item?.type === "anime");

  if (anime?.id) return anime.id;

  const mapping = Array.isArray(payload?.data) ? payload.data[0] : null;
  return mapping?.relationships?.item?.data?.id || null;
}

async function getEpisodesByKitsuId(kitsuId) {
  if (!kitsuId) return [];

  const params = new URLSearchParams();
  params.set("page[limit]", "500");
  params.set("sort", "number");

  const payload = await apiGet(
    `${KITSU_API}/anime/${encodeURIComponent(kitsuId)}/episodes?${params.toString()}`
  );

  return (Array.isArray(payload?.data) ? payload.data : []).map((row) => {
    const a = row?.attributes || {};

    return {
      id: row?.id,
      number: Number(a.number || a.relativeNumber || 0) || null,
      relativeNumber: Number(a.relativeNumber || 0) || null,
      seasonNumber: Number(a.seasonNumber || 1) || 1,
      title:
        a?.titles?.en_us ||
        a?.titles?.en ||
        a?.titles?.en_jp ||
        a?.canonicalTitle ||
        null,
      titleJapanese: a?.titles?.ja_jp || null,
      synopsis: a?.synopsis || a?.description || null,
      airDate: a?.airDate || a?.airdate || null,
      length: a?.length || null,
      thumbnail:
        a?.thumbnail?.original ||
        a?.thumbnail?.large ||
        a?.thumbnail?.small ||
        null
    };
  });
}

async function getEpisodesByMalId(malId) {
  const kitsuId = await malToKitsu(malId);
  if (!kitsuId) return { kitsuId: null, episodes: [] };

  const episodes = await getEpisodesByKitsuId(kitsuId);
  return { kitsuId, episodes };
}

module.exports = {
  KITSU_API,
  getEpisodesByMalId
};
