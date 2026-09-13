import Papa from "papaparse";
import type { TeamRecord } from "./types";

const IMAGE_EXT = /\.(svg|png|jpe?g|webp)$/i;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleFromFilename(file: string): string {
  return file
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function splitAliases(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[|,;/]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCsv(text: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: true,
  });
  return result.data.filter((row) => Object.values(row).some((value) => value?.trim()));
}

function pick(row: Record<string, string>, keys: string[]): string {
  const entries = Object.entries(row);
  for (const key of keys) {
    const hit = entries.find(([k]) => k.trim().toLowerCase() === key);
    if (hit?.[1]) return hit[1].trim();
  }
  return "";
}

export async function loadSampleRegistry(): Promise<TeamRecord[]> {
  const csvRes = await fetch("/sample/teams.csv");
  if (!csvRes.ok) throw new Error("Could not load sample teams.csv");
  const text = await csvRes.text();
  const rows = parseCsv(text);
  return rows.map((row, index) => {
    const name = pick(row, ["name", "team", "school"]);
    const logo = pick(row, ["logo", "file", "filename"]) || `${slugify(name)}.svg`;
    return {
      id: `sample-${index}-${slugify(name)}`,
      name,
      aliases: splitAliases(pick(row, ["aliases", "aka", "short"])),
      primary: pick(row, ["primary", "color", "colour"]) || "#444444",
      secondary: pick(row, ["secondary", "accent"]) || "#f3ead8",
      logoUrl: `/sample/logos/${logo}`,
      logoFile: logo,
      source: "sample" as const,
    };
  });
}

function findCsvFile(files: File[]): File | undefined {
  const preferred = files.find((file) =>
    /teams|colors|colours|aliases/i.test(file.name),
  );
  return preferred ?? files.find((file) => file.name.toLowerCase().endsWith(".csv"));
}

export async function loadUploadedRegistry(fileList: FileList | File[]): Promise<TeamRecord[]> {
  const files = Array.from(fileList);
  const images = files.filter((file) => IMAGE_EXT.test(file.name));
  const csvFile = findCsvFile(files);
  const imageMap = new Map(
    images.map((file) => [file.name.toLowerCase(), URL.createObjectURL(file)]),
  );
  const stemMap = new Map(
    images.map((file) => [
      file.name.replace(/\.[^.]+$/, "").toLowerCase(),
      { file: file.name, url: imageMap.get(file.name.toLowerCase()) ?? "" },
    ]),
  );

  if (csvFile) {
    const rows = parseCsv(await csvFile.text());
    return rows.map((row, index) => {
      const name = pick(row, ["name", "team", "school"]) || `Team ${index + 1}`;
      const logoName = pick(row, ["logo", "file", "filename"]);
      const byName = logoName ? imageMap.get(logoName.toLowerCase()) : undefined;
      const byStem = stemMap.get(slugify(name)) ?? stemMap.get(name.toLowerCase());
      const logoUrl = byName ?? byStem?.url ?? "";
      const logoFile = logoName || byStem?.file || "";
      return {
        id: `upload-${index}-${slugify(name)}`,
        name,
        aliases: splitAliases(pick(row, ["aliases", "aka", "short"])),
        primary: pick(row, ["primary", "color", "colour"]) || "#4a4a4a",
        secondary: pick(row, ["secondary", "accent"]) || "#f3ead8",
        logoUrl,
        logoFile,
        source: "upload" as const,
      };
    });
  }

  return images.map((file, index) => {
    const name = titleFromFilename(file.name);
    return {
      id: `upload-${index}-${slugify(name)}`,
      name,
      aliases: [file.name.replace(/\.[^.]+$/, "")],
      primary: "#4a4a4a",
      secondary: "#f3ead8",
      logoUrl: imageMap.get(file.name.toLowerCase()) ?? "",
      logoFile: file.name,
      source: "upload" as const,
    };
  });
}
