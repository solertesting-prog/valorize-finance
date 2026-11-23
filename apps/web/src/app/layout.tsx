import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Valorize Finance', template: '%s · Valorize Finance' },
  description: 'Valorize Finance: servicios financieros con activos digitales, oficinas físicas y clientes verificados. P2P: cambio presencial de USDT y USDC por euros.',
  applicationName: 'Valorize Finance',
};

export const viewport: Viewport = {
  themeColor: '#07111c',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
