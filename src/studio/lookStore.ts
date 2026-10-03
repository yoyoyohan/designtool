const KEY = "ranking-studio:template-looks";

function readAll(): Record<string, Record<string, string>> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const looks: Record<string, Record<string, string>> = {};
    for (const [id, tokens] of Object.entries(parsed as Record<string, unknown>)) {
      if (!tokens || typeof tokens !== "object") continue;
      const clean: Record<string, string> = {};
      for (const [token, value] of Object.entries(tokens as Record<string, unknown>)) {
        if (typeof value === "string") clean[token] = value;
      }
      looks[id] = clean;
    }
    return looks;
  } catch {
    return {};
  }
}

function writeAll(looks: Record<string, Record<string, string>>): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(looks));
    return true;
  } catch {
    return false;
  }
}

export function readTemplateLook(id: string): Record<string, string> | null {
  const saved = readAll()[id];
  return saved && Object.keys(saved).length ? saved : null;
}

export function writeTemplateLook(id: string, tokens: Record<string, string>): boolean {
  const looks = readAll();
  looks[id] = { ...tokens };
  return writeAll(looks);
}

export function clearTemplateLook(id: string): void {
  const looks = readAll();
  delete looks[id];
  writeAll(looks);
}
