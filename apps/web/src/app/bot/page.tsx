'use client';

import Link from 'next/link';
import { BOT_NAV, BOT_PLATFORM_URL, SitePage } from '@/components/site';
import { Icon } from '@/components/ui';

const FACTS: [string, string][] = [
  ['1 %', 'del capital como riesgo máximo por operación'],
  ['20 %', 'de caída máxima antes de parar y salir del mercado'],
  ['24/7', 'vigilando el mercado en un servidor dedicado'],
  ['3 años', 'de datos históricos en cada validación de la estrategia'],
];

const METHOD: [string, string][] = [
  ['Detecta la tendencia', 'Solo entra cuando el precio está en tendencia alcista de fondo y el movimiento tiene fuerza suficiente. En mercados laterales o bajistas, espera.'],
  ['Calcula el tamaño', 'Antes de comprar decide cuánto invertir para que, si sale mal, la pérdida no pase del 1 % de tu capital.'],
  ['Protege la posición', 'Coloca el stop de protección en el propio mercado y lo va subiendo a medida que el precio avanza, para asegurar beneficios.'],
  ['Sale con disciplina', 'Cierra cuando la tendencia se agota o salta el stop. Sin emociones, sin perseguir el precio.'],
];

const RISK: [string, string, string][] = [
  ['shield', 'Sin apalancamiento', 'Solo compra con el capital disponible. Nunca invierte dinero prestado ni opera a la baja.'],
  ['alert', 'Interruptor de seguridad', 'Si el capital cae un 20 % desde su máximo, vende todo y se detiene hasta que tú decidas.'],
  ['sliders', 'Stops según la volatilidad', 'La distancia del stop se adapta a cuánto se mueve el mercado en cada momento.'],
  ['chart', 'Diversificación', 'Puede seguir varios mercados a la vez, con un límite de posiciones abiertas simultáneas.'],
  ['link', 'Tu dinero, en tu cuenta', 'Opera en tu propia cuenta del exchange con claves sin permiso de retirada. Valorize nunca custodia tus fondos.'],
  ['log', 'Validado antes de usarlo', 'Cada cambio de estrategia se prueba con años de datos históricos y en datos que no ha visto antes.'],
];

const TRANSPARENCY: [string, string, string][] = [
  ['users', 'Te explica lo que piensa', 'Para cada mercado, en lenguaje llano: por qué no compra, qué espera o cuándo vendería.'],
  ['chart', 'Laboratorio en la sombra', 'Variantes de la estrategia compiten en paralelo con dinero ficticio y precios reales. Ves cuál rinde mejor antes de cambiar.'],
  ['doc', 'Resultados públicos opcionales', 'Una página de solo lectura con la evolución en porcentaje, sin importes, comparada con comprar y mantener.'],
  ['bell', 'Avisos al momento', 'Cada compra, venta o incidencia te llega por Telegram, y puedes pararlo desde el móvil.'],
];

const FAQ: [string, string][] = [
  ['¿Qué es el BOT de Valorize?', 'Un sistema de inversión automatizada que sigue reglas fijas de tendencia y gestión del riesgo, y opera por ti las 24 horas.'],
  [
    '¿Puedo empezar ya?',
    'La plataforma está en beta privada: el acceso es por invitación y, de momento, cada usuario opera en modo simulado, con precios reales y dinero ficticio. Así puedes ver cómo se comporta antes de nada más.',
  ],
  ['¿Valorize guarda mi dinero?', 'No. Cuando se active el modo real, el bot operará en tu propia cuenta del exchange con claves sin permiso de retirada.'],
  [
    '¿Garantiza beneficios?',
    'No. Ninguna estrategia los garantiza. El bot limita cuánto puedes perder en cada operación y en total, pero puede haber pérdidas, y los resultados pasados no garantizan los futuros.',
  ],
];

