#!/usr/bin/env bash
# CE-07 — Sauvegarde logique de la base (pg_dump, format custom compressé).
#   BACKUP_DB_URL=postgres://... ./scripts/backup-db.sh [dossier]      (sinon DB_URL)
# Supabase : utiliser la connexion directe (port 5432) ou le « session pooler », PAS le
# « transaction pooler » (port 6543) qui ne convient pas à pg_dump.
# Sortie : <dossier>/campus-edu_AAAAMMJJ-HHMMSS.dump  (+ .sha256). Le fichier est relu avant de réussir.
set -euo pipefail

URL="${BACKUP_DB_URL:-${DB_URL:-}}"
DIR="${1:-./backups}"
[ -n "$URL" ] || { echo "BACKUP_DB_URL (ou DB_URL) manquant" >&2; exit 2; }

mkdir -p "$DIR"
FILE="$DIR/campus-edu_$(date -u +%Y%m%d-%H%M%S).dump"

# --no-owner/--no-privileges : restaurable sur n'importe quel rôle ; schémas Supabase internes exclus
pg_dump "$URL" --format=custom --compress=6 --no-owner --no-privileges \
  --exclude-schema='auth' --exclude-schema='storage' --exclude-schema='realtime' \
  --exclude-schema='graphql*' --exclude-schema='vault' --exclude-schema='pgsodium*' \
  --exclude-schema='supabase_*' --exclude-schema='_realtime' --exclude-schema='extensions' \
  --file="$FILE"

# Vérification : l'archive doit être lisible et contenir nos tables
pg_restore --list "$FILE" | grep -q 'TABLE public utilisateurs' \
  || { echo "Sauvegarde invalide : table utilisateurs absente" >&2; rm -f "$FILE"; exit 3; }

( cd "$DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256" )
echo "OK $FILE ($(du -h "$FILE" | cut -f1))"
