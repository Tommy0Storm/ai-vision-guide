/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef } from 'react';
import { useLiveCommentary } from './hooks/useLiveCommentary';
import { AVAILABLE_VOICES } from './constants';
import ControlBar from './components/StartButton';

/**
 * The main AI Vision Guide application component.
 * It initializes the hook for live AI narration and renders the main UI 
 * for screen sharing and controls.
 */
function AIVisionGuideApp() {
    const [selectedVoice, setSelectedVoice] = useState(AVAILABLE_VOICES[0].name);
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [isSharingScreen, setIsSharingScreen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const commentary = useLiveCommentary();
    
    const handleToggleSession = async () => {
        if (isSessionActive) {
            // If stopping session, also stop screen share
            if (isSharingScreen) {
                await commentary.stopScreenShare();
                setIsSharingScreen(false);
            }
            // The onclose callback in the hook will handle session cleanup.
            // We can just update the state here.
            setIsSessionActive(false);
        } else {
            // Start session
            try {
                await commentary.initLiveSession(selectedVoice);
                setIsSessionActive(true);
            } catch (e) {
                console.error("Failed to initialize commentary session:", e);
                setIsSessionActive(false); // Ensure state is correct on failure
            }
        }
    };

    const handleToggleScreenShare = async () => {
        if (isSharingScreen) {
            await commentary.stopScreenShare();
            setIsSharingScreen(false);
        } else {
            if (videoRef.current) {
                try {
                    await commentary.startScreenShare(videoRef.current);
                    setIsSharingScreen(true);
                } catch (e) {
                    console.error("Failed to start screen share:", e);
                    // User likely cancelled the prompt.
                    setIsSharingScreen(false);
                }
            }
        }
    };

    return (
        <div className="app-container">
            <header className="app-header">
                <h1>AI Vision Guide</h1>
            </header>

            <main className="main-content">
                <div className="screen-share-container">
                    <video 
                        ref={videoRef} 
                        className="screen-preview" 
                        muted 
                        autoPlay 
                        playsInline
                        style={{ display: isSharingScreen ? 'block' : 'none' }}
                        aria-label="Screen share preview"
                    ></video>
                    {!isSharingScreen && (
                        <div className="instructions">
                            <h2>Welcome to the AI Vision Guide</h2>
                            <p>
                                1. Click 'Start Session' to connect to your AI guide.
                                <br />
                                2. Click 'Share Screen' and choose the window or screen you want described.
                                <br />
                                3. Your AI guide will begin describing what it sees and can answer your questions.
                            </p>
                        </div>
                    )}
                </div>
            </main>
            
            <ControlBar
                isSessionActive={isSessionActive}
                onToggleSession={handleToggleSession}
                commentaryStatus={commentary.commentaryStatus}
                selectedVoice={selectedVoice}
                onVoiceChange={setSelectedVoice}
                isSharingScreen={isSharingScreen}
                onToggleScreenShare={handleToggleScreenShare}
            />
        </div>
    );
}

export default AIVisionGuideApp;