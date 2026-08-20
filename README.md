# Hyakanime Stremio Addon — v1.7.1

## Correctif 429 Hyakanime

Les logs v1.7.0 ont confirmé un rate limit Hyakanime :

```text
429 Too Many Requests
retryAfter ≈ 10 minutes
```

La v1.7.1 évite désormais les rafales de requêtes.

### Catalogues

Les catalogues utilisent uniquement :

```text
GET /explore
```

Ils ne font plus de `/anime/:id` par résultat.

Une fiche complète Hyakanime n'est demandée que lorsque l'utilisateur ouvre
une fiche dans Stremio.

### Protection rate limit

Le client Hyakanime possède maintenant :

- déduplication des requêtes identiques en cours
- cache frais 15 minutes
- cache stale 6 heures
- délai minimum entre requêtes
- lecture de `retryAfter`
- circuit breaker global pendant le cooldown
- stale-cache fallback lors d'un 429

Pendant un cooldown, l'addon n'essaie donc pas de marteler l'API.

### Diagnostic

```text
/debug/rate-limit
```

Exemple :

```json
{
  "ok": true,
  "hyakanime": {
    "blocked": true,
    "retryAfter": 420,
    "cacheEntries": 8,
    "inFlight": 0
  }
}
```

## Variables

```text
CACHE_TTL_MS=900000
STALE_CACHE_TTL_MS=21600000
HYAKANIME_MIN_REQUEST_GAP_MS=250
```

Les fiches restent enrichies via AniList + Kitsu.
