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
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  return value;
}

async function gql(query, variables = {}) {
  const key = JSON.stringify({ query, variables });

  const cached = getCached(key);
  if (cached !== undefined) return cached;

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const task = (async () => {
    try {
      const response = await fetch(ANILIST_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "AniList-Stremio-Addon/2.1.2"
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(12000)
      });

      const raw = await response.text();

      if (!response.ok) {
        throw new Error(`AniList HTTP ${response.status}: ${raw.slice(0, 800)}`);
      }

      const payload = JSON.parse(raw);

      if (payload.errors?.length) {
        throw new Error(
          `AniList GraphQL: ${payload.errors
            .map((error) => error.message)
            .join("; ")}`
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

function buildCatalogQuery(options = {}) {
  const variableDefinitions = [
    "$page: Int!",
    "$perPage: Int!",
    "$sort: [MediaSort]"
  ];

  const mediaArguments = [
    "type: ANIME",
    "sort: $sort",
    "isAdult: false"
  ];

  const variables = {
    page: Number(options.page || 1),
    perPage: Number(options.perPage || 50),
    sort: Array.isArray(options.sort) && options.sort.length
      ? options.sort
      : ["POPULARITY_DESC"]
  };

  if (Array.isArray(options.formats) && options.formats.length) {
    variableDefinitions.push("$formats: [MediaFormat]");
    mediaArguments.push("format_in: $formats");
    variables.formats = options.formats;
  }

  if (options.season) {
    variableDefinitions.push("$season: MediaSeason");
    mediaArguments.push("season: $season");
    variables.season = options.season;
  }

  if (Number.isInteger(options.seasonYear)) {
    variableDefinitions.push("$seasonYear: Int");
    mediaArguments.push("seasonYear: $seasonYear");
    variables.seasonYear = options.seasonYear;
  }

  if (options.genre) {
    variableDefinitions.push("$genre: String");
    mediaArguments.push("genre: $genre");
    variables.genre = options.genre;
  }

  if (options.status) {
    variableDefinitions.push("$status: MediaStatus");
    mediaArguments.push("status: $status");
    variables.status = options.status;
  }

  if (options.search) {
    variableDefinitions.push("$search: String");
    mediaArguments.push("search: $search");
    variables.search = options.search;
  }

  if (Number.isInteger(options.startDateGreater)) {
    variableDefinitions.push("$startDateGreater: FuzzyDateInt");
    mediaArguments.push("startDate_greater: $startDateGreater");
    variables.startDateGreater = options.startDateGreater;
  }

  if (Number.isInteger(options.startDateLesser)) {
    variableDefinitions.push("$startDateLesser: FuzzyDateInt");
    mediaArguments.push("startDate_lesser: $startDateLesser");
    variables.startDateLesser = options.startDateLesser;
  }

  const query = `
    query (
      ${variableDefinitions.join(",\n      ")}
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
          ${mediaArguments.join(",\n          ")}
        ) {
          ${CATALOG_FIELDS}
        }
      }
    }
  `;

  return { query, variables };
}

async function getCatalog(options = {}) {
  const { query, variables } = buildCatalogQuery(options);
  const data = await gql(query, variables);

  return data?.Page || {
    media: [],
    pageInfo: null
  };
}

async function getMedia(id) {
  const query = `
    query ($id: Int!) {
      Media(id: $id, type: ANIME) {
        ${DETAIL_FIELDS}
      }
    }
  `;

  const data = await gql(query, {
    id: Number(id)
  });

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

function debugBuildCatalogQuery(options = {}) {
  return buildCatalogQuery(options);
}

module.exports = {
  ANILIST_API,
  getCatalog,
  getMedia,
  smokeTest,
  debugBuildCatalogQuery
};
