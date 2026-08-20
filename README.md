# Hyakanime Stremio Addon — v1.5.0

## Architecture

Hyakanime est désormais la source canonique.

```text
Stremio catalogue/search
        ↓
Hyakanime /explore
        ↓
Hyakanime /anime/:id
        ↓
ID Stremio = hyakanime:<id>
```

AniList ne remplace plus le catalogue. Il sert uniquement à enrichir les fiches :

```text
Hyakanime fiche
   + AniList matching
   = fiche Stremio enrichie
```

## Priorité des données

```text
ID principal        Hyakanime
Titre               Hyakanime
Synopsis            Hyakanime
Poster              Hyakanime
Streaming           Hyakanime
Genres              Hyakanime + AniList
Banner              AniList en priorité
Nombre d'épisodes   Hyakanime, fallback AniList
Studio              Hyakanime + AniList
Saison / année      Hyakanime, AniList en complément
```

## Catalogues

Type :

```text
Hyakanime
```

Catalogues :

```text
Séries
Films
```

Filtres séries :

```text
Tout
En cours
À venir
Winter / Spring / Summer / Fall par année
Genres
```

Les résultats sont toujours collectés depuis Hyakanime puis filtrés.

## Debug

```text
/health
/debug/hyakanime
/debug/match/<hyakanime-id>
```
