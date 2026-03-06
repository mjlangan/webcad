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
import './App.css';

export default function App() {
  const actionsRef = useRef<ViewportActions | null>(null);

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
          const { selectedIds } = useSceneStore.getState();
          if (selectedIds.length === 0) break;
          // Push each removal as a separate command so they undo independently
          for (const id of [...selectedIds]) {
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
