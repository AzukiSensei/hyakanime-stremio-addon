const express = require("express");
const path = require("path");
const { addonBuilder, getRouter } = require("stremio-addon-sdk");

const {
  API_BASE,
  explore,
  getAnime,
  getAnimeStats,
  hydrateExploreResults
} = require("./hyakanime");

const {
  ANILIST_API,
  findBestMatch
} = require("./anilist");

const {
  parseHyakId,
  normalizeHyakanimeType,
  deriveSeason,
  toPreviewMeta,
  toFullMeta
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

const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];

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

function seasonLabel(season) {
  return {
    WINTER: "Winter",
    SPRING: "Spring",
    SUMMER: "Summer",
    FALL: "Fall"
  }[season];
}

function seasonalOptions(config) {
  const currentYear = new Date().getUTCFullYear();
  const values = [];

  for (let year = currentYear; year >= currentYear - config.seasonYearsBack; year -= 1) {
    for (const season of SEASONS) {
      values.push(`${seasonLabel(season)} ${year}`);
    }
  }

  return values;
}

function seriesFilterOptions(config) {
  return [
    "Tout",
    "En cours",
    "À venir",
    ...seasonalOptions(config),
    ...BASE_GENRES
  ];
}

function movieFilterOptions() {
  return ["Tout", ...BASE_GENRES];
}

function parseFilter(value) {
  if (!value || value === "Tout") return {};

  if (value === "En cours") return { status: 1 };
  if (value === "À venir") return { status: 2 };

  const seasonMatch = /^(Winter|Spring|Summer|Fall)\s+(\d{4})$/.exec(value);
  if (seasonMatch) {
    return {
      season: seasonMatch[1].toUpperCase(),
      year: Number(seasonMatch[2])
    };
  }

  if (BASE_GENRES.includes(value)) {
    return { genre: value };
  }

  return {};
}

function normalizeGenre(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesFilter(anime, filter, wantedType) {
  if (normalizeHyakanimeType(anime) !== wantedType) return false;

  if (filter.status && Number(anime?.status) !== filter.status) {
    return false;
  }

  if (filter.year && Number(anime?.start?.year) !== filter.year) {
    return false;
  }

  if (filter.season && deriveSeason(anime) !== filter.season) {
    return false;
  }

  if (filter.genre) {
    const genres = Array.isArray(anime?.genre) ? anime.genre : [];
    if (!genres.some((genre) => normalizeGenre(genre) === normalizeGenre(filter.genre))) {
      return false;
    }
  }

  return true;
}

async function collectHyakanimeCatalog({
  search = "",
  skip = 0,
  wantedType,
  filter = {},
  pageSize = 20,
  maxExplorePages = 12
}) {
  const targetCount = skip + pageSize;
  const matches = [];
  const seen = new Set();

  for (let page = 1; page <= maxExplorePages && matches.length < targetCount; page += 1) {
    const raw = await explore({ search, page });

    if (!Array.isArray(raw) || raw.length === 0) break;

    const unique = raw.filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    const hydrated = await hydrateExploreResults(unique, 6);

    for (const anime of hydrated) {
      if (matchesFilter(anime, filter, wantedType)) {
        matches.push(anime);
      }
    }
  }

  return matches.slice(skip, skip + pageSize);
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
          options: seriesFilterOptions(config)
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
          options: movieFilterOptions()
        },
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    });
  }

  const manifest = {
    id: "fr.hyakanime.catalog",
    version: "1.5.0",
    name: "Hyakanime",
    description:
      "Catalogue Hyakanime pour Stremio, enrichi avec AniList.",
    logo: "https://cdn-hyakanime.s3.eu-west-3.amazonaws.com/logo-hyakanime.png",
    resources: ["catalog", "meta"],
    types: ["hyakanime"],
    idPrefixes: ["hyakanime:"],
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
      const search = String(args?.extra?.search || "").trim();
      const filter = parseFilter(String(args?.extra?.genre || ""));

      const wantedType =
        args.id === "hyakanime-movies"
          ? "movie"
          : "series";

      const results = await collectHyakanimeCatalog({
        search,
        skip,
        wantedType,
        filter,
        pageSize: 20
      });

      console.log(
        `[catalog] source=hyakanime id=${args.id} genre=${args?.extra?.genre || "Tout"} ` +
        `search=${search || "-"} skip=${skip} returned=${results.length}`
      );

      return {
        metas: results.map((anime) => toPreviewMeta(anime, config))
      };
    } catch (error) {
      console.error("[catalog]", error?.stack || error);
      return { metas: [] };
    }
  });

  builder.defineMetaHandler(async (args) => {
    const animeId = parseHyakId(args.id);
    if (!animeId) return { meta: null };

    try {
      const hyak = await getAnime(animeId);
      if (!hyak) return { meta: null };

      const [ani, stats] = await Promise.all([
        findBestMatch(hyak),
        config.showStats
          ? getAnimeStats(animeId).catch(() => null)
          : Promise.resolve(null)
      ]);

      console.log(
        `[meta] hyakanime=${animeId} anilist=${ani?.id || "no-match"}`
      );

      return {
        meta: toFullMeta(hyak, ani, stats, config)
      };
    } catch (error) {
      console.error("[meta]", error?.stack || error);
      return { meta: null };
    }
  });

  return builder.getInterface();
}

// Configuration routes before static/router.
app.get("/", (_req, res) => {
  res.redirect("/configure");
});

app.get("/configure", (_req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(path.join(process.cwd(), "public", "configure.html"));
});

app.get("/c/:config/configure", (_req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(path.join(process.cwd(), "public", "configure.html"));
});

app.get("/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    status: "ok",
    addon: "Hyakanime",
    version: "1.5.0",
    catalogSource: "Hyakanime",
    enrichmentSource: "AniList",
    hyakanimeApi: API_BASE,
    aniListApi: ANILIST_API
  });
});

app.get("/debug/hyakanime", async (_req, res) => {
  try {
    const raw = await explore({ search: "Solo Leveling", page: 1 });
    const hydrated = await hydrateExploreResults(
      Array.isArray(raw) ? raw.slice(0, 5) : [],
      4
    );

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      source: "Hyakanime",
      count: hydrated.length,
      sample: hydrated.map((anime) => ({
        id: anime.id,
        title: anime.title || anime.titleEN || anime.romanji,
        type: anime.type,
        status: anime.status,
        genres: anime.genre,
        episodes: anime.NbEpisodes,
        start: anime.start
      }))
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || String(error)
    });
  }
});

app.get("/debug/match/:id", async (req, res) => {
  try {
    const hyak = await getAnime(req.params.id);
    const ani = await findBestMatch(hyak);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      hyakanime: {
        id: hyak?.id,
        title: hyak?.title,
        titleEN: hyak?.titleEN,
        romanji: hyak?.romanji
      },
      anilist: ani
        ? {
            id: ani.id,
            title: ani.title,
            format: ani.format,
            season: ani.season,
            seasonYear: ani.seasonYear,
            episodes: ani.episodes,
            genres: ani.genres
          }
        : null
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || String(error)
    });
  }
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
  console.log(`AniList enrichment API: ${ANILIST_API}`);
  console.log(`Configure: http://127.0.0.1:${PORT}/configure`);
  console.log(`Addon: http://127.0.0.1:${PORT}/c/${defaultConfig}/manifest.json`);
});
