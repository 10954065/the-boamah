# Nightly database backup job (Railway cron service, root directory ops/db-backup).
# pg_dump must be at least the server's major version: the database runs PostgreSQL 18.
FROM postgres:18-alpine
# rclone copies each backup to Google Drive when GDRIVE_TOKEN is set.
RUN apk add --no-cache aws-cli rclone
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
CMD ["/usr/local/bin/backup.sh"]
