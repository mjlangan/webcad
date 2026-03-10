import { Spin, Button } from 'antd';
import { useSceneStore } from '../../store/useSceneStore';
import { cancelCsg } from '../../lib/triggerCsg';

export default function CsgOverlay() {
  const csgStatus = useSceneStore((s) => s.csgStatus);

  if (csgStatus === 'idle') return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingBottom: 24,
      zIndex: 10,
    }}>
      {csgStatus === 'in_flight' && (
        <div style={{
          pointerEvents: 'all',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(20,20,20,0.88)',
          border: '1px solid #444',
          borderRadius: 6,
          padding: '8px 14px',
          backdropFilter: 'blur(4px)',
        }}>
          <Spin size="small" />
          <span style={{ fontSize: 13, color: '#ccc' }}>Computing…</span>
          <Button size="small" onClick={cancelCsg}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
