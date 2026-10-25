-- Runs once when the local Docker volume is first created.
-- A separate database keeps integration tests away from development data.
CREATE DATABASE boamah_test OWNER boamah;
