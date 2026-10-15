'use client';

import {
  BOOKING_STATUS_LABEL,
  BookingStatus,
  errorMessage,
  KYC_STATUS_LABEL,
  KycStatus,
} from '@valorize/shared';
import {
  ButtonHTMLAttributes,
  createContext,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

// ───────── Botón ─────────
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'danger' | 'ghost' | 'default';
  size?: 'sm' | 'lg';
  block?: boolean;
  loading?: boolean;
};

export function Button({ variant = 'default', size, block, loading, children, className = '', disabled, ...rest }: BtnProps) {
  const cls = ['btn', variant !== 'default' && variant, size, block && 'block', className].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} aria-hidden /> : null}
      {children}
    </button>
  );
}

// ───────── Campos ─────────
interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string, describedBy?: string) => ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, [hintId, errId].filter(Boolean).join(' ') || undefined)}
      {hint ? (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="error" id={errId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, d) => <input id={id} className="input" aria-describedby={d} aria-invalid={!!error || undefined} {...rest} />}
    </Field>
  );
}

export function SelectInput({
  label,
  hint,
  error,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, d) => (
        <select id={id} className="select" aria-describedby={d} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextArea({ label, hint, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, d) => <textarea id={id} className="textarea" aria-describedby={d} {...rest} />}
    </Field>
  );
}

// ───────── Estados ─────────
export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: 32 }} role="status">
      <span className="spinner" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'warn' | 'ok'; children: ReactNode }) {
  return (
    <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <Alert kind="error">{errorMessage(error)}</Alert>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <p style={{ margin: '0 auto 16px' }}>{children}</p> : null}
      {action}
    </div>
  );
}

const STATUS_TONE: Record<BookingStatus, string> = {
  PENDING: 'warn',
  CONFIRMED: 'ok',
  CHECKED_IN: 'info',
  IN_SERVICE: 'info',
  COMPLETED: '',
  CANCELLED: 'bad',
  NO_SHOW: 'bad',
  REJECTED: 'bad',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`badge ${STATUS_TONE[status]}`}>{BOOKING_STATUS_LABEL[status]}</span>;
}

const KYC_TONE: Record<KycStatus, string> = {
  NOT_STARTED: '',
  PENDING: 'warn',
  IN_REVIEW: 'info',
  APPROVED: 'ok',
  REJECTED: 'bad',
  EXPIRED: 'bad',
};

export function KycBadge({ status }: { status: KycStatus }) {
  return <span className={`badge ${KYC_TONE[status]}`}>{KYC_STATUS_LABEL[status]}</span>;
}

// ───────── Paginación ─────────
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Paginación">
      <span className="muted small">
        Página {page} de {pages} · {total} resultados
      </span>
      <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
        Anterior
      </Button>
      <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>
        Siguiente
      </Button>
    </nav>
  );
}

// ───────── Diálogo modal ─────────
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="modal-title">
      <div className="body">
        <h2 id="modal-title" style={{ fontSize: 'var(--t-lg)' }}>
          {title}
        </h2>
        {children}
      </div>
      {footer ? <div className="foot">{footer}</div> : null}
    </dialog>
  );
}

// ───────── Toasts ─────────
interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, text, kind }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ───────── Iconos (trazos simples, 24×24) ─────────
const paths: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  building: 'M4 21V5l8-3v19M12 9l8 3v9M8 9h.01M8 13h.01M8 17h.01M16 15h.01M16 18h.01',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 8.5h.01',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  log: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
  inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M16 13h.01',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name] ?? ''} />
    </svg>
  );
}
