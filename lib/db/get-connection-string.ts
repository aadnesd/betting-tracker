export function getPostgresUrl() {
  if (process.env.VERCEL) {
    return process.env.APP_POSTGRES_URL ?? process.env.POSTGRES_URL;
  }

  return process.env.POSTGRES_URL ?? process.env.APP_POSTGRES_URL;
}

export function getMigrationPostgresUrl() {
  if (process.env.VERCEL) {
    return process.env.APP_POSTGRES_URL ?? process.env.POSTGRES_URL;
  }

  return (
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL ??
    process.env.APP_POSTGRES_URL
  );
}

export function getMigrationPostgresSource() {
  if (process.env.VERCEL) {
    if (process.env.APP_POSTGRES_URL) {
      return "APP_POSTGRES_URL";
    }

    if (process.env.POSTGRES_URL) {
      return "POSTGRES_URL";
    }

    return null;
  }

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
