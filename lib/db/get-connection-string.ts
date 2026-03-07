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

export function getMigrationPostgresSource() {
  if (process.env.POSTGRES_URL_NON_POOLING) {
    return "POSTGRES_URL_NON_POOLING";
  }

  if (process.env.POSTGRES_URL) {
    return "POSTGRES_URL";
  }

  if (process.env.APP_POSTGRES_URL) {
    return "APP_POSTGRES_URL";
  }

  return null;
}
