import * as THREE from "three";
import { useEffect, useRef } from "react";
import { buildRig, getRig, loadRigLibrary, rigLibraryVersion, type RigInstance } from "../three/rigBuilder";
import type { CharacterAppearance } from "./heroes99";

/**
 * 3D character preview — builds the same humanoid rig the Three.js world
 * uses, with the appearance palette applied, on a slow turntable. Appearance
 * edits rebuild the doll so creation options map exactly to the in-game look.
 */
export function CharacterPreview3D({
  appearance,
  className = "",
  width = 200,
  height = 220,
  walking = true,
  hideWeapon = false,
}: {
  appearance: CharacterAppearance;
  className?: string;
  width?: number;
  height?: number;
  walking?: boolean;
  hideWeapon?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rigRef = useRef<RigInstance | null>(null);
  const dollAppearance = (a: CharacterAppearance) =>
    hideWeapon ? { ...a, weapon: "", subWeapon: "" } : a;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 30);
    camera.position.set(0, 1.05, 3.6);
    camera.lookAt(0, 0.85, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x3a2c22, 1.05));
    const key = new THREE.DirectionalLight(0xffe9d0, 1.9);
    key.position.set(2.2, 4.5, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -2;
    key.shadow.camera.right = key.shadow.camera.top = 2;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x86b8ff, 0.8);
    rim.position.set(-2.5, 2, -3);
    scene.add(rim);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 48),
      new THREE.MeshStandardMaterial({ color: 0x232d3a, roughness: 1 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.receiveShadow = true;
    scene.add(disc);

    const spawn = () => {
      rigRef.current?.dispose();
      const rig = buildRig(getRig("humanoid"), { appearance: dollAppearance(appearanceRef.current) });
      rigRef.current = rig;
      scene.add(rig.root);
    };
    spawn();
    // Authored rigs (public/assets/rigs3d) may override the compiled default —
    // rebuild once they land so the preview matches the world exactly.
    const libVersion = rigLibraryVersion;
    void loadRigLibrary().then(() => {
      if (rigLibraryVersion !== libVersion) spawn();
    });

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      const t = now / 1000;
      const rig = rigRef.current;
      if (rig) {
        rig.update(dt, t, walking, true);
        rig.root.rotation.y = t * 0.55;
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      rigRef.current?.dispose();
      rigRef.current = null;
      sceneRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [width, height, walking]);

  // Rebuild the doll when appearance options change.
  const appearanceKey = JSON.stringify(dollAppearance(appearance));
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !rigRef.current) return;
    rigRef.current.dispose();
    const rig = buildRig(getRig("humanoid"), { appearance: dollAppearance(appearance) });
    rigRef.current = rig;
    scene.add(rig.root);
  }, [appearanceKey]);

  return (
    <div
      ref={hostRef}
      className={`character-preview character-preview--3d ${className}`.trim()}
      style={{ width, height }}
    />
  );
}
