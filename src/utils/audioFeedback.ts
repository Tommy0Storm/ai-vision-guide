/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Audio feedback utility for non-verbal navigation cues
 * Provides beeps, tones, and directional audio for blind users
 */
export class AudioFeedbackManager {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;

    /**
     * Initialize audio context for feedback sounds
     */
    async init(): Promise<void> {
        if (this.audioContext) {
            return; // Already initialized
        }

        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
            latencyHint: 'interactive'
        });

        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.3; // 30% volume for non-intrusive feedback
        this.masterGain.connect(this.audioContext.destination);

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        console.log('✅ Audio feedback initialized');
    }

    /**
     * Play a distance-coded beep (closer = higher pitch)
     * @param distanceMeters - Distance to object in meters
     */
    playDistanceBeep(distanceMeters: number): void {
        if (!this.audioContext || !this.masterGain) {
            return;
        }

        // Map distance to frequency: 1m = 800Hz, 5m = 200Hz
        const frequency = Math.max(200, Math.min(800, 800 - (distanceMeters - 1) * 150));
        const duration = 0.1; // 100ms beep

        this.playTone(frequency, duration, 'sine', 0.4);
    }

    /**
     * Play directional warning tone
     * @param direction - 'left', 'center', 'right'
     * @param urgency - 'critical', 'high', 'medium', 'low'
     */
    playDirectionalTone(
        direction: 'left' | 'center' | 'right',
        urgency: 'critical' | 'high' | 'medium' | 'low'
    ): void {
        if (!this.audioContext || !this.masterGain) {
            return;
        }

        // Frequency based on urgency
        const frequencyMap = {
            critical: 880, // A5 - urgent
            high: 660,     // E5
            medium: 523,   // C5
            low: 392       // G4
        };

        const frequency = frequencyMap[urgency];
        const duration = urgency === 'critical' ? 0.2 : 0.15;

        // Create stereo panning
        const panner = this.audioContext.createStereoPanner();
        panner.pan.value = direction === 'left' ? -0.8 : direction === 'right' ? 0.8 : 0;
        panner.connect(this.masterGain);

        // Create oscillator
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;

        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0.5;

        oscillator.connect(gainNode);
        gainNode.connect(panner);

        const now = this.audioContext.currentTime;
        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    /**
     * Play attention-grabbing alert before critical warnings
     */
    playAttentionAlert(): void {
        if (!this.audioContext || !this.masterGain) {
            return;
        }

        // Two quick beeps to grab attention
        this.playTone(880, 0.08, 'sine', 0.5);
        setTimeout(() => {
            this.playTone(880, 0.08, 'sine', 0.5);
        }, 100);
    }

    /**
     * Play obstacle proximity warning (parking sensor style)
     * Faster beeps = closer object
     */
    startProximityAlert(distanceMeters: number): NodeJS.Timeout | null {
        if (!this.audioContext || !this.masterGain) {
            return null;
        }

        // Interval based on distance: 1m = 200ms, 3m = 1000ms
        const interval = Math.max(200, Math.min(1000, distanceMeters * 300));

        const intervalId = setInterval(() => {
            this.playTone(600, 0.05, 'square', 0.3);
        }, interval);

        return intervalId;
    }

    /**
     * Play success/confirmation tone
     */
    playConfirmation(): void {
        if (!this.audioContext || !this.masterGain) {
            return;
        }

        // Pleasant ascending tone
        this.playTone(523, 0.1, 'sine', 0.4); // C5
        setTimeout(() => {
            this.playTone(659, 0.15, 'sine', 0.4); // E5
        }, 100);
    }

    /**
     * Play error/warning tone
     */
    playError(): void {
        if (!this.audioContext || !this.masterGain) {
            return;
        }

        // Descending dissonant tone
        this.playTone(440, 0.15, 'sawtooth', 0.5); // A4
        setTimeout(() => {
            this.playTone(330, 0.2, 'sawtooth', 0.5); // E4
        }, 150);
    }

    /**
     * Generic tone player
     */
    private playTone(
        frequency: number,
        duration: number,
        type: OscillatorType = 'sine',
        volume: number = 0.3
    ): void {
        if (!this.audioContext || !this.masterGain) {
            return;
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = type;
        oscillator.frequency.value = frequency;

        gainNode.gain.value = volume;

        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);

        const now = this.audioContext.currentTime;
        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    /**
     * Set master volume for all feedback sounds
     */
    setVolume(volume: number): void {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /**
     * Clean up audio context
     */
    async dispose(): Promise<void> {
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
            this.masterGain = null;
        }
    }
}

// Export singleton instance
export const audioFeedback = new AudioFeedbackManager();
