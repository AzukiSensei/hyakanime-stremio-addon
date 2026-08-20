const express = require("express");
const path = require("path");
const { addonBuilder, getRouter } = require("stremio-addon-sdk");

const {
  ANILIST_API,
  getCatalog,
  getMedia,
  smokeTest
} = require("./anilist");

const {
  ANIZIP_API,
  getEpisodes: getAniZipEpisodes,
  healthCheck: aniZipHealthCheck
} = require("./anizip");

const {
  parseAniListId,
  toPreviewMeta,
  toFullMeta
} = require("./mappers");

const PORT = Number(process.env.PORT || 7000);
const VERSION = "2.1.1";
const app = express();

const DEFAULT_CONFIG = Object.freeze({
  titleLanguage: "auto",
  includeSeries: true,
  includeMovies: true,
  includeONA: true,
  includeOVA: true,
  includeSpecials: false,
  seasonYearsBack: 4,
  defaultSort: "popularity",
  useAniZip: true,
  preferEpisodeImages: true
});

const GENRES = [
  "Action","Adventure","Comedy","Drama","Ecchi","Fantasy","Horror",
  "Mahou Shoujo","Mecha","Music","Mystery","Psychological","Romance",
  "Sci-Fi","Slice of Life","Sports","Supernatural","Thriller"
];

const SEASONS = ["WINTER","SPRING","SUMMER","FALL"];

function sanitizeConfig(input = {}) {
  const languages = new Set(["auto","en","romaji","jp"]);
  const sorts = new Set(["popularity","trending","score","newest"]);
  const yearsBack = Number(input.seasonYearsBack);

  return {
    titleLanguage: languages.has(input.titleLanguage)
      ? input.titleLanguage : DEFAULT_CONFIG.titleLanguage,
    includeSeries: typeof input.includeSeries === "boolean"
      ? input.includeSeries : DEFAULT_CONFIG.includeSeries,
    includeMovies: typeof input.includeMovies === "boolean"
      ? input.includeMovies : DEFAULT_CONFIG.includeMovies,
    includeONA: typeof input.includeONA === "boolean"
      ? input.includeONA : DEFAULT_CONFIG.includeONA,
    includeOVA: typeof input.includeOVA === "boolean"
      ? input.includeOVA : DEFAULT_CONFIG.includeOVA,
    includeSpecials: typeof input.includeSpecials === "boolean"
      ? input.includeSpecials : DEFAULT_CONFIG.includeSpecials,
    seasonYearsBack: Number.isFinite(yearsBack)
      ? Math.max(0, Math.min(10, Math.floor(yearsBack)))
      : DEFAULT_CONFIG.seasonYearsBack,
    defaultSort: sorts.has(input.defaultSort)
      ? input.defaultSort : DEFAULT_CONFIG.defaultSort,
    useAniZip: typeof input.useAniZip === "boolean"
      ? input.useAniZip : DEFAULT_CONFIG.useAniZip,
    preferEpisodeImages: typeof input.preferEpisodeImages === "boolean"
      ? input.preferEpisodeImages : DEFAULT_CONFIG.preferEpisodeImages
  };
}

function encodeConfig(config) {
  return Buffer.from(
    JSON.stringify(sanitizeConfig(config)),
    "utf8"
  ).toString("base64url");
}

function decodeConfig(value) {
  try {
    return sanitizeConfig(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    );
  } catch {
    return DEFAULT_CONFIG;
  }
}

function seasonLabel(season) {
  return ({WINTER:"Winter",SPRING:"Spring",SUMMER:"Summer",FALL:"Fall"})[season];
}

function seasonalOptions(config) {
  const currentYear = new Date().getUTCFullYear();
  const values = [];

  for (
    let year = currentYear;
    year >= currentYear - config.seasonYearsBack;
    year -= 1
  ) {
    for (const season of SEASONS) {
      values.push(`${seasonLabel(season)} ${year}`);
    }
  }

  return values;
}

function seriesFilters(config) {
  return [
    "Tout","En cours","À venir","Populaires","Tendances","Mieux notés","Nouveautés",
    ...seasonalOptions(config),
    ...GENRES
  ];
}

function movieFilters(config) {
  const currentYear = new Date().getUTCFullYear();
  const years = Array.from(
    { length: config.seasonYearsBack + 1 },
    (_, i) => String(currentYear - i)
  );

  return [
    "Tout","Populaires","Tendances","Mieux notés","Nouveautés",
    ...years,
    ...GENRES
  ];
}

