import { useRef, useEffect } from 'react';
import Viewport from './components/Viewport/Viewport';
import Toolbar from './components/Toolbar/Toolbar';
import ScenePanel from './components/ScenePanel/ScenePanel';
import PropertiesPanel from './components/PropertiesPanel/PropertiesPanel';
import CsgOverlay from './components/CsgOverlay/CsgOverlay';
import type { ViewportActions } from './types/viewport';
import { useSceneStore } from './store/useSceneStore';
import { undoStack } from './store/undoStack';
import { RemoveNodeCommand } from './store/commands';
import { useCsgAutoRecompute } from './lib/useCsgAutoRecompute';
import './App.css';

export default function App() {
  const actionsRef = useRef<ViewportActions | null>(null);
  useCsgAutoRecompute();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore shortcuts when focus is inside an input / textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

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
        case 'Delete':
        case 'Backspace': {
          const { selectedIds, nodes } = useSceneStore.getState();
          if (selectedIds.length === 0) break;
          // Skip children of CSG results — they cannot be deleted independently
          const deletableIds = selectedIds.filter(
            (id) => nodes.find((n) => n.id === id)?.parentId === null,
          );
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
