/** Fold punctuation and possessives so "Gill St. Bernard's" and "Gill St Bernards" are the same name. */
export function normalizeSchoolName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/['\u2019]s\b/g, "s")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Higher is a closer school name. Exact wins. A short name like "Bernards" loses to
 * "Gill St. Bernards" when the paste has the extra words.
 */
export function nameMatchScore(query: string, name: string): number {
  const q = normalizeSchoolName(query);
  const n = normalizeSchoolName(name);
  if (!q || !n) return 0;
  if (q === n) return 1000 + n.length;
  if (n.startsWith(`${q} `)) return 400 + q.length;
  const qt = q.split(" ").filter((token) => token.length > 1);
  const nt = n.split(" ").filter((token) => token.length > 1);
  if (qt.length === 0 || nt.length === 0) return 0;
  const qset = new Set(qt);
  const nset = new Set(nt);
  const shared = qt.filter((token) => nset.has(token)).length;
  if (shared === 0) return 0;
  const nameInQuery = nt.every((token) => qset.has(token));
  const queryInName = qt.every((token) => nset.has(token));
  if (!nameInQuery && !queryInName) return 0;
  return shared * 20 - Math.abs(n.length - q.length);
}
