const STATIC_ASSET_PREFIX = (process.env.NEXT_PUBLIC_STATIC_ASSET_PREFIX || "")
  .replace(/\/$/, "");

export function publicAssetPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${STATIC_ASSET_PREFIX}${normalized}`;
}
