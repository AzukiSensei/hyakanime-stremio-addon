const express = require("express");
const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const {
  explore,
  getAnime,
  getAnimeStats,
  API_BASE
} = require("./hyakanime");
const {
  normalizeType,
  parseHyakId,
  toPreviewMeta,
  toFullMeta
} = require("./mappers");

const PORT = Number(process.env.PORT || 7000);
const app = express();

const DEFAULT_CONFIG = Object.freeze({
  titleLanguage: "auto",
  includeSeries: true,
  includeMovies: true,
  showStats: true
});

function sanitizeConfig(input = {}) {
  const languages = new Set(["auto", "fr", "en", "romaji", "jp"]);

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
        : DEFAULT_CONFIG.showStats
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

function buildAddon(configInput = DEFAULT_CONFIG) {
  const config = sanitizeConfig(configInput);

  const catalogs = [];

  if (config.includeSeries) {
    catalogs.push({
      type: "series",
      id: "hyakanime-series",
      name: "Hyakanime — Séries",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    });
  }

  if (config.includeMovies) {
    catalogs.push({
      type: "movie",
      id: "hyakanime-movies",
      name: "Hyakanime — Films",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    });
  }

  const manifest = {
    id: "fr.hyakanime.catalog",
    version: "1.1.0",
    name: "Hyakanime",
    description:
      "Catalogue et métadonnées anime Hyakanime pour Stremio. Addon communautaire non officiel.",
    logo: "https://cdn-hyakanime.s3.eu-west-3.amazonaws.com/logo-hyakanime.png",
    resources: ["catalog", "meta"],
    types: ["series", "movie"],
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
      if (args.type === "series" && !config.includeSeries) return { metas: [] };
      if (args.type === "movie" && !config.includeMovies) return { metas: [] };

      const search = String(args?.extra?.search || "").trim();
      const skip = Math.max(0, Number(args?.extra?.skip || 0));
      const page = Math.floor(skip / 20) + 1;
      const result = await explore({ search, page });

      if (!Array.isArray(result)) return { metas: [] };

      return {
        metas: result
          .filter((anime) => anime?.id != null)
          .filter((anime) => normalizeType(anime) === args.type)
          .map((anime) => toPreviewMeta(anime, config))
      };
    } catch (error) {
      console.error("[catalog]", error);
      return { metas: [] };
    }
  });

  builder.defineMetaHandler(async (args) => {
    const animeId = parseHyakId(args.id);
    if (!animeId) return { meta: null };

    try {
      const anime = await getAnime(animeId);

      if (!anime || anime.id == null) {
        return { meta: null };
      }

      const actualType = normalizeType(anime);
      if (args.type && actualType !== args.type) {
        return { meta: null };
      }

      let stats = null;
      if (config.showStats) {
        try {
          stats = await getAnimeStats(animeId);
        } catch {
          // La fiche reste utilisable si les stats ne répondent pas.
        }
      }

      return {
        meta: toFullMeta(anime, stats, config)
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
    api: API_BASE
  });
});

// Alias pratique vers la page officielle de configuration.
app.get("/", (_req, res) => {
  res.redirect("/configure");
});

// Le router par défaut garde la compatibilité avec /manifest.json.
app.use((req, res, next) => {
  if (req.path.startsWith("/c/")) return next();
  return defaultRouter(req, res, next);
});

// Configuration encodée dans l'URL de l'addon.
app.use("/c/:config", (req, res, next) => {
  const config = decodeConfig(req.params.config);
  return getRouter(buildAddon(config))(req, res, next);
});

app.listen(PORT, "0.0.0.0", () => {
  const defaultConfig = encodeConfig(DEFAULT_CONFIG);
  console.log(`Hyakanime API: ${API_BASE}`);
  console.log(`Configure: http://127.0.0.1:${PORT}/configure`);
  console.log(`Default addon: http://127.0.0.1:${PORT}/c/${defaultConfig}/manifest.json`);
});
