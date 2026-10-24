// Art served from S3 through CloudFront at /art/, synced from the
// repository's art/ folder on each deploy, so new art needs no client build.
// The sprites in assets/ are bundled instead; they move here when real art
// replaces the placeholders. Local play loads art from the live site.

const ART_URL = process.env.EXPO_PUBLIC_ART_URL ?? "https://thelongboil.com/art";

/** The address of one file under art/, e.g. art("splash.jpg"). */
export function art(path: string): string {
  return `${ART_URL}/${path}`;
}
