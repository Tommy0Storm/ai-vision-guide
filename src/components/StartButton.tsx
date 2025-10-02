/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { AVAILABLE_VOICES } from '../constants';

interface ControlBarProps {
    isSessionActive: boolean;
    onToggleSession: () => void;
    commentaryStatus: string;
    selectedVoice: string;
    onVoiceChange: (voice: string) => void;
    isSharingScreen: boolean;
    onToggleScreenShare: () => void;
}

const ControlBar: React.FC<ControlBarProps> = ({ 
    isSessionActive, 
    onToggleSession, 
    commentaryStatus, 
    selectedVoice, 
    onVoiceChange,
    isSharingScreen,
    onToggleScreenShare
}) => {

    const isLoading = commentaryStatus.startsWith("🔌");
    const sessionButtonText = isSessionActive ? 'Stop Session' : 'Start Session';
    const sessionButtonClass = isSessionActive ? 'control-button active' : 'control-button inactive';
    const shareButtonText = isSharingScreen ? 'Stop Sharing' : 'Share Screen';
    const shareButtonClass = `control-button share-screen ${isSharingScreen ? 'active' : 'inactive'}`;

    return (
        <div className="control-bar">
            <div className="controls-left">
                <div className="commentary-status" aria-live="polite">
                    {isLoading ? 'Connecting...' : `AI Status: ${commentaryStatus || 'Idle'}`}
                </div>
                <select
                    className="voice-selector"
                    value={selectedVoice}
                    onChange={(e) => onVoiceChange(e.target.value)}
                    disabled={isSessionActive || isLoading}
                    aria-label="Select commentary voice"
                >
                    {AVAILABLE_VOICES.map(voice => (
                        <option key={voice.name} value={voice.name}>{voice.label}</option>
                    ))}
                </select>
            </div>
            <div className="controls-right">
                <button
                    onClick={onToggleScreenShare}
                    className={shareButtonClass}
                    disabled={!isSessionActive || isLoading}
                    aria-label={shareButtonText}
                >
                    {shareButtonText}
                </button>
                <button
                    onClick={onToggleSession}
                    className={sessionButtonClass}
                    disabled={isLoading}
                    aria-label={sessionButtonText}
                >
                    {sessionButtonText}
                </button>
            </div>
        </div>
    );
};

export default ControlBar;