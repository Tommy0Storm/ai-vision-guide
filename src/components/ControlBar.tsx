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
    isNavigationMode: boolean;
    onToggleNavigationMode: () => void;
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
    onToggleMicMute,
    isNavigationMode,
    onToggleNavigationMode
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
        <div className="control-bar" role="region" aria-label="Application controls and status">
            <div className="controls-left">
                <div className="status-indicators" role="status" aria-live="polite">
                    <div className={`api-key-status ${apiKeyStatus}`} role="status" aria-live="polite" aria-atomic="true">
                        {apiKeyMessage}
                    </div>
                    <div className="commentary-status" role="status" aria-live="polite" aria-atomic="true">
                        {isLoading ? 'Connecting to AI...' : `AI Status: ${commentaryStatus || 'Idle'}`}
                    </div>
                </div>
                <label htmlFor="voice-selector" className="visually-hidden">Select AI voice</label>
                <select
                    id="voice-selector"
                    className="voice-selector"
                    value={selectedVoice}
                    onChange={(e) => onVoiceChange(e.target.value)}
                    disabled={isSessionActive || isLoading}
                    aria-label="Select Aura's voice - Change before starting session"
                    aria-describedby="voice-help"
                >
                    {AVAILABLE_VOICES.map(voice => (
                        <option key={voice.name} value={voice.name}>{voice.label}</option>
                    ))}
                </select>
                <span id="voice-help" className="visually-hidden">Voice can only be changed when session is stopped</span>
            </div>
            <div className="controls-right" role="group" aria-label="Session controls">
                <button
                    onClick={onToggleNavigationMode}
                    className={`control-button ${isNavigationMode ? 'active' : 'inactive'}`}
                    disabled={!isSessionActive || !isCameraActive}
                    aria-label={isNavigationMode ? 'Deactivate navigation mode - return to normal descriptions' : 'Activate navigation mode - get short clear walking directions'}
                    aria-pressed={isNavigationMode}
                    title={isNavigationMode ? 'ON: Short walking commands' : 'OFF: Activate for walking guidance'}
                >
                    <span className="material-symbols-outlined">navigation</span>
                    {isNavigationMode ? 'Nav ON' : 'Nav OFF'}
                </button>
                <button
                    onClick={onToggleMicMute}
                    className={`control-button ${isMicMuted ? 'inactive' : 'active'}`}
                    disabled={!isSessionActive}
                    aria-label={isMicMuted ? 'Unmute microphone to speak with Aura' : 'Mute microphone - currently listening'}
                    aria-pressed={!isMicMuted}
                    title={isMicMuted ? 'Click to unmute - you can talk to Aura' : 'Click to mute - Aura cannot hear you'}
                >
                    <span className="material-symbols-outlined">{isMicMuted ? 'mic_off' : 'mic'}</span>
                    {isMicMuted ? 'Mic Off' : 'Mic On'}
                </button>
                <button
                    onClick={onToggleCamera}
                    className={cameraButtonClass}
                    disabled={isCameraButtonDisabled}
                    aria-label={isCameraActive ? 'Stop camera feed' : isCameraDenied ? 'Camera access denied - check browser permissions' : 'Start camera for walking guidance and navigation'}
                    aria-pressed={isCameraActive}
                >
                    <span className="material-symbols-outlined">{isCameraActive ? 'videocam_off' : isCameraDenied ? 'block' : 'videocam'}</span>
                    {isCameraActive ? 'Stop Camera' : isCameraDenied ? 'Camera Denied' : 'Start Camera'}
                </button>
                <button
                    onClick={onToggleScreenShare}
                    className={shareButtonClass}
                    disabled={areStreamButtonsDisabled}
                    aria-label={isSharingScreen ? 'Stop screen sharing' : 'Share screen for reading and document assistance'}
                    aria-pressed={isSharingScreen}
                >
                    <span className="material-symbols-outlined">{isSharingScreen ? 'stop_screen_share' : 'screen_share'}</span>
                    {isSharingScreen ? 'Stop Sharing' : 'Share Screen'}
                </button>
                <button
                    onClick={onToggleSession}
                    className={sessionButtonClass}
                    disabled={isLoading || (apiKeyStatus !== 'ready' && !isSessionActive)}
                    aria-label={isSessionActive ? 'Stop AI session and disconnect from Aura' : 'Start AI session and connect to Aura'}
                    aria-pressed={isSessionActive}
                >
                    <span className="material-symbols-outlined">{isSessionActive ? 'stop' : 'play_arrow'}</span>
                    {isSessionActive ? 'Stop Session' : 'Start Session'}
                </button>
            </div>
        </div>
    );
};

export default ControlBar;