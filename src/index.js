const express = require("express");
const path = require("path");
const { addonBuilder, getRouter } = require("stremio-addon-sdk");

const {
  explore,
  getAnime,
  API_BASE
} = require("./hyakanime");

const {
  getCatalog: getAniListCatalog,
  getMedia: getAniListMedia,
  ANILIST_API
} = require("./anilist");

const {
  parseAniListId,
  aniListToPreviewMeta,
  aniListToFullMeta
} = require("./mappers");

const PORT = Number(process.env.PORT || 7000);
const app = express();

app.use((req, res, next) => {
  const started = Date.now();
  console.log(`[http] ${req.method} ${req.originalUrl}`);

  res.on("finish", () => {
    console.log(
      `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started}ms)`
    );
  });

  next();
});

const DEFAULT_CONFIG = Object.freeze({
  titleLanguage: "auto",
  includeSeries: true,
  includeMovies: true,
  showStats: true,
  seasonYearsBack: 2
});

const BASE_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Horror",
  "Mahou Shoujo",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller"
];

const SEASONS = [
  ["WINTER", "Winter"],
  ["SPRING", "Spring"],
  ["SUMMER", "Summer"],
  ["FALL", "Fall"]
];

function sanitizeConfig(input = {}) {
  const languages = new Set(["auto", "fr", "en", "romaji", "jp"]);
  const yearsBack = Number(input.seasonYearsBack);

  return {
    titleLanguage: languages.has(input.titleLanguage)
      ? input.titleLanguage
      : DEFAULT_CONFIG.titleLanguage,
    includeSeries:
      typeof input.includeSeries === "boolean"
        ? input.includeSeries
        : DEFAULT_CONFIG.includeSeries,
    includeMovies:
      typeof input.includeMovies === "boolean"
        ? input.includeMovies
        : DEFAULT_CONFIG.includeMovies,
    showStats:
      typeof input.showStats === "boolean"
        ? input.showStats
        : DEFAULT_CONFIG.showStats,
    seasonYearsBack:
      Number.isFinite(yearsBack)
        ? Math.max(0, Math.min(5, Math.floor(yearsBack)))
        : DEFAULT_CONFIG.seasonYearsBack
  };
}

