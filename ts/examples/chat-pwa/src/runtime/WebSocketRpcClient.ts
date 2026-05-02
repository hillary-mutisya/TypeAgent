// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export type RpcMessage =
    | { type: "call"; callId: number; name: string; args: unknown[] }
    | { type: "invoke"; callId: number; name: string; args: unknown[] }
    | { type: "invokeResult"; callId: number; result: unknown }
    | { type: "invokeError"; callId: number; error: string; stack?: string };

export type ChannelMessage = {
    name: string;
    message: RpcMessage;
};

type PendingInvoke = {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
};

type CallHandler = (...args: unknown[]) => void;
type InvokeHandler = (...args: unknown[]) => Promise<unknown>;

export type ConnectionState = "connecting" | "connected" | "disconnected";

export class WebSocketRpcClient {
    private ws: WebSocket | null = null;
    private callId = 0;
    private pending = new Map<number, PendingInvoke>();
    private callHandlers = new Map<string, Map<string, CallHandler>>();
    private invokeHandlers = new Map<string, Map<string, InvokeHandler>>();
    private connectionState: ConnectionState = "disconnected";
    private reconnectTimer: number | null = null;
    private stateListeners: Set<(state: ConnectionState) => void> = new Set();
    private connectPromise: Promise<void> | null = null;

    constructor(private url: string) {}

    get state(): ConnectionState {
        return this.connectionState;
    }

    onStateChange(listener: (state: ConnectionState) => void): () => void {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }

    private setState(state: ConnectionState) {
        this.connectionState = state;
        this.stateListeners.forEach((listener) => listener(state));
    }

    connect(): Promise<void> {
        // Return existing promise if already connected or connecting
        if (this.ws?.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        if (this.connectPromise && this.connectionState === "connecting") {
            return this.connectPromise;
        }

        this.connectPromise = new Promise((resolve, reject) => {
            this.setState("connecting");
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                this.setState("connected");
                resolve();
            };

            this.ws.onerror = (event) => {
                console.error("WebSocket error:", event);
                reject(new Error("WebSocket connection failed"));
            };

            this.ws.onclose = () => {
                this.handleDisconnect();
            };

            this.ws.onmessage = (event) => {
                try {
                    const channelMsg: ChannelMessage = JSON.parse(event.data);
                    this.handleMessage(channelMsg);
                } catch (e) {
                    console.error("Failed to parse message:", e);
                }
            };
        });

        return this.connectPromise;
    }

    private handleDisconnect() {
        this.setState("disconnected");
        this.connectPromise = null;

        // Reject all pending invokes
        for (const pending of this.pending.values()) {
            pending.reject(new Error("Connection closed"));
        }
        this.pending.clear();
    }

    private handleMessage(channelMsg: ChannelMessage) {
        const { name: channel, message } = channelMsg;

        switch (message.type) {
            case "call": {
                const handlers = this.callHandlers.get(channel);
                const handler = handlers?.get(message.name);
                if (handler) {
                    handler(...message.args);
                }
                break;
            }
            case "invoke": {
                const handlers = this.invokeHandlers.get(channel);
                const handler = handlers?.get(message.name);
                if (handler) {
                    handler(...message.args)
                        .then((result) => {
                            this.send(channel, {
                                type: "invokeResult",
                                callId: message.callId,
                                result,
                            });
                        })
                        .catch((error: Error) => {
                            this.send(channel, {
                                type: "invokeError",
                                callId: message.callId,
                                error: error.message,
                            });
                        });
                }
                break;
            }
            case "invokeResult": {
                const pending = this.pending.get(message.callId);
                if (pending) {
                    this.pending.delete(message.callId);
                    pending.resolve(message.result);
                }
                break;
            }
            case "invokeError": {
                const pending = this.pending.get(message.callId);
                if (pending) {
                    this.pending.delete(message.callId);
                    pending.reject(new Error(message.error));
                }
                break;
            }
        }
    }

    private send(channel: string, message: RpcMessage) {
        if (this.ws?.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket not connected");
        }
        const channelMsg: ChannelMessage = { name: channel, message };
        this.ws.send(JSON.stringify(channelMsg));
    }

    async invoke<T>(channel: string, method: string, ...args: unknown[]): Promise<T> {
        if (this.ws?.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket not connected");
        }

        const callId = ++this.callId;

        return new Promise<T>((resolve, reject) => {
            this.pending.set(callId, {
                resolve: resolve as (result: unknown) => void,
                reject,
            });
            this.send(channel, {
                type: "invoke",
                callId,
                name: method,
                args,
            });
        });
    }

    call(channel: string, method: string, ...args: unknown[]): void {
        if (this.ws?.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket not connected");
        }

        const callId = ++this.callId;
        this.send(channel, {
            type: "call",
            callId,
            name: method,
            args,
        });
    }

    onCall(channel: string, method: string, handler: CallHandler): () => void {
        let handlers = this.callHandlers.get(channel);
        if (!handlers) {
            handlers = new Map();
            this.callHandlers.set(channel, handlers);
        }
        handlers.set(method, handler);

        return () => {
            handlers?.delete(method);
        };
    }

    onInvoke(channel: string, method: string, handler: InvokeHandler): () => void {
        let handlers = this.invokeHandlers.get(channel);
        if (!handlers) {
            handlers = new Map();
            this.invokeHandlers.set(channel, handlers);
        }
        handlers.set(method, handler);

        return () => {
            handlers?.delete(method);
        };
    }

    close() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.ws?.close();
        this.ws = null;
    }
}
