/** @type {import('next').NextConfig} */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

// Origen del almacenamiento S3 (subidas directas desde el navegador y lectura de documentos).
const S3_ORIGIN = process.env.S3_PUBLIC_ORIGIN ?? 'https://*.amazonaws.com';

// Instancia de OpenScan que el backoffice muestra integrada (debe coincidir con OPENSCAN_URL de la API).
const OPENSCAN_ORIGIN = process.env.OPENSCAN_ORIGIN ?? 'https://openscan.eth.link https://openscan.eth.limo https://openscan-explorer.github.io';

const csp = [
  "default-src 'self'",
  // Next.js inserta scripts inline de hidratación.
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://*.basemaps.cartocdn.com ${S3_ORIGIN}`,
  `connect-src 'self' ${S3_ORIGIN}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  `frame-src ${S3_ORIGIN} ${OPENSCAN_ORIGIN}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // La cámara solo la usa el escáner del panel del empleado (mismo origen).
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

export default {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@valorize/shared'],
  poweredByHeader: false,
  async rewrites() {
    // La web y la API comparten origen: la cookie de sesión es SameSite=Strict y no hace falta CORS.
    return [{ source: '/api/v1/:path*', destination: `${API_INTERNAL_URL}/v1/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