export default function Bot() {
  return (
    <SitePage nav={BOT_NAV} section="BOT">
      <section className="s-hero corp">
        <div className="glow" aria-hidden />
        <div className="grid-lines" aria-hidden />
        <div className="site-wrap grid2">
          <div>
            <span className="s-badge">BOT · Inversión automatizada · Beta privada</span>
            <h1>
              Invierte con reglas, <em>no con emociones</em>.
            </h1>
            <p className="lede">
              El BOT de Valorize sigue la tendencia del mercado con un método fijo, limita el riesgo de cada operación y protege tu capital las 24 horas. Tú
              decides cuánto y dónde; él se encarga de la disciplina.
            </p>
            <div className="row" style={{ gap: 12 }}>
              <a href={BOT_PLATFORM_URL} className="btn primary lg" rel="noopener">
                Acceder a la plataforma
              </a>
              <a href="#metodo" className="btn lg">
                Ver el método
              </a>
            </div>
            <p className="note">Acceso por invitación · Modo simulado con precios reales</p>
          </div>

          <aside className="ledger" aria-label="Reglas del BOT">
            <div className="ledger-head">
              <span className="mono">VALORIZE BOT · REGLAS ACTIVAS</span>
              <span className="dot" aria-hidden />
            </div>
            <ol>
              {[
                ['Tendencia', 'confirmada antes de entrar'],
                ['Riesgo', 'máximo 1 % por operación'],
                ['Stop', 'colocado en el mercado'],
                ['Límite', 'parada total al −20 %'],
              ].map(([k, v], i) => (
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
            <div className="ledger-foot mono">Las mismas reglas, en cada operación.</div>
          </aside>
        </div>
      </section>

      <div className="site-wrap">
        <div className="s-stats">
          {FACTS.map(([n, l]) => (
            <div key={l}>
              <div className="n">{n}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="s-section" id="metodo">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">El método</span>
            <h2>Seguir la tendencia, cortar las pérdidas</h2>
            <p>Una estrategia sencilla de explicar y difícil de cumplir a mano: por eso la automatizamos.</p>
          </div>
          <ol className="s-steps">
            {METHOD.map(([t, d]) => (
              <li key={t}>
                <strong>{t}</strong>
                <span>{d}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="s-section alt" id="riesgo">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Gestión del riesgo</span>
            <h2>Primero, no perder demasiado</h2>
          </div>
          <div className="s-cards">
            {RISK.map(([icon, t, d]) => (
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

      <section className="s-section" id="transparencia">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Transparencia</span>
            <h2>Sabes qué hace y por qué</h2>
          </div>
          <div className="s-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {TRANSPARENCY.map(([icon, t, d]) => (
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

      <section className="s-section alt" id="acceso">
        <div className="site-wrap">
          <div className="s-gate">
            <div className="lock" aria-hidden>
              <Icon name="shield" size={28} />
            </div>
            <h2>Beta privada, solo por invitación</h2>
            <p>
              Cada usuario tiene su propia cuenta, su panel y su bot, con verificación en dos pasos. En esta fase el bot opera en modo simulado: precios reales y
              dinero ficticio, para que veas cómo se comporta sin arriesgar nada.
            </p>
            <a href={BOT_PLATFORM_URL} className="btn primary lg" rel="noopener">
              Acceder a la plataforma
            </a>
            <div className="micro">¿Aún no tienes invitación? Pídela en nuestra oficina.</div>
          </div>
        </div>
      </section>

      <section className="s-section">
        <div className="site-wrap">
          <div className="s-head">
            <span className="kicker">Preguntas</span>
            <h2>Antes de empezar</h2>
          </div>
          <div className="s-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          <p className="center small muted" style={{ marginTop: 24, maxWidth: 720, marginInline: 'auto' }}>
            El BOT es una herramienta, no una recomendación de inversión. Usa solo dinero que puedas permitirte perder. <Link href="/">Volver a Valorize Finance</Link>
          </p>
        </div>
      </section>
    </SitePage>
  );
}
