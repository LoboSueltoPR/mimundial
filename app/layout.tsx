import type { Metadata, Viewport } from 'next';
import { Anton, Inter } from 'next/font/google';
import './globals.css';
import RegistrarSW from '@/components/RegistrarSW';
import Arranque from '@/components/Arranque';

// Anton: condensada y pesada, de cartel de estadio y número de camiseta.
const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--fuente-anton', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--fuente-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'MiMundial',
  description: 'Tu registro de picaditos: quién juega, quién debe y cómo salió.',
  manifest: '/manifest.json',
  applicationName: 'MiMundial',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'MiMundial' },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#eceff4',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${anton.variable} ${inter.variable}`}>
      <body>
        <Arranque />
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
