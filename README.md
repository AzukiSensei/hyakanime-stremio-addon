# Hyakanime Stremio Addon

## v1.3.1

Architecture hybride :

- AniList = découverte, saisons, années, affiches, synopsis, genres, nombre d'épisodes
- Hyakanime = enrichissement complémentaire quand une fiche correspond
- Stremio = types standards `series` et `movie`

### Catalogues

L'addon déclare notamment :

```text
Séries
Films
Séries — Winter 2026
Séries — Spring 2026
Séries — Summer 2026
Séries — Fall 2026
Séries — Winter 2025
...
```

Le nombre d'années de saisons visibles est configurable depuis `/configure`.

### Pourquoi ne pas créer un type `hyakanime` ?

Les clients Stremio utilisent surtout les types standards :

```text
series
movie
channel
tv
```

Hyakanime est donc le nom/source de l'addon, tandis que les lignes visibles
dans Stremio sont des catalogues séparés.

### Variables

```text
PORT=7000
HYAKANIME_API_BASE=https://api-v5.hyakanime.fr
CACHE_TTL_MS=300000
ANILIST_CACHE_TTL_MS=300000
```

### URLs

```text
/configure
/manifest.json
/health
```


### Configuration modifiable

Les deux routes sont supportées :

```text
/configure
/c/<configuration>/configure
```

La seconde recharge automatiquement les réglages encodés dans l'URL actuelle.
