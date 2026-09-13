export type ExtraFont = {
  id: string;
  family: string;
  stack: string;
  kind: "google" | "file";
  dataUrl?: string;
};

const STORAGE_KEY = "ranking-studio-fonts";

export function fontStack(family: string): string {
  return `"${family.replace(/"/g, "")}", sans-serif`;
}

export function googleFontHref(fonts: ExtraFont[]): string {
  const families = fonts
    .filter((font) => font.kind === "google")
    .map((font) => `family=${encodeURIComponent(font.family).replace(/%20/g, "+")}:wght@400;500;600;700;900`);
  if (families.length === 0) return "";
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

export function loadExtraFonts(): ExtraFont[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExtraFont[];
    return Array.isArray(parsed) ? parsed.filter((font) => font?.family && font?.stack) : [];
  } catch {
    return [];
  }
}

export function saveExtraFonts(fonts: ExtraFont[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fonts));
  } catch {
    // Quota or private mode — keep fonts for this session only.
  }
}

export function applyExtraFonts(fonts: ExtraFont[]): void {
  document.getElementById("ranking-google-fonts")?.remove();
  document.getElementById("ranking-file-fonts")?.remove();

  const href = googleFontHref(fonts);
  if (href) {
    const link = document.createElement("link");
    link.id = "ranking-google-fonts";
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  const files = fonts.filter((font) => font.kind === "file" && font.dataUrl);
  if (files.length === 0) return;
  const style = document.createElement("style");
  style.id = "ranking-file-fonts";
  style.textContent = files
    .map(
      (font) =>
        `@font-face { font-family: "${font.family.replace(/"/g, "")}"; src: url("${font.dataUrl}"); font-display: swap; }`,
    )
    .join("\n");
  document.head.appendChild(style);
}

export async function addGoogleFont(family: string, existing: ExtraFont[]): Promise<ExtraFont> {
  const name = family.replace(/["<>]/g, "").replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Type a Google Font name");
  const dup = existing.find((font) => font.family.toLowerCase() === name.toLowerCase());
  if (dup) return dup;
  return {
    id: `google-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    family: name,
    stack: fontStack(name),
    kind: "google",
  };
}

export async function addFileFont(file: File, existing: ExtraFont[]): Promise<ExtraFont> {
  if (!/\.(woff2?|ttf|otf)$/i.test(file.name)) {
    throw new Error("Use a .woff, .woff2, .ttf, or .otf file");
  }
  const family = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Custom";
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read font"));
    reader.readAsDataURL(file);
  });
  const base = family;
  let name = base;
  let n = 2;
  while (existing.some((font) => font.family.toLowerCase() === name.toLowerCase())) {
    name = `${base} ${n}`;
    n += 1;
  }
  return {
    id: `file-${Date.now()}`,
    family: name,
    stack: fontStack(name),
    kind: "file",
    dataUrl,
  };
}
