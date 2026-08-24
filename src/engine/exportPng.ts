import { toPng } from "html-to-image";

export async function exportPosterPng(
  node: HTMLElement,
  filename: string,
  pixelRatio = 2,
): Promise<void> {
  await document.fonts.ready;
  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.position = "fixed";
  clone.style.left = "-12000px";
  clone.style.top = "0";
  clone.style.transform = "none";
  clone.style.margin = "0";
  document.body.appendChild(clone);
  try {
    const dataUrl = await toPng(clone, {
      cacheBust: true,
      pixelRatio,
      backgroundColor: getComputedStyle(node).backgroundColor || "#121212",
    });
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  } finally {
    clone.remove();
  }
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
