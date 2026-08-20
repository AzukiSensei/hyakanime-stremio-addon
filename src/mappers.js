function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function anilistId(id) { return `anilist:${id}`; }
function parseAniListId(id) {
  const m = /^anilist:(\d+)$/.exec(String(id));
  return m ? Number(m[1]) : null;
}
function isMovie(media) { return media?.format === "MOVIE"; }
function pickTitle(media, preferred="auto") {
  const t = media?.title || {};
  if (preferred === "en" && t.english) return t.english;
  if (preferred === "romaji" && t.romaji) return t.romaji;
  if (preferred === "jp" && t.native) return t.native;
  return t.userPreferred || t.english || t.romaji || t.native || `Anime ${media?.id ?? ""}`;
}
function toPreviewMeta(media, config={}) {
  return {
    id: anilistId(media.id),
    type: "anilist",
    name: pickTitle(media, config.titleLanguage),
    poster: media?.coverImage?.extraLarge || media?.coverImage?.large,
    posterShape: "poster",
    year: media?.seasonYear || media?.startDate?.year
  };
}
function episodeRowsFromAniZip(payload) {
  if (!payload?.episodes || typeof payload.episodes !== "object") return [];
  return Object.entries(payload.episodes)
    .map(([key,row]) => ({
      absolute: Number(row?.absoluteEpisodeNumber || row?.episodeNumber || key) || null,
      seasonNumber: Number(row?.seasonNumber || 1) || 1,
      episodeNumber: Number(row?.episodeNumber || row?.absoluteEpisodeNumber || key) || null,
      title: row?.title || {},
      overview: row?.overview || row?.summary || row?.description || null,
      airDate: row?.airDate || row?.airDateUtc || row?.airdate || null,
      image: row?.image || null
    }))
    .filter(r => r.absolute != null)
    .sort((a,b) => a.absolute - b.absolute);
}
function parseStreamingEpisodeNumber(value) {
  const m = String(value || "").match(/(?:episode|ep\.?)\s*(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : null;
}
function streamingRows(media) {
  return (media?.streamingEpisodes || []).map(row => ({
    number: parseStreamingEpisodeNumber(row?.title),
    title: row?.title || null,
    image: row?.thumbnail || null
  })).filter(r => r.number != null);
}
function pickEpisodeTitle(titles, preferred="auto") {
  if (!titles || typeof titles !== "object") return null;
  if (preferred === "en") return titles.en || titles["en-US"] || titles.en_us || titles["x-jat"] || null;
  if (preferred === "jp") return titles.ja || titles["ja-JP"] || titles.ja_jp || titles["x-jat"] || null;
  if (preferred === "romaji") return titles["x-jat"] || titles.en || titles.ja || null;
  return titles.fr || titles["fr-FR"] || titles.en || titles["en-US"] || titles["x-jat"] || titles.ja || null;
}
function deriveSeasonNumber(media) {
  const text = [media?.title?.userPreferred, media?.title?.english, media?.title?.romaji, ...(media?.synonyms || [])]
    .filter(Boolean).join(" ");
  for (const pattern of [/\bseason\s*(\d+)\b/i, /\b(\d+)(?:st|nd|rd|th)\s+season\b/i, /\bsaison\s*(\d+)\b/i, /\bpart\s*(\d+)\b/i]) {
    const m = text.match(pattern);
    const n = Number(m?.[1] || 0);
    if (n >= 1 && n <= 30) return n;
  }
  const hasPrequel = (media?.relations?.edges || []).some(e => e?.relationType === "PREQUEL" && e?.node?.format !== "MOVIE");
  return hasPrequel ? 2 : 1;
}
function buildVideos(media, aniZipPayload, config={}) {
  if (isMovie(media)) return [];
  const zipRows = episodeRowsFromAniZip(aniZipPayload);
  const streamRows = streamingRows(media);
  const seasonNumber = deriveSeasonNumber(media);
  const total = Number(media?.episodes || aniZipPayload?.episodeCount || zipRows.length || 0);
  if (!Number.isFinite(total) || total <= 0) return [];
  const fallback = media?.bannerImage || media?.coverImage?.extraLarge || media?.coverImage?.large;

  return Array.from({ length: Math.min(total, 2000) }, (_, index) => {
    const absolute = index + 1;
    const zip = zipRows.find(r => r.absolute === absolute) || zipRows[index] || null;
    const stream = streamRows.find(r => Number(r.number) === absolute) || null;
    const epSeason = Number(zip?.seasonNumber || seasonNumber || 1);
    const epNumber = Number(zip?.episodeNumber || absolute);
    const title = pickEpisodeTitle(zip?.title, config.titleLanguage) || stream?.title || `Épisode ${epNumber}`;
    const released = zip?.airDate && !Number.isNaN(Date.parse(zip.airDate))
      ? new Date(zip.airDate).toISOString()
      : undefined;
    return {
      id: `${anilistId(media.id)}:${epSeason}:${epNumber}`,
      title,
      season: epSeason,
      episode: epNumber,
      released,
      thumbnail: config.preferEpisodeImages !== false
        ? (zip?.image || stream?.image || fallback)
        : (stream?.image || fallback || zip?.image),
      overview: zip?.overview || `Épisode ${epNumber} de ${pickTitle(media, config.titleLanguage)}.`
    };
  });
}
function toFullMeta(media, aniZipPayload=null, config={}) {
  const studios = media?.studios?.nodes?.map(s => s.name).filter(Boolean) || [];
  const seasonNumber = deriveSeasonNumber(media);
  const rows = episodeRowsFromAniZip(aniZipPayload);
  const totalEpisodes = Number(media?.episodes || aniZipPayload?.episodeCount || rows.length || 0);
  const meta = {
    id: anilistId(media.id),
    type: "anilist",
    name: pickTitle(media, config.titleLanguage),
    poster: media?.coverImage?.extraLarge || media?.coverImage?.large,
    background: media?.bannerImage || media?.coverImage?.extraLarge,
    description: stripHtml(media?.description) || "Fiche AniList.",
    genres: Array.isArray(media?.genres) ? media.genres : [],
    year: media?.seasonYear || media?.startDate?.year,
    releaseInfo: [
      media?.format,
      totalEpisodes ? `${totalEpisodes} épisodes` : null,
      seasonNumber > 1 ? `Saison ${seasonNumber}` : null,
      media?.season && media?.seasonYear ? `${media.season} ${media.seasonYear}` : null,
      media?.averageScore ? `${media.averageScore}%` : null
    ].filter(Boolean).join(" • "),
    website: `https://anilist.co/anime/${media.id}`
  };
  if (studios.length) meta.director = studios.join(", ");
  if (!isMovie(media)) meta.videos = buildVideos(media, aniZipPayload, config);
  return meta;
}
module.exports = { parseAniListId, toPreviewMeta, toFullMeta };
