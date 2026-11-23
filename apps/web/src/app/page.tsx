'use client';

import { LocationDto } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SitePage } from '@/components/site';
import { Icon } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Hechos del producto, no métricas comerciales. */
const STATS: [string, string][] = [
  ['4', 'redes blockchain soportadas'],
  ['2', 'stablecoins: USDT y USDC'],
  ['100 %', 'de clientes con identidad verificada'],
  ['1', 'justificante verificable por operación'],
];

const RAILS = ['TRON', 'Ethereum', 'Polygon', 'BNB Chain', 'USDT', 'USDC', 'OFAC', 'MiCA'];

/** Lo que hace distinta a Valorize. */
const PRINCIPLES: [string, string, string][] = [
  ['building', 'Presencia física', 'Oficinas reales y un equipo al que puedes mirar a la cara. Lo digital, con alguien detrás que responde.'],
  ['users', 'Clientes identificados', 'Cada persona que opera con nosotros está verificada. Es la base de la confianza entre todos.'],
  ['shield', 'Cumplimiento desde el diseño', 'Control de sanciones, prueba de titularidad de wallets y alertas de riesgo integradas en cada flujo.'],
  ['link', 'Todo comprobado en la red', 'No damos nada por bueno sin verlo en la blockchain: importe, token, origen y destino.'],
  ['chart', 'Precios a la vista', 'Cotización de mercado y margen explícito antes de comprometerte. Sin letra pequeña.'],
  ['doc', 'Trazabilidad completa', 'Registro de auditoría inalterable y justificantes que cualquiera puede verificar.'],
];

const FAQ: [string, string][] = [
  [
    '¿Qué es Valorize Finance?',
    'Una empresa de servicios financieros con activos digitales que combina tecnología propia con atención presencial. Nuestro primer servicio es P2P, el cambio presencial de USDT y USDC por euros.',
  ],
  [
    '¿Qué es la categoría P2P?',
    'Es nuestra plataforma de cambio presencial: simulas la cotización, solicitas el cambio desde la web o la app, recibes un QR y completas la operación en una oficina con nuestro equipo.',
  ],
  [
    '¿Por qué pedís verificar la identidad?',
    'La normativa europea de prevención del blanqueo exige identificar a cada cliente. Lo haces una sola vez y te sirve para operar mientras tu documento esté en vigor.',
  ],
  [
    '¿Dónde estáis?',
    'Puedes ver nuestras oficinas y su dirección en la sección de contacto de esta página y en P2P, donde también puedes reservar cita.',
  ],
  [
    '¿Es esto asesoramiento financiero?',
    'No. Prestamos servicios de cambio y te damos información clara para que decidas tú. Operar con criptoactivos conlleva riesgos.',
  ],
];

const CHECKS: [string, string][] = [
  ['Identidad', 'verificada'],
  ['Wallet', 'auditada'],
  ['Transacción', 'comprobada en la red'],
  ['Justificante', 'emitido'],
];

