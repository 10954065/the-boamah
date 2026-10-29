# Nightly database backup job (Railway cron service, root directory ops/db-backup).
# pg_dump must be at least the server's major version: the database runs PostgreSQL 18.
FROM postgres:18-alpine
RUN apk add --no-cache aws-cli
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
CMD ["/usr/local/bin/backup.sh"]
