#!/usr/bin/env bash
# CE-07 — Test de restauration : recharge une sauvegarde dans une base JETABLE et compare les volumes.
#   RESTORE_TEST_URL=postgres://.../campus_restore SOURCE_DB_URL=postgres://... ./scripts/restore-test.sh fichier.dump
# RESTORE_TEST_URL doit désigner une base vide/jetable : elle est VIDÉE avant la restauration.
# Refus si elle est identique à SOURCE_DB_URL (jamais d'écrasement de la production).
set -euo pipefail

FILE="${1:?usage: restore-test.sh fichier.dump}"
TARGET="${RESTORE_TEST_URL:?RESTORE_TEST_URL manquant}"
SOURCE="${SOURCE_DB_URL:-}"
[ "$TARGET" != "$SOURCE" ] || { echo "Refus : la base de test est la base source" >&2; exit 2; }
[ -f "$FILE.sha256" ] && ( cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" )

START=$(date +%s)
psql "$TARGET" -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET" "$FILE"
echo "Restauration en $(( $(date +%s) - START )) s"

TABLES="utilisateurs ecoles filieres ues cours cours_documents sujets telechargements audit_logs"
STATUS=0
for t in $TABLES; do
  R=$(psql "$TARGET" -Atc "SELECT count(*) FROM $t")
  if [ -n "$SOURCE" ]; then
    S=$(psql "$SOURCE" -Atc "SELECT count(*) FROM $t")
    # La source peut avoir bougé depuis la sauvegarde : on signale l'écart sans échouer
    [ "$R" = "$S" ] && echo "  $t : $R lignes (identique)" || echo "  $t : restaurée $R / source $S (écart attendu si activité depuis la sauvegarde)"
  else
    echo "  $t : $R lignes"
  fi
done
[ "$(psql "$TARGET" -Atc 'SELECT count(*) FROM utilisateurs')" -gt 0 ] || { echo "Restauration vide !" >&2; STATUS=4; }
exit $STATUS
