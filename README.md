# AniList Stremio Addon — v2.1.0

Architecture:
- AniList: catalogue, recherche, fiches, IDs
- AniZip: enrichissement épisode optionnel

Changes:
- Stremio custom type is now `anilist` so Discover shows AniList
- configuration page displays AniList logo
- version and live health status at top
- AniZip health/degraded state visible
- extra config: ONA, OVA, Specials, default sort, AniZip toggle, episode-image preference
- AniZip 403/Cloudflare does not break metadata; AniList remains fallback

Debug:
- `/health`
- `/debug/anizip/<anilist_id>`
