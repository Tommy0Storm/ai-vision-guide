/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { decode, decodeAudioData, createPCMBlob } from '../utils/audioUtils';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const initialSystemPrompt = `You are an AI vision assistant named 'Aura'. Your ONLY job is to describe what you see in the images being sent to you from the user's screen or camera.

**CRITICAL RULES:**
1. **ONLY describe visual content:** Describe ONLY what you can see in the images sent to you. Do NOT talk about emails, documents, registries, or anything else unless you can ACTUALLY SEE them in the current image.

2. **Initial image:** When you receive the first image, immediately say "I can see [describe exactly what's visible in the image]."

3. **Continuous description:** Every 5-10 seconds, briefly describe what's currently visible on screen. For example: "The screen shows [specific content]."

4. **Changes:** When the screen content changes, describe the new content: "Now I see [new content]."

5. **No assumptions:** DO NOT make assumptions, hallucinate, or talk about things not visible in the images. If the screen is blank, say "The screen appears blank."

6. **User questions:** If the user asks about something on screen, describe what you SEE in that area.

7. **Be literal:** Describe exactly what's visible - text, buttons, images, windows, colors, layouts.

8. **Audio only:** Your responses are converted to speech. Be clear and concise.

REMEMBER: You can ONLY see what's in the images sent to you. Describe ONLY what you actually see.`;


const FRAME_RATE = 1 / 3; // Send frame every 3 seconds (0.33 fps)
const JPEG_QUALITY = 0.7;

/**
 * Custom hook to manage all Gemini Live API interactions for commentary.
 */
export function useLiveCommentary() {
    const [commentaryStatus, setCommentaryStatus] = useState('');
    const [isSessionReady, setIsSessionReady] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(true);
    const outputAudioCtxRef = useRef<AudioContext | null>(null);
    const inputAudioCtxRef = useRef<AudioContext | null>(null);
    const liveSessionRef = useRef<any | null>(null);
    const nextStartTimeRef = useRef(0);
    const isAudioPlayingRef = useRef(false);
    const activeSourcesRef = useRef(new Set<AudioBufferSourceNode>());
    
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

    const initAudioContexts = useCallback(async () => {
        if (!outputAudioCtxRef.current) outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        if (!inputAudioCtxRef.current) inputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        if (outputAudioCtxRef.current.state === 'suspended') { try { await outputAudioCtxRef.current.resume(); } catch (e) { console.warn("Output AudioContext resume failed:", e); throw e; } }
        if (inputAudioCtxRef.current.state === 'suspended') { try { await inputAudioCtxRef.current.resume(); } catch (e) { console.warn("Input AudioContext resume failed:", e); throw e; } }
    }, []);

    const stopAndClearAudio = useCallback(() => {
        activeSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) { /* Ignore */ } });
        activeSourcesRef.current.clear();
        isAudioPlayingRef.current = false;
    }, []);

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
            
            // Process audio if present in the message
            if (outputAudioCtxRef.current?.state === 'running') {
                const modelTurn = message.serverContent?.modelTurn;
                const audioPart = modelTurn?.parts.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));
                
                if (audioPart?.inlineData?.data) {
                    if (!isAudioPlayingRef.current) nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioCtxRef.current.currentTime);
                    isAudioPlayingRef.current = true;
                    setCommentaryStatus(`🎙️ Speaking...`);
        
                    const audioBytes = decode(audioPart.inlineData.data);
                    const audioBuffer = await decodeAudioData(audioBytes, outputAudioCtxRef.current, 24000, 1);
                    const source = outputAudioCtxRef.current.createBufferSource();
                    source.buffer = audioBuffer;
                    
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
        cameraStreamRef.current?.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
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
                        setCommentaryStatus("🎙️ Ready");

                        // Set up microphone with mute control
                        (async () => {
                            try {
                                console.log("Setting up microphone...");
                                await inputAudioCtxRef.current!.audioWorklet.addModule('/audioProcessor.js');

                                microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                                console.log("Microphone access granted");

                                const source = inputAudioCtxRef.current!.createMediaStreamSource(microphoneStreamRef.current);
                                const audioWorkletNode = new AudioWorkletNode(inputAudioCtxRef.current!, 'audio-processor');
                                audioWorkletNodeRef.current = audioWorkletNode;

                                audioWorkletNode.port.onmessage = (event) => {
                                    if (!liveSessionRef.current || isMicMuted) return;
                                    const pcmData = event.data as Int16Array;
                                    const pcmBlob = createPCMBlob(pcmData);
                                    liveSessionRef.current.sendRealtimeInput({ audio: pcmBlob });
                                };
                                source.connect(audioWorkletNode);
                                audioWorkletNode.connect(inputAudioCtxRef.current!.destination);
                                console.log("Microphone setup complete (muted by default)");
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
                config: { systemInstruction: initialSystemPrompt, responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
            });
            liveSessionRef.current = await sessionPromise;
            console.log("Session object assigned to ref");

            // Send welcome message
            try {
                console.log("Sending welcome message");
                liveSessionRef.current.sendRealtimeInput({ text: "Say: Welcome! Please start sharing your screen or camera so I can describe what I see." });
            } catch (err) {
                console.error("Error sending welcome message:", err);
            }
        } catch (e: any) { console.error("Live connect error:", e); setCommentaryStatus(`⚠️ Connect Err`); throw e; }
    }, [initAudioContexts, stopAndClearAudio, stopLiveSession, cleanupAudioInput, isSessionReady]);

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

        frameIntervalRef.current = window.setInterval(() => {
            if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0 || !isSessionReady) {
                return;
            }
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            ctx!.drawImage(videoEl, 0, 0, videoEl.videoWidth, videoEl.videoHeight);
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
        }, 1000 / FRAME_RATE);
    }, [isSessionReady]);

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
    }, [startFrameStreaming, isSessionReady]);

    const toggleMicMute = useCallback(() => {
        setIsMicMuted(prev => !prev);
        console.log("Microphone muted:", !isMicMuted);
    }, [isMicMuted]);

    return {
        commentaryStatus,
        isSessionReady,
        isMicMuted,
        initLiveSession,
        startScreenShare,
        stopScreenShare,
        startCameraStream,
        stopCameraStream,
        stopLiveSession,
        toggleMicMute
    };
}