function encodeConfig(config) {
  return Buffer.from(JSON.stringify(sanitizeConfig(config)), "utf8").toString("base64url");
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

function seasonalOptions(config) {
  const currentYear = new Date().getUTCFullYear();
  const values = [];

  for (let year = currentYear; year >= currentYear - config.seasonYearsBack; year -= 1) {
    for (const [, label] of SEASONS) {
      values.push(`${label} ${year}`);
    }
  }

  return values;
}

function genreOptions(config) {
  return [
    "Tout",
    "En cours",
    "À venir",
    "Populaires",
    "Tendances",
    ...seasonalOptions(config),
    ...BASE_GENRES
  ];
}

function parseFilter(filter) {
  if (!filter || filter === "Tout") return {};

  if (filter === "En cours") return { status: "RELEASING" };
  if (filter === "À venir") return { status: "NOT_YET_RELEASED" };
  if (filter === "Populaires") return { sort: ["POPULARITY_DESC"] };
  if (filter === "Tendances") return { sort: ["TRENDING_DESC"] };

  const seasonMatch = /^(Winter|Spring|Summer|Fall)\s+(\d{4})$/.exec(filter);
  if (seasonMatch) {
    return {
      season: seasonMatch[1].toUpperCase(),
      seasonYear: Number(seasonMatch[2])
    };
  }

  if (BASE_GENRES.includes(filter)) {
    return { genre: filter };
  }

  return {};
}

async function findHyakanimeMatch(media) {
  const candidates = [
    media?.title?.userPreferred,
    media?.title?.english,
    media?.title?.romaji
  ].filter(Boolean);

  for (const title of candidates) {
    try {
      const results = await explore({ search: title, page: 1 });
      if (!Array.isArray(results)) continue;

      const normalized = String(title).trim().toLowerCase();

      const match = results.find((item) =>
        [item?.title, item?.titleEN, item?.romanji, item?.titleJP]
          .filter(Boolean)
          .some((candidate) => String(candidate).trim().toLowerCase() === normalized)
      );

      if (match?.id != null) {
        return await getAnime(match.id);
      }
    } catch {
      // Hyakanime is optional enrichment.
    }
  }

  return null;
}

function buildAddon(configInput = DEFAULT_CONFIG) {
  const config = sanitizeConfig(configInput);
  const catalogs = [];

  if (config.includeSeries) {
    catalogs.push({
      type: "hyakanime",
      id: "hyakanime-series",
      name: "Séries",
      extra: [
        {
          name: "genre",
          isRequired: false,
          options: genreOptions(config)
        },
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    });
  }

  if (config.includeMovies) {
    catalogs.push({
      type: "hyakanime",
      id: "hyakanime-movies",
      name: "Films",
      extra: [
        {
          name: "genre",
          isRequired: false,
          options: [
            "Tout",
            "Populaires",
            "Tendances",
            ...BASE_GENRES
          ]
        },
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    });
  }

  const manifest = {
    id: "fr.hyakanime.catalog",
    version: "1.4.1",
    name: "Hyakanime",
    description:
      "Catalogues anime Stremio alimentés par AniList et enrichis par Hyakanime.",
    logo: "https://cdn-hyakanime.s3.eu-west-3.amazonaws.com/logo-hyakanime.png",
    resources: ["catalog", "meta"],
    types: ["hyakanime"],
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
      const skip = Math.max(0, Number(args?.extra?.skip || 0));
      const page = Math.floor(skip / 50) + 1;
      const search = String(args?.extra?.search || "").trim() || undefined;
      const filter = parseFilter(String(args?.extra?.genre || ""));

      const format =
        args.id === "hyakanime-movies"
          ? "MOVIE"
          : "TV";

      const result = await getAniListCatalog({
        page,
        perPage: 50,
        format,
        search,
        season: filter.season,
        seasonYear: filter.seasonYear,
        genre: filter.genre,
        status: filter.status,
        sort: search
          ? ["SEARCH_MATCH"]
          : filter.sort || ["POPULARITY_DESC"]
      });

      return {
        metas: (result?.media || []).map((media) =>
          aniListToPreviewMeta(media, config)
        )
      };
    } catch (error) {
      console.error("[catalog]", error?.stack || error);
      return { metas: [] };
    }
  });

  builder.defineMetaHandler(async (args) => {
    const mediaId = parseAniListId(args.id);
    if (!mediaId) return { meta: null };

    try {
      const media = await getAniListMedia(mediaId);
      if (!media) return { meta: null };

      const hyak = await findHyakanimeMatch(media);

      return {
        meta: aniListToFullMeta(media, config, hyak)
      };
    } catch (error) {
      console.error("[meta]", error?.stack || error);
      return { meta: null };
    }
  });

  return builder.getInterface();
}

// IMPORTANT: configuration routes first, before express.static / addon router.
app.get("/", (_req, res) => {
  res.redirect("/configure");
});

app.get("/configure", (_req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(path.join(process.cwd(), "public", "configure.html"));
});

app.get("/c/:config/configure", (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(path.join(process.cwd(), "public", "configure.html"));
});

app.get("/debug/anilist", async (_req, res) => {
  try {
    const result = await getAniListCatalog({
      page: 1,
      perPage: 5,
      format: "TV",
      sort: ["POPULARITY_DESC"]
    });

    res.json({
      ok: true,
      api: ANILIST_API,
      count: result?.media?.length || 0,
      sample: (result?.media || []).map((media) => ({
        id: media.id,
        title:
          media?.title?.userPreferred ||
          media?.title?.english ||
          media?.title?.romaji,
        format: media.format,
        season: media.season,
        seasonYear: media.seasonYear
      }))
    });
  } catch (error) {
    console.error("[debug/anilist]", error?.stack || error);
    res.status(500).json({
      ok: false,
      api: ANILIST_API,
      error: error?.message || String(error)
    });
  }
});

app.get("/debug/hyakanime", async (_req, res) => {
  try {
    const result = await explore({ search: "Solo Leveling", page: 1 });

    res.json({
      ok: true,
      api: API_BASE,
      count: Array.isArray(result) ? result.length : 0,
      sample: Array.isArray(result)
        ? result.slice(0, 5).map((anime) => ({
            id: anime.id,
            title: anime.title || anime.titleEN || anime.romanji || anime.titleJP
          }))
        : result
    });
  } catch (error) {
    console.error("[debug/hyakanime]", error?.stack || error);
    res.status(500).json({
      ok: false,
      api: API_BASE,
      error: error?.message || String(error)
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    addon: "Hyakanime",
    version: "1.4.1",
    hyakanimeApi: API_BASE,
    aniListApi: ANILIST_API
  });
});

app.use(express.static("public", {
  index: false,
  fallthrough: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", "inline");
    }
  }
}));

const defaultInterface = buildAddon(DEFAULT_CONFIG);
const defaultRouter = getRouter(defaultInterface);

app.use((req, res, next) => {
  if (req.path.startsWith("/c/")) return next();
  return defaultRouter(req, res, next);
});

app.use("/c/:config", (req, res, next) => {
  const config = decodeConfig(req.params.config);
  return getRouter(buildAddon(config))(req, res, next);
});

app.listen(PORT, "0.0.0.0", () => {
  const defaultConfig = encodeConfig(DEFAULT_CONFIG);
  console.log(`Hyakanime API: ${API_BASE}`);
  console.log(`AniList API: ${ANILIST_API}`);
  console.log(`Configure: http://127.0.0.1:${PORT}/configure`);
  console.log(`Addon: http://127.0.0.1:${PORT}/c/${defaultConfig}/manifest.json`);
});
