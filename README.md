# Hyakanime Stremio Addon — v1.6.0

## Changements principaux

### Catalogue Hyakanime élargi

Hyakanime reste la source canonique.

La collecte passe désormais jusqu'à 40 pages `/explore` et cherche jusqu'à
50 résultats par requête Stremio avant de s'arrêter.

Cela améliore fortement les filtres peu denses comme :

```text
Summer 2026
Winter 2025
Fantasy
Films
```

Le cache Hyakanime évite de refaire inutilement les mêmes requêtes de détail.

### Enrichissement réel des saisons

Après matching Hyakanime -> AniList :

```text
Hyakanime
   ↓
AniList
   ↓ relations PREQUEL
numéro de saison
```

Exemple :

```text
Solo Leveling Season 2
→ PREQUEL Solo Leveling
→ Saison 2 dans Stremio
```

### Vrais épisodes via MyAnimeList/Jikan

AniList fournit `idMal`.

L'addon utilise ensuite l'API Jikan :

```text
Hyakanime
→ AniList
→ idMal
→ Jikan /anime/{malId}/episodes
```

Quand Jikan possède les données, les épisodes gagnent :

- vrai titre
- date de diffusion
- ordre d'épisode

Les miniatures restent basées sur le `bannerImage` AniList ou l'image Hyakanime,
car Jikan ne fournit pas systématiquement une miniature par épisode.

### Priorité des sources

```text
Catalogue       Hyakanime
ID              Hyakanime
Titre           Hyakanime
Synopsis        Hyakanime
Poster          Hyakanime
Genres          Hyakanime + AniList
Banner          AniList
Saison          AniList relations
Épisodes        Hyakanime/AniList pour le nombre
Titres épisodes Jikan/MAL
Dates épisodes  Jikan/MAL
```

## Variables

```text
PORT=7000
HYAKANIME_API_BASE=https://api-v5.hyakanime.fr
CACHE_TTL_MS=300000
ANILIST_CACHE_TTL_MS=900000
JIKAN_CACHE_TTL_MS=3600000
```
