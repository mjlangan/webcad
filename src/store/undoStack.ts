export interface Command {
  execute(): void;
  undo(): void;
}

export class UndoStack {
  private past: Command[] = [];
  private future: Command[] = [];
  private listeners: Array<() => void> = [];

  push(cmd: Command): void {
    cmd.execute();
    this.past.push(cmd);
    this.future = [];
    this.notify();
  }

  undo(): void {
    const cmd = this.past.pop();
    if (cmd) {
      cmd.undo();
      this.future.push(cmd);
      this.notify();
    }
  }

  redo(): void {
    const cmd = this.future.pop();
    if (cmd) {
      cmd.execute();
      this.past.push(cmd);
      this.notify();
    }
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}

export const undoStack = new UndoStack();
