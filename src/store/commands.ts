import type { PrimitiveParams, SceneNode, Transform, MaterialProps, Workplane, CsgOperation } from '../types/scene';
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
    // Store's removeNode cascades: if this is a CSG parent, children are released automatically
    useSceneStore.getState().removeNode(this.id);
  }

  undo(): void {
    if (!this.savedNode) return;
    useSceneStore.getState().restoreNode(this.savedNode, this.savedIndex);
    // If this was a CSG parent, re-adopt the children (re-parent and hide them)
    if (this.savedNode.childIds.length > 0 && this.savedNode.csgOperation) {
      useSceneStore.getState().adoptChildren(
        this.savedNode.id,
        this.savedNode.childIds,
        this.savedNode.csgOperation,
      );
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

/**
 * Records a material change. execute() applies the new material, undo() restores the old one.
 */
export class UpdateMaterialCommand {
  private readonly id: string;
  private readonly before: MaterialProps;
  private readonly after: MaterialProps;

  constructor(id: string, before: MaterialProps, after: MaterialProps) {
    this.id = id;
    this.before = before;
    this.after = after;
  }

  execute(): void {
    useSceneStore.getState().updateMaterial(this.id, this.after);
  }

  undo(): void {
    useSceneStore.getState().updateMaterial(this.id, this.before);
  }
}

/**
 * Records a committed CSG operation. Instead of deleting source nodes,
 * adopts them as hidden children of the result node. Undo releases the
 * children and removes the result.
 */
export class CsgAdoptCommand {
  private readonly savedSourceNodes: SceneNode[];
  private readonly resultId: string;
  private readonly operation: CsgOperation;
  private savedResultNode: SceneNode | null = null;
  private savedResultIndex = 0;

  constructor(
    savedSourceNodes: SceneNode[],
    _savedSourceIndices: number[],
    resultId: string,
    operation: CsgOperation,
  ) {
    this.savedSourceNodes = savedSourceNodes;
    this.resultId = resultId;
    this.operation = operation;
  }

  execute(): void {
    const state = useSceneStore.getState();

    // On redo: result was removed by undo(), restore it before re-adopting
    if (!state.nodes.find((n) => n.id === this.resultId) && this.savedResultNode) {
      state.restoreNode(this.savedResultNode, this.savedResultIndex);
    }

    useSceneStore.getState().adoptChildren(
      this.resultId,
      this.savedSourceNodes.map((n) => n.id),
      this.operation,
    );
  }

  undo(): void {
    const state = useSceneStore.getState();

    // Save result node and position so redo can restore it
    const resultIdx = state.nodes.findIndex((n) => n.id === this.resultId);
    if (resultIdx >= 0) {
      this.savedResultNode = state.nodes[resultIdx];
      this.savedResultIndex = resultIdx;
    }

    // Release children (sets parentId=null, visible=true) then remove result
    state.releaseChildren(this.resultId);
    useSceneStore.getState().removeNode(this.resultId);
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
