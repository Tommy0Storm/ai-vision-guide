/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Haptic feedback utility using Vibration API for urgency alerts
 */
export class HapticsManager {
    /**
     * Check if vibration API is supported
     */
    static isSupported(): boolean {
        return 'vibrate' in navigator;
    }

    /**
     * Vibrate based on urgency level
     * @param urgency - The urgency level
     */
    static vibrateForUrgency(urgency: 'critical' | 'high' | 'medium' | 'low'): void {
        if (!this.isSupported()) {
            return;
        }

        switch (urgency) {
            case 'critical':
                // Strong, urgent pattern: buzz-buzz-buzz (rapid)
                navigator.vibrate([200, 100, 200, 100, 200]);
                break;
            case 'high':
                // Moderate pattern: buzz-pause-buzz
                navigator.vibrate([150, 200, 150]);
                break;
            case 'medium':
                // Single medium vibration
                navigator.vibrate(100);
                break;
            case 'low':
                // Gentle single tap
                navigator.vibrate(50);
                break;
        }
    }

    /**
     * Play attention-grabbing vibration
     */
    static vibrateAlert(): void {
        if (!this.isSupported()) {
            return;
        }

        // Strong alert pattern
        navigator.vibrate([300, 100, 300]);
    }

    /**
     * Play confirmation vibration
     */
    static vibrateConfirm(): void {
        if (!this.isSupported()) {
            return;
        }

        // Short positive feedback
        navigator.vibrate(50);
    }

    /**
     * Play error/warning vibration
     */
    static vibrateError(): void {
        if (!this.isSupported()) {
            return;
        }

        // Long buzzing error
        navigator.vibrate(500);
    }

    /**
     * Stop all vibrations
     */
    static stop(): void {
        if (!this.isSupported()) {
            return;
        }

        navigator.vibrate(0);
    }
}

export const haptics = HapticsManager;
