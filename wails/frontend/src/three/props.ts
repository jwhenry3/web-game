import * as THREE from "three";
import { mapFeatureStamps } from "../world/featureStamps";
import { WORLD_SCALE, WORLD_ZOOM, WorldHeightmap } from "./heightmap";
import { disposeObject } from "./terrain";
import { createBuilding } from "./prefabs";

/** Volumetric equivalents of the world's existing authored building stamps. */
export class WorldBuildings {
  readonly group = new THREE.Group();
  private disposed = false;
  constructor(mapId: string, field: WorldHeightmap) {
    void mapFeatureStamps(mapId).then(stamps => {
      if (this.disposed) return;
      for (const stamp of stamps) {
        if (!stamp.feature.startsWith("building_")) continue;
        const building = createBuilding(stamp.feature.includes("tower"));
        building.position.set(stamp.x * WORLD_SCALE, field.height(stamp.x, stamp.y), stamp.y * WORLD_SCALE);
        building.rotation.y = -stamp.rotation * Math.PI / 180;
        const scale = stamp.scale * WORLD_ZOOM;
        building.scale.set(scale * (stamp.flipX ? -1 : 1), scale, scale);
        this.group.add(building);
      }
    });
  }
  dispose() { this.disposed = true; disposeObject(this.group); }
}
