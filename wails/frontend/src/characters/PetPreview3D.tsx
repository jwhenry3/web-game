import * as THREE from "three";
import { useEffect, useRef } from "react";
import { buildEnemyRig } from "../three/actors";
import { loadRigLibrary, rigLibraryVersion, type RigInstance } from "../three/rigBuilder";
import type { EnemyKind } from "./enemies";

/**
 * 3D pet preview — builds the same enemy rig the Three.js world uses on a
 * slow turntable. The camera frames the rig's bounding sphere each spawn so
 * small imps and bulky golems both fit.
 */
export function PetPreview3D({
  kind,
  className = "",
  width = 200,
  height = 220,
  walking = true,
}: {
  kind: EnemyKind;
  className?: string;
  width?: number;
  height?: number;
  walking?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rigRef = useRef<RigInstance | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 60);
    cameraRef.current = camera;
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
    key.shadow.camera.left = key.shadow.camera.bottom = -4;
    key.shadow.camera.right = key.shadow.camera.top = 4;
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
      const { rig } = buildEnemyRig(kindRef.current);
      rigRef.current = rig;
      scene.add(rig.root);
      // Frame whatever the rig produced — enemy sizes vary wildly.
      const sphere = new THREE.Box3().setFromObject(rig.root).getBoundingSphere(new THREE.Sphere());
      const dist = Math.max(1.8, sphere.radius * 3.2);
      camera.position.set(sphere.center.x, sphere.center.y + sphere.radius * 0.7, sphere.center.z + dist);
      camera.lookAt(sphere.center);
      disc.position.set(sphere.center.x, 0, sphere.center.z);
      disc.scale.setScalar(Math.max(1, sphere.radius * 1.4));
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
      cameraRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [width, height, walking]);

  // Rebuild the rig when the pet kind changes.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !rigRef.current || !cameraRef.current) return;
    rigRef.current.dispose();
    const { rig } = buildEnemyRig(kind);
    rigRef.current = rig;
    scene.add(rig.root);
    const sphere = new THREE.Box3().setFromObject(rig.root).getBoundingSphere(new THREE.Sphere());
    const dist = Math.max(1.8, sphere.radius * 3.2);
    cameraRef.current.position.set(sphere.center.x, sphere.center.y + sphere.radius * 0.7, sphere.center.z + dist);
    cameraRef.current.lookAt(sphere.center);
  }, [kind]);

  return (
    <div
      ref={hostRef}
      className={`character-preview character-preview--3d ${className}`.trim()}
      style={{ width, height }}
    />
  );
}
