/** Minimal scene-local ECS for replicated/presentation state. */

export type Entity = number;
export type System = (world: EntityWorld, dt: number) => void;

export interface ComponentStore<T> {
  readonly id: symbol;
  readonly _type?: T;
}

export function component<T>(): ComponentStore<T> {
  return { id: Symbol("component") };
}

export class EntityWorld {
  private nextEntity = 1;
  private readonly live = new Set<Entity>();
  private readonly externalToEntity = new Map<string, Entity>();
  private readonly entityToExternal = new Map<Entity, string>();
  private readonly data = new Map<ComponentStore<unknown>, Map<Entity, unknown>>();

  create(externalId?: string): Entity {
    if (externalId !== undefined) {
      const existing = this.entityByExternalId(externalId);
      if (existing !== undefined) return existing;
    }
    const entity = this.nextEntity++;
    this.live.add(entity);
    if (externalId !== undefined) {
      this.externalToEntity.set(externalId, entity);
      this.entityToExternal.set(entity, externalId);
    }
    return entity;
  }

  entityByExternalId(externalId: string): Entity | undefined {
    const entity = this.externalToEntity.get(externalId);
    return entity !== undefined && this.live.has(entity) ? entity : undefined;
  }

  externalId(entity: Entity): string | undefined {
    return this.live.has(entity) ? this.entityToExternal.get(entity) : undefined;
  }

  has(entity: Entity): boolean {
    return this.live.has(entity);
  }

  register<T>(store: ComponentStore<T>): ComponentStore<T> {
    const key = store as ComponentStore<unknown>;
    if (!this.data.has(key)) this.data.set(key, new Map());
    return store;
  }

  set<T>(store: ComponentStore<T>, entity: Entity, value: T): void {
    this.assertLive(entity);
    this.register(store);
    this.data.get(store as ComponentStore<unknown>)!.set(entity, value);
  }

  get<T>(store: ComponentStore<T>, entity: Entity): T | undefined {
    if (!this.live.has(entity)) return undefined;
    return this.data.get(store as ComponentStore<unknown>)?.get(entity) as T | undefined;
  }

  remove<T>(store: ComponentStore<T>, entity: Entity): void {
    this.assertLive(entity);
    this.register(store);
    this.data.get(store as ComponentStore<unknown>)?.delete(entity);
  }

  query(...stores: ComponentStore<unknown>[]): Entity[] {
    return this.queryExcluding(stores, []);
  }

  queryExcluding(
    includes: readonly ComponentStore<unknown>[],
    excludes: readonly ComponentStore<unknown>[],
  ): Entity[] {
    const includeTables = includes.map((store) => this.data.get(store));
    if (includeTables.some((table) => table === undefined)) return [];
    const excludeTables = excludes
      .map((store) => this.data.get(store))
      .filter((table): table is Map<Entity, unknown> => table !== undefined);
    const candidates =
      includeTables.length === 0
        ? [...this.live]
        : [...(includeTables as Map<Entity, unknown>[]).sort((a, b) => a.size - b.size)[0].keys()];
    const out: Entity[] = [];
    for (const entity of candidates) {
      if (!this.live.has(entity)) continue;
      if (!includeTables.every((table) => table!.has(entity))) continue;
      if (excludeTables.some((table) => table.has(entity))) continue;
      out.push(entity);
    }
    return out;
  }

  entities(): Entity[] {
    return [...this.live];
  }

  destroy(entity: Entity): void {
    if (!this.live.delete(entity)) return;
    for (const table of this.data.values()) table.delete(entity);
    const externalId = this.entityToExternal.get(entity);
    if (externalId !== undefined) {
      this.entityToExternal.delete(entity);
      this.externalToEntity.delete(externalId);
    }
  }

  clear(): void {
    this.live.clear();
    this.externalToEntity.clear();
    this.entityToExternal.clear();
    for (const table of this.data.values()) table.clear();
  }

  private assertLive(entity: Entity): void {
    if (!this.live.has(entity)) {
      throw new Error(`ECS entity ${entity} is not live`);
    }
  }
}

export function runSystems(world: EntityWorld, systems: readonly System[], dt: number): void {
  for (const system of systems) system(world, dt);
}
