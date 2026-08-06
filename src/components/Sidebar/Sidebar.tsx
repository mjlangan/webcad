import { useEffect, useRef, useState } from 'react';
import ScenePanel from '../ScenePanel/ScenePanel';
import PropertiesPanel from '../PropertiesPanel/PropertiesPanel';

const MIN_PANE_HEIGHT = 80;
const DEFAULT_SCENE_HEIGHT = 240;

/** Left sidebar: the scene tree stacked above the properties panel, split by a
 *  vertically-draggable divider. */
export default function Sidebar() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sceneHeight, setSceneHeight] = useState(DEFAULT_SCENE_HEIGHT);
  const draggingRef = useRef(false);

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const maxHeight = Math.max(rect.height - MIN_PANE_HEIGHT, MIN_PANE_HEIGHT);
      const next = Math.min(Math.max(e.clientY - rect.top, MIN_PANE_HEIGHT), maxHeight);
      setSceneHeight(next);
    }
    function onPointerUp() {
      draggingRef.current = false;
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        gridArea: 'scene',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRight: '1px solid #2a2a2a',
        background: '#181818',
      }}
    >
      <div style={{ height: sceneHeight, flexShrink: 0, overflow: 'hidden' }}>
        <ScenePanel />
      </div>
      <div
        data-testid="sidebar-resize-handle"
        onPointerDown={(e) => {
          draggingRef.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        style={{
          height: 5,
          flexShrink: 0,
          cursor: 'row-resize',
          background: '#222',
          borderTop: '1px solid #2a2a2a',
          borderBottom: '1px solid #2a2a2a',
        }}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <PropertiesPanel />
      </div>
    </div>
  );
}
