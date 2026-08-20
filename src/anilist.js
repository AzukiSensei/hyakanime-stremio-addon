const ANILIST_API = "https://graphql.anilist.co";
const CACHE_TTL_MS = Number(process.env.ANILIST_CACHE_TTL_MS || 900000);

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

async function gql(query, variables = {}) {
  const key = JSON.stringify({ query, variables });

  const cached = getCached(key);
  if (cached !== undefined) return cached;
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    try {
      const response = await fetch(ANILIST_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "AniList-Stremio-Addon/2.1.1"
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(12000)
      });

      const raw = await response.text();

      if (!response.ok) {
        throw new Error(`AniList HTTP ${response.status}: ${raw.slice(0, 500)}`);
      }

      const payload = JSON.parse(raw);

      if (payload.errors?.length) {
        throw new Error(
          `AniList GraphQL: ${payload.errors.map((e) => e.message).join("; ")}`
        );
      }

      return setCached(key, payload.data);
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

const CATALOG_FIELDS = `
  id
  format
  season
  seasonYear
  startDate { year month day }
  title { romaji english native userPreferred }
  coverImage { extraLarge large medium color }
`;

const DETAIL_FIELDS = `
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
  meanScore
  popularity
  trending
  favourites
  countryOfOrigin
  coverImage { extraLarge large medium color }
  bannerImage
  studios(isMain: true) { nodes { name } }
  streamingEpisodes { title thumbnail url site }
  relations {
    edges {
      relationType(version: 2)
      node {
        id
        format
        season
        seasonYear
        title { romaji english native userPreferred }
      }
    }
  }
`;

async function getCatalog({
  page = 1,
  perPage = 50,
  formats,
  season,
  seasonYear,
  genre,
  status,
  search,
  sort = ["POPULARITY_DESC"],
  startDateGreater,
  startDateLesser
} = {}) {
  const query = `
    query (
      $page: Int,
      $perPage: Int,
      $formats: [MediaFormat],
      $season: MediaSeason,
      $seasonYear: Int,
      $genre: String,
      $status: MediaStatus,
      $search: String,
      $sort: [MediaSort],
      $startDateGreater: FuzzyDateInt,
      $startDateLesser: FuzzyDateInt
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
          format_in: $formats,
          season: $season,
          seasonYear: $seasonYear,
          genre: $genre,
          status: $status,
          search: $search,
          sort: $sort,
          startDate_greater: $startDateGreater,
          startDate_lesser: $startDateLesser,
          isAdult: false
        ) {
          ${CATALOG_FIELDS}
        }
      }
    }
  `;

  const data = await gql(query, {
    page,
    perPage,
    formats: Array.isArray(formats) && formats.length ? formats : null,
    season: season || null,
    seasonYear: seasonYear || null,
    genre: genre || null,
    status: status || null,
    search: search || null,
    sort,
    startDateGreater: startDateGreater || null,
    startDateLesser: startDateLesser || null
  });

  return data?.Page || { media: [], pageInfo: null };
}

async function getMedia(id) {
  const query = `
    query ($id: Int!) {
      Media(id: $id, type: ANIME) {
        ${DETAIL_FIELDS}
      }
    }
  `;

  const data = await gql(query, { id: Number(id) });
  return data?.Media || null;
}

async function smokeTest() {
  const result = await getCatalog({
    page: 1,
    perPage: 5,
    formats: ["TV"],
    sort: ["POPULARITY_DESC"]
  });

  return result?.media || [];
}

module.exports = {
  ANILIST_API,
  getCatalog,
  getMedia,
  smokeTest
};
