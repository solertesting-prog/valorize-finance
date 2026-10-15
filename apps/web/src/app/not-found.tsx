import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="auth">
      <div className="box center">
        <p className="mono" style={{ fontSize: 'var(--t-4xl)', color: 'var(--mint)', margin: 0 }}>404</p>
        <h1>Esta página no existe</h1>
        <p className="muted" style={{ margin: '0 auto 24px' }}>Puede que el enlace esté mal escrito o que la página se haya movido.</p>
        <Link href="/" className="btn primary">Ir al inicio</Link>
      </div>
    </div>
  );
}
