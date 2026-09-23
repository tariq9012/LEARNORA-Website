/**
 * Every URL here points at an authorization-aware route (see the
 * src/routes/media.*.ts files) — none of them expose a filesystem path,
 * and none of them are safe to treat as "secret but guessable" security;
 * the routes themselves check canViewAsset() on every request.
 */

export function publicAssetUrl(assetId: string): string {
  return `/media/public/${assetId}`;
}

export function lessonVideoUrl(assetId: string): string {
  return `/media/lesson-video/${assetId}`;
}

export function lessonResourceUrl(assetId: string): string {
  return `/media/resource/${assetId}`;
}
