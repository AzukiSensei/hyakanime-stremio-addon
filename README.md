# AniList Stremio Addon — v2.1.1

Fixes:
- lightweight AniList catalog query
- TV/ONA/OVA/SPECIAL merged with one `format_in` query
- detailed fields fetched only when opening a media page
- movie year filter uses start-date bounds instead of `seasonYear` alone
- `/debug/catalog` tests the exact catalogue path
- AniZip remains optional and degraded-safe

Debug:
- `/health`
- `/debug/catalog`
- `/debug/anizip/<anilist_id>`
