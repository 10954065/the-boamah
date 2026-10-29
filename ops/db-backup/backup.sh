#!/bin/sh
# Nightly PostgreSQL backup to an S3-compatible bucket (a Railway Storage Bucket).
# Runs once and exits, as a Railway cron service. See docs/DEPLOYMENT.md, "R7. Database backups".
#
# Required: DATABASE_URL, BUCKET, ENDPOINT, ACCESS_KEY_ID, SECRET_ACCESS_KEY
# Optional: REGION (default auto), KEEP_DAILY (default 14), KEEP_MONTHLY (default 12)
set -eu
set -o pipefail

: "${DATABASE_URL:?Set DATABASE_URL}" "${BUCKET:?Set BUCKET}" "${ENDPOINT:?Set ENDPOINT}"
: "${ACCESS_KEY_ID:?Set ACCESS_KEY_ID}" "${SECRET_ACCESS_KEY:?Set SECRET_ACCESS_KEY}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"

export AWS_ACCESS_KEY_ID="$ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$SECRET_ACCESS_KEY" AWS_DEFAULT_REGION="${REGION:-auto}"
s3() { aws --endpoint-url "$ENDPOINT" s3 "$@"; }

stamp=$(date -u +%Y-%m-%dT%H%MZ)
month=$(date -u +%Y-%m)
file="/tmp/boamah-$stamp.sql.gz"

# Plain SQL without owners or grants, so it restores into any PostgreSQL with psql.
pg_dump --no-owner --no-acl --dbname="$DATABASE_URL" | gzip -9 > "$file"

# Refuse to store a broken or empty backup.
gzip -t "$file"
size=$(wc -c < "$file")
if [ "$size" -lt 1024 ]; then echo "Backup is only $size bytes; not storing it." >&2; exit 1; fi
# grep -c reads to the end (grep -q would stop early and, with pipefail, fail the pipe).
tables=$(gunzip -c "$file" | grep -c '^CREATE TABLE public\.' || true)
if ! gunzip -c "$file" | grep -c '^CREATE TABLE public\."Order" ' > /dev/null; then echo "Backup has no Order table; not storing it." >&2; exit 1; fi

s3 cp "$file" "s3://$BUCKET/daily/boamah-$stamp.sql.gz" --only-show-errors
# One backup per month is kept longer: the first successful one of each month.
if ! s3 ls "s3://$BUCKET/monthly/boamah-$month.sql.gz" > /dev/null 2>&1; then
  s3 cp "$file" "s3://$BUCKET/monthly/boamah-$month.sql.gz" --only-show-errors
fi

# Keep the newest KEEP_DAILY daily and KEEP_MONTHLY monthly backups (names sort by date).
prune() {
  prefix=$1
  keep=$2
  keys=$(s3 ls "s3://$BUCKET/$prefix/" | awk '{print $4}' | grep '^boamah-' | sort || true)
  total=$(printf '%s\n' "$keys" | grep -c . || true)
  excess=$((total - keep))
  if [ "$excess" -gt 0 ]; then
    printf '%s\n' "$keys" | head -n "$excess" | while read -r key; do
      s3 rm "s3://$BUCKET/$prefix/$key" --only-show-errors
    done
  fi
}
prune daily "$KEEP_DAILY"
prune monthly "$KEEP_MONTHLY"

rm -f "$file"
echo "Backup stored: daily/boamah-$stamp.sql.gz ($size bytes gzip, $tables tables)."
