/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { useLiveCommentary } from './hooks/useLiveCommentary';
import { AVAILABLE_VOICES } from './constants';
import ControlBar from './components/ControlBar';
import ParticleBackground from './components/ParticleBackground';
import ChatInterface from './components/ChatInterface';

export type APIKeyStatus = 'checking' | 'ready' | 'missing';
export type CameraPermissionStatus = 'prompt' | 'granted' | 'denied';

/**
 * The main AI Vision Guide application component.
 * It initializes the hook for live AI narration and renders the main UI
 * for screen sharing and controls.
 */
function AIVisionGuideApp() {
    const [selectedVoice, setSelectedVoice] = useState(AVAILABLE_VOICES[0].name);
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [isSharingScreen, setIsSharingScreen] = useState(false);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [apiKeyStatus, setApiKeyStatus] = useState<APIKeyStatus>('checking');
    const [cameraPermissionStatus, setCameraPermissionStatus] = useState<CameraPermissionStatus>('prompt');


    const videoRef = useRef<HTMLVideoElement>(null);
    const {
        commentaryStatus,
        isSessionReady,
        isMicMuted,
        chatMessages,
        isNavigationMode,
        deviceOrientation,
        imageQuality,
        initLiveSession,
        stopLiveSession,
        startScreenShare,
        stopScreenShare,
        startCameraStream,
        stopCameraStream,
        toggleMicMute,
        toggleNavigationMode
    } = useLiveCommentary();

    useEffect(() => {
        // Check API Key
        console.log("Checking API Key:", process.env.API_KEY ? "Found" : "Missing");
        if (process.env.API_KEY && process.env.API_KEY.length > 0) {
            setApiKeyStatus('ready');
        } else {
            setApiKeyStatus('missing');
            console.error("API Key is missing! Check your .env.local file.");
        }

        // Check Camera Permissions on load
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                setCameraPermissionStatus('granted');
                // We requested the stream just to check permission, so we should stop it immediately.
                stream.getTracks().forEach(track => track.stop());
            })
            .catch(err => {
                console.error("Camera permission denied:", err);
                setCameraPermissionStatus('denied');
            });
    }, []);

    const handleToggleSession = async () => {
        console.log("handleToggleSession called, isSessionActive:", isSessionActive);
        if (isSessionActive) {
            console.log("Stopping session...");
            await stopLiveSession();
            // The onclose handler in the hook will reset status and streams.
            setIsSessionActive(false);
            setIsSharingScreen(false);
            setIsCameraActive(false);
        } else {
            if (apiKeyStatus !== 'ready') {
                console.error("Cannot start session: API key is missing.");
                return;
            }
            console.log("Starting session with voice:", selectedVoice);
            try {
                await initLiveSession(selectedVoice);
                console.log("Session initialized successfully");
                setIsSessionActive(true);
            } catch (e) {
                console.error("Failed to initialize commentary session:", e);
                setIsSessionActive(false);
            }
        }
    };

    const handleToggleScreenShare = async () => {
        if (isSharingScreen) {
            await stopScreenShare();
            setIsSharingScreen(false);
        } else {
            if (isCameraActive) {
                await stopCameraStream();
                setIsCameraActive(false);
            }
            if (videoRef.current) {
                try {
                    await startScreenShare(videoRef.current);
                    setIsSharingScreen(true);
                } catch (e) {
                    console.error("Failed to start screen share:", e);
                    setIsSharingScreen(false);
                }
            }
        }
    };

    const handleToggleCamera = async () => {
        if (isCameraActive) {
            await stopCameraStream();
            setIsCameraActive(false);
        } else {
            if (isSharingScreen) {
                await stopScreenShare();
                setIsSharingScreen(false);
            }
            if (videoRef.current) {
                try {
                    await startCameraStream(videoRef.current);
                    setIsCameraActive(true);
                } catch (e) {
                    console.error("Failed to start camera:", e);
                    setIsCameraActive(false);
                }
            }
        }
    };

    const isVideoVisible = isSharingScreen || isCameraActive;

    return (
        <>
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <ParticleBackground />
            <div className="app-container" role="application" aria-label="VCB Vision - AI Vision Assistant">
                <header className="app-header" role="banner">
                    <div className="header-content">
                        <img
                            src="https://i.postimg.cc/gJRb8pvP/logo-transparent-Black-Back.png"
                            alt="VCB Vision - AI powered vision assistance for the blind and visually impaired"
                            className="app-logo"
                        />
                        <div className="header-text">
                            <h1>VCB Vision</h1>
                            <p className="motto">Where vision becomes viable</p>
                        </div>
                    </div>
                </header>

                <main id="main-content" className="main-content" role="main">
                    <div className="screen-share-container">
                        <video
                            ref={videoRef}
                            className="screen-preview"
                            muted
                            autoPlay
                            playsInline
                            style={{ display: isVideoVisible ? 'block' : 'none' }}
                            aria-label="Live video feed from screen or camera"
                        ></video>
                        {!isVideoVisible && (
                            <div className="instructions" role="region" aria-label="Getting started instructions">
                                <h2>Welcome to VCB Vision</h2>
                                <p>
                                    <strong>1.</strong> Ensure your API Key is ready in the status bar below
                                    <br/>
                                    <strong>2.</strong> Click 'Start Session' to connect to Aura, your AI vision assistant
                                    <br />
                                    <strong>3.</strong> Choose 'Start Camera' for walking guidance or 'Share Screen' to read content
                                    <br />
                                    <strong>4.</strong> Aura will describe what she sees with focus on safety and navigation
                                    <br />
                                    <strong>5.</strong> Speak anytime to ask questions or get more details - you can interrupt Aura at any time
                                    <br />
                                    <strong>6.</strong> Use the microphone button to mute/unmute your voice input
                                </p>
                            </div>
                        )}
                    </div>
                </main>

                <ControlBar
                    isSessionActive={isSessionActive}
                    isSessionReady={isSessionReady}
                    onToggleSession={handleToggleSession}
                    commentaryStatus={commentaryStatus}
                    selectedVoice={selectedVoice}
                    onVoiceChange={setSelectedVoice}
                    isSharingScreen={isSharingScreen}
                    onToggleScreenShare={handleToggleScreenShare}
                    isCameraActive={isCameraActive}
                    onToggleCamera={handleToggleCamera}
                    apiKeyStatus={apiKeyStatus}
                    cameraPermissionStatus={cameraPermissionStatus}
                    isMicMuted={isMicMuted}
                    onToggleMicMute={toggleMicMute}
                    isNavigationMode={isNavigationMode}
                    onToggleNavigationMode={toggleNavigationMode}
                />

                {isSessionActive && chatMessages.length > 0 && (
                    <ChatInterface
                        messages={chatMessages}
                        isListening={!isMicMuted && isSessionReady}
                    />
                )}
            </div>
        </>
    );
}

export default AIVisionGuideApp;