import type { Metadata, Viewport } from 'next';
import 'flag-icons/css/flag-icons.min.css';
import './globals.css';
import { AppProvider } from '@/components/AppProvider';
import { TopBar, SettingsPanel } from '@/components/TopBar';

export const metadata: Metadata = {
  title: 'Match Engine',
  description: 'A football match engine for a management game: squads, tactics, live 2D matches, reports and an engine lab.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

// Applies the saved theme before first paint so the page does not flash the wrong colours.
const themeScript = `try{var t=JSON.parse(localStorage.getItem('me-theme')||'null');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

// The page shell shared by every route: fonts, theme and top bar.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <AppProvider>
          <TopBar />
          <SettingsPanel />
          <main>{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