function sortFromConfig(config) {
  return {
    popularity: ["POPULARITY_DESC"],
    trending: ["TRENDING_DESC"],
    score: ["SCORE_DESC"],
    newest: ["START_DATE_DESC"]
  }[config.defaultSort] || ["POPULARITY_DESC"];
}

function parseFilter(value, isMovie = false) {
  if (!value || value === "Tout") return {};
  if (value === "En cours") return { status: "RELEASING" };
  if (value === "À venir") return { status: "NOT_YET_RELEASED" };
  if (value === "Populaires") return { sort: ["POPULARITY_DESC"] };
  if (value === "Tendances") return { sort: ["TRENDING_DESC"] };
  if (value === "Mieux notés") return { sort: ["SCORE_DESC"] };
  if (value === "Nouveautés") return { sort: ["START_DATE_DESC"] };

  if (isMovie && /^\d{4}$/.test(value)) {
    return { seasonYear: Number(value) };
  }

  const seasonMatch = /^(Winter|Spring|Summer|Fall)\s+(\d{4})$/.exec(value);

  if (seasonMatch) {
    return {
      season: seasonMatch[1].toUpperCase(),
      seasonYear: Number(seasonMatch[2])
    };
  }

  if (GENRES.includes(value)) return { genre: value };

  return {};
}

async function querySeriesCatalog(args, config) {
  const skip = Math.max(0, Number(args?.extra?.skip || 0));
  const perPage = 50;
  const page = Math.floor(skip / perPage) + 1;
  const offset = skip % perPage;
  const search = String(args?.extra?.search || "").trim() || undefined;
  const filter = parseFilter(String(args?.extra?.genre || ""), false);

  const formats = ["TV"];
  if (config.includeONA) formats.push("ONA");
  if (config.includeOVA) formats.push("OVA");
  if (config.includeSpecials) formats.push("SPECIAL");

  const result = await getCatalog({
    page,
    perPage,
    formats,
    search,
    season: filter.season,
    seasonYear: filter.seasonYear,
    genre: filter.genre,
    status: filter.status,
    sort: search
      ? ["SEARCH_MATCH"]
      : filter.sort || sortFromConfig(config)
  });

  return (result?.media || []).slice(offset, offset + 50);
}

function buildAddon(configInput = DEFAULT_CONFIG) {
  const config = sanitizeConfig(configInput);
  const catalogs = [];

  if (config.includeSeries) {
    catalogs.push({
      type: "anilist",
      id: "anilist-series",
      name: "Séries",
      extra: [
        { name: "genre", isRequired: false, options: seriesFilters(config) },
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    });
  }

  if (config.includeMovies) {
    catalogs.push({
      type: "anilist",
      id: "anilist-movies",
      name: "Films",
      extra: [
        { name: "genre", isRequired: false, options: movieFilters(config) },
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    });
  }

  const manifest = {
    id: "fr.azks.anilist",
    version: VERSION,
    name: "AniList",
    description:
      "Catalogue AniList pour Stremio avec enrichissement d'épisodes AniZip.",
    logo: "https://anilist.co/img/icons/android-chrome-512x512.png",
    resources: ["catalog","meta"],
    types: ["anilist"],
    idPrefixes: ["anilist:"],
    catalogs,
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  };

  const builder = new addonBuilder(manifest);

  builder.defineCatalogHandler(async (args) => {
    try {
      const isMovie = args.id === "anilist-movies";

      let media;

      if (!isMovie) {
        media = await querySeriesCatalog(args, config);
      } else {
        const skip = Math.max(0, Number(args?.extra?.skip || 0));
        const perPage = 50;
        const page = Math.floor(skip / perPage) + 1;
        const offset = skip % perPage;
        const search = String(args?.extra?.search || "").trim() || undefined;
        const filter = parseFilter(String(args?.extra?.genre || ""), true);

        const year = filter.seasonYear;
        const result = await getCatalog({
          page,
          perPage,
          formats: ["MOVIE"],
          search,
          genre: filter.genre,
          startDateGreater: year ? Number(`${year}0101`) : undefined,
          startDateLesser: year ? Number(`${year}1231`) : undefined,
          sort: search
            ? ["SEARCH_MATCH"]
            : filter.sort || sortFromConfig(config)
        });

        media = (result?.media || []).slice(offset);
      }

      return {
        metas: media.map((item) => toPreviewMeta(item, config))
      };
    } catch (error) {
      console.error("[catalog]", error?.stack || error);
      return { metas: [] };
    }
  });

  builder.defineMetaHandler(async (args) => {
    const id = parseAniListId(args.id);
    if (!id) return { meta: null };

    try {
      const media = await getMedia(id);
      if (!media) return { meta: null };

      let aniZipPayload = null;

      if (config.useAniZip && media.format !== "MOVIE") {
        aniZipPayload = await getAniZipEpisodes(id).catch((error) => {
          console.warn(`[anizip] ${id}: ${error?.message || error}`);
          return null;
        });
      }

      return {
        meta: toFullMeta(
          media,
          aniZipPayload,
          config
        )
      };
    } catch (error) {
      console.error("[meta]", error?.stack || error);
      return { meta: null };
    }
  });

  return builder.getInterface();
}

app.get("/", (_req, res) => res.redirect("/configure"));

app.get("/configure", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(path.join(process.cwd(), "public", "configure.html"));
});

app.get("/c/:config/configure", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(path.join(process.cwd(), "public", "configure.html"));
});

