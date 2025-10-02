/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { decode, decodeAudioData, createPCMBlob } from '../utils/audioUtils';
import { orientationTracker, type OrientationData } from '../utils/orientationTracker';
import { audioFeedback } from '../utils/audioFeedback';
import { analyzeImageQuality, extractImageDataFromVideo, type ImageQualityResult } from '../utils/imageQuality';
import { haptics } from '../utils/haptics';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const normalSystemPrompt = `You are 'Aura', an AI vision assistant for visually impaired and blind users. Your purpose is to be their eyes, providing real-time visual descriptions.

**DEFAULT MODE:**
- Describe what you see in detail
- Read visible text clearly, in logical order
- Describe UI elements, buttons, menus with their positions
- Answer user questions directly and immediately
- Keep responses conversational but informative

**IMAGE QUALITY CHECK:**
- If image is blurry, very dark, or overexposed: Say "Camera needs adjustment" then give guidance
- Too dark/blurry: "Lift phone up" or "Move to brighter area"
- Too bright: "Move away from light" or "Tilt phone down"
- Camera blocked/obscured: "Camera obscured - clear view needed"

**When camera starts**: Say "Camera active. I can see [brief description]."

REMEMBER: You are someone's eyes. Be accurate, clear, and helpful.`;

const navigationSystemPrompt = `You are 'Aura' in NAVIGATION MODE. Give SHORT, CLEAR walking directions with DISTANCE ESTIMATES.

**CRITICAL RULES:**
1. **BE BRIEF**: Use 3-5 word commands maximum
2. **ALWAYS INCLUDE DISTANCE**: Estimate distance to nearest obstacle/hazard in meters or feet
3. **IMMEDIATE HAZARDS**: "STOP. Wall one meter" or "STOP. Stairs two feet"
4. **URGENCY BY DISTANCE**:
   - Under 1 meter (3 feet): "STOP" + hazard
   - 1-3 meters (3-10 feet): State hazard + distance
   - Over 3 meters (10+ feet): "Clear ahead" or direction
5. **CLEAR DIRECTIONS**: "Turn left", "Move right", "Door straight"
6. **CLOCK POSITIONS**: "Obstacle two o'clock, two meters"

**IMAGE QUALITY - PRIORITY CHECK:**
- If image blurry/dark: "Lift phone up"
- If too bright: "Tilt phone down"
- If camera obscured: "Camera blocked. Adjust angle"
- Check BEFORE giving navigation commands

**DISTANCE EXAMPLES:**
- "STOP. Wall half meter"
- "Person ahead. Two meters"
- "Clear path. Five meters"
- "Stairs down. One meter"
- "Door straight. Three meters"
- "Obstacle right. Four feet"

**URGENCY LEVELS:**
- CRITICAL (< 1m): "STOP. [hazard] [distance]"
- HIGH (1-2m): "[Hazard] ahead. [distance]"
- MEDIUM (2-3m): "[Object]. [distance]"
- LOW (3m+): "Clear ahead" or direction

**DO NOT:**
- Give long explanations
- Describe colors or unnecessary details
- Omit distance measurements
- Repeat unless asked

**SAFETY FIRST**: Image quality → Closer objects = MORE URGENT. Always estimate distance. Keep under 5 words.

You are a distance-aware walking GPS. SHORT. CLEAR. MEASURED. SAFE.`;


const FRAME_RATE = 1 / 2; // Send frame every 2 seconds (0.5 fps) - faster for navigation
const JPEG_QUALITY = 0.7;
const AUDIO_BUFFER_GAP_MS = 80; // Safety margin between audio chunks to prevent stuttering

/**
 * Custom hook to manage all Gemini Live API interactions for commentary.
 */
export interface ChatMessage {
    type: 'user' | 'ai';
    text: string;
    timestamp: Date;
}

