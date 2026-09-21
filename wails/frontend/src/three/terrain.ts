import * as THREE from "three";
import { terrainNoise, WORLD_SCALE, WORLD_ZOOM, WorldHeightmap } from "./heightmap";
import type { TerrainBounds } from "./terrainEditing";

const CHUNK = 16;
const COLORS: Record<string, number> = {
  ".": 0x718956, ",": 0x9c9a62, T: 0x4e7050, H: 0xc4b797,
  R: 0xb49b73, "#": 0x888b86, "~": 0x376b76, S: 0xdbe5e4, D: 0xcdb77d, I: 0x9cbfc8,
};

export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(object => {
    // Sprite.geometry is a shared singleton — dispose its material only.
    if (object instanceof THREE.Sprite) {
      materials.add(object.material);
    } else if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
  root.removeFromParent();
}

/** Bounded chunk streaming: the million-tile world never becomes one giant mesh. */
export class TerrainWorld {
  readonly group = new THREE.Group();
  readonly ground: THREE.Mesh[] = [];
  private chunks = new Map<string, THREE.Group>();
  private center = "";
  /** Player in clip space (xy = NDC, z = view depth); z <= 0 disables the cutaway. */
  private playerScreen = { value: new THREE.Vector3() };
  private aspect = { value: 1 };
  /** Dither canopies covering the player's screen position; editors turn this off. */
  canopyCutaway = true;
  private waterMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: { value: 0 } },
    vertexShader: `varying vec3 world;
      #include <fog_pars_vertex>
      void main() { world = (modelMatrix * vec4(position, 1.)).xyz; vec4 mvPosition = viewMatrix * vec4(world, 1.); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; varying vec3 world;
      #include <fog_pars_fragment>
      void main() {
        float ripple = sin(world.x * ${(6 / WORLD_ZOOM).toFixed(4)} + world.z * ${(3 / WORLD_ZOOM).toFixed(4)} + time * 1.8) * sin(world.z * ${(5 / WORLD_ZOOM).toFixed(4)} - time);
        float crest = smoothstep(.65, 1., ripple);
        vec3 color = mix(vec3(.09,.32,.38), vec3(.38,.65,.65), crest * .55 + .12);
        gl_FragColor = vec4(color, .82);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });

  constructor(readonly field: WorldHeightmap) {}

  /** Rebuild only loaded chunks touching an edit (including both sides of seams). */
  invalidate(bounds: TerrainBounds) {
    for (const [id, chunk] of this.chunks) {
      const [c, r] = id.split(",").map(Number);
      if ((c + 1) * CHUNK < bounds.minC || c * CHUNK > bounds.maxC || (r + 1) * CHUNK < bounds.minR || r * CHUNK > bounds.maxR) continue;
      this.releaseChunk(chunk);
      const next = this.build(c * CHUNK, r * CHUNK);
      this.chunks.set(id, next);
      this.group.add(next);
    }
    this.refreshGround();
    this.group.updateMatrixWorld(true);
  }

  private releaseChunk(chunk: THREE.Group) {
    // Water material belongs to this TerrainWorld, not individual chunks.
    chunk.traverse(o => { if (o instanceof THREE.Mesh && o.material === this.waterMaterial) o.material = new THREE.MeshBasicMaterial(); });
    disposeObject(chunk);
  }
  private refreshGround() {
    this.ground.length = 0;
    for (const chunk of this.chunks.values()) this.ground.push(chunk.children[0] as THREE.Mesh);
  }

  update(x: number, y: number, time: number, camera?: THREE.PerspectiveCamera) {
    if (this.canopyCutaway && camera) {
      const focus = new THREE.Vector3(x * WORLD_SCALE, this.field.height(x, y) + .9, y * WORLD_SCALE);
      const depth = -focus.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const ndc = focus.project(camera);
      this.playerScreen.value.set(ndc.x, ndc.y, depth);
      this.aspect.value = camera.aspect;
    } else this.playerScreen.value.set(0, 0, 0);
    this.waterMaterial.uniforms.time.value = time;
    const { tile, cols, rows } = this.field.map;
    const cx = Math.floor(x / tile / CHUNK), cy = Math.floor(y / tile / CHUNK);
    const key = `${cx},${cy}`;
    if (key === this.center) return;
    this.center = key;
    const keep = new Set<string>();
    for (let r = cy - 2; r <= cy + 2; r++) for (let c = cx - 2; c <= cx + 2; c++) {
      if (c < 0 || r < 0 || c * CHUNK >= cols || r * CHUNK >= rows) continue;
      const id = `${c},${r}`;
      keep.add(id);
      if (!this.chunks.has(id)) {
        const chunk = this.build(c * CHUNK, r * CHUNK);
        this.chunks.set(id, chunk);
        this.group.add(chunk);
      }
    }
    for (const [id, chunk] of this.chunks) if (!keep.has(id)) {
      this.releaseChunk(chunk);
      this.chunks.delete(id);
    }
    this.refreshGround();
  }

  private build(c0: number, r0: number) {
    const group = new THREE.Group();
    const positions: number[] = [], colors: number[] = [], water: number[] = [];
    const trees: { x: number; y: number; z: number; size: number }[] = [];
    const rocks: { x: number; y: number; z: number; size: number }[] = [];
    const grass: { x: number; y: number; z: number; size: number }[] = [];
    const { cols, rows, tile } = this.field.map;
    const t = tile * WORLD_SCALE;
    for (let r = r0; r < Math.min(rows, r0 + CHUNK); r++) for (let c = c0; c < Math.min(cols, c0 + CHUNK); c++) {
      const cell = this.field.cell(c, r), n = terrainNoise(c * 17, r * 29);
      const color = new THREE.Color(COLORS[cell] ?? COLORS["."]).multiplyScalar(.91 + n * .16);
      const corners = [[c, r], [c, r + 1], [c + 1, r], [c + 1, r + 1]];
      for (const i of [0, 1, 2, 2, 1, 3]) {
        const [vc, vr] = corners[i];
        positions.push(vc * t, this.field.vertex(vc, vr), vr * t);
        colors.push(color.r, color.g, color.b);
        if (cell === "~") water.push(vc * t, -.015 * WORLD_ZOOM, vr * t);
      }
      const x = (c + .5) * t, z = (r + .5) * t;
      const y = this.field.height((c + .5) * tile, (r + .5) * tile);
      // Small clusters, with open paths under canopies on walkable forest.
      if (cell === "T" && n > .28) trees.push({ x, y, z, size: (.75 + n * .6) * WORLD_ZOOM });
      if (cell === "#" && n > .66) rocks.push({ x, y, z, size: (.3 + n * .45) * WORLD_ZOOM });
      if ((cell === "." || cell === ",") && n > .52) grass.push({ x, y, z, size: (.15 + n * .2) * WORLD_ZOOM });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    mesh.receiveShadow = true;
    group.add(mesh);
    if (water.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(water, 3));
      group.add(new THREE.Mesh(geo, this.waterMaterial));
    }
    const instances = (items: typeof trees, geometry: THREE.BufferGeometry, color: number, lift: number, sy = 1, canopy = false) => {
      if (!items.length) { geometry.dispose(); return; }
      const material = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
      if (canopy) {
        material.onBeforeCompile = shader => {
          shader.uniforms.playerScreen = this.playerScreen;
          shader.uniforms.aspect = this.aspect;
          shader.vertexShader = "varying vec3 canopyScreen;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
            vec4 canopyW = modelMatrix * instanceMatrix * vec4(position, 1.);
            vec4 canopyClip = projectionMatrix * viewMatrix * canopyW;
            canopyScreen = vec3(canopyClip.xy / canopyClip.w, -(viewMatrix * canopyW).z);`);
          shader.fragmentShader = "uniform vec3 playerScreen; uniform float aspect; varying vec3 canopyScreen;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
            vec2 canopyD = (canopyScreen.xy - playerScreen.xy) * vec2(aspect, 1.);
            if (length(canopyD) < .13 && canopyScreen.z < playerScreen.z) {
              if (mod(gl_FragCoord.x + gl_FragCoord.y * 2., 4.) > .5) discard;
            }`);
        };
        material.customProgramCacheKey = () => "player-canopy-cutaway";
      }
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);
      const transform = new THREE.Object3D();
      items.forEach((item, i) => {
        transform.position.set(item.x, item.y + lift * item.size, item.z);
        transform.scale.set(item.size, item.size * sy, item.size);
        transform.rotation.y = terrainNoise(item.x * 17, item.z * 13) * 6;
        transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere(); group.add(mesh);
    };
    instances(trees, new THREE.CylinderGeometry(.09, .14, 1.3, 5), 0x6c5540, .65);
    instances(trees, new THREE.ConeGeometry(.8, 1.6, 7), 0x325c46, 1.6, 1, true);
    instances(trees, new THREE.ConeGeometry(.6, 1.4, 7), 0x4d7953, 2.3, 1, true);
    instances(rocks, new THREE.DodecahedronGeometry(1, 0), 0x93958d, .25, .7);
    instances(grass, new THREE.ConeGeometry(.35, 1, 3), 0x829456, .45);
    return group;
  }

  dispose() { disposeObject(this.group); this.waterMaterial.dispose(); this.chunks.clear(); this.ground.length = 0; }
}
