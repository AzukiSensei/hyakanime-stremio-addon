function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickHyakanimeTitle(hyak, preferred = "auto") {
  const choices = {
    fr: hyak?.title,
    en: hyak?.titleEN,
    romaji: hyak?.romanji,
    jp: hyak?.titleJP
  };

  if (preferred !== "auto" && choices[preferred]) {
    return choices[preferred];
  }

  return (
    hyak?.title ||
    hyak?.titleEN ||
    hyak?.romanji ||
    hyak?.titleJP ||
    `Anime ${hyak?.id ?? ""}`
  );
}

function hyakId(id) {
  return `hyakanime:${id}`;
}

function parseHyakId(id) {
  const match = /^hyakanime:(\d+)$/.exec(String(id));
  return match ? match[1] : null;
}

function normalizeHyakanimeType(hyak) {
  const raw = String(hyak?.type || "").trim().toLowerCase();

  if (
    raw === "movie" ||
    raw === "film" ||
    raw.includes("movie") ||
    raw.includes("film")
  ) {
    return "movie";
  }

  return "series";
}

function deriveSeason(hyak) {
  const explicit = String(hyak?.season || "").toLowerCase();

  if (explicit.includes("winter") || explicit.includes("hiver")) return "WINTER";
  if (explicit.includes("spring") || explicit.includes("printemps")) return "SPRING";
  if (explicit.includes("summer") || explicit.includes("été") || explicit.includes("ete")) return "SUMMER";
  if (explicit.includes("fall") || explicit.includes("autumn") || explicit.includes("automne")) return "FALL";

  const month = Number(hyak?.start?.month || 0);
  if (!month) return null;

  if (month <= 3) return "WINTER";
  if (month <= 6) return "SPRING";
  if (month <= 9) return "SUMMER";
  return "FALL";
}

function toPreviewMeta(hyak, config = {}) {
  return {
    id: hyakId(hyak.id),
    type: "hyakanime",
    name: pickHyakanimeTitle(hyak, config.titleLanguage),
    poster: hyak?.image || undefined,
    posterShape: "poster",
    year: hyak?.start?.year || undefined
  };
}

function buildVideos(hyak, ani = null) {
  if (normalizeHyakanimeType(hyak) === "movie") return [];

  const total = Number(hyak?.NbEpisodes || ani?.episodes || 0);
  if (!Number.isFinite(total) || total <= 0) return [];

  const thumbnail =
    ani?.bannerImage ||
    hyak?.banner ||
    hyak?.image ||
    ani?.coverImage?.extraLarge ||
    ani?.coverImage?.large;

  return Array.from({ length: Math.min(total, 2000) }, (_, index) => {
    const episode = index + 1;

    return {
      id: `${hyakId(hyak.id)}:${episode}`,
      title: `Épisode ${episode}`,
      season: 1,
      episode,
      thumbnail,
      overview: `Épisode ${episode} de ${pickHyakanimeTitle(hyak)}.`
    };
  });
}

function mergeGenres(hyak, ani) {
  const values = [
    ...(Array.isArray(hyak?.genre) ? hyak.genre : []),
    ...(Array.isArray(ani?.genres) ? ani.genres : [])
  ].filter(Boolean);

  return [...new Set(values)];
}

function toFullMeta(hyak, ani = null, stats = null, config = {}) {
  const type = normalizeHyakanimeType(hyak);

  let description =
    String(hyak?.synopsis || "").trim() ||
    stripHtml(ani?.description) ||
    "Fiche Hyakanime.";

  if (config.showStats !== false && stats && typeof stats.UsersAdd === "number") {
    description += `\n\nAjouté par ${stats.UsersAdd.toLocaleString("fr-FR")} utilisateurs Hyakanime.`;
  }

  if (Array.isArray(hyak?.streaming) && hyak.streaming.length) {
    const platforms = [...new Set(
      hyak.streaming.map((entry) => entry?.source).filter(Boolean)
    )];

    if (platforms.length) {
      description += `\n\nDisponible via : ${platforms.join(", ")}.`;
    }
  }

  const studios = [
    ...(Array.isArray(hyak?.studios) ? hyak.studios : hyak?.studios ? [hyak.studios] : []),
    ...((ani?.studios?.nodes || []).map((studio) => studio.name))
  ].filter(Boolean);

  const totalEpisodes = Number(hyak?.NbEpisodes || ani?.episodes || 0);

  const meta = {
    id: hyakId(hyak.id),
    type: "hyakanime",
    name: pickHyakanimeTitle(hyak, config.titleLanguage),
    poster:
      hyak?.image ||
      ani?.coverImage?.extraLarge ||
      ani?.coverImage?.large,
    background:
      ani?.bannerImage ||
      hyak?.banner ||
      hyak?.image ||
      ani?.coverImage?.extraLarge,
    description,
    genres: mergeGenres(hyak, ani),
    year: hyak?.start?.year || ani?.seasonYear || ani?.startDate?.year,
    releaseInfo: [
      hyak?.type || ani?.format,
      totalEpisodes ? `${totalEpisodes} épisodes` : null,
      ani?.season && ani?.seasonYear
        ? `${ani.season} ${ani.seasonYear}`
        : null
    ].filter(Boolean).join(" • "),
    website: `https://hyakanime.fr/anime/${hyak.id}`
  };

  if (studios.length) meta.director = [...new Set(studios)].join(", ");
  if (type === "series") meta.videos = buildVideos(hyak, ani);

  return meta;
}

module.exports = {
  stripHtml,
  pickHyakanimeTitle,
  hyakId,
  parseHyakId,
  normalizeHyakanimeType,
  deriveSeason,
  toPreviewMeta,
  toFullMeta
};
