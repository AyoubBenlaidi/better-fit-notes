import { create } from 'zustand';
import { clsx } from 'clsx';
import { CheckCircle2, XCircle, AlertCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, type: ToastType = 'info') {
  useToastStore.getState().addToast(message, type);
}

const icons: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error:   XCircle,
  info:    AlertCircle,
};

const colorClasses: Record<ToastType, string> = {
  success: 'text-success',
  error:   'text-danger',
  info:    'text-accent',
};

const bgClasses: Record<ToastType, string> = {
  success: 'border-success/20',
  error:   'border-danger/20',
  info:    'border-accent/20',
};

function ToastItem({ toast: t, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const Icon = icons[t.type];

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-2xl',
        'bg-surface-overlay border shadow-card-lg',
        'animate-fade-in w-full max-w-sm',
        bgClasses[t.type],
      )}
    >
      <Icon size={17} strokeWidth={2} className={clsx('flex-shrink-0', colorClasses[t.type])} />
      <p className="flex-1 text-sm text-text-primary font-medium leading-snug">{t.message}</p>
      <button
        onClick={onDismiss}
        className="text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center w-full px-4 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto w-full max-w-sm">
          <ToastItem toast={t} onDismiss={() => removeToast(t.id)} />
        </div>
      ))}
    </div>
  );
}
