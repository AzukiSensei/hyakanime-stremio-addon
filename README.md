# Hyakanime Stremio Addon

Addon Stremio communautaire non officiel basé sur l'API Hyakanime V5.

## Fonctionnalités

- Catalogues Séries et Films
- Recherche Stremio
- Métadonnées Hyakanime
- Page de configuration `/configure`
- Installation rapide via `stremio://`
- Préférence de langue des titres
- Activation/désactivation des catalogues
- Activation/désactivation des statistiques Hyakanime
- Docker / Dokploy compatible

## URLs

Une fois déployé :

```text
https://votre-domaine/configure
https://votre-domaine/manifest.json
https://votre-domaine/health
```

La page de configuration génère des URLs personnalisées :

```text
https://votre-domaine/c/<configuration>/manifest.json
```

## Variables d'environnement

```text
PORT=7000
HYAKANIME_API_BASE=https://api-v5.hyakanime.fr
CACHE_TTL_MS=300000
```

## Déploiement

```bash
npm install
npm start
```

ou avec Docker :

```bash
docker build -t hyakanime-stremio .
docker run -p 7000:7000 hyakanime-stremio
```

## Limite

Cet addon fournit `catalog` et `meta`, pas de flux vidéo direct.
