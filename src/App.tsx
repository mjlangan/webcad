import { useRef } from 'react';
import Viewport from './components/Viewport/Viewport';
import Toolbar from './components/Toolbar/Toolbar';
import ScenePanel from './components/ScenePanel/ScenePanel';
import PropertiesPanel from './components/PropertiesPanel/PropertiesPanel';
import type { ViewportActions } from './types/viewport';
import './App.css';

export default function App() {
  const actionsRef = useRef<ViewportActions | null>(null);

  return (
    <div className="app-shell">
      <Toolbar actionsRef={actionsRef} />
      <ScenePanel />
      <div className="app-viewport">
        <Viewport actionsRef={actionsRef} />
      </div>
      <PropertiesPanel />
    </div>
  );
}
