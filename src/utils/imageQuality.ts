/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ImageQualityResult {
    isBlurry: boolean;
    blurScore: number;
    isTooDark: boolean;
    isTooLight: boolean;
    brightness: number;
    qualityIssue: string | null;
}

/**
 * Analyzes image quality using Variance of Laplacian for blur detection
 * and brightness histogram analysis
 */
export function analyzeImageQuality(
    imageData: ImageData,
    blurThreshold: number = 100,
    darkThreshold: number = 50,
    lightThreshold: number = 200
): ImageQualityResult {
    const { width, height, data } = imageData;

    // Convert to grayscale and compute Laplacian variance for blur detection
    const gray = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        const idx = i / 4;
        gray[idx] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    // Compute Laplacian using 3x3 kernel
    let laplacianSum = 0;
    let laplacianCount = 0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;

            // Laplacian kernel: center pixel * 8 - surrounding 8 pixels
            const laplacian = Math.abs(
                gray[idx] * 8 -
                gray[idx - width - 1] - gray[idx - width] - gray[idx - width + 1] -
                gray[idx - 1] - gray[idx + 1] -
                gray[idx + width - 1] - gray[idx + width] - gray[idx + width + 1]
            );

            laplacianSum += laplacian;
            laplacianCount++;
        }
    }

    const laplacianMean = laplacianSum / laplacianCount;

    // Compute variance of Laplacian
    let varianceSum = 0;
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;

            const laplacian = Math.abs(
                gray[idx] * 8 -
                gray[idx - width - 1] - gray[idx - width] - gray[idx - width + 1] -
                gray[idx - 1] - gray[idx + 1] -
                gray[idx + width - 1] - gray[idx + width] - gray[idx + width + 1]
            );

            varianceSum += Math.pow(laplacian - laplacianMean, 2);
        }
    }

    const blurScore = varianceSum / laplacianCount;
    const isBlurry = blurScore < blurThreshold;

    // Analyze brightness
    let brightnessSum = 0;
    const pixelCount = width * height;

    for (let i = 0; i < gray.length; i++) {
        brightnessSum += gray[i];
    }

    const brightness = brightnessSum / pixelCount;
    const isTooDark = brightness < darkThreshold;
    const isTooLight = brightness > lightThreshold;

    // Determine quality issue
    let qualityIssue: string | null = null;
    if (isBlurry && isTooDark) {
        qualityIssue = 'Camera obscured or too dark - lift phone up';
    } else if (isBlurry) {
        qualityIssue = 'Image blurry - adjust camera angle';
    } else if (isTooDark) {
        qualityIssue = 'Too dark - need more light';
    } else if (isTooLight) {
        qualityIssue = 'Too bright - move away from light source';
    }

    return {
        isBlurry,
        blurScore,
        isTooDark,
        isTooLight,
        brightness,
        qualityIssue
    };
}

/**
 * Extracts ImageData from a video element for analysis
 */
export function extractImageDataFromVideo(
    videoElement: HTMLVideoElement,
    canvas?: HTMLCanvasElement
): ImageData | null {
    if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
        return null;
    }

    const tempCanvas = canvas || document.createElement('canvas');
    tempCanvas.width = videoElement.videoWidth;
    tempCanvas.height = videoElement.videoHeight;

    const ctx = tempCanvas.getContext('2d');
    if (!ctx) {
        return null;
    }

    ctx.drawImage(videoElement, 0, 0, tempCanvas.width, tempCanvas.height);
    return ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
}
