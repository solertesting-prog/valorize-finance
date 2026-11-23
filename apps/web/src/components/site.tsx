'use client';

import { CryptoAsset, ExchangeDirection } from '@valorize/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { homeFor, useAuth } from '@/lib/auth';
import { QuoteBox } from './quote';
import { Icon } from './ui';

/** Categorías del sitio público. P2P agrupa toda la plataforma de cambio presencial. */
const NAV = [
  { href: '/p2p', label: 'P2P', cat: true },
  { href: '/#como-funciona', label: 'Cómo funciona' },
  { href: '/#seguridad', label: 'Seguridad' },
  { href: '/#preguntas', label: 'Preguntas' },
];

export function SiteHeader() {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="site-header">
        <div className="site-wrap">
          <Link href="/" className="brand" style={{ textDecoration: 'none', color: 'var(--paper)' }} aria-label="Valorize Finance, inicio">
            <b>VALORIZE</b> FINANCE
          </Link>
          <nav className="main" aria-label="Principal">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={n.cat ? 'cat' : undefined} aria-current={pathname === n.href ? 'page' : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="actions">
            {ready && user ? (
              <Link href={homeFor(user.role)} className="btn primary">
                Ir a mi área
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn ghost hide-sm">
                  Entrar
                </Link>
                <Link href="/registro" className="btn primary hide-sm">
                  Empezar ahora
                </Link>
              </>
            )}
            <button className="btn ghost menu-btn" aria-expanded={open} aria-controls="site-mobile-nav" aria-label="Menú" onClick={() => setOpen((v) => !v)}>
              <Icon name={open ? 'x' : 'list'} />
            </button>
          </div>
        </div>
        <nav id="site-mobile-nav" className={`site-mobile-nav ${open ? 'open' : ''}`} aria-label="Menú móvil">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>
              {n.label}
            </Link>
          ))}
          {!user ? (
            <Link href="/login" onClick={() => setOpen(false)}>
              Entrar
            </Link>
          ) : null}
        </nav>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-wrap">
        <div className="cols">
          <div>
            <div className="brand" style={{ marginBottom: 10 }}>
              <b>VALORIZE</b> FINANCE
            </div>
            <p className="small muted" style={{ margin: 0, maxWidth: '34ch' }}>
              Cambio presencial de USDT y USDC por euros, con cita previa, identidad verificada y cada operación comprobada en la blockchain.
            </p>
          </div>
          <div>
            <h4>P2P</h4>
            <Link href="/p2p">Cambio presencial</Link>
            <Link href="/p2p#simulador">Simulador</Link>
            <Link href="/p2p#seguridad">Seguridad</Link>
            <Link href="/justificante">Comprobar un justificante</Link>
          </div>
          <div>
            <h4>Cuenta</h4>
            <Link href="/registro">Crear cuenta</Link>
            <Link href="/login">Entrar</Link>
            <Link href="/#preguntas">Preguntas frecuentes</Link>
          </div>
          <div>
            <h4>Legal</h4>
            <Link href="/legal/condiciones">Condiciones de uso</Link>
            <Link href="/legal/privacidad">Privacidad</Link>
          </div>
        </div>
        <div className="legal">
          <span>
            Las operaciones con criptoactivos conllevan riesgos, incluida la pérdida de fondos si se envían a una red o dirección equivocadas. Las cotizaciones del
            simulador son orientativas; el importe final se confirma en la oficina. La información de esta web no es asesoramiento financiero.
          </span>
          <span>© {new Date().getFullYear()} Valorize Finance</span>
        </div>
      </div>
    </footer>
  );
}

/** Botón fijo en el móvil. */
export function StickyCta({ href = '/registro', label = 'Empezar ahora' }: { href?: string; label?: string }) {
  const { user } = useAuth();
  if (user) return null;
  return (
    <div className="sticky-cta">
      <Link href={href} className="btn primary lg">
        {label}
      </Link>
    </div>
  );
}

export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <a href="#contenido" className="sr-only">
        Saltar al contenido
      </a>
      <SiteHeader />
      <main id="contenido">{children}</main>
      <SiteFooter />
      <StickyCta />
    </div>
  );
}

/** Simulador público: cuánto recibe o paga el cliente, con el tipo del día. */
export function Simulator({ cta = true }: { cta?: boolean }) {
  const { user } = useAuth();
  const [direction, setDirection] = useState<ExchangeDirection>('SELL_CRYPTO');
  const [asset, setAsset] = useState<CryptoAsset>('USDT');
  const [amount, setAmount] = useState('500');
  return (
    <section className="card big stack simulator" aria-label="Simula tu cambio" style={{ width: '100%', boxShadow: '0 30px 80px rgba(0,0,0,0.35)' }}>
      <div className="row between">
        <strong>Simula tu cambio</strong>
        <span className="xs muted">Tipo del día</span>
      </div>
      <div className="row" role="group" aria-label="Operación" style={{ gap: 8 }}>
        <button type="button" className={`btn sm ${direction === 'SELL_CRYPTO' ? 'primary' : ''}`} aria-pressed={direction === 'SELL_CRYPTO'} onClick={() => setDirection('SELL_CRYPTO')}>
          Vendo cripto
        </button>
        <button type="button" className={`btn sm ${direction === 'BUY_CRYPTO' ? 'primary' : ''}`} aria-pressed={direction === 'BUY_CRYPTO'} onClick={() => setDirection('BUY_CRYPTO')}>
          Compro cripto
        </button>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <input
          className="input mono"
          inputMode="decimal"
          aria-label="Importe"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          style={{ fontSize: 'var(--t-lg)' }}
        />
        <select className="select" style={{ width: 'auto' }} value={asset} onChange={(e) => setAsset(e.target.value as CryptoAsset)} aria-label="Moneda">
          <option value="USDT">USDT</option>
          <option value="USDC">USDC</option>
        </select>
      </div>
      <QuoteBox direction={direction} asset={asset} amount={amount} />
      {cta ? (
        <Link href={user ? '/app/reservar' : '/registro'} className="btn primary">
          Solicitar mi cambio
        </Link>
      ) : null}
    </section>
  );
}
