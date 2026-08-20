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

const DEFAULT_CONFIG = Object.freeze({
  titleLanguage: "auto",
  includeSeries: true,
  includeMovies: true,
  showStats: true,
  seasonalCatalogs: true,
  seasonYearsBack: 2
});

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
    seasonalCatalogs:
      typeof input.seasonalCatalogs === "boolean"
        ? input.seasonalCatalogs
        : DEFAULT_CONFIG.seasonalCatalogs,
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

function buildSeasonCatalogs(config) {
  if (!config.seasonalCatalogs || !config.includeSeries) return [];

  const year = new Date().getUTCFullYear();
  const catalogs = [];

  // Année courante + années précédentes demandées.
  for (let y = year; y >= year - config.seasonYearsBack; y -= 1) {
    for (const [season, label] of SEASONS) {
      catalogs.push({
        type: "series",
        id: `anilist-series-${season.toLowerCase()}-${y}`,
        name: `Séries — ${label} ${y}`,
        extra: [
          { name: "skip", isRequired: false },
          { name: "search", isRequired: false }
        ]
      });
    }
  }

  return catalogs;
}

function parseSeasonCatalogId(id) {
  const match = /^anilist-series-(winter|spring|summer|fall)-(\d{4})$/.exec(id);
  if (!match) return null;

  return {
    season: match[1].toUpperCase(),
    year: Number(match[2])
  };
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
      // Enrichissement optionnel.
    }
  }

  return null;
}

function buildAddon(configInput = DEFAULT_CONFIG) {
  const config = sanitizeConfig(configInput);
  const catalogs = [];

  if (config.includeSeries) {
    catalogs.push({
      type: "series",
      id: "anilist-series",
      name: "Séries",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    });
  }

  if (config.includeMovies) {
    catalogs.push({
      type: "movie",
      id: "anilist-movies",
      name: "Films",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    });
  }

  catalogs.push(...buildSeasonCatalogs(config));

  const manifest = {
    id: "fr.hyakanime.catalog",
    version: "1.3.1",
    name: "Hyakanime",
    description:
      "Catalogues anime Stremio alimentés par AniList et enrichis par Hyakanime.",
    logo: "https://cdn-hyakanime.s3.eu-west-3.amazonaws.com/logo-hyakanime.png",
    resources: ["catalog", "meta"],
    types: ["series", "movie"],
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

      let season;
      let seasonYear;
      let format;

      if (args.id === "anilist-series") {
        format = "TV";
      } else if (args.id === "anilist-movies") {
        format = "MOVIE";
      } else {
        const parsed = parseSeasonCatalogId(args.id);
        if (!parsed) return { metas: [] };
        season = parsed.season;
        seasonYear = parsed.year;
        format = "TV";
      }

      const result = await getAniListCatalog({
        page,
        perPage: 50,
        season,
        seasonYear,
        format,
        search,
        sort: search ? ["SEARCH_MATCH"] : ["POPULARITY_DESC"]
      });

      return {
        metas: (result?.media || []).map((media) =>
          aniListToPreviewMeta(media, config)
        )
      };
    } catch (error) {
      console.error("[catalog]", error);
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
      console.error("[meta]", error);
      return { meta: null };
    }
  });

  return builder.getInterface();
}

const defaultInterface = buildAddon(DEFAULT_CONFIG);
const defaultRouter = getRouter(defaultInterface);

app.use(express.static("public"));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    addon: "Hyakanime",
    hyakanimeApi: API_BASE,
    aniListApi: ANILIST_API
  });
});

app.get("/", (_req, res) => {
  res.redirect("/configure");
});

app.get("/configure", (_req, res) => {
  res.type("html");
  res.sendFile(path.join(process.cwd(), "public", "configure.html"));
});

// Stremio ouvre la page de configuration relativement à l'URL du manifest.
// Une installation personnalisée /c/<config>/manifest.json doit donc exposer
// également /c/<config>/configure.
app.get("/c/:config/configure", (req, res) => {
  res.type("html");
  res.sendFile(path.join(process.cwd(), "public", "configure.html"));
});

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
