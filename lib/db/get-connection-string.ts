export function getPostgresUrl() {
  return process.env.POSTGRES_URL ?? process.env.APP_POSTGRES_URL;
}

export function getMigrationPostgresUrl() {
  return (
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL ??
    process.env.APP_POSTGRES_URL
  );
}
