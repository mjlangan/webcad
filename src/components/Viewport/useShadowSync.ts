import { useEffect, type RefObject } from 'react';
import type { ThreeSetup } from './useThreeSetup';
import { usePreferencesStore } from '../../store/usePreferencesStore';

/** Keeps the key light's castShadow flag in sync with the shadows preference. */
export function useShadowSync(threeRef: RefObject<ThreeSetup | null>): void {
  useEffect(() => {
    if (!threeRef.current) return;
    const { keyLight } = threeRef.current;

    keyLight.castShadow = usePreferencesStore.getState().shadowsEnabled;

    const unsubscribe = usePreferencesStore.subscribe((state) => {
      keyLight.castShadow = state.shadowsEnabled;
    });

    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
