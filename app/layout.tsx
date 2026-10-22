import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Rage Relay — One More Try',
  description: 'Race with up to four friends across three trap-filled courses. No sign-up.',
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#141915' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
