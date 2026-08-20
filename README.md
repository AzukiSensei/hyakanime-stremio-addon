# Hyakanime Stremio Addon — v1.4.0

## Structure Stremio

Type personnalisé :

```text
Hyakanime
```

Catalogues :

```text
Séries
Films
```

Filtres de Séries via `genre` :

```text
Tout
En cours
À venir
Populaires
Tendances
Winter 2026
Spring 2026
Summer 2026
Fall 2026
...
Action
Adventure
Comedy
Drama
Fantasy
Romance
Sci-Fi
...
```

## Métadonnées

- AniList fournit catalogue, images, genres, saison et nombre d'épisodes.
- Hyakanime enrichit les fiches quand une correspondance est trouvée.
- Le synopsis Hyakanime est prioritaire afin d'avoir du français quand disponible.
- Les épisodes utilisent `bannerImage` AniList comme miniature, avec fallback couverture.

## Configuration

```text
/configure
/c/<config>/configure
```

Les routes sont servies explicitement en `text/html` avec `Content-Disposition: inline`.

## Variables

```text
PORT=7000
HYAKANIME_API_BASE=https://api-v5.hyakanime.fr
CACHE_TTL_MS=300000
ANILIST_CACHE_TTL_MS=300000
```
