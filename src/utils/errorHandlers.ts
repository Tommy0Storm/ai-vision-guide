/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { errorLogger, type ErrorSeverity } from './errorLogger';

export type MediaErrorType =
    | 'permission-denied'
    | 'device-not-found'
    | 'device-in-use'
    | 'security-error'
    | 'overconstrained'
    | 'unknown';

export interface MediaErrorState {
    hasError: boolean;
    errorType: MediaErrorType;
    errorMessage: string;
    userMessage: string;
    userGuidance: string;
    canRetry: boolean;
    retryDelay: number; // milliseconds
}

export interface NetworkErrorState {
    hasError: boolean;
    errorCode?: number;
    errorMessage: string;
    userMessage: string;
    canReconnect: boolean;
    shouldRetry: boolean;
}

export interface AudioErrorState {
    hasError: boolean;
    errorMessage: string;
    userMessage: string;
    canRecover: boolean;
    recoveryAction: string;
}

/**
 * Handle camera/microphone access errors
 */
export function handleMediaError(error: Error, deviceType: 'camera' | 'microphone'): MediaErrorState {
    const errorName = error.name;
    const device = deviceType === 'camera' ? 'Camera' : 'Microphone';
    let errorType: MediaErrorType = 'unknown';
    let userMessage = '';
    let userGuidance = '';
    let canRetry = false;
    let retryDelay = 0;

    switch (errorName) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            errorType = 'permission-denied';
            userMessage = `${device} access denied`;
            userGuidance = getPermissionGuidance(deviceType);
            canRetry = true;
            retryDelay = 0; // User can retry immediately after granting permission
            break;

        case 'NotFoundError':
        case 'DevicesNotFoundError':
            errorType = 'device-not-found';
            userMessage = `No ${deviceType} detected`;
            userGuidance = `Please connect a ${deviceType} and try again`;
            canRetry = true;
            retryDelay = 2000;
            break;

        case 'NotReadableError':
        case 'TrackStartError':
            errorType = 'device-in-use';
            userMessage = `${device} is being used by another application`;
            userGuidance = `Close other apps using the ${deviceType} and try again`;
            canRetry = true;
            retryDelay = 3000;
            break;

        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
            errorType = 'overconstrained';
            userMessage = `${device} doesn't meet requirements`;
            userGuidance = `Your ${deviceType} may not support the required settings`;
            canRetry = false;
            break;

        case 'SecurityError':
            errorType = 'security-error';
            userMessage = `${device} blocked by security policy`;
            userGuidance = 'Ensure you are on a secure HTTPS connection';
            canRetry = false;
            break;

        default:
            errorType = 'unknown';
            userMessage = `${device} error occurred`;
            userGuidance = 'Please try again or restart your browser';
            canRetry = true;
            retryDelay = 2000;
    }

    // Log the error
    errorLogger.log(
        'media',
        errorType === 'permission-denied' ? 'warning' : 'critical',
        `${device} error: ${errorName}`,
        error,
        { deviceType, errorType }
    );

    return {
        hasError: true,
        errorType,
        errorMessage: error.message,
        userMessage,
        userGuidance,
        canRetry,
        retryDelay
    };
}

/**
 * Get OS-specific permission guidance
 */
function getPermissionGuidance(deviceType: 'camera' | 'microphone'): string {
    const userAgent = navigator.userAgent.toLowerCase();
    const device = deviceType === 'camera' ? 'Camera' : 'Microphone';

    // Detect OS
    if (userAgent.includes('mac')) {
        return `Mac: Open System Settings → Privacy & Security → ${device} → Enable for your browser`;
    } else if (userAgent.includes('win')) {
        return `Windows: Open Settings → Privacy → ${device} → Allow apps to access your ${deviceType}`;
    } else if (userAgent.includes('android')) {
        return `Android: Open Settings → Apps → Browser → Permissions → ${device} → Allow`;
    } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
        return `iOS: Open Settings → Browser → ${device} → Allow`;
    }

    // Detect Browser
    if (userAgent.includes('chrome')) {
        return `Chrome: Click the ${deviceType === 'camera' ? 'camera' : 'microphone'} icon in the address bar → Allow`;
    } else if (userAgent.includes('firefox')) {
        return `Firefox: Click the ${deviceType} icon in the address bar → Allow`;
    } else if (userAgent.includes('safari')) {
        return `Safari: Go to Safari → Settings for This Website → ${device} → Allow`;
    }

    return `Grant ${deviceType} permission in your browser settings`;
}

