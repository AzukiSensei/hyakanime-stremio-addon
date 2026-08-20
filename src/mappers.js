function pickTitle(anime, preferred = "auto") {
  const choices = {
    fr: anime?.title,
    en: anime?.titleEN,
    romaji: anime?.romanji,
    jp: anime?.titleJP
  };

  if (preferred !== "auto" && choices[preferred]) {
    return choices[preferred];
  }

  return (
    anime?.title ||
    anime?.titleEN ||
    anime?.romanji ||
    anime?.titleJP ||
    anime?.alt?.[0] ||
    `Anime ${anime?.id ?? ""}`
  );
}

function normalizeType(anime) {
  const raw = String(anime?.type || "").toLowerCase();

  if (raw.includes("movie") || raw.includes("film")) {
    return "movie";
  }

  return "series";
}

function hyakId(id) {
  return `hyakanime:${id}`;
}

function parseHyakId(id) {
  const match = /^hyakanime:(\d+)$/.exec(String(id));
  return match ? match[1] : null;
}

function yearFromAnime(anime) {
  return anime?.start?.year || undefined;
}

function formatReleaseInfo(anime) {
  const bits = [];

  if (anime?.type) bits.push(String(anime.type));
  if (anime?.NbEpisodes) bits.push(`${anime.NbEpisodes} épisodes`);
  if (anime?.season) bits.push(String(anime.season));

  return bits.join(" • ") || undefined;
}

function buildDescription(anime) {
  const synopsis = anime?.synopsis?.trim();
  if (synopsis) return synopsis;

  const details = [];
  if (anime?.studios) details.push(`Studio : ${anime.studios}`);
  if (anime?.source) details.push(`Source : ${anime.source}`);
  if (anime?.origin) details.push(`Origine : ${anime.origin}`);

  return details.join("\n") || "Fiche Hyakanime.";
}

function toPreviewMeta(anime, config = {}) {
  return {
    id: hyakId(anime.id),
    type: normalizeType(anime),
    name: pickTitle(anime, config.titleLanguage),
    poster: anime.image || undefined,
    posterShape: "poster",
    year: yearFromAnime(anime)
  };
}

function toFullMeta(anime, stats, config = {}) {
  const type = normalizeType(anime);

  const meta = {
    id: hyakId(anime.id),
    type,
    name: pickTitle(anime, config.titleLanguage),
    poster: anime.image || undefined,
    background: anime.banner || anime.cover || anime.image || undefined,
    logo: anime.logo || undefined,
    description: buildDescription(anime),
    genres: Array.isArray(anime.genre) ? anime.genre.filter(Boolean) : [],
    year: yearFromAnime(anime),
    releaseInfo: formatReleaseInfo(anime),
    website: `https://hyakanime.fr/anime/${anime.id}`
  };

  if (anime?.studios) {
    meta.director = Array.isArray(anime.studios)
      ? anime.studios.join(", ")
      : String(anime.studios);
  }

  if (config.showStats !== false && stats && typeof stats.UsersAdd === "number") {
    meta.description += `\n\nAjouté par ${stats.UsersAdd.toLocaleString("fr-FR")} utilisateurs Hyakanime.`;
  }

  if (Array.isArray(anime?.streaming) && anime.streaming.length) {
    const platforms = anime.streaming
      .map((entry) => entry?.source)
      .filter(Boolean);

    if (platforms.length) {
      meta.description += `\n\nDisponible via : ${[...new Set(platforms)].join(", ")}.`;
    }
  }

  return meta;
}

module.exports = {
  pickTitle,
  normalizeType,
  hyakId,
  parseHyakId,
  toPreviewMeta,
  toFullMeta
};
