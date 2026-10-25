import { useCallback, useEffect, useRef, useState } from "react";
import "./Toasts.css";

export type Toast = { id: number; text: string; tone: "info" | "error" | "progress" };

const ERROR_RE = /fail|could not|couldn't|did not match|not a ranking|too large|error|not a ranking studio|out of storage|need the desk key|only keep/i;

function toneFor(text: string): Toast["tone"] {
  if (ERROR_RE.test(text)) return "error";
  if (/…$|\.\.\.$/.test(text.trim())) return "progress";
  return "info";
}

/** Errors stay until closed; progress lines are replaced by whatever comes next. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const toast: Toast = { id: nextId.current++, text, tone: toneFor(text) };
      setToasts((prev) => [...prev.filter((item) => item.tone !== "progress" && item.text !== text), toast].slice(-3));
      if (toast.tone === "info") {
        timers.current.set(toast.id, window.setTimeout(() => dismiss(toast.id), 4500));
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return { toasts, notify, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast is-${toast.tone}`}>
          {toast.tone === "progress" ? <span className="toast-spin" aria-hidden /> : null}
          <span className="toast-text">{toast.text}</span>
          <button type="button" aria-label="Close" onClick={() => onDismiss(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
