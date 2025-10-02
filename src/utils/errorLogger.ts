/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ErrorSeverity = 'critical' | 'warning' | 'info';
export type ErrorCategory = 'media' | 'network' | 'audio' | 'api' | 'sensor' | 'unknown';

export interface LoggedError {
    id: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    message: string;
    originalError?: Error;
    timestamp: Date;
    userAgent: string;
    context?: Record<string, any>;
}

class ErrorLogger {
    private errors: LoggedError[] = [];
    private maxErrors = 100;

    /**
     * Log an error with context
     */
    log(
        category: ErrorCategory,
        severity: ErrorSeverity,
        message: string,
        originalError?: Error,
        context?: Record<string, any>
    ): string {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const loggedError: LoggedError = {
            id,
            category,
            severity,
            message,
            originalError,
            timestamp: new Date(),
            userAgent: navigator.userAgent,
            context
        };

        this.errors.push(loggedError);

        // Keep only last N errors
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }

        // Console logging with appropriate level
        const consoleMessage = `[${severity.toUpperCase()}] ${category}: ${message}`;

        switch (severity) {
            case 'critical':
                console.error(consoleMessage, originalError, context);
                break;
            case 'warning':
                console.warn(consoleMessage, originalError, context);
                break;
            case 'info':
                console.info(consoleMessage, originalError, context);
                break;
        }

        return id;
    }

    /**
     * Get all logged errors
     */
    getErrors(): LoggedError[] {
        return [...this.errors];
    }

    /**
     * Get errors by category
     */
    getErrorsByCategory(category: ErrorCategory): LoggedError[] {
        return this.errors.filter(e => e.category === category);
    }

    /**
     * Get errors by severity
     */
    getErrorsBySeverity(severity: ErrorSeverity): LoggedError[] {
        return this.errors.filter(e => e.severity === severity);
    }

    /**
     * Clear all errors
     */
    clearErrors(): void {
        this.errors = [];
    }

    /**
     * Get error by ID
     */
    getErrorById(id: string): LoggedError | undefined {
        return this.errors.find(e => e.id === id);
    }

    /**
     * Export errors for debugging (returns JSON string)
     */
    export(): string {
        return JSON.stringify(this.errors, null, 2);
    }
}

export const errorLogger = new ErrorLogger();
