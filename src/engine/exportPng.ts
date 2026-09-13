type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
}

async function waitForImages(node: HTMLElement): Promise<void> {
  const images = [...node.querySelectorAll("img")];
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

async function inlineCssUrls(cssText: string, baseHref: string): Promise<string> {
  const matches = [...cssText.matchAll(/url\((['"]?)([^"')]+)\1\)/g)];
  const unique = new Map<string, string>();
  for (const match of matches) {
    const raw = match[2].trim();
    if (!raw || raw.startsWith("data:")) continue;
    const original = match[0];
    if (unique.has(original)) continue;
    try {
      const abs = new URL(raw, baseHref).href;
      const res = await fetch(abs);
      if (!res.ok) continue;
      unique.set(original, `url("${await blobToDataUrl(await res.blob())}")`);
    } catch {
      // Keep the remote URL; the SVG rasterizer will ignore it.
    }
  }
  let out = cssText;
  for (const [from, to] of unique) {
    out = out.split(from).join(to);
  }
  return out;
}

async function fontEmbedCSS(): Promise<string> {
  const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((node) => (node instanceof HTMLLinkElement ? node.href : ""))
    .filter((href) => href.includes("fonts.googleapis.com"));
  const sheets: string[] = [];
  for (const href of hrefs) {
    try {
      const css = await fetch(href).then((res) => (res.ok ? res.text() : ""));
      if (css) sheets.push(await inlineCssUrls(css, href));
    } catch {
      // Keep exporting with fallback fonts if Google CSS is blocked.
    }
  }
  return sheets.join("\n");
}

function collectDocumentCSS(): string {
  const parts: string[] = [];
  for (const sheet of document.styleSheets) {
    try {
      parts.push([...sheet.cssRules].map((rule) => rule.cssText).join("\n"));
    } catch {
      // Cross-origin sheets (Google Fonts) are inlined separately.
    }
  }
  return parts.join("\n");
}

async function inlineImages(root: HTMLElement): Promise<void> {
  const images = [...root.querySelectorAll("img")];
  await Promise.all(
    images.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith("data:")) return;
      try {
        const res = await fetch(src);
        if (!res.ok) return;
        img.srcset = "";
        img.src = await blobToDataUrl(await res.blob());
      } catch {
        // Leave the original src; a missing logo is better than aborting export.
      }
    }),
  );
}

function replaceInlineSvgs(original: HTMLElement, clone: HTMLElement): void {
  const source = [...original.querySelectorAll("svg")];
  const dest = [...clone.querySelectorAll("svg")];
  source.forEach((svg, index) => {
    const target = dest[index];
    if (!target) return;
    const copy = svg.cloneNode(true) as SVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.style.color = getComputedStyle(svg).color;
    const xml = new XMLSerializer().serializeToString(copy);
    const img = document.createElement("img");
    img.alt = "";
    img.className = target.getAttribute("class") ?? "";
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    target.replaceWith(img);
  });
}

function copyCustomProperties(from: HTMLElement, to: HTMLElement): void {
  const source = getComputedStyle(from);
  for (let i = 0; i < source.length; i += 1) {
    const prop = source.item(i);
    if (prop.startsWith("--")) {
      to.style.setProperty(prop, source.getPropertyValue(prop));
    }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not rasterize the poster."));
    image.src = url;
  });
}

async function rasterizePoster(node: HTMLElement, pixelRatio: number): Promise<HTMLCanvasElement> {
  const width = node.offsetWidth;
  const height = node.offsetHeight;

  const clone = node.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.classList.remove("is-live");
  clone.classList.add("is-exporting");
  clone.querySelectorAll(".edit-handle").forEach((el) => el.remove());
  clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.maxWidth = `${width}px`;
  clone.style.maxHeight = `${height}px`;
  clone.style.transform = "none";
  clone.style.margin = "0";
  clone.style.left = "0";
  clone.style.top = "0";
  copyCustomProperties(node, clone);
  replaceInlineSvgs(node, clone);
  await inlineImages(clone);

  const style = document.createElement("style");
  style.textContent = `${await fontEmbedCSS()}\n${collectDocumentCSS()}`;
  clone.insertBefore(style, clone.firstChild);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
  foreignObject.setAttribute("width", "100%");
  foreignObject.setAttribute("height", "100%");
  foreignObject.setAttribute("x", "0");
  foreignObject.setAttribute("y", "0");
  foreignObject.appendChild(clone);
  svg.appendChild(foreignObject);

  const xml = new XMLSerializer().serializeToString(svg);
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
  if (image.decode) {
    try {
      await image.decode();
    } catch {
      // drawImage still works if decode() is unsupported.
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * pixelRatio));
  canvas.height = Math.max(1, Math.round(height * pixelRatio));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not build a PNG from the poster.");
  }
  ctx.fillStyle = getComputedStyle(node).backgroundColor || "#07080c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size < 32) {
        reject(new Error("Could not build a PNG from the poster."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function renderPosterBlob(node: HTMLElement, pixelRatio: number): Promise<Blob> {
  await document.fonts.ready;
  await waitForImages(node);

  const width = node.offsetWidth;
  const height = node.offsetHeight;
  if (width < 8 || height < 8) {
    throw new Error("Poster is not ready to export yet.");
  }

  const canvas = await rasterizePoster(node, pixelRatio);
  return canvasToBlob(canvas);
}

export async function exportPosterPng(
  node: HTMLElement,
  filename: string,
  pixelRatio = 2,
): Promise<"saved" | "cancelled"> {
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  let handle: Awaited<ReturnType<NonNullable<SavePickerWindow["showSaveFilePicker"]>>> | undefined;

  if (typeof picker === "function") {
    try {
      handle = await picker({
        suggestedName: filename.endsWith(".png") ? filename : `${filename}.png`,
        types: [{ description: "PNG image", accept: { "image/png": [".png"] } }],
      });
    } catch (err) {
      if (isAbort(err)) return "cancelled";
    }
  }

  const blob = await renderPosterBlob(node, pixelRatio);

  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return "saved";
  }

  downloadBlob(blob, filename);
  return "saved";
}

export function filenameFromTitle(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "rankings";
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug}-${stamp}.png`;
}
