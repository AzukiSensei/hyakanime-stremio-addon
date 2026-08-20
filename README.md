# Hyakanime Stremio Addon

Addon Stremio communautaire **non officiel** utilisant l'API Hyakanime V5.

## Fonctionnalités

- Catalogue Hyakanime dans Stremio
- Séries et films séparés
- Recherche Stremio via Hyakanime
- Fiches anime
- Affiche, synopsis, genres, année, studio, source
- Nombre d'utilisateurs Hyakanime ayant ajouté un titre lorsqu'il est disponible
- Cache mémoire configurable
- Docker / Docker Compose

## Limite importante

Cet addon ne fournit volontairement **aucun flux vidéo piraté ou inventé**.

L'API Hyakanime expose notamment des informations de diffuseurs dans certaines fiches.
Ces informations servent seulement à enrichir les métadonnées.

L'addon déclare donc uniquement :

- `catalog`
- `meta`

et pas `stream`.

Il peut être combiné avec d'autres addons Stremio fournissant légalement des streams pour
des identifiants compatibles. Comme les IDs de cet addon sont spécifiques à Hyakanime
(`hyakanime:<id>`), un mapping externe AniList/MAL/IMDb serait nécessaire pour une
interopérabilité complète avec les fournisseurs de streams Stremio existants.

## API utilisée

Base :

```text
https://api-v5.hyakanime.fr
```

Endpoints utilisés :

```text
GET /explore?search={query}&page={page}
GET /anime/{id}
GET /anime/stats/{id}
```

## Installation locale

Prérequis :

- Node.js 18+

Puis :

```bash
npm install
npm start
```

L'addon sera disponible sur :

```text
http://127.0.0.1:7000/manifest.json
```

Dans Stremio, ajoute cette URL d'addon.

## Docker

```bash
docker compose up -d --build
```

Puis :

```text
http://127.0.0.1:7000/manifest.json
```

## Déploiement public

Stremio exige HTTPS pour les addons distants. Le SDK Stremio gère CORS, mais ton reverse
proxy doit fournir un certificat HTTPS valide.

Exemple :

```text
https://hyakanime-addon.example.com/manifest.json
```

Variables d'environnement :

```text
PORT=7000
HYAKANIME_API_BASE=https://api-v5.hyakanime.fr
CACHE_TTL_MS=300000
```

## Structure

```text
src/
├── index.js       # Manifest + handlers Stremio
├── hyakanime.js   # Client API Hyakanime
└── mappers.js     # Conversion Hyakanime -> Stremio
```

## Étape suivante recommandée

Pour obtenir une intégration Stremio réellement complète, il faut identifier dans
Hyakanime un identifiant externe stable :

- AniList
- MyAnimeList
- IMDb
- TMDB

On pourra alors mapper les fiches Hyakanime vers les IDs utilisés par les autres addons
Stremio et ajouter des épisodes/saisons de façon fiable.
