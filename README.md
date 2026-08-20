# Hyakanime Stremio Addon — v1.7.0

## Performance

Hyakanime reste la source principale.

L'addon n'hydrate plus systématiquement chaque ligne de `/explore` via
`/anime/:id`. Il ne le fait que si le filtre actif nécessite une donnée absente.

Cela réduit fortement le temps de chargement des catalogues.

## Images d'épisodes

L'enrichissement épisode passe maintenant par Kitsu :

```text
Hyakanime
→ AniList
→ idMal
→ Kitsu mapping
→ Kitsu episodes
```

Kitsu peut fournir une miniature propre à chaque épisode, ainsi que :

- titre
- synopsis
- date de diffusion
- durée
- numéro d'épisode

Quand une miniature Kitsu manque, l'addon utilise la bannière AniList ou
l'image Hyakanime en fallback.

## Saisons

Le calcul récursif de saison AniList a été supprimé du chemin critique.

Priorité :

1. numéro explicite dans le titre
2. PREQUEL direct
3. saison 1

Cela évite plusieurs appels réseau séquentiels.
