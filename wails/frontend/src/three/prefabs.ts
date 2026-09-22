import * as THREE from "three";
import { normalizeComponents, type SceneComponents } from './scene3d';

// Prefab registry shared by the game renderer and the Scene editor. Every
// authored SceneObject references one of these by id; `create` builds a
// fresh Object3D with the object's props applied. Meshes are low-poly
// flat-shaded to match the procedural world.

export type PrefabPropType = "color" | "number" | "boolean";

export interface PrefabProp {
  key: string;
  label: string;
  type: PrefabPropType;
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
}

export interface PrefabDef {
  id: string;
  label: string;
  category: "Buildings" | "Nature" | "Landmarks" | "Primitives" | "Lights" | "Utility" | "Gameplay";
  components?: SceneComponents;
  props: PrefabProp[];
  create(props: Record<string, unknown>): THREE.Object3D;
}

const colorOf = (v: unknown, fallback: number) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? parseInt(v.slice(1), 16) : fallback;
const numOf = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .9, flatShading: true, ...extra }));
  mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}

/** Volumetric house/tower used both for authored stamps and Scene prefabs. */
export function createBuilding(tower: boolean, wall = 0xd1bf98, roofColor = 0x686e72): THREE.Group {
  const building = new THREE.Group();
  const height = tower ? 3.2 : 1.5, width = tower ? 1.5 : 2.4;
  part(building, new THREE.BoxGeometry(width + .3, .35, 2.2), 0x929185, 0, .1);
  part(building, new THREE.BoxGeometry(width, height, 2), wall, 0, height / 2 + .2);
  const roof = part(building, new THREE.ConeGeometry(1, 1.4, 4), roofColor, 0, height + .85);
  roof.scale.set(width * .85, 1, 1.6); roof.rotation.y = Math.PI / 4;
  part(building, new THREE.BoxGeometry(.52, 1, .09), 0x66503d, 0, .68, 1.05);
  for (const side of [-1, 1]) {
    part(building, new THREE.BoxGeometry(.12, height, .12), 0x705d45, side * (width / 2 - .05), height / 2 + .2, 1.04);
    part(building, new THREE.BoxGeometry(.36, .42, .08), 0xf2cf82, side * width * .32, 1.12, 1.06, { emissive: new THREE.Color(0xad6d2c), emissiveIntensity: .4 });
  }
  return building;
}

const COLOR = (key: string, label: string, def: string): PrefabProp => ({ key, label, type: "color", default: def });
const NUMBER = (key: string, label: string, def: number, min: number, max: number, step = .1): PrefabProp => ({ key, label, type: "number", default: def, min, max, step });

const primitive = (id: string, label: string, geometry: () => THREE.BufferGeometry, def: string, lift: number): PrefabDef => ({
  id, label, category: "Primitives", props: [COLOR("color", "Color", def)],
  create: p => { const g = new THREE.Group(); part(g, geometry(), colorOf(p.color, parseInt(def.slice(1), 16)), 0, lift); return g; },
});

