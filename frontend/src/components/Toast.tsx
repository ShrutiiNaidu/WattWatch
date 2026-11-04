import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastItem } from '../types';

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const ICONS: Record<ToastItem['kind'], React.ReactNode> = {
  error: <AlertTriangle size={16} aria-hidden="true" />,
  success: <CheckCircle2 size={16} aria-hidden="true" />,
  info: <Info size={16} aria-hidden="true" />,
};

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const dismissRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className={`toast toast--${toast.kind}`}
      role={toast.kind === 'error' ? 'alert' : 'status'}
      aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {ICONS[toast.kind]}
      <span className="toast__message">{toast.message}</span>
      <button
        ref={dismissRef}
        className="toast__close"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastStack({ toasts, onDismiss }: Props) {
  // Announce newest toast to screen readers via the live region wrapper
  return (
    <div className="toast-stack" aria-label="Notifications">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}
