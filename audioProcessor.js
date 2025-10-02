/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * This class extends AudioWorkletProcessor to create a custom audio processor
 * that runs in a separate thread. It receives raw audio data (Float32Array),
 * converts it to 16-bit PCM format (Int16Array), and posts it back to the
 * main thread for streaming to the Gemini API.
 */
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
    }

    /**
     * Converts a Float32Array of audio samples to a 16-bit PCM Int16Array.
     * @param {Float32Array} buffer The input audio data.
     * @returns {Int16Array} The converted 16-bit PCM data.
     */
    float32ToInt16(buffer) {
        const int16 = new Int16Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            // Clamp the sample to the range [-1, 1] and convert to 16-bit integer.
            const s = Math.max(-1, Math.min(1, buffer[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16;
    }

    /**
     * The main processing function, called by the browser's audio engine.
     * @param {Float32Array[][]} inputs An array of inputs, each with an array of channels.
     * @returns {boolean} `true` to keep the processor alive.
     */
    process(inputs) {
        // We expect a single input with a single (mono) channel.
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0];
            const pcmData = this.float32ToInt16(channelData);
            // Post the PCM data back to the main thread.
            // The buffer is transferred, not copied, for performance.
            this.port.postMessage(pcmData, [pcmData.buffer]);
        }
        return true; // Keep the processor alive.
    }
}

registerProcessor('audio-processor', AudioProcessor);