app.get("/health", async (_req, res) => {
  const [aniList, aniZip] = await Promise.all([
    smokeTest()
      .then((items) => ({
        ok: true,
        status: "healthy",
        count: items.length
      }))
      .catch((error) => ({
        ok: false,
        status: "unavailable",
        error: error?.message || String(error)
      })),
    aniZipHealthCheck()
  ]);

  const overall = aniList.ok
    ? (aniZip.ok ? "healthy" : "degraded")
    : "unhealthy";

  res.setHeader("Cache-Control", "no-store");
  res.json({
    status: overall,
    addon: "AniList",
    version: VERSION,
    type: "anilist",
    catalogSource: "AniList",
    episodeSource: "AniZip",
    services: {
      anilist: aniList,
      anizip: aniZip
    },
    aniListApi: ANILIST_API,
    aniZipApi: ANIZIP_API
  });
});

app.get("/debug/catalog", async (_req, res) => {
  try {
    const result = await getCatalog({
      page: 1,
      perPage: 10,
      formats: ["TV"],
      sort: ["POPULARITY_DESC"]
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      count: result?.media?.length || 0,
      pageInfo: result?.pageInfo || null,
      sample: (result?.media || []).map((item) => ({
        id: item.id,
        title:
          item?.title?.userPreferred ||
          item?.title?.english ||
          item?.title?.romaji,
        format: item.format,
        season: item.season,
        seasonYear: item.seasonYear
      }))
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || String(error)
    });
  }
});

app.get("/debug/anizip/:id", async (req, res) => {
  try {
    const payload = await getAniZipEpisodes(Number(req.params.id));
    const eps =
      payload?.episodes && typeof payload.episodes === "object"
        ? Object.entries(payload.episodes)
        : [];

    res.json({
      ok: true,
      anilistId: Number(req.params.id),
      episodeCount: eps.length,
      sample: eps.slice(0, 3).map(([number, episode]) => ({
        number,
        title: episode?.title,
        image: episode?.image,
        overview: episode?.overview,
        airDate: episode?.airDate
      }))
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      service: "AniZip",
      status:
        error?.cloudflare
          ? "blocked_by_cloudflare"
          : "unavailable",
      httpStatus: error?.status || null,
      error: error?.message || String(error)
    });
  }
});

app.use(express.static("public", {
  index: false,
  fallthrough: true
}));

const defaultRouter = getRouter(buildAddon(DEFAULT_CONFIG));

app.use((req, res, next) =>
  req.path.startsWith("/c/")
    ? next()
    : defaultRouter(req, res, next)
);

app.use("/c/:config", (req, res, next) =>
  getRouter(buildAddon(decodeConfig(req.params.config)))(
    req,
    res,
    next
  )
);

app.listen(PORT, "0.0.0.0", () => {
  const defaultConfig = encodeConfig(DEFAULT_CONFIG);

  console.log(`AniList Stremio Addon v${VERSION}`);
  console.log(`AniList API: ${ANILIST_API}`);
  console.log(`AniZip API: ${ANIZIP_API}`);
  console.log(`Configure: http://127.0.0.1:${PORT}/configure`);
  console.log(
    `Addon: http://127.0.0.1:${PORT}/c/${defaultConfig}/manifest.json`
  );
});
