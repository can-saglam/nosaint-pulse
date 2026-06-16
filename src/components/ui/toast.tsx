import { useCallback, useEffect, useState } from "react";

interface Toast {
  id: number;
  message: string;
  type: "info" | "error";
}

let _push: ((t: Omit<Toast, "id">) => void) | null = null;
let _nextId = 0;

/** Fire-and-forget toast from anywhere (no context needed). */
export function toast(message: string, type: "info" | "error" = "info") {
  _push?.({ message, type });
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++_nextId;
    setToasts((prev) => [...prev.slice(-4), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2800);
  }, []);

  useEffect(() => {
    _push = push;
    return () => {
      _push = null;
    };
  }, [push]);

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto animate-fade-up rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg ${
            t.type === "error"
              ? "bg-red-600 text-white"
              : "bg-ink text-white"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
