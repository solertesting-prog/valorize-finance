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
  ['2', 'áreas de servicio: P2P y BOT'],
  ['1 %', 'de riesgo máximo por operación en el BOT'],
  ['100 %', 'de clientes con identidad verificada'],
  ['24/7', 'seguimiento automatizado de los mercados'],
];

const RAILS = ['Gestión del riesgo', 'Método', 'Disciplina', 'Transparencia', 'Cumplimiento', 'Atención en persona', 'Seguridad', 'Trazabilidad'];

/** Lo que hace distinta a Valorize. */
const PRINCIPLES: [string, string, string][] = [
  ['sliders', 'Método antes que intuición', 'Cada decisión sigue reglas definidas y probadas con años de datos. Nada se deja a la emoción del momento.'],
  ['shield', 'El riesgo, siempre acotado', 'Sabemos cuánto se puede perder antes de entrar. Limitar las pérdidas es la primera regla.'],
  ['building', 'Presencia física', 'Oficinas reales y un equipo al que puedes mirar a la cara. Lo digital, con alguien detrás que responde.'],
  ['users', 'Clientes identificados', 'Cada persona que trabaja con nosotros está verificada. Es la base de la confianza entre todos.'],
  ['chart', 'Costes y resultados a la vista', 'Precios, márgenes y evolución, explicados con claridad. Sin letra pequeña.'],
  ['doc', 'Trazabilidad completa', 'Registro de auditoría inalterable y justificantes que cualquiera puede verificar.'],
];

const FAQ: [string, string][] = [
  [
    '¿Qué es Valorize Finance?',
    'Una empresa de inversión y servicios financieros que combina tecnología propia con atención presencial. Hoy ofrecemos dos áreas: BOT, inversión automatizada con gestión del riesgo, y P2P, cambio presencial con cita previa.',
  ],
  [
    '¿Qué es el BOT?',
    'Nuestro sistema de inversión automatizada: sigue la tendencia del mercado con reglas fijas, limita el riesgo de cada operación y te explica cada decisión. Está en beta privada, por invitación.',
  ],
  [
    '¿Qué es P2P?',
    'Nuestro servicio de cambio presencial: consultas la cotización, lo solicitas desde la web o la app, recibes un QR y lo completas en la oficina con nuestro equipo.',
  ],
  [
    '¿Por qué pedís verificar la identidad?',
    'La normativa europea de prevención del blanqueo exige identificar a cada cliente. Lo haces una sola vez y te sirve mientras tu documento esté en vigor.',
  ],
  [
    '¿Dónde estáis?',
    'Puedes ver nuestras oficinas y su dirección en la sección de contacto de esta página y en P2P, donde también puedes reservar cita.',
  ],
  [
    '¿Es esto asesoramiento financiero?',
    'No. Ofrecemos herramientas y servicios, y te damos información clara para que decidas tú. Toda inversión conlleva riesgos, incluida la pérdida del capital.',
  ],
];

const CHECKS: [string, string][] = [
  ['Análisis', 'con reglas definidas'],
  ['Riesgo', 'acotado antes de entrar'],
  ['Ejecución', 'automática y comprobada'],
  ['Seguimiento', 'e informe de cada operación'],
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
            <span className="s-badge">Valorize Finance · Inversión con método</span>
            <h1>
              Haz crecer tu patrimonio <em>con método</em>.
            </h1>
            <p className="lede">
              Tecnología de inversión con reglas claras, riesgo controlado y personas reales al otro lado. Para que tu dinero trabaje con disciplina, no con
              impulsos.
            </p>
            <div className="row" style={{ gap: 12 }}>
              <Link href="#servicios" className="btn primary lg">
                Descubrir los servicios
              </Link>
              <Link href="/bot" className="btn lg">
                Conocer el BOT
              </Link>
            </div>
            <p className="note">Clientes verificados · Riesgo definido · Total transparencia</p>
          </div>

          <aside className="ledger" aria-label="El método Valorize">
            <div className="ledger-head">
              <span className="mono">VALORIZE · MÉTODO</span>
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

      {/* Tira de valores, en lugar de logos de socios */}
      <div className="rails" aria-label="Nuestros valores">
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
            <h2>Invertir bien no va de adivinar el mercado, va de tener un método y cumplirlo.</h2>
          </div>
          <div className="stack">
            <p>
              Valorize Finance nace de una idea sencilla: la disciplina gana a la intuición. Por eso desarrollamos tecnología propia que aplica reglas probadas,
              limita el riesgo y explica cada decisión, y la acompañamos de oficinas donde atendemos en persona.
            </p>
            <p>
              Trabajamos solo con clientes identificados, aplicamos controles de cumplimiento en cada paso y dejamos constancia de todo. Así protegemos tu
              patrimonio y la confianza de todos.
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
          <div className="areas">
            <Link href="/bot" className="area">
              <div className="area-main">
                <span className="badge ok">Beta privada</span>
                <h3>BOT</h3>
                <p className="area-sub">Inversión automatizada con gestión del riesgo</p>
                <p className="muted">
                  Sigue la tendencia del mercado con reglas fijas, arriesga como máximo un 1 % por operación y protege tu capital las 24 horas. Te explica cada
                  decisión y te avisa al momento.
                </p>
                <span className="area-cta">
                  Conocer el BOT <span aria-hidden>→</span>
                </span>
              </div>
              <ul className="area-list">
                <li>Estrategia validada con años de datos</li>
                <li>Stops de protección en el mercado</li>
                <li>Parada automática ante caídas fuertes</li>
                <li>Tu dinero siempre en tu cuenta</li>
              </ul>
            </Link>
            <Link href="/p2p" className="area">
              <div className="area-main">
                <span className="badge ok">Disponible</span>
                <h3>P2P</h3>
                <p className="area-sub">Cambio presencial con cita previa</p>
                <p className="muted">
                  Consulta la cotización, solicítalo desde la web o la app, recibe tu QR y complétalo en nuestra oficina, con justificante de cada operación.
                </p>
                <span className="area-cta">
                  Entrar en P2P <span aria-hidden>→</span>
                </span>
              </div>
              <ul className="area-list">
                <li>Cotización al momento</li>
                <li>Cita con QR en la oficina</li>
                <li>Justificante verificable</li>
                <li>Web y app móvil</li>
              </ul>
            </Link>
          </div>
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
              Valorize no es una plataforma anónima. Creas tu cuenta y verificas tu identidad una sola vez. A cambio, sabes que todas las personas con las que
              trabajamos también lo están.
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
            <p>Atendemos con cita previa. Resérvala online y te esperamos en la oficina.</p>
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
          <h2>Invierte con la tranquilidad de saber cómo y con quién</h2>
          <p>Elige el servicio que encaja contigo y empieza hoy.</p>
          <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
            <Link href="/bot" className="btn primary lg">
              Conocer el BOT
            </Link>
            <Link href="/p2p" className="btn lg">
              Ir a P2P
            </Link>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
