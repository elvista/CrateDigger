import { useEffect, useRef, useState, useCallback } from 'react';

export function useSSE(url, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const enabledRef = useRef(enabled);

  // Keep ref in sync so retry callback reads latest value
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.addEventListener('progress', (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setData(parsed);
      } catch {
        // ignore parse errors
      }
    });

    es.onerror = () => {
      setConnected(false);
      setError('Connection lost');
      es.close();
      // Retry after 5 seconds, reading latest enabled from ref
      retryTimeoutRef.current = setTimeout(() => {
        if (enabledRef.current) connect();
      }, 5000);
    };
  }, [url]);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect, enabled]);

  return { data, error, connected };
}
