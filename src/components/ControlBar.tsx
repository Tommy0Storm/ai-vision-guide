/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { AVAILABLE_VOICES } from '../constants';
import { APIKeyStatus, CameraPermissionStatus } from '../AIVisionGuideApp';

interface ControlBarProps {
    isSessionActive: boolean;
    isSessionReady: boolean;
    onToggleSession: () => void;
    commentaryStatus: string;
    selectedVoice: string;
    onVoiceChange: (voice: string) => void;
    isSharingScreen: boolean;
    onToggleScreenShare: () => void;
    isCameraActive: boolean;
    onToggleCamera: () => void;
    apiKeyStatus: APIKeyStatus;
    cameraPermissionStatus: CameraPermissionStatus;
    isMicMuted: boolean;
    onToggleMicMute: () => void;
}

const ControlBar: React.FC<ControlBarProps> = ({
    isSessionActive,
    isSessionReady,
    onToggleSession,
    commentaryStatus,
    selectedVoice,
    onVoiceChange,
    isSharingScreen,
    onToggleScreenShare,
    isCameraActive,
    onToggleCamera,
    apiKeyStatus,
    cameraPermissionStatus,
    isMicMuted,
    onToggleMicMute
}) => {
    const isLoading = commentaryStatus.startsWith("🔌");
    const sessionButtonText = isSessionActive ? 'Stop Session' : 'Start Session';
    const sessionButtonClass = isSessionActive ? 'control-button active' : 'control-button inactive';
    
    const shareButtonText = isSharingScreen ? 'Stop Sharing' : 'Share Screen';
    const shareButtonClass = `control-button share-screen ${isSharingScreen ? 'active' : 'inactive'}`;

    const isCameraDenied = cameraPermissionStatus === 'denied';
    const cameraButtonText = isCameraActive ? 'Stop Camera' : (isCameraDenied ? 'Camera Denied' : 'Start Camera');
    const cameraButtonClass = `control-button share-screen ${isCameraActive ? 'active' : 'inactive'} ${isCameraDenied ? 'permission-denied' : ''}`;

    const apiKeyMessage = {
        checking: 'Checking API Key...',
        ready: 'API Key Ready',
        missing: 'API Key Missing'
    }[apiKeyStatus];

    const areStreamButtonsDisabled = !isSessionActive || !isSessionReady;
    const isCameraButtonDisabled = areStreamButtonsDisabled || isCameraDenied;

    return (
        <div className="control-bar">
            <div className="controls-left">
                <div className="status-indicators">
                    <div className={`api-key-status ${apiKeyStatus}`} aria-live="polite">
                        {apiKeyMessage}
                    </div>
                    <div className="commentary-status" aria-live="polite">
                        {isLoading ? 'Connecting...' : `AI Status: ${commentaryStatus || 'Idle'}`}
                    </div>
                </div>
                <select
                    className="voice-selector"
                    value={selectedVoice}
                    onChange={(e) => onVoiceChange(e.target.value)}
                    disabled={isSessionActive || isLoading}
                    aria-label="Select guide's voice"
                >
                    {AVAILABLE_VOICES.map(voice => (
                        <option key={voice.name} value={voice.name}>{voice.label}</option>
                    ))}
                </select>
            </div>
            <div className="controls-right">
                <button
                    onClick={onToggleMicMute}
                    className={`control-button ${isMicMuted ? 'inactive' : 'active'}`}
                    disabled={!isSessionActive}
                    aria-label={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                    title={isMicMuted ? 'Click to unmute - you can talk to the AI' : 'Click to mute - AI cannot hear you'}
                >
                    {isMicMuted ? 'Mic Off' : 'Mic On'}
                </button>
                <button
                    onClick={onToggleCamera}
                    className={cameraButtonClass}
                    disabled={isCameraButtonDisabled}
                    aria-label={cameraButtonText}
                >
                    {cameraButtonText}
                </button>
                <button
                    onClick={onToggleScreenShare}
                    className={shareButtonClass}
                    disabled={areStreamButtonsDisabled}
                    aria-label={shareButtonText}
                >
                    {shareButtonText}
                </button>
                <button
                    onClick={onToggleSession}
                    className={sessionButtonClass}
                    disabled={isLoading || (apiKeyStatus !== 'ready' && !isSessionActive)}
                    aria-label={sessionButtonText}
                >
                    {sessionButtonText}
                </button>
            </div>
        </div>
    );
};

export default ControlBar;