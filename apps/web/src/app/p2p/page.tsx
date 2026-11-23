'use client';

import { LocationDto, NETWORK_LABEL, networkFullName, ChainNetwork } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SitePage, Simulator } from '@/components/site';
import { Icon } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const OPERATIONS: [string, string, string][] = [
  ['Vender USDT o USDC', 'Nos envías la cripto en la oficina, desde tu wallet, y te pagamos en euros.', 'Recibes euros'],
  ['Comprar USDT o USDC', 'Pagas en euros en la oficina y te enviamos la cripto a tu wallet en el momento.', 'Recibes cripto'],
];

const PROCESS: [string, string][] = [
  ['Simula', 'Cotización al momento con el tipo de mercado y nuestro margen.'],
  ['Solicita', 'Oficina, importe, moneda, red y tu wallet. Te guiamos para elegir la red correcta.'],
  ['Revisión', 'Auditamos la wallet y aprobamos la solicitud. Los clientes habituales, al momento.'],
  ['Cita con QR', 'Tu QR llega al móvil. Lo muestras al llegar y comprobamos tu identidad.'],
  ['Cambio', 'Se completa la operación y verificamos la transacción en la blockchain.'],
  ['Justificante', 'PDF con código de verificación, siempre disponible en tu historial.'],
];

const SECURITY: [string, string, string][] = [
  ['shield', 'Sanciones y bloqueos', 'Cada wallet se contrasta con la lista de sanciones de EE. UU. (OFAC), nuestra lista interna y los bloqueos de Tether y Circle.'],
  ['wallet', 'Tu wallet, demostrada', 'En importes altos firmas un mensaje con tu wallet (sin mover fondos), como pide la normativa europea.'],
  ['alert', 'Periodo de seguridad', 'Si se añade una wallet nueva a tu cuenta te avisamos y esperamos antes de enviarle cripto.'],
  ['link', 'Verificado en la red', 'Comprobamos en la blockchain que cada transacción existe, es del token correcto y cuadra con la operación.'],
  ['users', 'Identidad en el mostrador', 'Al escanear tu QR, el personal coteja tus datos verificados con tu documento.'],
  ['log', 'Todo queda registrado', 'Cada paso queda en un registro de auditoría que no se puede modificar.'],
];

const ACCOUNT: [string, string, string][] = [
  ['/app/reservar', 'Solicitar un cambio', 'calendar'],
  ['/app/reservas', 'Mis citas y QR', 'qr'],
  ['/app/operaciones', 'Mis operaciones y justificantes', 'doc'],
  ['/app/perfil', 'Mis wallets y verificación', 'wallet'],
];

/** Categoría P2P: toda la plataforma de cambio presencial de Valorize. */
export default function P2P() {
  const { user } = useAuth();
  const start = user ? '/app/reservar' : '/registro';
  const locs = useQuery({ queryKey: ['locations', 'public'], queryFn: () => api.get<LocationDto[]>('/locations') });

  return (
    <SitePage>
      <section className="s-hero">
        <div className="glow" aria-hidden />
        <div className="site-wrap grid2">
          <div>
            <span className="s-badge">P2P · Cambio presencial de stablecoins</span>
            <h1>
              USDT y USDC por euros, <em>en persona</em>.
            </h1>
            <p className="lede">
              El P2P de Valorize une lo mejor de los dos mundos: la rapidez de pedirlo desde el móvil y la seguridad de cambiar en una oficina, con personas
              identificadas y operaciones comprobadas.
            </p>
            <div className="row" style={{ gap: 12 }}>
              <Link href={start} className="btn primary lg">
                Solicitar mi cambio
              </Link>
              <a href="#oficinas" className="btn lg">
                Ver oficinas
              </a>
            </div>
            <p className="note">
              Redes: {(Object.keys(NETWORK_LABEL) as ChainNetwork[]).map((n) => networkFullName(n)).join(' · ')}
            </p>
          </div>
          <div id="simulador">
            <Simulator />
          </div>
        </div>
      </section>

      <section className="s-section alt">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Operaciones</span>
            <h2>Compra o vende, siempre cara a cara</h2>
          </div>
          <div className="s-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {OPERATIONS.map(([t, d, tag]) => (
              <article key={t} className="s-card">
                <span className="badge ok" style={{ marginBottom: 12 }}>
                  {tag}
                </span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="s-section">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">El proceso</span>
            <h2>Seis pasos, todos desde tu móvil salvo uno</h2>
          </div>
          <ol className="s-steps" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {PROCESS.map(([t, d]) => (
              <li key={t}>
                <strong>{t}</strong>
                <span>{d}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="s-section alt" id="seguridad">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Seguridad</span>
            <h2>Controles en cada operación</h2>
            <p>Lo que hacemos para que tu cambio sea seguro y cumpla la normativa.</p>
          </div>
          <div className="s-cards">
            {SECURITY.map(([icon, t, d]) => (
              <article key={t} className="s-card">
                <div className="ico" aria-hidden>
                  <Icon name={icon} size={22} />
                </div>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="s-section" id="oficinas">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Oficinas</span>
            <h2>Dónde cambiar</h2>
          </div>
          {locs.data?.length ? (
            <div className="s-cards">
              {locs.data.map((l) => (
                <article key={l.id} className="s-card">
                  <div className="ico" aria-hidden>
                    <Icon name="pin" size={22} />
                  </div>
                  <h3>{l.name}</h3>
                  <p>
                    {l.address}, {l.city}
                  </p>
                  <Link href={user ? `/app/reservar?location=${l.id}` : '/registro'} className="btn sm" style={{ marginTop: 14 }}>
                    Reservar aquí
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className="center muted">{locs.isLoading ? 'Cargando oficinas…' : 'Pronto anunciaremos nuestras oficinas.'}</p>
          )}
        </div>
      </section>

      <section className="s-section alt">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Tu cuenta P2P</span>
            <h2>Todo en la web y en la app</h2>
            <p>Solicitudes, citas con QR, historial, justificantes y tus wallets, siempre a mano.</p>
          </div>
          <div className="s-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {ACCOUNT.map(([href, t, icon]) => (
              <Link key={href} href={user ? href : `/login?next=${encodeURIComponent(href)}`} className="s-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="ico" aria-hidden>
                  <Icon name={icon} size={22} />
                </div>
                <h3>{t}</h3>
                <p>{user ? 'Abrir' : 'Entra para verlo'} →</p>
              </Link>
            ))}
          </div>
          <p className="center small muted" style={{ marginTop: 20 }}>
            ¿Te han dado un justificante? <Link href="/justificante">Comprueba que es auténtico</Link>.
          </p>
        </div>
      </section>

      <section className="s-section s-cta">
        <div className="site-wrap">
          <h2>Empieza tu primer cambio P2P</h2>
          <p>Crea tu cuenta, verifica tu identidad una vez y solicita tu cambio desde el móvil.</p>
          <Link href={start} className="btn primary lg">
            {user ? 'Solicitar un cambio' : 'Crear mi cuenta'}
          </Link>
        </div>
      </section>
    </SitePage>
  );
}
