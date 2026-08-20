const ANILIST_API = "https://graphql.anilist.co";
const CACHE_TTL_MS = Number(process.env.ANILIST_CACHE_TTL_MS || 300000);

const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function gql(query, variables = {}) {
  const cacheKey = JSON.stringify({ query, variables });
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const response = await fetch(ANILIST_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Hyakanime-Stremio-Addon/1.5"
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(12000)
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`AniList HTTP ${response.status}: ${raw.slice(0, 400)}`);
  }

  const payload = JSON.parse(raw);

  if (payload.errors?.length) {
    throw new Error(
      `AniList GraphQL: ${payload.errors.map((e) => e.message).join("; ")}`
    );
  }

  return cacheSet(cacheKey, payload.data);
}

const MEDIA_FIELDS = `
  id
  idMal
  type
  format
  season
  seasonYear
  episodes
  duration
  status
  startDate { year month day }
  endDate { year month day }
  title { romaji english native userPreferred }
  synonyms
  description(asHtml: false)
  genres
  averageScore
  popularity
  trending
  countryOfOrigin
  coverImage { extraLarge large medium color }
  bannerImage
  studios(isMain: true) { nodes { name } }
  externalLinks { site url type }
`;

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleCandidates(hyak) {
  return [
    hyak?.title,
    hyak?.titleEN,
    hyak?.romanji,
    hyak?.titleJP
  ].filter(Boolean);
}

async function searchMedia(title) {
  const query = `
    query ($search: String!) {
      Page(page: 1, perPage: 8) {
        media(type: ANIME, search: $search, sort: SEARCH_MATCH) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await gql(query, { search: title });
  return data?.Page?.media || [];
}

function scoreMatch(hyak, media) {
  const hyakTitles = titleCandidates(hyak).map(normalizeTitle).filter(Boolean);
  const aniTitles = [
    media?.title?.userPreferred,
    media?.title?.english,
    media?.title?.romaji,
    media?.title?.native,
    ...(media?.synonyms || [])
  ].map(normalizeTitle).filter(Boolean);

  if (!hyakTitles.length || !aniTitles.length) return 0;

  let score = 0;

  for (const h of hyakTitles) {
    for (const a of aniTitles) {
      if (h === a) score = Math.max(score, 100);
      else if (h.includes(a) || a.includes(h)) score = Math.max(score, 80);
    }
  }

  const hyakYear = Number(hyak?.start?.year || 0);
  const aniYear = Number(media?.seasonYear || media?.startDate?.year || 0);

  if (score > 0 && hyakYear && aniYear) {
    if (hyakYear === aniYear) score += 10;
    else if (Math.abs(hyakYear - aniYear) > 1) score -= 20;
  }

  return score;
}

async function findBestMatch(hyak) {
  const candidates = titleCandidates(hyak);

  for (const title of candidates) {
    try {
      const results = await searchMedia(title);
      if (!results.length) continue;

      const ranked = results
        .map((media) => ({ media, score: scoreMatch(hyak, media) }))
        .sort((a, b) => b.score - a.score);

      if (ranked[0]?.score >= 80) {
        return ranked[0].media;
      }
    } catch {
      // AniList enrichissement facultatif.
    }
  }

  return null;
}

module.exports = {
  ANILIST_API,
  findBestMatch
};
