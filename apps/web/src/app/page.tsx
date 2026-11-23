'use client';

import Link from 'next/link';
import { SitePage, Simulator } from '@/components/site';
import { Icon } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Cifras del producto (hechos verificables, no métricas de negocio). */
const STATS = [
  ['4', 'redes: TRON, Ethereum, Polygon y BNB Chain'],
  ['2', 'stablecoins: USDT y USDC'],
  ['100 %', 'de las wallets auditadas antes de operar'],
  ['1 QR', 'por cita, validado en la oficina'],
];

const BENEFITS: [string, string, string][] = [
  ['chart', 'Cotización al momento', 'Precio de mercado con el margen a la vista. Sabes cuánto recibes antes de reservar.'],
  ['building', 'Oficinas físicas', 'Cambias cara a cara con nuestro equipo, no con un desconocido de internet.'],
  ['shield', 'Wallets auditadas', 'Revisamos sanciones internacionales, bloqueos de Tether y Circle y el historial de cada wallet.'],
  ['link', 'Comprobado en blockchain', 'Cada transacción se verifica en la red: importe, token, origen y destino.'],
  ['doc', 'Justificante verificable', 'Recibes un PDF con código de verificación que cualquiera puede comprobar.'],
  ['qr', 'Cita con QR', 'Reservas desde la web o la app y entras con tu QR, sin colas ni papeles.'],
];

const STEPS: [string, string][] = [
  ['Crea tu cuenta', 'Regístrate y verifica tu identidad una sola vez.'],
  ['Solicita tu cambio', 'Elige oficina, importe, red y tu wallet. Ves la cotización al momento.'],
  ['Recibe tu QR', 'Revisamos la solicitud y la wallet. Al aprobarla, tu QR llega al móvil.'],
  ['Cambia en la oficina', 'Muestras el QR, se completa la operación y te llevas el justificante.'],
];

const FAQ: [string, string][] = [
  [
    '¿Qué es Valorize Finance?',
    'Una red de oficinas para cambiar USDT y USDC por euros (y euros por USDT o USDC) en persona, con cita previa. Todo el proceso se gestiona desde la web o la app.',
  ],
  [
    '¿Por qué tengo que verificar mi identidad?',
    'La normativa de prevención del blanqueo nos obliga a identificar a cada cliente. Lo haces una vez y sirve para todas tus operaciones mientras tu documento esté en vigor.',
  ],
  [
    '¿Cómo sé cuánto voy a recibir?',
    'El simulador te muestra la cotización orientativa con el tipo de mercado y nuestro margen. El importe final se confirma al aprobar la solicitud o en la oficina.',
  ],
  [
    '¿Qué redes y monedas aceptáis?',
    'USDT y USDC en TRON, Ethereum, Polygon y BNB Chain. Al pedir el cambio te guiamos para elegir la red correcta en tu wallet.',
  ],
  [
    '¿Por qué revisáis mi wallet?',
    'Comprobamos que no esté sancionada ni bloqueada y, en importes altos, que es tuya (firmando un mensaje con ella, sin mover fondos). Protege tu dinero y el de todos.',
  ],
  [
    '¿Qué pasa si me equivoco de red?',
    'Los fondos enviados por una red distinta se pueden perder. Por eso te pedimos confirmar la red antes de continuar y lo recordamos en tu cita.',
  ],
  [
    '¿Cuánto tarda la aprobación?',
    'Revisamos cada solicitud antes de la cita. Los clientes habituales con todo en regla pueden tener la aprobación al momento.',
  ],
];

