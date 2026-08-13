import { useEffect, type RefObject } from 'react';
import type { ThreeSetup } from './useThreeSetup';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import { primeAndSubscribe } from '../../store/storeSync';

/** Keeps the key light's castShadow flag in sync with the shadows preference. */
export function useShadowSync(threeRef: RefObject<ThreeSetup | null>): void {
  useEffect(() => {
    if (!threeRef.current) return;
    const { keyLight } = threeRef.current;

    return primeAndSubscribe(usePreferencesStore, (state) => {
      keyLight.castShadow = state.shadowsEnabled;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
