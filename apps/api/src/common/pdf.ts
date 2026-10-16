/**
 * Generador de PDF mínimo, sin dependencias: texto (Helvetica / Helvetica-Bold), líneas y rectángulos.
 * Suficiente para justificantes de una página. Codificación WinAnsi (acentos, ñ, €).
 */

type Font = 'R' | 'B';
type Rgb = [number, number, number];

const WIN_ANSI_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
};

/** Convierte texto a bytes WinAnsi escapados para un string literal de PDF. */
function pdfString(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    let b: number;
    if (WIN_ANSI_EXTRA[ch] !== undefined) b = WIN_ANSI_EXTRA[ch];
    else if (code >= 0x20 && code <= 0xff && !(code >= 0x7f && code <= 0x9f)) b = code;
    else b = 0x3f; // '?'
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) out += `\\${b.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(b);
  }
  return `(${out})`;
}

/** Anchos aproximados de Helvetica (por mil) para recortar y alinear texto. */
function approxWidth(text: string, size: number, font: Font) {
  let w = 0;
  for (const ch of text) {
    if ('il.,:;|!\'·'.includes(ch)) w += 250;
    else if ('fjrtI '.includes(ch)) w += 300;
    else if ('mwMW'.includes(ch)) w += 850;
    else if (ch >= 'A' && ch <= 'Z') w += 680;
    else if (ch >= '0' && ch <= '9') w += 556;
    else w += 530;
  }
  return (w / 1000) * size * (font === 'B' ? 1.06 : 1);
}

export class PdfPage {
  readonly width = 595.28; // A4
  readonly height = 841.89;
  private ops: string[] = [];

  /** Texto con origen arriba-izquierda (y crece hacia abajo). */
  text(x: number, y: number, text: string, opts: { size?: number; font?: Font; color?: Rgb; align?: 'left' | 'right' } = {}) {
    const size = opts.size ?? 10;
    const font = opts.font ?? 'R';
    const [r, g, b] = opts.color ?? [0.03, 0.07, 0.11];
    const px = opts.align === 'right' ? x - approxWidth(text, size, font) : x;
    this.ops.push(`BT /F${font} ${size} Tf ${r} ${g} ${b} rg ${px.toFixed(2)} ${(this.height - y - size).toFixed(2)} Td ${pdfString(text)} Tj ET`);
    return this;
  }

  /** Texto partido en líneas que caben en `maxWidth`; devuelve la altura usada. */
  wrap(x: number, y: number, text: string, maxWidth: number, opts: { size?: number; font?: Font; color?: Rgb; lineHeight?: number } = {}) {
    const size = opts.size ?? 10;
    const lh = opts.lineHeight ?? size * 1.35;
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const cand = line ? `${line} ${word}` : word;
      if (approxWidth(cand, size, opts.font ?? 'R') > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = cand;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => this.text(x, y + i * lh, l, opts));
    return lines.length * lh;
  }

  rect(x: number, y: number, w: number, h: number, fill: Rgb) {
    this.ops.push(`${fill.join(' ')} rg ${x.toFixed(2)} ${(this.height - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Rgb = [0.85, 0.87, 0.9], width = 0.8) {
    this.ops.push(`${color.join(' ')} RG ${width} w ${x1.toFixed(2)} ${(this.height - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.height - y2).toFixed(2)} l S`);
    return this;
  }

  content() {
    return this.ops.join('\n');
  }
}

/** Ensambla un PDF de una página. */
export function renderPdf(page: PdfPage, meta: { title: string; author?: string }): Buffer {
  const content = Buffer.from(page.content(), 'latin1');
  const objects: (string | Buffer)[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /FR 4 0 R /FB 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream', 'latin1')]),
    `<< /Title ${pdfString(meta.title)} /Author ${pdfString(meta.author ?? 'Valorize Finance')} /Producer (Valorize) /CreationDate (D:${pdfDate(new Date())}) >>`,
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets: number[] = [];
  let pos = parts[0].length;
  objects.forEach((o, i) => {
    offsets.push(pos);
    const body = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), typeof o === 'string' ? Buffer.from(o, 'latin1') : o, Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(body);
    pos += body.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}

function pdfDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