export default function ValorizeHome() {
  const { user } = useAuth();
  const access = user ? '/p2p' : '/p2p/registro';
  const locs = useQuery({ queryKey: ['locations', 'public'], queryFn: () => api.get<LocationDto[]>('/locations') });

  return (
    <SitePage>
      {/* Mensaje principal */}
      <section className="s-hero corp">
        <div className="glow" aria-hidden />
        <div className="grid-lines" aria-hidden />
        <div className="site-wrap grid2">
          <div>
            <span className="s-badge">Valorize Finance · Barcelona</span>
            <h1>
              Finanzas digitales con <em>los pies en la tierra</em>.
            </h1>
            <p className="lede">
              Unimos la tecnología de los activos digitales con la seguridad de una oficina física. Clientes identificados, operaciones comprobadas en la blockchain
              y personas reales al otro lado.
            </p>
            <div className="row" style={{ gap: 12 }}>
              <Link href={access} className="btn primary lg">
                {user ? 'Ir a P2P' : 'Solicitar acceso'}
              </Link>
              <Link href="/p2p" className="btn lg">
                Conocer P2P
              </Link>
            </div>
            <p className="note">Acceso solo para clientes con identidad verificada</p>
          </div>

          <aside className="ledger" aria-label="Cómo garantizamos cada operación">
            <div className="ledger-head">
              <span className="mono">VALORIZE · CONTROL DE OPERACIÓN</span>
              <span className="dot" aria-hidden />
            </div>
            <ol>
              {CHECKS.map(([k, v], i) => (
                <li key={k} style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
                  <span className="tick" aria-hidden>
                    <Icon name="check" size={16} />
                  </span>
                  <span>
                    <strong>{k}</strong> {v}
                  </span>
                </li>
              ))}
            </ol>
            <div className="ledger-foot mono">Así es cada operación en Valorize.</div>
          </aside>
        </div>
      </section>

      {/* Tira de redes y estándares, en lugar de logos de socios */}
      <div className="rails" aria-label="Redes, monedas y estándares con los que trabajamos">
        <div className="rails-track">
          {[...RAILS, ...RAILS].map((r, i) => (
            <span key={i} aria-hidden={i >= RAILS.length}>
              {r}
            </span>
          ))}
        </div>
      </div>

      {/* Cifras */}
      <div className="site-wrap" style={{ marginTop: 40 }}>
        <div className="s-stats">
          {STATS.map(([n, l]) => (
            <div key={l}>
              <div className="n">{n}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Nosotros */}
      <section className="s-section" id="nosotros">
        <div className="site-wrap about">
          <div>
            <span className="kicker">Nosotros</span>
            <h2>Hacemos que operar con activos digitales sea tan fiable como ir al banco.</h2>
          </div>
          <div className="stack">
            <p>
              Valorize Finance nace de una idea sencilla: el dinero digital necesita la misma confianza que el de siempre. Por eso combinamos una plataforma
              propia, que comprueba cada wallet y cada transacción, con oficinas donde atendemos en persona.
            </p>
            <p>
              Trabajamos solo con clientes identificados, aplicamos controles de cumplimiento en cada paso y dejamos constancia de todo. Así protegemos tu
              dinero y el de toda la comunidad.
            </p>
          </div>
        </div>
      </section>

      {/* Categorías */}
      <section className="s-section alt" id="servicios">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Nuestros servicios</span>
            <h2>Una plataforma, organizada por categorías</h2>
            <p>Cada servicio de Valorize vive en su propia categoría, con su acceso y sus herramientas.</p>
          </div>
          <Link href="/p2p" className="area">
            <div className="area-main">
              <span className="badge ok">Disponible</span>
              <h3>P2P</h3>
              <p className="area-sub">Cambio presencial de USDT y USDC por euros</p>
              <p className="muted">
                Simula la cotización, solicita tu cambio desde la web o la app, recibe tu QR y completa la operación en nuestra oficina. Con aprobación al
                momento para clientes habituales, historial y justificantes.
              </p>
              <span className="area-cta">
                Entrar en P2P <span aria-hidden>→</span>
              </span>
            </div>
            <ul className="area-list">
              <li>Compra y venta de stablecoins</li>
              <li>TRON, Ethereum, Polygon y BNB Chain</li>
              <li>Cita con QR en la oficina</li>
              <li>Wallets auditadas y verificadas</li>
              <li>Justificante en PDF verificable</li>
              <li>Web y app móvil</li>
            </ul>
          </Link>
        </div>
      </section>

      {/* Principios */}
      <section className="s-section" id="principios">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Cómo trabajamos</span>
            <h2>Seis principios que no negociamos</h2>
          </div>
          <div className="s-cards">
            {PRINCIPLES.map(([icon, t, d]) => (
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

      {/* Acceso */}
      <section className="s-section alt">
        <div className="site-wrap">
          <div className="s-gate">
            <div className="lock" aria-hidden>
              <Icon name="shield" size={28} />
            </div>
            <h2>Acceso solo para clientes verificados</h2>
            <p>
              Valorize no es una plataforma anónima. Para operar, creas tu cuenta y verificas tu identidad una sola vez. A cambio, sabes que todas las personas
              con las que operamos también lo están.
            </p>
            <Link href={access} className="btn primary lg">
              {user ? 'Ir a P2P' : 'Solicitar acceso'}
            </Link>
            <div className="micro">
              ¿Ya tienes cuenta? <Link href="/p2p/login">Entra aquí</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Preguntas */}
      <section className="s-section" id="preguntas">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Preguntas frecuentes</span>
            <h2>Lo que nos suelen preguntar</h2>
          </div>
          <div className="s-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section className="s-section alt" id="contacto">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Contacto</span>
            <h2>Ven a vernos</h2>
            <p>Atendemos con cita previa. Resérvala desde P2P y te esperamos en la oficina.</p>
          </div>
          {locs.data?.length ? (
            <div className="s-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {locs.data.map((l) => (
                <article key={l.id} className="s-card">
                  <div className="ico" aria-hidden>
                    <Icon name="pin" size={22} />
                  </div>
                  <h3>{l.name}</h3>
                  <p>
                    {l.address}, {l.city}
                  </p>
                  <Link href={user ? `/p2p/app/reservar?location=${l.id}` : '/p2p/registro'} className="btn sm" style={{ marginTop: 14 }}>
                    Reservar cita
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className="center muted">{locs.isLoading ? 'Cargando oficinas…' : 'Pronto anunciaremos nuestras oficinas.'}</p>
          )}
        </div>
      </section>

      {/* Llamada final */}
      <section className="s-section s-cta">
        <div className="site-wrap">
          <h2>Opera con la tranquilidad de saber con quién lo haces</h2>
          <p>Crea tu cuenta, verifica tu identidad y empieza con P2P.</p>
          <Link href={access} className="btn primary lg">
            {user ? 'Ir a P2P' : 'Solicitar acceso'}
          </Link>
        </div>
      </section>
    </SitePage>
  );
}
