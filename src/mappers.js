function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickAniListTitle(media, preferred = "auto") {
  const title = media?.title || {};

  const choices = {
    fr: title.userPreferred,
    en: title.english,
    romaji: title.romaji,
    jp: title.native
  };

  if (preferred !== "auto" && choices[preferred]) {
    return choices[preferred];
  }

  return (
    title.userPreferred ||
    title.english ||
    title.romaji ||
    title.native ||
    `Anime ${media?.id ?? ""}`
  );
}

function anilistId(id) {
  return `anilist:${id}`;
}

function parseAniListId(id) {
  const match = /^anilist:(\d+)$/.exec(String(id));
  return match ? match[1] : null;
}

function normalizeAniListType(media) {
  return media?.format === "MOVIE" ? "movie" : "series";
}

function aniListToPreviewMeta(media, config = {}) {
  return {
    id: anilistId(media.id),
    type: normalizeAniListType(media),
    name: pickAniListTitle(media, config.titleLanguage),
    poster: media?.coverImage?.extraLarge || media?.coverImage?.large,
    posterShape: "poster",
    year: media?.seasonYear || media?.startDate?.year,
    releaseInfo: media?.seasonYear
      ? `${media.season || ""} ${media.seasonYear}`.trim()
      : undefined
  };
}

function buildAniListVideos(media) {
  if (normalizeAniListType(media) !== "series") return [];

  const total = Number(media?.episodes || 0);
  if (!Number.isFinite(total) || total <= 0) return [];

  return Array.from({ length: Math.min(total, 2000) }, (_, i) => {
    const episode = i + 1;
    return {
      id: `${anilistId(media.id)}:${episode}`,
      title: `Épisode ${episode}`,
      season: 1,
      episode,
      overview: `Épisode ${episode} de ${pickAniListTitle(media)}.`,
      thumbnail: media?.coverImage?.large || media?.coverImage?.extraLarge
    };
  });
}

function aniListToFullMeta(media, config = {}, hyak = null) {
  const type = normalizeAniListType(media);
  const studios = media?.studios?.nodes?.map((s) => s.name).filter(Boolean) || [];
  const year = media?.seasonYear || media?.startDate?.year;

  let description = stripHtml(media?.description) || "Fiche anime AniList.";

  if (hyak?.streaming?.length) {
    const platforms = [...new Set(
      hyak.streaming.map((item) => item?.source).filter(Boolean)
    )];

    if (platforms.length) {
      description += `\n\nDisponible via : ${platforms.join(", ")}.`;
    }
  }

  const meta = {
    id: anilistId(media.id),
    type,
    name: pickAniListTitle(media, config.titleLanguage),
    poster:
      media?.coverImage?.extraLarge ||
      media?.coverImage?.large ||
      hyak?.image,
    background: media?.bannerImage || hyak?.image,
    description,
    genres: Array.isArray(media?.genres) ? media.genres : [],
    year,
    releaseInfo: [
      media?.format,
      media?.episodes ? `${media.episodes} épisodes` : null,
      media?.season && media?.seasonYear
        ? `${media.season} ${media.seasonYear}`
        : null
    ].filter(Boolean).join(" • "),
    website: `https://anilist.co/anime/${media.id}`
  };

  if (studios.length) meta.director = studios.join(", ");
  if (type === "series") meta.videos = buildAniListVideos(media);

  return meta;
}

// Legacy helpers kept for backward compatibility with already-installed URLs.
function pickTitle(anime, preferred = "auto") {
  const choices = {
    fr: anime?.title,
    en: anime?.titleEN,
    romaji: anime?.romanji,
    jp: anime?.titleJP
  };
  if (preferred !== "auto" && choices[preferred]) return choices[preferred];
  return anime?.title || anime?.titleEN || anime?.romanji || anime?.titleJP || anime?.alt?.[0] || `Anime ${anime?.id ?? ""}`;
}

function normalizeType(anime) {
  const raw = String(anime?.type || "").trim().toLowerCase();
  return raw === "movie" || raw === "film" || raw.includes("movie") || raw.includes("film")
    ? "movie"
    : "series";
}

function hyakId(id) {
  return `hyakanime:${id}`;
}

function parseHyakId(id) {
  const match = /^hyakanime:(\d+)$/.exec(String(id));
  return match ? match[1] : null;
}

module.exports = {
  stripHtml,
  pickAniListTitle,
  anilistId,
  parseAniListId,
  normalizeAniListType,
  aniListToPreviewMeta,
  buildAniListVideos,
  aniListToFullMeta,
  pickTitle,
  normalizeType,
  hyakId,
  parseHyakId
};
