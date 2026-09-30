/** Google Fonts that Canva also ships. Canva-only faces (Canva Sans, Canva Serif) cannot be bundled. */

export type CanvaFont = {
  family: string;
  stack: string;
};

export const CANVA_FONTS: CanvaFont[] = [
  { family: "Anton", stack: '"Anton", Impact, sans-serif' },
  { family: "Archivo Black", stack: '"Archivo Black", Impact, sans-serif' },
  { family: "Barlow Condensed", stack: '"Barlow Condensed", "Arial Narrow", sans-serif' },
  { family: "Bebas Neue", stack: '"Bebas Neue", Impact, sans-serif' },
  { family: "Black Ops One", stack: '"Black Ops One", Impact, sans-serif' },
  { family: "DM Sans", stack: '"DM Sans", sans-serif' },
  { family: "Figtree", stack: '"Figtree", sans-serif' },
  { family: "Inter", stack: '"Inter", sans-serif' },
  { family: "Kanit", stack: '"Kanit", sans-serif' },
  { family: "League Spartan", stack: '"League Spartan", Impact, sans-serif' },
  { family: "Montserrat", stack: '"Montserrat", sans-serif' },
  { family: "Nunito Sans", stack: '"Nunito Sans", sans-serif' },
  { family: "Open Sans", stack: '"Open Sans", sans-serif' },
  { family: "Oswald", stack: '"Oswald", "Arial Narrow", sans-serif' },
  { family: "Outfit", stack: '"Outfit", sans-serif' },
  { family: "Poppins", stack: '"Poppins", sans-serif' },
  { family: "Roboto Condensed", stack: '"Roboto Condensed", "Arial Narrow", sans-serif' },
  { family: "Russo One", stack: '"Russo One", Impact, sans-serif' },
  { family: "Staatliches", stack: '"Staatliches", Impact, sans-serif' },
  { family: "Teko", stack: '"Teko", Impact, sans-serif' },
  { family: "Work Sans", stack: '"Work Sans", sans-serif' },
];

export const CANVA_FONT_STACKS = CANVA_FONTS.map((font) => font.stack);

export function canvaFontsHref(): string {
  const families = CANVA_FONTS.map((font) => {
    const name = encodeURIComponent(font.family).replace(/%20/g, "+");
    return `family=${name}:wght@400;600;700;800;900`;
  });
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}
