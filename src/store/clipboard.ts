import type { SceneNode } from '../types/scene';

export class Clipboard {
  private nodes: SceneNode[] = [];
  private listeners: Array<() => void> = [];

  set(nodes: SceneNode[]): void {
    this.nodes = nodes;
    this.notify();
  }

  get(): SceneNode[] {
    return this.nodes;
  }

  get hasContent(): boolean {
    return this.nodes.length > 0;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}

export const clipboard = new Clipboard();
