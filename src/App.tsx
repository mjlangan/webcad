import { useRef, useEffect } from 'react';
import Viewport from './components/Viewport/Viewport';
import Toolbar from './components/Toolbar/Toolbar';
import ScenePanel from './components/ScenePanel/ScenePanel';
import PropertiesPanel from './components/PropertiesPanel/PropertiesPanel';
import CsgOverlay from './components/CsgOverlay/CsgOverlay';
import type { ViewportActions } from './types/viewport';
import { useSceneStore } from './store/useSceneStore';
import type { AxisConstraint } from './store/useSceneStore';
import { undoStack } from './store/undoStack';
import { RemoveNodeCommand, DuplicateNodeCommand } from './store/commands';
import { useCsgAutoRecompute } from './lib/useCsgAutoRecompute';
import { groupSelected } from './lib/groupActions';
import './App.css';

export default function App() {
  const actionsRef = useRef<ViewportActions | null>(null);
  useCsgAutoRecompute();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore shortcuts when focus is inside an input / textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'f' || e.key === 'F') {
        actionsRef.current?.focusSelection();
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        const { measureMode, setMeasureMode } = useSceneStore.getState();
        setMeasureMode(!measureMode);
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undoStack.undo();
          return;
        }
        if (e.key === 'z' && e.shiftKey) {
          e.preventDefault();
          undoStack.redo();
          return;
        }
        if (e.key === 'y') {
          e.preventDefault();
          undoStack.redo();
          return;
        }
        if (e.key === 'g') {
          e.preventDefault();
          groupSelected();
          return;
        }
        if (e.key === 'd') {
          e.preventDefault();
          const { selectedIds, nodes } = useSceneStore.getState();
          for (const id of selectedIds) {
            const node = nodes.find((n) => n.id === id);
            if (!node) continue;
            const parent = node.parentId ? nodes.find((n) => n.id === node.parentId) : null;
            const isDeletable = node.parentId === null || parent?.geometry.type === 'group';
            if (isDeletable) undoStack.push(new DuplicateNodeCommand(id));
          }
          return;
        }
        return;
      }

      switch (e.key) {
        case 'g':
        case 'G':
          useSceneStore.getState().setTransformMode('translate');
          break;
        case 'r':
        case 'R':
          useSceneStore.getState().setTransformMode('rotate');
          break;
        case 's':
        case 'S':
          useSceneStore.getState().setTransformMode('scale');
          break;
        case 'x':
        case 'X': {
          const { selectedIds, transformAxisConstraint } = useSceneStore.getState();
          if (selectedIds.length > 0) {
            useSceneStore.getState().setTransformAxisConstraint(
              transformAxisConstraint === 'X' ? null : 'X' as AxisConstraint
            );
          }
          break;
        }
        case 'y':
        case 'Y': {
          const { selectedIds, transformAxisConstraint } = useSceneStore.getState();
          if (selectedIds.length > 0) {
            useSceneStore.getState().setTransformAxisConstraint(
              transformAxisConstraint === 'Y' ? null : 'Y' as AxisConstraint
            );
          }
          break;
        }
        case 'z':
        case 'Z': {
          const { selectedIds, transformAxisConstraint } = useSceneStore.getState();
          if (selectedIds.length > 0) {
            useSceneStore.getState().setTransformAxisConstraint(
              transformAxisConstraint === 'Z' ? null : 'Z' as AxisConstraint
            );
          }
          break;
        }
        case 'Delete':
        case 'Backspace': {
          const { selectedIds, nodes } = useSceneStore.getState();
          if (selectedIds.length === 0) break;
          // Skip CSG children (locked) — allow deleting root nodes and group children
          const deletableIds = selectedIds.filter((id) => {
            const node = nodes.find((n) => n.id === id);
            if (!node) return false;
            if (node.parentId === null) return true;
            // Allow deletion if the parent is a general-purpose group
            const parent = nodes.find((n) => n.id === node.parentId);
            return parent?.geometry.type === 'group';
          });
          for (const id of deletableIds) {
            undoStack.push(new RemoveNodeCommand(id));
          }
          break;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="app-shell">
      <Toolbar actionsRef={actionsRef} />
      <ScenePanel />
      <div className="app-viewport">
        <Viewport actionsRef={actionsRef} />
        <CsgOverlay />
      </div>
      <PropertiesPanel />
    </div>
  );
}
