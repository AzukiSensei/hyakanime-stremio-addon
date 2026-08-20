# AniList Stremio Addon — v2.0.0

Architecture :

```text
AniList = catalogue + recherche + fiches + IDs
AniZip  = épisodes + images + dates + synopsis épisode
```

Hyakanime, Kitsu et Jikan sont supprimés.

Endpoints :
- `/configure`
- `/health`
- `/debug/anilist`
- `/debug/anizip/<anilist_id>`

Variables :
```text
PORT=7000
ANILIST_CACHE_TTL_MS=900000
ANIZIP_API_BASE=https://hayase.ani.zip
ANIZIP_CACHE_TTL_MS=3600000
```
