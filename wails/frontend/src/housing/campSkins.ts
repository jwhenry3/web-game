/** Mirrors internal/game.CampSkins — overworld tent palette + labels. */

export interface CampSkinDef {
  id: string;
  name: string;
  /** Glow under the tent */
  glow: number;
  /** Ground ellipse */
  base: number;
  /** Outer canvas triangle */
  outer: number;
  /** Inner flap */
  inner: number;
  /** Door rectangle */
  door: number;
  /** Outline */
  stroke: number;
  /** Soft interior house tint (floor accent) */
  interior: number;
}

export const CAMP_SKINS: CampSkinDef[] = [
  {
    id: "basic",
    name: "Canvas",
    glow: 0x7ecf6a,
    base: 0x2a4a28,
    outer: 0xd4b06a,
    inner: 0xb8894a,
    door: 0x5a4030,
    stroke: 0xf0e6c8,
    interior: 0x6a4a38,
  },
  {
    id: "crimson",
    name: "Crimson",
    glow: 0xe07070,
    base: 0x4a2020,
    outer: 0xc04040,
    inner: 0x8a2828,
    door: 0x3a2018,
    stroke: 0xf0c8c0,
    interior: 0x6a3030,
  },
  {
    id: "azure",
    name: "Azure",
    glow: 0x70b0e0,
    base: 0x203048,
    outer: 0x4a88c8,
    inner: 0x3060a0,
    door: 0x283848,
    stroke: 0xc8e0f0,
    interior: 0x385068,
  },
  {
    id: "verdant",
    name: "Verdant",
    glow: 0x70d080,
    base: 0x204028,
    outer: 0x48a058,
    inner: 0x2e7840,
    door: 0x2a3828,
    stroke: 0xd0f0c8,
    interior: 0x3a5840,
  },
  {
    id: "dusk",
    name: "Dusk",
    glow: 0xb080e0,
    base: 0x302040,
    outer: 0x7850a8,
    inner: 0x543878,
    door: 0x282030,
    stroke: 0xe0d0f0,
    interior: 0x483858,
  },
  {
    id: "snow",
    name: "Snow",
    glow: 0xc8e8f0,
    base: 0x384850,
    outer: 0xe8f0f4,
    inner: 0xb8c8d0,
    door: 0x505860,
    stroke: 0xffffff,
    interior: 0x586870,
  },
];

export function campSkinById(id: string | undefined | null): CampSkinDef {
  const key = (id || "basic").trim().toLowerCase();
  return CAMP_SKINS.find((s) => s.id === key) ?? CAMP_SKINS[0];
}
