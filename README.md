# AniList Stremio Addon — v2.1.2

Fix principal:
- les filtres GraphQL AniList sont maintenant ajoutés dynamiquement
- aucun opérateur absent n'est envoyé avec une valeur `null`
- corrige `Illegal operator and value combination`

Catalogue:
- `/debug/catalog` teste exactement le chemin TV/Popularité
- requête catalogue légère
- détails seulement à l'ouverture d'une fiche

AniZip:
- reste optionnel
- un 403 Cloudflare ne bloque pas AniList

Debug:
- `/health`
- `/debug/catalog`
- `/debug/anizip/<anilist_id>`
