# Mise en pré-production / production — Campus Edu API v2

Branche : `release/v2-preprod` (regroupe CE-01, 02, 06, 09 à 21 + sauvegardes + vérification de doublons).
**Ne pas fusionner dans `main` avant que la liste ci-dessous soit validée sur la pré-production.**

## 1. Avant de déployer
1. **Sauvegarde** de la base (workflow « Sauvegarde base de données » ou `pg_dump`). La migration `…11` supprime des lignes en double de `telechargements`.
2. **Pré-production = base séparée** (nouveau projet Supabase ou copie restaurée de la prod). Ne jamais tester les migrations d'abord sur la production.
3. **Audit des orphelins** : `DB_URL=<base> npm run db:audit` (code de sortie 1 s'il y en a). Corriger avec `npm run db:audit -- --fix` après sauvegarde.
4. **Migrations** : `DB_URL=<base> npm run db:migrate`, puis `npm run db:migrate:status` (tout en `up`, jusqu'à `20261030000011`).
   - La base doit pouvoir créer `unaccent` et `pg_trgm` (Supabase : oui). Sinon `UNACCENT_MODE=fallback`.
5. Déployer le code **après** les migrations (le code ancien tolère les nouvelles colonnes ; l'inverse non).

## 2. Variables d'environnement (Vercel)
| Variable | Obligatoire | Valeur / rôle |
|---|---|---|
| `DB_URL` | oui | URI Postgres (pooler pour l'API ; connexion directe/session pour les migrations) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | oui | secrets distincts, longs |
| `FRONTEND_URL` | oui | URL de l'admin ; `CORS_ORIGINS` : autres origines, séparées par des virgules |
| `BLOB_READ_WRITE_TOKEN` | oui | stockage Vercel Blob (`BLOB_EXTRA_HOSTS` si domaine personnalisé) |
| `APP_MIN_VERSION`, `APP_LATEST_VERSION`, `APP_UPDATE_URL`, `APP_UPDATE_MESSAGE` | conseillé | mise à jour forcée de l'app (426 sous la version minimale) |
| `DOWNLOAD_MODE` | non | `redirect` (défaut) ou `proxy` (retour arrière) |
| `RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_MAX`, `DOWNLOAD_RATE_LIMIT_MAX`, `DEMANDE_RATE_LIMIT_MAX` | non | 1000 / 10 / 30 / 5 par défaut |
| `MAX_SESSIONS_PER_USER` | non | 10 |
| `IP_RETENTION_DAYS`, `STATS_RETENTION_DAYS` | non | 30 / 180 — planifier `npm run db:purge-ip` chaque jour |
| `NAV_CACHE_MAX_AGE`, `NAV_CACHE_S_MAXAGE`, `NAV_CACHE_SWR` | non | 60 / 300 / 600 s |
| `DOCS_ENABLED` | non | `false` pour masquer `/api/v1/docs` en production |
| `DEPRECATION_SUNSET` | non | date de retrait des anciennes routes (en-tête `Sunset`) |
| `DB_SSL` | non | `false` uniquement pour une base locale |

## 3. Tests de pré-production (cocher tout avant la production)
**Base et démarrage**
- [ ] `GET /health` répond `ok` ; aucun avertissement « f_unaccent manquant » ni « migrations en attente » dans les journaux.
- [ ] `npm run db:migrate:status` : tout en `up`.

**Sécurité**
- [ ] CORS : origine admin acceptée, origine inconnue refusée.
- [ ] 11e connexion en 15 min pour le même matricule + IP : 429.
- [ ] Dépôt d'un sujet avec une URL hors `*.public.blob.vercel-storage.com` : 400.

**Authentification et sessions**
- [ ] Connexion sur 2 appareils : les deux restent connectés ; `GET /auth/sessions` en liste 2.
- [ ] `POST /auth/refresh` renvoie un nouveau `refreshToken` ; l'ancien est refusé.
- [ ] `DELETE /auth/sessions/:id` coupe l'autre appareil immédiatement.
- [ ] Les utilisateurs connectés avant la migration ne sont pas déconnectés (refresh avec un ancien token OK).

**Recherche et téléchargement**
- [ ] Recherche « systeme » trouve « Système » ; sujets avant cours ; pagination (`page`, `limit`).
- [ ] Recherche sans résultat : une ligne apparaît dans `GET /stats` (admin).
- [ ] Téléchargement d'un sujet : 302 vers Blob, le fichier s'ouvre ; compteur +1 ; 31e téléchargement anonyme en 1 h : 429.
- [ ] Anciennes routes de téléchargement : fonctionnent, en-tête `Deprecation: true`.

**Dépôt**
- [ ] `POST /upload/verifier-doublon` : fichier inconnu → `existe:false` ; fichier déjà publié → `existe:true`.
- [ ] Dépôt d'un sujet avec `sha256` déjà présent : 409.
- [ ] Nom de fichier sans `%20` en base.

**Demandes et statistiques**
- [ ] `POST /demandes` (sans compte) puis lecture par l'admin ; 6e envoi en 1 h : 429 ; champ `site_web` rempli : rien enregistré.
- [ ] `GET /stats` (admin) renvoie total, courbe, top documents.

**Navigation et documentation**
- [ ] `GET /ecoles` : `Cache-Control: public` + `ETag` ; second appel avec `If-None-Match` : 304.
- [ ] `/api/v1/docs` et `/api/v1/openapi.json` accessibles (ou désactivés si `DOCS_ENABLED=false`).
- [ ] Ancien préfixe `/api/...` : fonctionne, `Deprecation: true`.

**App Android** : connexion, renouvellement, recherche paginée, téléchargement (redirection suivie), formulaire « sujet manquant ».

## 4. Retour arrière
- Code : redéployer la version précédente sur Vercel (les migrations sont rétro-compatibles, sauf `…09` et `…11`).
- `DOWNLOAD_MODE=proxy` rétablit l'ancien relais des fichiers sans redéployer le code.
- Base : `npm run db:migrate:undo` (une migration à la fois) ou restauration de la sauvegarde (`docs/runbook-sauvegarde.md`). Les retours arrière de `…09` (sessions) déconnectent tout le monde ; celui de `…11` ne restaure pas les lignes dédoublonnées.
