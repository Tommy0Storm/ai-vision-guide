/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useState, useRef } from 'react';
import { AssetsLoaded } from '../types';

/**
 * This hook is no longer used in the Market Pulse application.
 * It is kept to maintain file structure but performs no actions.
 */
export function useGameAssets() {
    const [assetsLoaded] = useState<AssetsLoaded>({ all: true }); // Assume loaded
    const batHitSoundRef = useRef<HTMLAudioElement | null>(null);
    const wicketSoundRef = useRef<HTMLAudioElement | null>(null);

    return {
        assetsLoaded,
        batHitSoundRef,
        wicketSoundRef
    };
}