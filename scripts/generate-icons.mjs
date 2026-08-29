/**
 * Rasterizes every app icon from `public/icon.svg`, the single source of truth.
 *
 *   npm run icons
 *
 * The outputs are committed, so neither CI nor the Cloudflare build ever runs this —
 * they just read the files. Run it after editing `icon.svg` and commit what changes.
 *
 * Two things here are less obvious than they look:
 *
 *   The apple-touch-icon is flattened onto an opaque background rather than kept
 *   transparent. iOS applies its own rounded mask and renders transparency as black,
 *   so the artwork's rounded corners would be rounded twice with black wedges left in
 *   between. Flattening onto the card's own background color fills those corners with
 *   the color already there, which makes the icon full-bleed square without touching
 *   the artwork.
 *
 *   sharp cannot write `.ico`, so this assembles the container itself. That format is
 *   simple: a 6-byte header, one 16-byte directory entry per image, then the payloads.
 *   Since Vista those payloads may be whole PNG files rather than raw DIBs, which is
 *   what makes it possible without a bitmap encoder.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const SOURCE = join(PUBLIC, "icon.svg");

/** Sizes packed into favicon.ico, smallest first — the order browsers expect. */
const ICO_SIZES = [16, 32, 48];

/**
 * What the apple icon's transparent corners are filled with. **Must match the fill of
 * the outermost shape in icon.svg** — that is what makes the flattened result read as
 * one square card rather than as a rounded card sitting on a differently colored
 * ground. Currently --color-bg, the outer rect's fill.
 */
const APPLE_BACKGROUND = "#0d0d16";

/**
 * Rasterize at a high density rather than scaling a small render up: librsvg
 * rasterizes at the density and then resizes, so a low one produces soft edges on the
 * beams at 512.
 */
function render(svg, size, { background = null } = {}) {
  let pipeline = sharp(svg, { density: 600 }).resize(size, size);
  if (background) pipeline = pipeline.flatten({ background });
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Pack PNG buffers into an ICO container.
 *
 * Header:    reserved(2) type(2, 1 = icon) count(2)
 * Directory: width(1) height(1) colors(1) reserved(1) planes(2) bpp(2) bytes(4) offset(4)
 *            — width and height are stored as 0 to mean 256.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach(({ size, data }, i) => {
    const at = i * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, at);
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1);
    directory.writeUInt8(0, at + 2); // palette size; 0 for truecolor
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // color planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

async function main() {
  let svg;
  try {
    svg = readFileSync(SOURCE);
  } catch (error) {
    console.error(`Could not read ${SOURCE}: ${error.message}`);
    process.exit(1);
  }

  const written = [];
  const write = (name, data) => {
    writeFileSync(join(PUBLIC, name), data);
    written.push([name, data.length]);
  };

  // Browser tabs and bookmarks, plus the bare /favicon.ico probe.
  const frames = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, data: await render(svg, size) })),
  );
  write("favicon.ico", buildIco(frames));

  // The small PNG fallback, for anything that reads <link> tags but not SVG favicons.
  write("icon.png", await render(svg, 64));

  // Android install prompt and splash screen.
  write("icon-192.png", await render(svg, 192));
  write("icon-512.png", await render(svg, 512));

  // iOS home screen. The only one that is flattened — see the note at the top.
  write("apple-icon.png", await render(svg, 180, { background: APPLE_BACKGROUND }));

  for (const [name, bytes] of written) {
    console.log(`  ${name.padEnd(16)} ${String(bytes).padStart(7)} bytes`);
  }
  console.log(`\nWrote ${written.length} icons from public/icon.svg.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
