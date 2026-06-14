/**
 * Lightweight analytics hooks for the protocol canvas.
 * Dispatches a CustomEvent on window for optional host instrumentation.
 */

export type ProtocolCanvasAnalyticsPayload = {
  action: string;
  blockType?: string;
  blockId?: string;
  meetingId?: string;
};

const EVENT_NAME = 'protocolCanvasAnalytics';

export function trackProtocolCanvasAnalytics(payload: ProtocolCanvasAnalyticsPayload): void {
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
    } catch {
      /* ignore */
    }
  }
  if (process.env.NODE_ENV === 'development') {
     
    console.debug(`[${EVENT_NAME}]`, payload);
  }
}
