import type { Page } from '@playwright/test';

export type PrimitiveType =
  | 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'beerglass'
  | 'wedge' | 'roof' | 'pyramid' | 'tube' | 'dome'
  | 'polygon' | 'ellipsoid' | 'capsule' | 'torusknot';

/** Clicks the toolbar "Add <type>" button and returns the new node's id. Adding auto-selects it. */
export async function addPrimitive(page: Page, type: PrimitiveType): Promise<string> {
  const addButton = page.getByTestId(`toolbar-add-${type}`);
  if (!(await addButton.isVisible())) {
    await page.getByTestId('shape-library-handle').click();
  }
  await addButton.click();
  return page.evaluate(() => {
    const { nodes } = window.__E2E__!.store.getState();
    return nodes[nodes.length - 1].id;
  });
}

/** Selects a single node by clicking its ScenePanel row (replaces the current selection). */
export async function selectNode(page: Page, nodeId: string): Promise<void> {
  await page.getByTestId(`scene-node-${nodeId}`).click();
}

/** Adds the given node to the current selection via Ctrl/Cmd-click on its ScenePanel row. */
export async function addToSelection(page: Page, nodeId: string): Promise<void> {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.getByTestId(`scene-node-${nodeId}`).click({ modifiers: [modifier] });
}

export function getNodeIds(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__E2E__!.store.getState().nodes.map((n) => n.id));
}

export function getNode(page: Page, nodeId: string) {
  return page.evaluate(
    (id) => window.__E2E__!.store.getState().nodes.find((n) => n.id === id) ?? null,
    nodeId,
  );
}

export function getNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__E2E__!.store.getState().nodes.length);
}
