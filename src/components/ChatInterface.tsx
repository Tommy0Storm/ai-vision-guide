/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';

interface ChatMessage {
    type: 'user' | 'ai';
    text: string;
    timestamp: Date;
}

interface ChatInterfaceProps {
    messages: ChatMessage[];
    isListening: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, isListening }) => {
    return (
        <div className="chat-interface">
            <div className="chat-header">
                <h3>Conversation</h3>
                {isListening && (
                    <span className="listening-indicator">
                        <span className="pulse-dot"></span>
                        Listening...
                    </span>
                )}
            </div>
            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div className="chat-empty">
                        <p>Start speaking to interact with the AI</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={idx} className={`chat-message ${msg.type}`}>
                            <div className="message-content">{msg.text}</div>
                            <div className="message-time">
                                {msg.timestamp.toLocaleTimeString()}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ChatInterface;
