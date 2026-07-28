import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegistrarSW from '@/components/RegistrarSW';

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
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
