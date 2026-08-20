const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
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

const manifest = {
  id: "fr.hyakanime.catalog",
  version: "1.0.0",
  name: "Hyakanime",
  description:
    "Catalogue et métadonnées anime Hyakanime pour Stremio. Addon communautaire non officiel.",
  logo: "https://cdn-hyakanime.s3.eu-west-3.amazonaws.com/logo-hyakanime.png",
  resources: ["catalog", "meta"],
  types: ["series", "movie"],
  idPrefixes: ["hyakanime:"],
  catalogs: [
    {
      type: "series",
      id: "hyakanime-series",
      name: "Hyakanime — Séries",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "movie",
      id: "hyakanime-movies",
      name: "Hyakanime — Films",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    }
  ],
  behaviorHints: {
    configurable: false,
    configurationRequired: false
  }
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async (args) => {
  try {
    const search = String(args?.extra?.search || "").trim();
    const skip = Math.max(0, Number(args?.extra?.skip || 0));

    // L'API Hyakanime est paginée. On approxime 20 résultats par page,
    // puis on filtre par type Stremio.
    const page = Math.floor(skip / 20) + 1;
    const result = await explore({ search, page });

    if (!Array.isArray(result)) {
      return { metas: [] };
    }

    const metas = result
      .filter((anime) => anime?.id != null)
      .filter((anime) => normalizeType(anime) === args.type)
      .map(toPreviewMeta);

    return { metas };
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

    // Empêche qu'une fiche film soit renvoyée sous "series" et inversement.
    const actualType = normalizeType(anime);
    if (args.type && actualType !== args.type) {
      return { meta: null };
    }

    let stats = null;
    try {
      stats = await getAnimeStats(animeId);
    } catch {
      // Les statistiques sont accessoires : la fiche reste utilisable sans elles.
    }

    return {
      meta: toFullMeta(anime, stats)
    };
  } catch (error) {
    console.error("[meta]", error);
    return { meta: null };
  }
});

serveHTTP(builder.getInterface(), {
  port: PORT
});

console.log(`Hyakanime API: ${API_BASE}`);
console.log(`Addon: http://127.0.0.1:${PORT}/manifest.json`);
