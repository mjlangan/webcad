import { describe, it, expect, beforeEach } from 'vitest';
import { UndoStack } from './undoStack';
import type { Command } from './undoStack';

// Creates a simple command that records calls to an external log array.
function makeCmd(log: string[], label = 'cmd'): Command {
  return {
    execute: () => { log.push(`${label}:execute`); },
    undo:    () => { log.push(`${label}:undo`); },
  };
}

describe('UndoStack', () => {
  let stack: UndoStack;

  beforeEach(() => {
    stack = new UndoStack();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  it('starts with canUndo = false', () => {
    expect(stack.canUndo).toBe(false);
  });

  it('starts with canRedo = false', () => {
    expect(stack.canRedo).toBe(false);
  });

  // ── push ───────────────────────────────────────────────────────────────────

  it('push immediately executes the command', () => {
    const log: string[] = [];
    stack.push(makeCmd(log));
    expect(log).toEqual(['cmd:execute']);
  });

  it('push sets canUndo = true', () => {
    stack.push(makeCmd([]));
    expect(stack.canUndo).toBe(true);
  });

  it('push leaves canRedo = false', () => {
    stack.push(makeCmd([]));
    expect(stack.canRedo).toBe(false);
  });

  it('push clears the redo future (branching)', () => {
    const log: string[] = [];
    const a = makeCmd(log, 'a');
    const b = makeCmd(log, 'b');
    const c = makeCmd(log, 'c');

    stack.push(a);
    stack.push(b);
    stack.undo();          // b is now in future
    expect(stack.canRedo).toBe(true);

    stack.push(c);         // branching push must clear future
    expect(stack.canRedo).toBe(false);
  });

  // ── undo ───────────────────────────────────────────────────────────────────

  it('undo calls command.undo()', () => {
    const log: string[] = [];
    stack.push(makeCmd(log));
    log.length = 0; // clear the initial execute
    stack.undo();
    expect(log).toEqual(['cmd:undo']);
  });

  it('undo moves command to future, canRedo = true', () => {
    stack.push(makeCmd([]));
    stack.undo();
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(true);
  });

  it('undo on empty stack is a no-op', () => {
    expect(() => stack.undo()).not.toThrow();
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
  });

  it('multiple pushes then multiple undos work LIFO', () => {
    const log: string[] = [];
    stack.push(makeCmd(log, 'a'));
    stack.push(makeCmd(log, 'b'));
    stack.push(makeCmd(log, 'c'));
    log.length = 0;

    stack.undo();
    stack.undo();
    expect(log).toEqual(['c:undo', 'b:undo']);
    expect(stack.canUndo).toBe(true);  // 'a' still in past
    expect(stack.canRedo).toBe(true);
  });

  // ── redo ───────────────────────────────────────────────────────────────────

  it('redo calls command.execute() again', () => {
    const log: string[] = [];
    stack.push(makeCmd(log));
    stack.undo();
    log.length = 0;

    stack.redo();
    expect(log).toEqual(['cmd:execute']);
  });

  it('redo moves command back to past, canUndo = true', () => {
    stack.push(makeCmd([]));
    stack.undo();
    stack.redo();
    expect(stack.canUndo).toBe(true);
    expect(stack.canRedo).toBe(false);
  });

  it('redo on empty future is a no-op', () => {
    expect(() => stack.redo()).not.toThrow();
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
  });

  it('full push → undo → redo round-trip executes and undoes in correct order', () => {
    const log: string[] = [];
    stack.push(makeCmd(log, 'a'));
    stack.push(makeCmd(log, 'b'));
    log.length = 0;

    stack.undo();   // undo b
    stack.undo();   // undo a
    stack.redo();   // redo a
    stack.redo();   // redo b

    expect(log).toEqual(['b:undo', 'a:undo', 'a:execute', 'b:execute']);
  });

  it('redo respects LIFO order of future stack', () => {
    const log: string[] = [];
    stack.push(makeCmd(log, 'a'));
    stack.push(makeCmd(log, 'b'));
    stack.undo(); // b → future[0]
    stack.undo(); // a → future[1]
    log.length = 0;

    stack.redo(); // should redo a first (top of future)
    expect(log).toEqual(['a:execute']);
  });

  // ── subscribe ──────────────────────────────────────────────────────────────

  it('subscriber is called on push', () => {
    let calls = 0;
    stack.subscribe(() => { calls++; });
    stack.push(makeCmd([]));
    expect(calls).toBe(1);
  });

  it('subscriber is called on undo', () => {
    let calls = 0;
    stack.push(makeCmd([]));
    stack.subscribe(() => { calls++; });
    stack.undo();
    expect(calls).toBe(1);
  });

  it('subscriber is called on redo', () => {
    stack.push(makeCmd([]));
    stack.undo();
    let calls = 0;
    stack.subscribe(() => { calls++; });
    stack.redo();
    expect(calls).toBe(1);
  });

  it('subscriber is NOT called when undo is a no-op', () => {
    let calls = 0;
    stack.subscribe(() => { calls++; });
    stack.undo(); // empty stack — should not notify
    expect(calls).toBe(0);
  });

  it('subscriber is NOT called when redo is a no-op', () => {
    let calls = 0;
    stack.subscribe(() => { calls++; });
    stack.redo(); // empty future — should not notify
    expect(calls).toBe(0);
  });

  it('unsubscribe stops notifications', () => {
    let calls = 0;
    const unsub = stack.subscribe(() => { calls++; });
    stack.push(makeCmd([]));
    expect(calls).toBe(1);

    unsub();
    stack.undo();
    stack.redo();
    expect(calls).toBe(1); // no more calls after unsub
  });

  it('multiple subscribers are all notified', () => {
    let a = 0;
    let b = 0;
    stack.subscribe(() => { a++; });
    stack.subscribe(() => { b++; });
    stack.push(makeCmd([]));
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('unsubscribing one subscriber does not affect others', () => {
    let a = 0;
    let b = 0;
    const unsub = stack.subscribe(() => { a++; });
    stack.subscribe(() => { b++; });

    unsub();
    stack.push(makeCmd([]));
    expect(a).toBe(0);
    expect(b).toBe(1);
  });
});
