/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../hooks/useLiveCommentary';

interface ChatInterfaceProps {
    messages: ChatMessage[];
    isListening: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, isListening }) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="chat-interface" role="complementary" aria-label="Conversation history">
            <div className="chat-header">
                <h3>Conversation</h3>
                {isListening && (
                    <span className="listening-indicator" aria-live="polite">
                        <span className="pulse-dot" aria-hidden="true"></span>
                        Listening...
                    </span>
                )}
            </div>
            <div className="chat-messages" role="log" aria-live="polite" aria-atomic="false">
                {messages.length === 0 ? (
                    <div className="chat-empty">
                        <p>Start speaking to interact with the AI</p>
                    </div>
                ) : (
                    <>
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`chat-message ${msg.type}`} role="article">
                                <div className="message-content" aria-label={`${msg.type === 'ai' ? 'AI' : 'You'} said`}>
                                    {msg.text}
                                </div>
                                <div className="message-time" aria-hidden="true">
                                    {msg.timestamp.toLocaleTimeString()}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>
        </div>
    );
};

export default ChatInterface;
