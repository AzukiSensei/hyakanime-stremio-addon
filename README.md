# Hyakanime Stremio Addon — v1.4.1

Version de diagnostic.

## Nouveautés

- journalisation de chaque requête HTTP Stremio
- erreurs `catalog` et `meta` détaillées dans les logs
- endpoint `/debug/anilist`
- endpoint `/debug/hyakanime`
- `/health` affiche la version courante

## Tests

Après déploiement :

```text
https://votre-domaine/health
https://votre-domaine/debug/anilist
https://votre-domaine/debug/hyakanime
```

`/debug/anilist` doit renvoyer :

```json
{
  "ok": true,
  "count": 5
}
```

et quelques titres anime.

Si `ok` vaut `false`, la réponse JSON contient l'erreur exacte renvoyée par AniList ou le réseau.

## Logs

Lorsqu'un catalogue est ouvert dans Stremio, Dokploy doit maintenant afficher par exemple :

```text
[http] GET /catalog/hyakanime/hyakanime-series.json
[http] GET /catalog/hyakanime/hyakanime-series.json -> 200
```

ainsi qu'une erreur `[catalog]` si le handler échoue.