export default function Landing() {
  const { user } = useAuth();
  const start = user ? '/app/reservar' : '/registro';
  return (
    <SitePage>
      {/* Mensaje principal */}
      <section className="s-hero">
        <div className="glow" aria-hidden />
        <div className="site-wrap grid2">
          <div>
            <span className="s-badge">Cambio presencial · Barcelona</span>
            <h1>
              Cambia cripto por euros, <em>cara a cara</em> y con todas las garantías.
            </h1>
            <p className="lede">
              Vende o compra USDT y USDC en nuestras oficinas. Cotización al momento, wallet auditada y cada operación comprobada en la blockchain. Reserva desde
              el móvil y entra con tu QR.
            </p>
            <div className="row" style={{ gap: 12 }}>
              <Link href={start} className="btn primary lg">
                Solicitar mi cambio
              </Link>
              <Link href="/p2p" className="btn lg">
                Descubrir P2P
              </Link>
            </div>
            <p className="note">Identidad verificada · Comisiones a la vista · Justificante en cada operación</p>
          </div>
          <Simulator />
        </div>
      </section>

      {/* Cifras */}
      <div className="site-wrap" style={{ marginBottom: 8 }}>
        <div className="s-stats">
          {STATS.map(([n, l]) => (
            <div key={l}>
              <div className="n">{n}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Ventajas */}
      <section className="s-section" id="seguridad">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Por qué Valorize</span>
            <h2>La seguridad de una oficina. La comodidad de una app.</h2>
            <p>Todo lo que necesitas para cambiar cripto sin riesgos innecesarios.</p>
          </div>
          <div className="s-cards">
            {BENEFITS.map(([icon, t, d]) => (
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

      {/* Acceso con identidad verificada */}
      <section className="s-section alt">
        <div className="site-wrap">
          <div className="s-gate">
            <div className="lock" aria-hidden>
              <Icon name="shield" size={28} />
            </div>
            <h2>Solo con identidad verificada</h2>
            <p>
              Para proteger a nuestros clientes y cumplir la normativa, cada persona que opera con nosotros está identificada y cada wallet, revisada. Crea tu
              cuenta y completa la verificación una sola vez.
            </p>
            <Link href={start} className="btn primary lg">
              {user ? 'Solicitar un cambio' : 'Crear mi cuenta'}
            </Link>
            <div className="micro">Te avisamos en cuanto revisemos tu verificación.</div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="s-section" id="como-funciona">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Cómo funciona</span>
            <h2>De la solicitud al cambio, en cuatro pasos</h2>
          </div>
          <ol className="s-steps">
            {STEPS.map(([t, d]) => (
              <li key={t}>
                <strong>{t}</strong>
                <span>{d}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Categoría P2P */}
      <section className="s-section alt">
        <div className="site-wrap">
          <div className="s-cat">
            <div>
              <span className="kicker">Categoría</span>
              <h2 style={{ fontSize: 'clamp(1.7rem, 3.2vw, 2.4rem)', margin: '10px 0 8px' }}>P2P: cambio presencial de stablecoins</h2>
              <p className="muted" style={{ margin: 0 }}>
                Toda la plataforma de cambio de Valorize en un solo lugar: simulador, solicitud, oficinas, cita con QR y seguimiento de cada operación.
              </p>
              <ul>
                <li>Compra y venta de USDT y USDC</li>
                <li>Cuatro redes con guía para no equivocarte</li>
                <li>Aprobación al momento para clientes habituales</li>
                <li>Historial y justificantes en tu cuenta</li>
              </ul>
            </div>
            <div className="stack" style={{ alignItems: 'stretch' }}>
              <Link href="/p2p" className="btn primary lg">
                Entrar en P2P
              </Link>
              <Link href={start} className="btn lg">
                Solicitar mi cambio
              </Link>
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

      {/* Llamada final */}
      <section className="s-section alt s-cta">
        <div className="site-wrap">
          <h2>¿Listo para tu primer cambio?</h2>
          <p>Crea tu cuenta, verifica tu identidad y reserva tu cita en la oficina más cercana.</p>
          <Link href={start} className="btn primary lg">
            {user ? 'Solicitar un cambio' : 'Empezar ahora'}
          </Link>
        </div>
      </section>
    </SitePage>
  );
}
