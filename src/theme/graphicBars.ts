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

/** Published State/Movers bar colours. Seed the shared desk with these first. */
export const GRAPHIC_BAR_SCHOOLS: { name: string; primary: string; secondary: string }[] = [
  { name: "Lawrenceville", primary: "#c21d41", secondary: "#ffffff" },
  { name: "Summit", primary: "#fdc953", secondary: "#6b1c34" },
  { name: "Chatham", primary: "#122e59", secondary: "#ffffff" },
  { name: "Seton Hall Prep", primary: "#005ba5", secondary: "#ffffff" },
  { name: "Delbarton", primary: "#218954", secondary: "#ffffff" },
  { name: "Don Bosco Prep", primary: "#6b1c34", secondary: "#ffffff" },
  { name: "St. Augustine", primary: "#042d5d", secondary: "#ffffff" },
  { name: "Shawnee", primary: "#031a4b", secondary: "#ffffff" },
  { name: "Rumson-Fair Haven", primary: "#8d83a6", secondary: "#1a2748" },
  { name: "Westfield", primary: "#ffffff", secondary: "#122e59" },
  { name: "Scotch Plains-Fanwood", primary: "#1e3391", secondary: "#ffffff" },
  { name: "Christian Brothers", primary: "#89bce5", secondary: "#1a2748" },
  { name: "Bridgewater-Raritan", primary: "#1a1a1a", secondary: "#ffffff" },
  { name: "Ridgewood", primary: "#ffffff", secondary: "#7c0202" },
  { name: "Gill St. Bernard's", primary: "#1a1a16", secondary: "#ffffff" },
  { name: "Kent Place", primary: "#218954", secondary: "#ffffff" },
  { name: "Oak Knoll", primary: "#0b1e3a", secondary: "#ffffff" },
  { name: "Morristown", primary: "#7a3040", secondary: "#f3ead2" },
  { name: "Mendham", primary: "#c41d32", secondary: "#ffffff" },
  { name: "Moorestown", primary: "#111111", secondary: "#f5c518" },
  { name: "Trinity Hall", primary: "#f4832a", secondary: "#1a2748" },
  { name: "Haddonfield", primary: "#c50c21", secondary: "#ffffff" },
  { name: "Pingry", primary: "#0072c8", secondary: "#ffffff" },
  { name: "Montclair Kimberley", primary: "#142451", secondary: "#ffffff" },
];

const GRAPHIC_BARS: Record<string, GraphicBar> = Object.fromEntries(
  GRAPHIC_BAR_SCHOOLS.map((row) => [norm(row.name), { primary: row.primary, secondary: row.secondary }]),
);

export function graphicBarFor(query: string, teamName?: string): GraphicBar | null {
  for (const value of [query, teamName ?? ""]) {
    const hit = GRAPHIC_BARS[norm(value)];
    if (hit) return hit;
  }
  return null;
}
