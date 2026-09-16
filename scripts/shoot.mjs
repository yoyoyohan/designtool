// Renders poster variants from the dev server so measurements can be diffed against the
// published references. Usage: node scripts/shoot.mjs [url]
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const URL = process.argv[2] ?? "http://localhost:5173/";
const OUT = "/tmp/shots";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  userDataDir: "./.chrome-profile",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--force-device-scale-factor=1",
    "--crash-dumps-dir=/tmp",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1400, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: "networkidle2" });
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 1500));

async function clickByText(text) {
  const done = await page.evaluate((needle) => {
    const hit = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim().toLowerCase() === needle.toLowerCase(),
    );
    if (!hit) return false;
    hit.click();
    return true;
  }, text);
  if (!done) throw new Error(`button not found: ${text}`);
  await new Promise((r) => setTimeout(r, 900));
}

async function shoot(name) {
  // Lift the artboard out of the zoomed, clipped stage so the capture is the full 1080x1350.
  // The viewport stays fixed: resizing it makes the studio refit and rescale the board.
  await page.addStyleTag({
    content: `
      #ranking-artboard { position: fixed !important; left: 0 !important; top: 0 !important; z-index: 9999 !important; }
      #ranking-artboard, #ranking-artboard * { animation: none !important; transition: none !important; }
      body *:has(> #ranking-artboard) { transform: none !important; overflow: visible !important; }
    `,
  });
  await new Promise((r) => setTimeout(r, 600));
  const clip = await page.evaluate(() => {
    const r = document.getElementById("ranking-artboard").getBoundingClientRect();
    return { x: r.x, y: r.y, width: Math.round(r.width), height: Math.round(r.height) };
  });
  await page.screenshot({ path: `${OUT}/${name}.png`, clip });
  console.log("shot", name, clip);
}

const steps = process.env.SHOTS?.split(",") ?? ["Boys Top 15"];
for (const step of steps) {
  await clickByText(step);
  await shoot(step.replace(/\W+/g, "_").toLowerCase());
}

await browser.close();
