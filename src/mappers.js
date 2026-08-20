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

function isMovie(media) {
  return media?.format === "MOVIE";
}

function aniListToPreviewMeta(media, config = {}) {
  return {
    id: anilistId(media.id),
    type: "hyakanime",
    name: pickAniListTitle(media, config.titleLanguage),
    poster: media?.coverImage?.extraLarge || media?.coverImage?.large,
    posterShape: "poster",
    year: media?.seasonYear || media?.startDate?.year
  };
}

function buildAniListVideos(media) {
  if (isMovie(media)) return [];

  const total = Number(media?.episodes || 0);
  if (!Number.isFinite(total) || total <= 0) return [];

  const thumb =
    media?.bannerImage ||
    media?.coverImage?.extraLarge ||
    media?.coverImage?.large;

  return Array.from({ length: Math.min(total, 2000) }, (_, i) => {
    const episode = i + 1;

    return {
      id: `${anilistId(media.id)}:${episode}`,
      title: `Épisode ${episode}`,
      season: 1,
      episode,
      overview: `Épisode ${episode} de ${pickAniListTitle(media)}.`,
      thumbnail: thumb
    };
  });
}

function aniListToFullMeta(media, config = {}, hyak = null) {
  const studios = media?.studios?.nodes?.map((s) => s.name).filter(Boolean) || [];
  const year = media?.seasonYear || media?.startDate?.year;

  // Hyakanime est prioritaire car son synopsis est souvent en français.
  let description =
    String(hyak?.synopsis || "").trim() ||
    stripHtml(media?.description) ||
    "Fiche anime.";

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
    type: "hyakanime",
    name: pickAniListTitle(media, config.titleLanguage),
    poster:
      media?.coverImage?.extraLarge ||
      media?.coverImage?.large ||
      hyak?.image,
    background:
      media?.bannerImage ||
      hyak?.banner ||
      hyak?.image ||
      media?.coverImage?.extraLarge,
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
    website: hyak?.id
      ? `https://hyakanime.fr/anime/${hyak.id}`
      : `https://anilist.co/anime/${media.id}`
  };

  if (studios.length) meta.director = studios.join(", ");
  if (!isMovie(media)) meta.videos = buildAniListVideos(media);

  return meta;
}

module.exports = {
  stripHtml,
  pickAniListTitle,
  anilistId,
  parseAniListId,
  aniListToPreviewMeta,
  buildAniListVideos,
  aniListToFullMeta
};
