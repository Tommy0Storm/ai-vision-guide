/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ReconnectionConfig {
    maxRetries?: number;
    delays?: number[]; // milliseconds for each retry attempt
    onReconnectAttempt?: (attempt: number, delay: number) => void;
    onReconnectSuccess?: () => void;
    onReconnectFail?: () => void;
}

export class ReconnectionManager {
    private retryCount: number = 0;
    private maxRetries: number;
    private delays: number[];
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isReconnecting: boolean = false;

    private onReconnectAttempt?: (attempt: number, delay: number) => void;
    private onReconnectSuccess?: () => void;
    private onReconnectFail?: () => void;

    constructor(config: ReconnectionConfig = {}) {
        this.maxRetries = config.maxRetries ?? 7;
        // Exponential backoff: 250ms, 500ms, 1s, 2s, 4s, 8s, 10s (max)
        this.delays = config.delays ?? [250, 500, 1000, 2000, 4000, 8000, 10000];
        this.onReconnectAttempt = config.onReconnectAttempt;
        this.onReconnectSuccess = config.onReconnectSuccess;
        this.onReconnectFail = config.onReconnectFail;
    }

    /**
     * Schedule a reconnection attempt with exponential backoff
     */
    scheduleReconnect(connectFn: () => Promise<void>): void {
        if (this.isReconnecting) {
            console.warn('⚠️ Reconnection already in progress');
            return;
        }

        if (this.retryCount >= this.maxRetries) {
            console.error('❌ Max reconnection attempts reached');
            this.onReconnectFail?.();
            return;
        }

        this.isReconnecting = true;
        const delay = this.getCurrentDelay();

        console.log(`🔄 Scheduling reconnection attempt ${this.retryCount + 1}/${this.maxRetries} in ${delay}ms`);

        this.onReconnectAttempt?.(this.retryCount + 1, delay);

        this.reconnectTimer = setTimeout(async () => {
            try {
                console.log(`🔌 Attempting to reconnect...`);
                await connectFn();
                console.log('✅ Reconnection successful');
                this.onReconnectSuccess?.();
                this.reset();
            } catch (error) {
                console.error(`❌ Reconnection attempt ${this.retryCount + 1} failed:`, error);
                this.retryCount++;
                this.isReconnecting = false;

                // Schedule next attempt if not at max
                if (this.retryCount < this.maxRetries) {
                    this.scheduleReconnect(connectFn);
                } else {
                    this.onReconnectFail?.();
                }
            }
        }, delay);
    }

    /**
     * Cancel any pending reconnection
     */
    cancelReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.isReconnecting = false;
        console.log('🛑 Reconnection cancelled');
    }

    /**
     * Reset reconnection state (call after successful connection)
     */
    reset(): void {
        this.retryCount = 0;
        this.isReconnecting = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * Get current delay based on retry count
     */
    getCurrentDelay(): number {
        const index = Math.min(this.retryCount, this.delays.length - 1);
        return this.delays[index];
    }

    /**
     * Get current retry attempt number
     */
    getRetryCount(): number {
        return this.retryCount;
    }

    /**
     * Check if currently attempting to reconnect
     */
    isAttemptingReconnect(): boolean {
        return this.isReconnecting;
    }

    /**
     * Get max retry attempts
     */
    getMaxRetries(): number {
        return this.maxRetries;
    }

    /**
     * Manually trigger immediate reconnect (resets counter)
     */
    manualReconnect(connectFn: () => Promise<void>): void {
        console.log('🔄 Manual reconnection triggered');
        this.reset();
        this.scheduleReconnect(connectFn);
    }
}
