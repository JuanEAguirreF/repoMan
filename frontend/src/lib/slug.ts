export function buildPublicFilePath(slug: string): string {
  const clean = slug.trim();
  return `/files/${encodeURIComponent(clean)}`;
}

export function extractSlugParam(value: string): string | null {
  const clean = decodeURIComponent(value.trim());
  return clean ? clean : null;
}
