/**
 * Canonical public URL of the platform. Used for every link that leaves
 * the app (invite emails, alert emails) so recipients always land on the
 * branded domain regardless of which host served the request.
 * Override with APP_URL for other environments.
 */
export const APP_URL = (process.env.APP_URL ?? "https://www.comricworkspace.co.za").replace(
  /\/+$/,
  "",
);
