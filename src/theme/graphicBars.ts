/** Bar fills sampled from the State Top 15 reference graphics. */

export type GraphicBar = {
  primary: string;
  secondary: string;
};

function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const GRAPHIC_BARS: Record<string, GraphicBar> = {
  lawrenceville: { primary: "#c21d41", secondary: "#ffffff" },
  summit: { primary: "#fdc953", secondary: "#6b1c34" },
  chatham: { primary: "#122e59", secondary: "#ffffff" },
  "seton hall prep": { primary: "#005ba5", secondary: "#ffffff" },
  delbarton: { primary: "#218954", secondary: "#ffffff" },
  "don bosco prep": { primary: "#6b1c34", secondary: "#ffffff" },
  "st augustine": { primary: "#042d5d", secondary: "#ffffff" },
  shawnee: { primary: "#031a4b", secondary: "#ffffff" },
  "rumson fair haven": { primary: "#8d83a6", secondary: "#1a2748" },
  westfield: { primary: "#ffffff", secondary: "#122e59" },
  "scotch plains fanwood": { primary: "#1e3391", secondary: "#ffffff" },
  "christian brothers": { primary: "#89bce5", secondary: "#1a2748" },
  "bridgewater raritan": { primary: "#1a1a1a", secondary: "#ffffff" },
  ridgewood: { primary: "#ffffff", secondary: "#7c0202" },
  "gill st bernard s": { primary: "#1a1a16", secondary: "#ffffff" },
  "kent place": { primary: "#218954", secondary: "#ffffff" },
  "oak knoll": { primary: "#0b1e3a", secondary: "#ffffff" },
  morristown: { primary: "#7a3040", secondary: "#f3ead2" },
  mendham: { primary: "#c41d32", secondary: "#ffffff" },
  moorestown: { primary: "#111111", secondary: "#f5c518" },
  "trinity hall": { primary: "#f4832a", secondary: "#1a2748" },
  haddonfield: { primary: "#c50c21", secondary: "#ffffff" },
  pingry: { primary: "#0072c8", secondary: "#ffffff" },
  "montclair kimberley": { primary: "#142451", secondary: "#ffffff" },
};

export function graphicBarFor(query: string, teamName?: string): GraphicBar | null {
  for (const value of [query, teamName ?? ""]) {
    const hit = GRAPHIC_BARS[norm(value)];
    if (hit) return hit;
  }
  return null;
}
