import { useState, useCallback } from 'react';
import type { ToastItem } from '../types';

let _idCounter = 0;
const uid = () => String(++_idCounter);

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastItem['kind'], message: string, durationMs = 5000) => {
    const id = uid();
    setToasts(prev => [...prev, { id, kind, message }]);
    if (durationMs > 0) {
      setTimeout(() => dismiss(id), durationMs);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const error = useCallback((msg: string) => push('error', msg, 7000), [push]);
  const success = useCallback((msg: string) => push('success', msg, 4000), [push]);
  const info = useCallback((msg: string) => push('info', msg, 4000), [push]);

  return { toasts, dismiss, error, success, info };
}
