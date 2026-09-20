import type { Atlas, AtlasRegion } from "./types";

/** Parse a Spine .atlas file (the subset gen_spine_character.py emits). */
export function parseAtlas(text: string): Atlas {
  const lines = text.split("\n");
  const regions = new Map<string, AtlasRegion>();
  let i = 0;
  const image = lines[i++] ?? "";
  let width = 0;
  let height = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.startsWith("size:")) {
      const [w, h] = line.slice(5).split(",").map(Number);
      width = w;
      height = h;
      i++;
      continue;
    }
    if (line.startsWith(" ") || line.trim() === "") {
      i++;
      continue;
    }
    // Region name line — followed by indented props.
    const name = line;
    i++;
    let x = 0;
    let y = 0;
    let w = 0;
    let h = 0;
    while (i < lines.length && lines[i]!.startsWith("  ")) {
      const prop = lines[i]!.trim();
      if (prop.startsWith("xy:")) [x, y] = prop.slice(3).split(",").map(Number);
      if (prop.startsWith("size:")) [w, h] = prop.slice(5).split(",").map(Number);
      i++;
    }
    regions.set(name, { x, y, w, h });
  }
  return { image, width, height, regions };
}

/** Emit .atlas text in the same format the generator writes. */
export function emitAtlas(image: string, width: number, height: number, regions: Map<string, AtlasRegion>): string {
  const lines = [
    image,
    `size: ${width},${height}`,
    "format: RGBA8888",
    "filter: Nearest,Nearest",
    "repeat: none",
  ];
  for (const name of [...regions.keys()].sort()) {
    const r = regions.get(name)!;
    lines.push(
      name,
      "  rotate: false",
      `  xy: ${r.x}, ${r.y}`,
      `  size: ${r.w}, ${r.h}`,
      `  orig: ${r.w}, ${r.h}`,
      "  offset: 0, 0",
      "  index: -1",
    );
  }
  return lines.join("\n") + "\n";
}

/** Shelf-pack regions (matches the generator's pack()). */
export function packRegions(
  regions: Map<string, { w: number; h: number }>,
  atlasWidth: number,
  pad: number,
): { placements: Map<string, AtlasRegion>; height: number } {
  const names = [...regions.keys()].sort(
    (a, b) => -(regions.get(a)!.h * regions.get(a)!.w - regions.get(b)!.h * regions.get(b)!.w),
  );
  const placements = new Map<string, AtlasRegion>();
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const n of names) {
    const { w, h } = regions.get(n)!;
    if (x + w + pad > atlasWidth) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    placements.set(n, { x, y, w, h });
    x += w + pad;
    rowH = Math.max(rowH, h);
  }
  let height = 1;
  while (height < y + rowH + pad) height <<= 1;
  return { placements, height };
}
