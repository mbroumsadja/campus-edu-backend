# Sauvegarde et restauration de la base (CE-07)

Objectifs : **RPO 24 h** (au plus un jour de données perdu), **RTO 4 h** (service rétabli en moins de 4 h).

## Ce qui est en place
- Workflow GitHub `Sauvegarde base de données` (`.github/workflows/backup.yml`) : un `pg_dump` chaque jour à 02h17 UTC.
- Le fichier est vérifié (`pg_restore --list`), chiffré (AES-256, `BACKUP_PASSPHRASE`) puis conservé 30 jours comme artefact du workflow.
- Chaque dimanche (et à chaque lancement manuel) la sauvegarde est restaurée dans une base PostgreSQL jetable et les volumes de chaque table sont comparés à la production.

## Mise en route (une seule fois)
1. Supabase > Project Settings > Database > Connection string : copier l'URI **directe** (port 5432) ou **Session pooler**. Ne pas utiliser le Transaction pooler (6543).
2. GitHub > Settings > Secrets and variables > Actions : créer `SUPABASE_DB_URL` (cette URI) et `BACKUP_PASSPHRASE` (phrase longue, à conserver aussi dans un gestionnaire de mots de passe : sans elle les sauvegardes sont illisibles).
3. Onglet Actions > « Sauvegarde base de données » > Run workflow : vérifier que sauvegarde **et** restauration sont vertes.
4. Plan gratuit Supabase : pas de sauvegarde ni de restauration à un instant donné fournies. Ce workflow est donc la seule protection ; sur plan payant, activer aussi les sauvegardes quotidiennes de Supabase.

## Restaurer en cas d'incident
1. Actions > dernière exécution verte > télécharger l'artefact `sauvegarde-base-…`.
2. Déchiffrer : `gpg --output campus.dump --decrypt campus-edu_AAAAMMJJ-HHMMSS.dump.gpg`
3. Créer une base vide (nouveau projet Supabase ou base locale) et restaurer :
   `RESTORE_TEST_URL=<uri base vide> ./scripts/restore-test.sh campus.dump`
   (le script **vide** la base cible ; il refuse de tourner si elle est identique à `SOURCE_DB_URL`).
4. Si un message signale une extension absente (`unaccent`, `pg_trgm`) : `CREATE EXTENSION` dans la base cible, puis `npm run db:migrate` (recrée `f_unaccent` et les index).
5. Pointer `DB_URL` de Vercel vers la nouvelle base, redéployer, vérifier `GET /health` et un login.

## Limites connues
- Seuls les schémas applicatifs sont sauvegardés (`public`) ; les schémas internes Supabase (auth, storage…) sont exclus car non utilisés par l'API.
- Les fichiers (PDF) sont sur Vercel Blob, hors de cette sauvegarde : seules leurs URL sont en base.
