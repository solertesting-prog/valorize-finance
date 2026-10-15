import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { ENV, Env } from '../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  /** Texto plano; se genera también una versión HTML con la plantilla corporativa. */
  text: string;
  cta?: { label: string; url: string };
}

/** Canal de correo (SMTP) — cualquier proveedor compatible: SES, Postmark, Mailgun, Mailpit en local. */
@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter!: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {}

  onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT,
      secure: this.env.SMTP_SECURE,
      auth: this.env.SMTP_USER ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS } : undefined,
    });
  }

  async send(msg: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.env.MAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        text: msg.cta ? `${msg.text}\n\n${msg.cta.label}: ${msg.cta.url}` : msg.text,
        html: renderEmail(msg),
      });
    } catch (e) {
      this.logger.error(`Fallo enviando email a ${maskEmail(msg.to)}: ${(e as Error).message}`);
      throw e;
    }
  }
}

/** Canal SMS: Twilio en producción, consola en desarrollo. */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(to: string, body: string): Promise<void> {
    if (this.env.SMS_PROVIDER === 'console') {
      this.logger.log(`[SMS → ${to}] ${body}`);
      return;
    }
    const sid = this.env.TWILIO_ACCOUNT_SID!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${this.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: this.env.TWILIO_FROM!, Body: body }),
    });
    if (!res.ok) {
      this.logger.error(`Twilio ${res.status}: ${await res.text()}`);
      throw new Error('No se pudo enviar el SMS');
    }
  }
}

export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Push móvil vía Expo Push API (APNs + FCM). Devuelve los tokens inválidos para limpiarlos. */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(msg: PushMessage): Promise<string[]> {
    const tokens = msg.tokens.filter((t) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));
    if (!tokens.length) return [];
    const invalid: string[] = [];
    for (let i = 0; i < tokens.length; i += 100) {
      const chunk = tokens.slice(i, i + 100);
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(this.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${this.env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          body: JSON.stringify(
            chunk.map((to) => ({ to, title: msg.title, body: msg.body, data: msg.data ?? {}, sound: 'default' })),
          ),
        });
        const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
        json.data?.forEach((r, idx) => {
          if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') invalid.push(chunk[idx]);
        });
      } catch (e) {
        this.logger.warn(`Fallo en Expo Push: ${(e as Error).message}`);
      }
    }
    return invalid;
  }
}

function maskEmail(e: string) {
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}***@${d}`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function renderEmail(msg: EmailMessage): string {
  const paragraphs = msg.text
    .split('\n\n')
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const cta = msg.cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(msg.cta.url)}" style="background:#24CF8A;color:#07111C;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">${escapeHtml(msg.cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#07111C;font-family:'Courier New',monospace;color:#E6EDF3">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#13263A;border-radius:16px">
<tr><td style="padding:32px">
<div style="color:#24CF8A;font-weight:700;letter-spacing:1px">VALORIZE</div>
<div style="color:#E6EDF3;font-weight:700;margin-bottom:24px">FINANCE</div>
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(msg.subject)}</h1>
${paragraphs}${cta}
</td></tr></table>
<p style="color:#7A8A9A;font-size:12px;margin-top:16px">Valorize Finance · Este mensaje se ha enviado automáticamente.</p>
</td></tr></table></body></html>`;
}
