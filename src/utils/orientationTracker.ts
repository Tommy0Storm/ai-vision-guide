/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OrientationData {
    alpha: number | null; // Compass direction (0-360°)
    beta: number | null;  // Front-back tilt (-180 to 180°)
    gamma: number | null; // Left-right tilt (-90 to 90°)
}

export interface OrientationGuidance {
    needsAdjustment: boolean;
    message: string | null;
    severity: 'critical' | 'warning' | 'ok';
}

export type OrientationCallback = (data: OrientationData) => void;

/**
 * Manages device orientation tracking with permission handling
 */
export class OrientationTracker {
    private isTracking: boolean = false;
    private callback: OrientationCallback | null = null;
    private currentOrientation: OrientationData = {
        alpha: null,
        beta: null,
        gamma: null
    };

    /**
     * Request permission and start tracking device orientation
     * iOS 13+ requires explicit permission request
     */
    async start(callback: OrientationCallback): Promise<boolean> {
        if (this.isTracking) {
            console.warn('Orientation tracking already started');
            return true;
        }

        this.callback = callback;

        // Check if DeviceOrientationEvent exists
        if (typeof DeviceOrientationEvent === 'undefined') {
            console.error('DeviceOrientationEvent not supported');
            return false;
        }

        // Request permission on iOS 13+
        if (
            typeof (DeviceOrientationEvent as any).requestPermission === 'function'
        ) {
            try {
                const permission = await (DeviceOrientationEvent as any).requestPermission();
                if (permission !== 'granted') {
                    console.error('Orientation permission denied');
                    return false;
                }
            } catch (error) {
                console.error('Error requesting orientation permission:', error);
                return false;
            }
        }

        // Start listening to orientation changes
        window.addEventListener('deviceorientation', this.handleOrientation);
        this.isTracking = true;
        console.log('✅ Orientation tracking started');
        return true;
    }

    /**
     * Stop tracking device orientation
     */
    stop(): void {
        if (!this.isTracking) {
            return;
        }

        window.removeEventListener('deviceorientation', this.handleOrientation);
        this.isTracking = false;
        this.callback = null;
        console.log('🛑 Orientation tracking stopped');
    }

    /**
     * Handle orientation change events
     */
    private handleOrientation = (event: DeviceOrientationEvent): void => {
        this.currentOrientation = {
            alpha: event.alpha,
            beta: event.beta,
            gamma: event.gamma
        };

        if (this.callback) {
            this.callback(this.currentOrientation);
        }
    };

    /**
     * Get current orientation data
     */
    getOrientation(): OrientationData {
        return { ...this.currentOrientation };
    }

    /**
     * Analyze orientation and provide guidance for optimal camera angle
     * Assumes phone in portrait mode (vertical)
     */
    analyzeOrientation(): OrientationGuidance {
        const { beta, gamma } = this.currentOrientation;

        if (beta === null || gamma === null) {
            return {
                needsAdjustment: false,
                message: null,
                severity: 'ok'
            };
        }

        // Beta: Front-back tilt
        // Ideal range for walking: -10° to 20° (slightly tilted forward)
        // Too low (< -20°): Phone pointing at feet
        // Too high (> 40°): Phone pointing at sky

        // Gamma: Left-right tilt
        // Ideal range: -15° to 15° (mostly vertical)

        // Check for critical misalignment
        if (beta < -30) {
            return {
                needsAdjustment: true,
                message: 'Lift phone up - pointing too low',
                severity: 'critical'
            };
        }

        if (beta > 50) {
            return {
                needsAdjustment: true,
                message: 'Tilt phone down - pointing too high',
                severity: 'critical'
            };
        }

        if (gamma < -30) {
            return {
                needsAdjustment: true,
                message: 'Tilt phone right - leaning too far left',
                severity: 'warning'
            };
        }

        if (gamma > 30) {
            return {
                needsAdjustment: true,
                message: 'Tilt phone left - leaning too far right',
                severity: 'warning'
            };
        }

        // Check for minor misalignment (warnings)
        if (beta < -15) {
            return {
                needsAdjustment: true,
                message: 'Lift phone slightly',
                severity: 'warning'
            };
        }

        if (beta > 35) {
            return {
                needsAdjustment: true,
                message: 'Tilt phone down slightly',
                severity: 'warning'
            };
        }

        // Orientation is good
        return {
            needsAdjustment: false,
            message: null,
            severity: 'ok'
        };
    }

    /**
     * Get compass heading in cardinal directions
     */
    getCardinalDirection(): string | null {
        const { alpha } = this.currentOrientation;
        if (alpha === null) return null;

        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(alpha / 45) % 8;
        return directions[index];
    }

    /**
     * Check if orientation tracking is supported
     */
    static isSupported(): boolean {
        return typeof DeviceOrientationEvent !== 'undefined';
    }
}

// Export singleton instance
export const orientationTracker = new OrientationTracker();
