import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sample", "logos");
mkdirSync(root, { recursive: true });

const teams = [
  { slug: "north-harbor", letters: "NH", primary: "#1B3A4B", secondary: "#E8D5A3", shape: "circle" },
  { slug: "redwood-state", letters: "RS", primary: "#6B2B1F", secondary: "#F0D9B5", shape: "split" },
  { slug: "iron-range", letters: "IR", primary: "#3D3D42", secondary: "#D4A017", shape: "hex" },
  { slug: "cape-key", letters: "CK", primary: "#0E4D5C", secondary: "#F4C542", shape: "diamond" },
  { slug: "summit", letters: "SU", primary: "#1F3D2B", secondary: "#C9D4C0", shape: "peak" },
  { slug: "blackstone", letters: "BL", primary: "#1A1A1A", secondary: "#C4A574", shape: "square" },
  { slug: "prairie", letters: "PR", primary: "#8B5A2B", secondary: "#F3E6C8", shape: "bar" },
  { slug: "twin-rivers", letters: "TR", primary: "#234E70", secondary: "#A7C7E7", shape: "waves" },
  { slug: "golden-gate", letters: "GG", primary: "#B8860B", secondary: "#1A1A1A", shape: "arch" },
  { slug: "midland", letters: "MI", primary: "#5C2E2E", secondary: "#E6D5C3", shape: "circle" },
  { slug: "copperhead", letters: "CO", primary: "#9C4221", secondary: "#F2E8DC", shape: "split" },
  { slug: "lakeshore", letters: "LS", primary: "#245B6B", secondary: "#D8E6EA", shape: "waves" },
];

function shapeMark(shape, primary, secondary) {
  switch (shape) {
    case "circle":
      return `<circle cx="64" cy="64" r="54" fill="${primary}" />
        <circle cx="64" cy="64" r="46" fill="none" stroke="${secondary}" stroke-width="2" />`;
    case "split":
      return `<rect width="128" height="128" rx="18" fill="${primary}" />
        <polygon points="128,0 128,128 0,128" fill="${secondary}" fill-opacity="0.18" />`;
    case "hex":
      return `<polygon points="64,8 116,38 116,90 64,120 12,90 12,38" fill="${primary}" />
        <polygon points="64,22 104,46 104,82 64,106 24,82 24,46" fill="none" stroke="${secondary}" stroke-width="2" />`;
    case "diamond":
      return `<rect x="22" y="22" width="84" height="84" rx="6" transform="rotate(45 64 64)" fill="${primary}" />`;
    case "peak":
      return `<rect width="128" height="128" rx="16" fill="${primary}" />
        <polygon points="64,22 104,92 24,92" fill="none" stroke="${secondary}" stroke-width="4" />`;
    case "square":
      return `<rect width="128" height="128" rx="10" fill="${primary}" />
        <rect x="14" y="14" width="100" height="100" rx="4" fill="none" stroke="${secondary}" stroke-width="3" />`;
    case "bar":
      return `<rect width="128" height="128" rx="12" fill="${primary}" />
        <rect x="18" y="88" width="92" height="10" fill="${secondary}" />`;
    case "waves":
      return `<rect width="128" height="128" rx="16" fill="${primary}" />
        <path d="M18 78 C40 62, 52 94, 74 78 S108 62, 110 78" fill="none" stroke="${secondary}" stroke-width="4" />`;
    case "arch":
      return `<rect width="128" height="128" rx="14" fill="${primary}" />
        <path d="M28 96 V70 A36 36 0 0 1 100 70 V96" fill="none" stroke="${secondary}" stroke-width="6" />`;
    default:
      return `<rect width="128" height="128" fill="${primary}" />`;
  }
}

for (const team of teams) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  ${shapeMark(team.shape, team.primary, team.secondary)}
  <text x="64" y="76" text-anchor="middle" font-family="IBM Plex Sans, Helvetica, sans-serif" font-size="28" font-weight="600" fill="${team.secondary}">${team.letters}</text>
</svg>
`;
  writeFileSync(join(root, `${team.slug}.svg`), svg);
}

console.log(`wrote ${teams.length} logos to ${root}`);
