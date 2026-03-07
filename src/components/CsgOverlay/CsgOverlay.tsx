import { useSceneStore } from '../../store/useSceneStore';
import { cancelCsg } from '../../lib/triggerCsg';
import './CsgOverlay.css';

export default function CsgOverlay() {
  const csgStatus = useSceneStore((s) => s.csgStatus);

  if (csgStatus === 'idle') return null;

  return (
    <div className="csg-overlay">
      {csgStatus === 'in_flight' && (
        <div className="csg-overlay__panel">
          <div className="csg-overlay__spinner" />
          <span className="csg-overlay__label">Computing…</span>
          <button className="csg-overlay__btn csg-overlay__btn--cancel" onClick={cancelCsg}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
