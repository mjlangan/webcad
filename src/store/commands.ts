import type { PrimitiveParams, SceneNode, Transform, Workplane } from '../types/scene';
import { useSceneStore } from './useSceneStore';

export class AddNodeCommand {
  private nodeId: string | null = null;
  private readonly geometry: PrimitiveParams;
  private readonly spawnHalfHeight: number | undefined;

  constructor(geometry: PrimitiveParams, spawnHalfHeight?: number) {
    this.geometry = geometry;
    this.spawnHalfHeight = spawnHalfHeight;
  }

  execute(): void {
    this.nodeId = useSceneStore.getState().addNode(this.geometry, this.spawnHalfHeight);
  }

  undo(): void {
    if (this.nodeId) useSceneStore.getState().removeNode(this.nodeId);
  }
}

export class RemoveNodeCommand {
  private savedNode: SceneNode | null = null;
  private savedIndex = 0;
  private readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  execute(): void {
    const { nodes } = useSceneStore.getState();
    this.savedNode = nodes.find((n) => n.id === this.id) ?? null;
    this.savedIndex = nodes.findIndex((n) => n.id === this.id);
    useSceneStore.getState().removeNode(this.id);
  }

  undo(): void {
    if (this.savedNode) {
      useSceneStore.getState().restoreNode(this.savedNode, this.savedIndex);
    }
  }
}

export class RenameNodeCommand {
  private readonly id: string;
  private readonly before: string;
  private readonly after: string;

  constructor(id: string, before: string, after: string) {
    this.id = id;
    this.before = before;
    this.after = after;
  }

  execute(): void {
    useSceneStore.getState().renameNode(this.id, this.after);
  }

  undo(): void {
    useSceneStore.getState().renameNode(this.id, this.before);
  }
}

export class TransformCommand {
  private readonly ids: string[];
  private readonly befores: Transform[];
  private readonly afters: Transform[];

  constructor(ids: string[], befores: Transform[], afters: Transform[]) {
    this.ids = ids;
    this.befores = befores;
    this.afters = afters;
  }

  execute(): void {
    this.ids.forEach((id, i) =>
      useSceneStore.getState().updateTransform(id, this.afters[i]),
    );
  }

  undo(): void {
    this.ids.forEach((id, i) =>
      useSceneStore.getState().updateTransform(id, this.befores[i]),
    );
  }
}

export class UpdateGeometryCommand {
  private readonly id: string;
  private readonly before: PrimitiveParams;
  private readonly after: PrimitiveParams;

  constructor(id: string, before: PrimitiveParams, after: PrimitiveParams) {
    this.id = id;
    this.before = before;
    this.after = after;
  }

  execute(): void {
    useSceneStore.getState().updatePrimitiveParams(this.id, this.after);
  }

  undo(): void {
    useSceneStore.getState().updatePrimitiveParams(this.id, this.before);
  }
}

export class SetWorkplaneCommand {
  private readonly before: Workplane;
  private readonly after: Workplane;

  constructor(before: Workplane, after: Workplane) {
    this.before = before;
    this.after = after;
  }

  execute(): void {
    useSceneStore.getState().setWorkplane(this.after);
  }

  undo(): void {
    useSceneStore.getState().setWorkplane(this.before);
  }
}
