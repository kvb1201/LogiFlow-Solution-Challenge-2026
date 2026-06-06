import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';
import { BackendWarmup } from '@/components/BackendWarmup';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';

export const metadata: Metadata = {
  title: 'LogiFlow — Multimodal Logistics',
  description:
    'Compare rail, road, air, water, and hybrid freight routes with live data, AI-assisted planning, and explainable recommendations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh flex flex-col overflow-x-hidden font-body [overflow-wrap:anywhere]" suppressHydrationWarning>
        <BackendWarmup />
        <NavBar />
        <main className="relative isolate flex-1 min-h-0 overflow-x-hidden overflow-y-auto">
          <AmbientBackdrop variant="subtle" className="opacity-60" />
          <div className="relative z-10 w-full pointer-events-auto">{children}</div>
        </main>
      </body>
    </html>
  );
}