/**
 * Handle WebSocket connection errors
 */
export function handleWebSocketError(event: Event, closeCode?: number): NetworkErrorState {
    let errorMessage = 'WebSocket connection error';
    let userMessage = 'Connection to AI service lost';
    let canReconnect = true;
    let shouldRetry = true;

    // Handle close codes
    if (closeCode) {
        switch (closeCode) {
            case 1000: // Normal closure
                userMessage = 'Session ended normally';
                shouldRetry = false;
                break;
            case 1001: // Going away
                errorMessage = 'Server going away';
                userMessage = 'Server is restarting';
                break;
            case 1006: // Abnormal closure
                errorMessage = 'Connection lost unexpectedly';
                userMessage = 'Network connection lost';
                break;
            case 1008: // Policy violation
                errorMessage = 'Connection blocked by policy';
                userMessage = 'Connection blocked - check API key';
                canReconnect = false;
                shouldRetry = false;
                break;
            case 1011: // Server error
                errorMessage = 'Server encountered an error';
                userMessage = 'AI service temporarily unavailable';
                break;
            default:
                errorMessage = `Connection closed with code ${closeCode}`;
                userMessage = 'Connection interrupted';
        }
    }

    errorLogger.log(
        'network',
        closeCode === 1008 ? 'critical' : 'warning',
        errorMessage,
        undefined,
        { closeCode, event: event.type }
    );

    return {
        hasError: true,
        errorCode: closeCode,
        errorMessage,
        userMessage,
        canReconnect,
        shouldRetry
    };
}

/**
 * Handle Audio Context errors
 */
export function handleAudioContextError(error: Error, contextType: 'input' | 'output'): AudioErrorState {
    const context = contextType === 'input' ? 'Microphone audio' : 'Speaker audio';
    let userMessage = '';
    let canRecover = false;
    let recoveryAction = '';

    if (error.message.includes('suspended')) {
        userMessage = `${context} suspended`;
        canRecover = true;
        recoveryAction = 'resume';
    } else if (error.message.includes('AudioWorklet')) {
        userMessage = 'Audio processing failed';
        canRecover = true;
        recoveryAction = 'reload-worklet';
    } else if (error.message.includes('decodeAudioData')) {
        userMessage = 'Audio data corrupted';
        canRecover = false;
        recoveryAction = 'skip';
    } else {
        userMessage = `${context} error`;
        canRecover = true;
        recoveryAction = 'recreate';
    }

    errorLogger.log(
        'audio',
        canRecover ? 'warning' : 'critical',
        `Audio context error: ${error.message}`,
        error,
        { contextType, recoveryAction }
    );

    return {
        hasError: true,
        errorMessage: error.message,
        userMessage,
        canRecover,
        recoveryAction
    };
}

/**
 * Handle device orientation/sensor errors
 */
export function handleOrientationError(error: Error): AudioErrorState {
    let userMessage = 'Device orientation unavailable';
    let canRecover = false;
    let recoveryAction = 'continue-without';

    if (error.message.includes('permission')) {
        userMessage = 'Orientation permission denied';
        canRecover = true;
        recoveryAction = 'request-permission';
    } else if (error.message.includes('not supported')) {
        userMessage = 'Orientation sensors not available';
        canRecover = false;
        recoveryAction = 'feature-unavailable';
    }

    errorLogger.log(
        'sensor',
        canRecover ? 'info' : 'warning',
        `Orientation error: ${error.message}`,
        error
    );

    return {
        hasError: true,
        errorMessage: error.message,
        userMessage,
        canRecover,
        recoveryAction
    };
}

/**
 * Handle generic API errors
 */
export function handleAPIError(error: Error, endpoint?: string): NetworkErrorState {
    let userMessage = 'AI service error';
    let shouldRetry = true;

    if (error.message.includes('401') || error.message.includes('403')) {
        userMessage = 'Invalid API key';
        shouldRetry = false;
    } else if (error.message.includes('429')) {
        userMessage = 'Too many requests - please wait';
        shouldRetry = true;
    } else if (error.message.includes('500') || error.message.includes('503')) {
        userMessage = 'AI service temporarily down';
        shouldRetry = true;
    }

    errorLogger.log(
        'api',
        shouldRetry ? 'warning' : 'critical',
        `API error: ${error.message}`,
        error,
        { endpoint }
    );

    return {
        hasError: true,
        errorMessage: error.message,
        userMessage,
        canReconnect: shouldRetry,
        shouldRetry
    };
}
