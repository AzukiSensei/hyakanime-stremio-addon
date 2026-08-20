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
      "User-Agent": "Hyakanime-Stremio-Addon/1.3"
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AniList ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join("; "));
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
  countryOfOrigin
  coverImage { extraLarge large medium color }
  bannerImage
  studios(isMain: true) { nodes { name } }
  externalLinks { site url type }
`;

async function getCatalog({
  page = 1,
  perPage = 50,
  season,
  seasonYear,
  format,
  search,
  sort = ["POPULARITY_DESC"]
} = {}) {
  const query = `
    query (
      $page: Int,
      $perPage: Int,
      $season: MediaSeason,
      $seasonYear: Int,
      $format: MediaFormat,
      $search: String,
      $sort: [MediaSort]
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          currentPage
          lastPage
          hasNextPage
          perPage
        }
        media(
          type: ANIME,
          season: $season,
          seasonYear: $seasonYear,
          format: $format,
          search: $search,
          sort: $sort,
          isAdult: false
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await gql(query, {
    page,
    perPage,
    season: season || null,
    seasonYear: seasonYear || null,
    format: format || null,
    search: search || null,
    sort
  });

  return data.Page;
}

async function getMedia(id) {
  const query = `
    query ($id: Int!) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
        relations {
          edges {
            relationType(version: 2)
            node {
              id
              type
              format
              season
              seasonYear
              title { romaji english native userPreferred }
            }
          }
        }
      }
    }
  `;

  const data = await gql(query, { id: Number(id) });
  return data.Media;
}

module.exports = {
  ANILIST_API,
  getCatalog,
  getMedia
};