export function useLiveCommentary() {
    const [commentaryStatus, setCommentaryStatus] = useState('');
    const [isSessionReady, setIsSessionReady] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(false); // Changed to false - mic active by default
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isNavigationMode, setIsNavigationMode] = useState(false);
    const outputAudioCtxRef = useRef<AudioContext | null>(null);
    const inputAudioCtxRef = useRef<AudioContext | null>(null);
    const liveSessionRef = useRef<any | null>(null);
    const nextStartTimeRef = useRef(0);
    const isAudioPlayingRef = useRef(false);
    const activeSourcesRef = useRef(new Set<AudioBufferSourceNode>());
    const isMicMutedRef = useRef(false); // Add ref to track mute state without stale closures

    // Refs for screen and audio input streaming
    const screenStreamRef = useRef<MediaStream | null>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const microphoneStreamRef = useRef<MediaStream | null>(null);
    const canvasElRef = useRef<HTMLCanvasElement | null>(null);
    const frameIntervalRef = useRef<number | null>(null);
    const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
    const promptIntervalRef = useRef<number | null>(null);
    const frameCountRef = useRef(0);

    const messageQueueRef = useRef<any[]>([]);
    const isProcessingQueueRef = useRef(false);

    // Barge-in detection refs
    const userSpeechDetectedRef = useRef(false);
    const lastUserSpeechTimeRef = useRef(0);
    const SPEECH_ENERGY_THRESHOLD = 0.01; // Adjust based on testing
    const SPEECH_COOLDOWN_MS = 1000; // Prevent multiple triggers

    // Distance-based urgency tracking
    const [detectedDistance, setDetectedDistance] = useState<number | null>(null);
    const [urgencyLevel, setUrgencyLevel] = useState<'critical' | 'high' | 'medium' | 'low'>('low');

    // Orientation and image quality tracking
    const [deviceOrientation, setDeviceOrientation] = useState<OrientationData | null>(null);
    const [imageQuality, setImageQuality] = useState<ImageQualityResult | null>(null);
    const orientationCheckIntervalRef = useRef<number | null>(null);

    // Audio health tracking
    const audioChunkCounterRef = useRef(0);
    const micChunkCounterRef = useRef(0);
    const lastAudioReceivedRef = useRef(0);

    const initAudioContexts = useCallback(async () => {
        // Initialize output audio context with larger buffer for stability
        if (!outputAudioCtxRef.current) {
            outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 24000,
                latencyHint: 'playback' // Optimize for stable playback over low latency
            });
        }
        // Initialize input audio context with optimal settings
        if (!inputAudioCtxRef.current) {
            inputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 16000,
                latencyHint: 'interactive' // Low latency for real-time mic input
            });
        }
        if (outputAudioCtxRef.current.state === 'suspended') {
            try {
                await outputAudioCtxRef.current.resume();
                console.log("Output AudioContext resumed");
            } catch (e) {
                console.warn("Output AudioContext resume failed:", e);
                throw e;
            }
        }
        if (inputAudioCtxRef.current.state === 'suspended') {
            try {
                await inputAudioCtxRef.current.resume();
                console.log("Input AudioContext resumed");
            } catch (e) {
                console.warn("Input AudioContext resume failed:", e);
                throw e;
            }
        }
    }, []);

    const stopAndClearAudio = useCallback(() => {
        activeSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) { /* Ignore */ } });
        activeSourcesRef.current.clear();
        isAudioPlayingRef.current = false;
    }, []);

    // Parse distance from AI text and set urgency
    const parseDistanceAndSetUrgency = useCallback((text: string) => {
        const lowerText = text.toLowerCase();

        // Extract distance in meters or feet
        const meterMatch = lowerText.match(/(\d+\.?\d*)\s*(meter|metre|m\b)/i);
        const feetMatch = lowerText.match(/(\d+\.?\d*)\s*(feet|foot|ft\b)/i);

        let distanceInMeters: number | null = null;

        if (meterMatch) {
            distanceInMeters = parseFloat(meterMatch[1]);
        } else if (feetMatch) {
            distanceInMeters = parseFloat(feetMatch[1]) * 0.3048; // Convert feet to meters
        }

        // Detect "half meter" or "one and a half"
        if (lowerText.includes('half meter') || lowerText.includes('half metre')) {
            distanceInMeters = 0.5;
        }

        setDetectedDistance(distanceInMeters);

        // Set urgency level based on distance
        if (distanceInMeters !== null) {
            let newUrgency: 'critical' | 'high' | 'medium' | 'low';
            if (distanceInMeters < 1) {
                newUrgency = 'critical';
            } else if (distanceInMeters < 2) {
                newUrgency = 'high';
            } else if (distanceInMeters < 3) {
                newUrgency = 'medium';
            } else {
                newUrgency = 'low';
            }

            setUrgencyLevel(newUrgency);
            console.log(`📏 Distance detected: ${distanceInMeters.toFixed(1)}m - Urgency: ${newUrgency}`);

            // Play distance-coded audio feedback and haptics in navigation mode
            if (isNavigationMode) {
                audioFeedback.playDistanceBeep(distanceInMeters);
                haptics.vibrateForUrgency(newUrgency);

                // Play attention alert for critical distances
                if (newUrgency === 'critical') {
                    audioFeedback.playAttentionAlert();
                    haptics.vibrateAlert();
                }
            }
        }

        // Check for STOP command
        if (lowerText.includes('stop')) {
            setUrgencyLevel('critical');
            console.log('🛑 CRITICAL: STOP command detected');

            // Play critical alert and haptics for STOP commands
            if (isNavigationMode) {
                audioFeedback.playAttentionAlert();
                haptics.vibrateAlert();
            }
        }
    }, [isNavigationMode]);

    // Detect user speech energy for barge-in
    const detectUserSpeech = useCallback((audioData: Int16Array) => {
        // Calculate RMS (root mean square) energy
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            const normalized = audioData[i] / 32768.0; // Normalize to -1 to 1
            sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / audioData.length);

        const now = Date.now();
        const timeSinceLastSpeech = now - lastUserSpeechTimeRef.current;

        // If speech detected above threshold and AI is currently speaking
        if (rms > SPEECH_ENERGY_THRESHOLD &&
            isAudioPlayingRef.current &&
            timeSinceLastSpeech > SPEECH_COOLDOWN_MS &&
            !isMicMutedRef.current) {

            console.log("🛑 BARGE-IN DETECTED - User is speaking, stopping AI audio");
            lastUserSpeechTimeRef.current = now;

            // Immediately stop all AI audio playback
            stopAndClearAudio();

            // Clear the message queue to prevent stale audio from playing
            messageQueueRef.current = [];

            // Reset the next start time
            if (outputAudioCtxRef.current) {
                nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
            }

            // Update status
            setCommentaryStatus(isSessionReady ? "👂 Listening..." : "⚠️ Disconnected");
        }
    }, [stopAndClearAudio, isSessionReady]);

    const processMessageQueue = useCallback(async () => {
        if (isProcessingQueueRef.current || messageQueueRef.current.length === 0) return;
        isProcessingQueueRef.current = true;
    
        const message = messageQueueRef.current.shift();
    
        if (message) {
            // Handle interruption signal from the server for effective buffer management.
            if (message.serverContent?.interrupted) {
                console.log("AI speech interrupted. Clearing audio buffer.");
                stopAndClearAudio(); // Stop all currently playing/scheduled audio
                if (outputAudioCtxRef.current) {
                    nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
                }
                messageQueueRef.current = []; // Discard rest of the stale audio chunks
            }
            
            // Handle user turn (speech transcript from microphone)
            const userTurn = message.serverContent?.turnComplete;
            if (userTurn) {
                console.log("👤 User turn detected:", userTurn);
            }

            // Check for user speech transcript
            const userMessage = message.serverContent?.modelTurn?.parts?.find((p: any) =>
                p.text && message.serverContent?.modelTurn?.role === 'user'
            );
            if (userMessage?.text) {
                const userText = userMessage.text;
                console.log(`🎤 User said: "${userText}"`);

                setChatMessages(prev => [...prev.slice(-49), {
                    type: 'user',
                    text: userText,
                    timestamp: new Date()
                }]);
            }

            // Process audio if present in the message
            if (outputAudioCtxRef.current?.state === 'running') {
                const modelTurn = message.serverContent?.modelTurn;

                // Extract text from AI response for chat display
                const textPart = modelTurn?.parts.find((p: any) => p.text);
                if (textPart?.text && modelTurn?.role !== 'user') {
                    const aiText = textPart.text;

                    setChatMessages(prev => [...prev.slice(-49), {
                        type: 'ai',
                        text: aiText,
                        timestamp: new Date()
                    }]);

                    // Parse distance and set urgency when in navigation mode
                    parseDistanceAndSetUrgency(aiText);

                    // Voice command detection - check for navigation mode activation
                    const lowerText = textPart.text.toLowerCase();
                    if (lowerText.includes('navigation mode') ||
                        lowerText.includes('start navigation') ||
                        lowerText.includes('activate navigation')) {
                        console.log("📍 Navigation mode activated via voice command");
                        setIsNavigationMode(true);
                        setCommentaryStatus("🧭 Navigation Mode");
                    } else if (lowerText.includes('stop navigation') ||
                               lowerText.includes('exit navigation') ||
                               lowerText.includes('normal mode')) {
                        console.log("📍 Navigation mode deactivated");
                        setIsNavigationMode(false);
                        setCommentaryStatus("🎙️ Normal Mode");
                    }
                }

                const audioPart = modelTurn?.parts.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));

                if (audioPart?.inlineData?.data) {
                    audioChunkCounterRef.current++;
                    const chunkNumber = audioChunkCounterRef.current;
                    lastAudioReceivedRef.current = Date.now();

                    // Calculate safe start time with buffer gap to prevent stuttering
                    const safetyMarginSeconds = AUDIO_BUFFER_GAP_MS / 1000;
                    const currentTime = outputAudioCtxRef.current.currentTime;

                    if (!isAudioPlayingRef.current) {
                        // First chunk: add safety margin
                        nextStartTimeRef.current = Math.max(
                            nextStartTimeRef.current,
                            currentTime + safetyMarginSeconds
                        );
                        console.log(`🎵 Starting first audio chunk #${chunkNumber} at T+${(nextStartTimeRef.current - currentTime).toFixed(3)}s`);
                    } else {
                        // Ensure we don't schedule in the past
                        if (nextStartTimeRef.current < currentTime) {
                            console.warn(`⚠️ Buffer underrun detected! Adjusting schedule from ${nextStartTimeRef.current.toFixed(3)}s to ${(currentTime + safetyMarginSeconds).toFixed(3)}s`);
                            nextStartTimeRef.current = currentTime + safetyMarginSeconds;
                        }
                    }

                    isAudioPlayingRef.current = true;
                    setCommentaryStatus(`🎙️ Speaking...`);

                    const audioBytes = decode(audioPart.inlineData.data);
                    console.log(`📥 Received audio chunk #${chunkNumber}, size: ${audioBytes.length} bytes`);

                    const audioBuffer = await decodeAudioData(audioBytes, outputAudioCtxRef.current, 24000, 1);
                    const source = outputAudioCtxRef.current.createBufferSource();
                    source.buffer = audioBuffer;

                    console.log(`🔊 Scheduling chunk #${chunkNumber} at ${nextStartTimeRef.current.toFixed(3)}s, duration: ${audioBuffer.duration.toFixed(3)}s`);
                    
                    source.onended = () => {
                        activeSourcesRef.current.delete(source);
                        if (activeSourcesRef.current.size === 0) {
                            isAudioPlayingRef.current = false;
                            setCommentaryStatus(isSessionReady ? "🎙️ Ready" : "⚠️ Disconnected");

                            // Clear existing prompt interval to prevent interruption
                            if (promptIntervalRef.current) {
                                window.clearInterval(promptIntervalRef.current);
                                promptIntervalRef.current = null;
                            }

                            // Wait 5 seconds after AI finishes speaking, then send next prompt and restart interval
                            setTimeout(() => {
                                if (liveSessionRef.current && isSessionReady && frameCountRef.current > 0 && !isAudioPlayingRef.current) {
                                    console.log("Sending prompt after AI finished speaking");
                                    liveSessionRef.current.sendRealtimeInput({ text: "What do you see now?" });

                                    // Restart 10-second interval
                                    promptIntervalRef.current = window.setInterval(() => {
                                        if (liveSessionRef.current && isSessionReady && frameCountRef.current > 0 && !isAudioPlayingRef.current) {
                                            console.log("Sending periodic prompt");
                                            liveSessionRef.current.sendRealtimeInput({ text: "What do you see now?" });
                                        }
                                    }, 10000);
                                }
                            }, 5000);
                        }
                    };
        
                    activeSourcesRef.current.add(source);
                    source.connect(outputAudioCtxRef.current.destination);
                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += audioBuffer.duration;
                }
            }
        }
    
        isProcessingQueueRef.current = false;
        // Process next message if the queue was not cleared by an interruption
        if (messageQueueRef.current.length > 0) processMessageQueue();
    }, [isSessionReady, stopAndClearAudio]);

    // To prevent stale closures in the `onmessage` callback.
    const processMessageQueueCallbackRef = useRef(processMessageQueue);
    useEffect(() => {
        processMessageQueueCallbackRef.current = processMessageQueue;
    }, [processMessageQueue]);

    const stopScreenShare = useCallback(async () => {
        if (frameIntervalRef.current) { window.clearInterval(frameIntervalRef.current); frameIntervalRef.current = null; }
        if (promptIntervalRef.current) { window.clearInterval(promptIntervalRef.current); promptIntervalRef.current = null; }
        screenStreamRef.current?.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
    }, []);

    const stopCameraStream = useCallback(async () => {
        if (frameIntervalRef.current) { window.clearInterval(frameIntervalRef.current); frameIntervalRef.current = null; }
        if (promptIntervalRef.current) { window.clearInterval(promptIntervalRef.current); promptIntervalRef.current = null; }
        if (orientationCheckIntervalRef.current) { window.clearInterval(orientationCheckIntervalRef.current); orientationCheckIntervalRef.current = null; }
        cameraStreamRef.current?.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;

        // Stop orientation tracking and audio feedback
        orientationTracker.stop();
        await audioFeedback.dispose();
    }, []);
    
    const cleanupAudioInput = useCallback(() => {
        microphoneStreamRef.current?.getTracks().forEach(track => track.stop());
        microphoneStreamRef.current = null;
        if (audioWorkletNodeRef.current) {
            audioWorkletNodeRef.current.port.close();
            audioWorkletNodeRef.current.disconnect();
            audioWorkletNodeRef.current = null;
        }
    }, []);

    const stopLiveSession = useCallback(async () => {
        setIsSessionReady(false); // Immediately prevent new data from being sent
        setChatMessages([]); // Clear chat history
        if (liveSessionRef.current) {
            try {
                liveSessionRef.current.close();
            } catch (e) {
                console.warn("Error initiating live session close:", e);
                 // Force cleanup if close() fails
                 stopAndClearAudio();
                 liveSessionRef.current = null;
                 setCommentaryStatus("Idle");
                 cleanupAudioInput();
            }
        }
        await stopScreenShare();
        await stopCameraStream();
    }, [stopAndClearAudio, stopScreenShare, stopCameraStream, cleanupAudioInput]);

    const initLiveSession = useCallback(async (voiceName: string) => {
        if (liveSessionRef.current) { await stopLiveSession(); }
        liveSessionRef.current = null; setIsSessionReady(false);
        try { await initAudioContexts(); } catch (e: any) { setCommentaryStatus(`⚠️ Audio Err`); throw e; }

        nextStartTimeRef.current = outputAudioCtxRef.current!.currentTime;
        messageQueueRef.current = [];
        
        try {
            setCommentaryStatus("🔌 Connecting...");

            if (!inputAudioCtxRef.current?.audioWorklet) {
                throw new Error("AudioWorklet is not supported by this browser.");
            }

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: async () => {
                        console.log("WebSocket onopen called!");
                        setIsSessionReady(true);
                        setIsNavigationMode(false);
                        setCommentaryStatus("🎙️ Ready");

                        // Set up microphone with mute control
                        (async () => {
                            try {
                                console.log("Setting up microphone...");
                                await inputAudioCtxRef.current!.audioWorklet.addModule('/ai-vision-guide/audioProcessor.js');

                                microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                                console.log("Microphone access granted");

                                const source = inputAudioCtxRef.current!.createMediaStreamSource(microphoneStreamRef.current);
                                const audioWorkletNode = new AudioWorkletNode(inputAudioCtxRef.current!, 'audio-processor');
                                audioWorkletNodeRef.current = audioWorkletNode;

                                audioWorkletNode.port.onmessage = (event) => {
                                    const pcmData = event.data as Int16Array;

                                    // Always detect user speech for barge-in (even if muted for sending)
                                    detectUserSpeech(pcmData);

                                    // Only send audio to AI if not muted and session is active
                                    if (liveSessionRef.current && !isMicMutedRef.current) {
                                        micChunkCounterRef.current++;
                                        const pcmBlob = createPCMBlob(pcmData);
                                        liveSessionRef.current.sendRealtimeInput({ audio: pcmBlob });

                                        // Log every 50th chunk to avoid spam
                                        if (micChunkCounterRef.current % 50 === 0) {
                                            console.log(`📤 Sent microphone chunk #${micChunkCounterRef.current}, size: ${pcmData.length * 2} bytes (16kHz PCM)`);
                                        }
                                    }
                                };
                                source.connect(audioWorkletNode);
                                audioWorkletNode.connect(inputAudioCtxRef.current!.destination);
                                console.log("Microphone setup complete (active by default)");
                            } catch (err) {
                                console.error("Error setting up microphone:", err);
                                console.warn("Continuing without microphone");
                            }
                        })();
                    },
                    onmessage: (message: any) => {
                        console.log("WebSocket message received:", message);
                        messageQueueRef.current.push(message);
                        processMessageQueueCallbackRef.current();
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error("WebSocket error:", e);
                        stopAndClearAudio();
                        setIsSessionReady(false);
                        setCommentaryStatus(`⚠️ Error`);
                    },
                    onclose: (e) => {
                        console.error("WebSocket closed. Code:", e?.code, "Reason:", e?.reason);
                        stopAndClearAudio();
                        setIsSessionReady(false);
                        liveSessionRef.current = null;
                        setCommentaryStatus("Idle");
                        cleanupAudioInput();
                    },
                },
                config: {
                    systemInstruction: normalSystemPrompt,
                    responseModalities: [Modality.AUDIO, Modality.TEXT], // Enable TEXT for speech transcription
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName } }
                    }
                },
            });
            liveSessionRef.current = await sessionPromise;
            console.log("Session object assigned to ref");

            // Send welcome message
            try {
                console.log("Sending welcome message");
                liveSessionRef.current.sendRealtimeInput({ text: "Say: Hello! I'm Aura, your AI vision assistant. Start your camera or share your screen, and I'll describe what I see. Feel free to interrupt me anytime with questions." });
            } catch (err) {
                console.error("Error sending welcome message:", err);
            }
        } catch (e: any) { console.error("Live connect error:", e); setCommentaryStatus(`⚠️ Connect Err`); throw e; }
    }, [initAudioContexts, stopAndClearAudio, stopLiveSession, cleanupAudioInput, isSessionReady, detectUserSpeech]);

    const startFrameStreaming = useCallback((videoEl: HTMLVideoElement) => {
        if (frameIntervalRef.current) {
            window.clearInterval(frameIntervalRef.current);
        }
        if (promptIntervalRef.current) {
            window.clearInterval(promptIntervalRef.current);
        }

        if (!canvasElRef.current) canvasElRef.current = document.createElement('canvas');
        const canvas = canvasElRef.current;
        const ctx = canvas.getContext('2d');

        frameCountRef.current = 0;

        // Calculate frame rate based on urgency level
        const getFrameInterval = () => {
            if (!isNavigationMode) return 1000 / FRAME_RATE; // 2 seconds default

            switch (urgencyLevel) {
                case 'critical': return 500;   // 0.5 seconds - FASTEST
                case 'high':     return 1000;  // 1 second
                case 'medium':   return 1500;  // 1.5 seconds
                case 'low':      return 2000;  // 2 seconds
                default:         return 1000 / FRAME_RATE;
            }
        };

        // Wait for frames to be sent before prompting
        // First prompt after 5 seconds (enough time for several frames to arrive)
        setTimeout(() => {
            if (liveSessionRef.current && isSessionReady && frameCountRef.current > 0 && !isAudioPlayingRef.current) {
                console.log("Sending initial prompt after frames received");
                liveSessionRef.current.sendRealtimeInput({ text: "Describe what you see." });
            }
        }, 5000);

        // Note: Subsequent prompts are now handled in the audio onended callback
        // to ensure they don't interrupt the AI while speaking

        // Dynamic frame rate - adjusts based on urgency
        const sendFrame = () => {
            if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0 || !isSessionReady) {
                return;
            }
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            ctx!.drawImage(videoEl, 0, 0, videoEl.videoWidth, videoEl.videoHeight);

            // Check image quality before sending
            const imageData = extractImageDataFromVideo(videoEl, canvas);
            if (imageData) {
                const quality = analyzeImageQuality(imageData);
                setImageQuality(quality);

                // If critical image quality issue, play audio cue and log warning
                if (quality.qualityIssue) {
                    console.log(`📸 Image quality issue: ${quality.qualityIssue}`);
                    const orientation = orientationTracker.analyzeOrientation();

                    // Combine image quality and orientation guidance
                    if (orientation.needsAdjustment && orientation.severity === 'critical') {
                        console.log(`📱 Orientation issue: ${orientation.message}`);
                    }
                }
            }

            canvas.toBlob(async (blob) => {
                if (blob && liveSessionRef.current && isSessionReady) {
                    const base64Data = (await new Promise<string>(resolve => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                        reader.readAsDataURL(blob);
                    }));
                    if (liveSessionRef.current && isSessionReady) {
                        frameCountRef.current++;
                        console.log(`Sending frame ${frameCountRef.current} to AI, size: ${base64Data.length} bytes`);
                        // Try both video and media to ensure the frame is sent
                        liveSessionRef.current.sendRealtimeInput({
                            video: { mimeType: 'image/jpeg', data: base64Data }
                        });
                        console.log("Frame sent successfully");
                    }
                }
            }, 'image/jpeg', JPEG_QUALITY);

            // Schedule next frame with dynamic interval
            const nextInterval = getFrameInterval();
            frameIntervalRef.current = window.setTimeout(sendFrame, nextInterval);
        };

        // Start first frame
        sendFrame();
    }, [isSessionReady, isNavigationMode, urgencyLevel]);

    const startScreenShare = useCallback(async (videoEl: HTMLVideoElement) => {
        if (!liveSessionRef.current || !isSessionReady) throw new Error("Live session not ready.");
        console.log("Starting screen share...");
        screenStreamRef.current = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        });
        console.log("Screen share stream obtained:", screenStreamRef.current.getVideoTracks()[0].getSettings());
        videoEl.srcObject = screenStreamRef.current;
        await videoEl.play();
        console.log("Video element playing, dimensions:", videoEl.videoWidth, "x", videoEl.videoHeight);
        startFrameStreaming(videoEl);
    }, [startFrameStreaming, isSessionReady]);

    const startCameraStream = useCallback(async (videoEl: HTMLVideoElement) => {
        if (!liveSessionRef.current || !isSessionReady) throw new Error("Live session not ready.");
        cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true });
        videoEl.srcObject = cameraStreamRef.current;
        await videoEl.play();
        startFrameStreaming(videoEl);

        // Initialize orientation tracking and audio feedback
        await orientationTracker.start((orientation) => {
            setDeviceOrientation(orientation);
        });
        await audioFeedback.init();

        // Check orientation every 2 seconds and provide guidance if needed
        orientationCheckIntervalRef.current = window.setInterval(() => {
            const guidance = orientationTracker.analyzeOrientation();
            if (guidance.needsAdjustment && guidance.severity === 'critical') {
                audioFeedback.playError();
                console.log(`⚠️ Orientation issue: ${guidance.message}`);
            }
        }, 2000);
    }, [startFrameStreaming, isSessionReady]);

    const toggleMicMute = useCallback(() => {
        setIsMicMuted(prev => {
            const newState = !prev;
            isMicMutedRef.current = newState; // Update ref immediately
            console.log("Microphone muted:", newState);
            return newState;
        });
    }, []);

    const toggleNavigationMode = useCallback(() => {
        setIsNavigationMode(prev => {
            const newMode = !prev;
            console.log("Navigation mode:", newMode ? "ON" : "OFF");

            // Send prompt update to AI
            if (liveSessionRef.current) {
                const instruction = newMode ?
                    `You are now in NAVIGATION MODE. Switch to giving SHORT, CLEAR walking directions (3-5 words max). Examples: "Clear ahead", "Stop. Stairs down", "Turn left. Door ahead". Call hazards immediately. Be brief and direct.` :
                    `You are now in NORMAL MODE. Return to detailed descriptions and conversational responses. Describe what you see fully.`;

                liveSessionRef.current.sendRealtimeInput({ text: instruction });
            }

            setCommentaryStatus(newMode ? "🧭 Navigation Mode" : "🎙️ Normal Mode");
            return newMode;
        });
    }, []);

    // Sync ref with state on mount
    useEffect(() => {
        isMicMutedRef.current = isMicMuted;
    }, [isMicMuted]);

    return {
        commentaryStatus,
        isSessionReady,
        isMicMuted,
        chatMessages,
        isNavigationMode,
        detectedDistance,
        urgencyLevel,
        deviceOrientation,
        imageQuality,
        initLiveSession,
        startScreenShare,
        stopScreenShare,
        startCameraStream,
        stopCameraStream,
        stopLiveSession,
        toggleMicMute,
        toggleNavigationMode
    };
}