export const PREFABS: PrefabDef[] = [
  { id:'npc', label:'NPC', category:'Gameplay', props:[COLOR('color','Clothing','#9d6653')], components:normalizeComponents({npc:{},collider:{shape:'capsule',size:[.7,1.8,.7],offset:[0,.9,0]}}),
    create:p=>{const g=new THREE.Group();part(g,new THREE.CapsuleGeometry(.24,.65,4,8),colorOf(p.color,0x9d6653),0,.8);part(g,new THREE.SphereGeometry(.23,8,6),0xe4bf91,0,1.5);for(const x of [-.16,.16])part(g,new THREE.BoxGeometry(.18,.5,.22),0x3e4249,x,.25);return g;} },
  { id:'poi', label:'Point of Interest', category:'Gameplay', props:[COLOR('color','Beacon','#78dbec')], components:normalizeComponents({poi:{},collider:{isTrigger:true,size:[2,2,2],offset:[0,1,0]}}),
    create:p=>{const g=new THREE.Group(),c=colorOf(p.color,0x78dbec);part(g,new THREE.CylinderGeometry(.65,.8,.2,8),0x777f88,0,.1);part(g,new THREE.OctahedronGeometry(.35),c,0,1.2,0,{emissive:new THREE.Color(c),emissiveIntensity:.7});return g;} },
  { id:'item', label:'Item Pickup', category:'Gameplay', props:[COLOR('color','Color','#ecc15e')], components:normalizeComponents({item:{},collider:{shape:'sphere',isTrigger:true,size:[1,1,1],offset:[0,.5,0]}}),
    create:p=>{const g=new THREE.Group();part(g,new THREE.DodecahedronGeometry(.3),colorOf(p.color,0xecc15e),0,.45,0,{metalness:.4,roughness:.35});return g;} },
  { id:'door', label:'Door', category:'Gameplay', props:[COLOR('color','Frame','#4a6038'),COLOR('glow','Glow','#6a9ad4')],
    create:p=>{const g=new THREE.Group(),frame=colorOf(p.color,0x4a6038),glow=colorOf(p.glow,0x6a9ad4);
      const post=new THREE.CylinderGeometry(.09,.11,2.8,6);
      for(const s of [-1,1])part(g,post,frame,s*1.1,1.4);
      part(g,new THREE.BoxGeometry(2.8,.2,.24),frame,0,2.84);
      const pane=part(g,new THREE.PlaneGeometry(2.2,2.5),glow,0,1.3,0,{transparent:true,opacity:.3,side:THREE.DoubleSide,emissive:new THREE.Color(glow),emissiveIntensity:.4});pane.castShadow=pane.receiveShadow=false;
      return g;} },
  { id:'storage', label:'Storage Chest', category:'Gameplay', props:[COLOR('color','Body','#8a6030'),COLOR('trim','Trim','#f0d090')],
    create:p=>{const g=new THREE.Group(),body=colorOf(p.color,0x8a6030),trim=colorOf(p.trim,0xf0d090);
      part(g,new THREE.BoxGeometry(1.6,1.1,1.2),body,0,.55);
      part(g,new THREE.BoxGeometry(1.72,.28,1.32),trim,0,1.16);
      const ring=part(g,new THREE.RingGeometry(.9,1.2,24),0xd4a05a,0,.02,0,{transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false});ring.rotation.x=-Math.PI/2;ring.castShadow=ring.receiveShadow=false;
      return g;} },
  { id:'furniture', label:'Furniture', category:'Gameplay', props:[COLOR('color','Body','#7a5a3a'),COLOR('trim','Trim','#d4b890')],
    create:p=>{const g=new THREE.Group(),body=colorOf(p.color,0x7a5a3a),trim=colorOf(p.trim,0xd4b890);
      part(g,new THREE.BoxGeometry(1.44,1.16,1.2),body,0,.58);
      part(g,new THREE.BoxGeometry(1.56,.16,1.32),trim,0,1.2);
      return g;} },
  { id: "empty", label: "Empty", category: "Utility", props: [], create: () => new THREE.Group() },
  {
    id: "house", label: "House", category: "Buildings",
    props: [COLOR("wall", "Wall", "#d1bf98"), COLOR("roof", "Roof", "#686e72")],
    create: p => createBuilding(false, colorOf(p.wall, 0xd1bf98), colorOf(p.roof, 0x686e72)),
  },
  {
    id: "tower", label: "Tower", category: "Buildings",
    props: [COLOR("wall", "Wall", "#d1bf98"), COLOR("roof", "Roof", "#686e72")],
    create: p => createBuilding(true, colorOf(p.wall, 0xd1bf98), colorOf(p.roof, 0x686e72)),
  },
  {
    id: "tree", label: "Tree", category: "Nature",
    props: [COLOR("leaves", "Leaves", "#325c46"), NUMBER("size", "Size", 1, .3, 3)],
    create: p => {
      const g = new THREE.Group(), s = numOf(p.size, 1), leaves = colorOf(p.leaves, 0x325c46);
      part(g, new THREE.CylinderGeometry(.09, .14, 1.3, 5), 0x6c5540, 0, .65);
      part(g, new THREE.ConeGeometry(.8, 1.6, 7), leaves, 0, 1.6);
      part(g, new THREE.ConeGeometry(.6, 1.4, 7), new THREE.Color(leaves).offsetHSL(0, 0, .08).getHex(), 0, 2.3);
      g.scale.setScalar(s);
      return g;
    },
  },
  {
    id: "rock", label: "Rock", category: "Nature",
    props: [COLOR("color", "Color", "#93958d"), NUMBER("size", "Size", .6, .1, 4)],
    create: p => { const g = new THREE.Group(), s = numOf(p.size, .6); const m = part(g, new THREE.DodecahedronGeometry(1, 0), colorOf(p.color, 0x93958d), 0, .25 * s); m.scale.set(s, s * .7, s); return g; },
  },
  {
    id: "bush", label: "Bush", category: "Nature",
    props: [COLOR("color", "Color", "#4d7953")],
    create: p => { const g = new THREE.Group(); const m = part(g, new THREE.IcosahedronGeometry(.5, 1), colorOf(p.color, 0x4d7953), 0, .35); m.scale.y = .7; return g; },
  },
  {
    id: "crystal", label: "Save Crystal", category: "Landmarks",
    props: [COLOR("color", "Color", "#83e5e0"), NUMBER("glow", "Glow", 4, 0, 12, .5)],
    create: p => {
      const g = new THREE.Group(), color = colorOf(p.color, 0x83e5e0);
      part(g, new THREE.CylinderGeometry(.45, .62, .26, 8), 0x9c9c90, 0, .13);
      const spin = part(g, new THREE.OctahedronGeometry(.42), color, 0, 1.2, 0, { emissive: new THREE.Color(color).multiplyScalar(.35), emissiveIntensity: 1.1, roughness: .4, metalness: .15 });
      spin.scale.y = 1.7;
      const light = new THREE.PointLight(color, numOf(p.glow, 4), 4); light.position.y = 1.3; g.add(light);
      return g;
    },
  },
  {
    id: "lantern", label: "Lantern Post", category: "Landmarks",
    props: [COLOR("color", "Color", "#f2c476"), NUMBER("intensity", "Intensity", 3, 0, 12, .5)],
    create: p => {
      const g = new THREE.Group(), color = colorOf(p.color, 0xf2c476);
      part(g, new THREE.CylinderGeometry(.05, .07, 2.2, 6), 0x4a3b2e, 0, 1.1);
      part(g, new THREE.BoxGeometry(.3, .32, .3), color, 0, 2.3, 0, { emissive: new THREE.Color(color), emissiveIntensity: .8 });
      const light = new THREE.PointLight(color, numOf(p.intensity, 3), 6); light.position.y = 2.3; g.add(light);
      return g;
    },
  },
  {
    id: "fence", label: "Fence Segment", category: "Buildings",
    props: [COLOR("color", "Color", "#7a6247"), NUMBER("length", "Length", 2, .5, 8, .5)],
    create: p => {
      const g = new THREE.Group(), color = colorOf(p.color, 0x7a6247), len = numOf(p.length, 2);
      for (const x of [-len / 2, len / 2]) part(g, new THREE.BoxGeometry(.1, .9, .1), color, x, .45);
      for (const y of [.35, .7]) part(g, new THREE.BoxGeometry(len, .07, .05), color, 0, y);
      return g;
    },
  },
  primitive("cube", "Cube", () => new THREE.BoxGeometry(1, 1, 1), "#9aa4b0", .5),
  primitive("sphere", "Sphere", () => new THREE.SphereGeometry(.5, 12, 8), "#9aa4b0", .5),
  primitive("cylinder", "Cylinder", () => new THREE.CylinderGeometry(.5, .5, 1, 12), "#9aa4b0", .5),
  primitive("plane", "Plane", () => { const g = new THREE.BoxGeometry(2, .05, 2); return g; }, "#9aa4b0", .025),
  {
    id: "point_light", label: "Point Light", category: "Lights",
    props: [COLOR("color", "Color", "#ffe3b0"), NUMBER("intensity", "Intensity", 6, 0, 40, .5), NUMBER("distance", "Distance", 8, 0, 40, .5)],
    create: p => {
      const g = new THREE.Group(), color = colorOf(p.color, 0xffe3b0);
      g.add(new THREE.PointLight(color, numOf(p.intensity, 6), numOf(p.distance, 8)));
      // Small emissive marker so the light can be seen and picked in the editor.
      const marker = part(g, new THREE.SphereGeometry(.12, 8, 6), color, 0, 0, 0, { emissive: new THREE.Color(color), emissiveIntensity: 1 });
      marker.castShadow = marker.receiveShadow = false;
      return g;
    },
  },
];

export const PREFAB_BY_ID: ReadonlyMap<string, PrefabDef> = new Map(PREFABS.map(p => [p.id, p]));

export function prefabDefaults(def: PrefabDef): Record<string, unknown> {
  return Object.fromEntries(def.props.map(p => [p.key, p.default]));
}

/** Build the prefab (or an empty group for unknown ids) with props merged over defaults. */
export function instantiatePrefab(prefabId: string, props: Record<string, unknown>): THREE.Object3D {
  const def = PREFAB_BY_ID.get(prefabId) ?? PREFAB_BY_ID.get("empty")!;
  return def.create({ ...prefabDefaults(def), ...props });
}
