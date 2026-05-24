const CORE_URL = import.meta.env.VITE_CORE_API_URL || 'http://localhost:8002';
const TELEMETRY_ENABLED = (import.meta.env.VITE_TELEMETRY_ENABLED || 'true') === 'true';

type TelemetryPayload = {
  event_type: string;
  path?: string;
  metadata?: Record<string, unknown>;
};

export function trackEvent(eventType: string, metadata: Record<string, unknown> = {}) {
  if (!TELEMETRY_ENABLED) return;
  const payload: TelemetryPayload = {
    event_type: eventType,
    path: window.location.pathname,
    metadata,
  };

  const url = `${CORE_URL}/public/client-event`;
  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }
  } catch {
    // Fall through to fetch.
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function setupGlobalErrorTracking() {
  if (!TELEMETRY_ENABLED) return;

  window.addEventListener('error', (event) => {
    trackEvent('frontend_window_error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason =
      typeof event.reason === 'string'
        ? event.reason
        : (event.reason?.message || 'Unhandled rejection');
    trackEvent('frontend_unhandled_rejection', { reason });
  });
}
