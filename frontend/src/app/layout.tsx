import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';
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
<<<<<<< Updated upstream
      <body className="h-full flex flex-col overflow-x-hidden font-body bg-[#06080d]" suppressHydrationWarning>
        <NavBar />
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          <div className="pointer-events-none absolute inset-0 z-0">
            <div className="absolute w-[800px] h-[800px] rounded-full blur-[140px] opacity-[0.08] bg-primary -top-[35%] -left-[20%] animate-mesh-1" />
            <div className="absolute w-[680px] h-[680px] rounded-full blur-[120px] opacity-[0.07] bg-tertiary -bottom-[35%] -right-[20%] animate-mesh-2" />
          </div>
          <div className="relative z-10 flex-1 flex flex-col min-h-0">
          {children}
          </div>
=======
      <body className="min-h-dvh flex flex-col overflow-x-hidden font-body" suppressHydrationWarning>
        <NavBar />
        <main className="relative isolate flex-1 min-h-0 overflow-x-hidden overflow-y-auto">
          <AmbientBackdrop variant="subtle" className="opacity-60" />
          <div className="relative z-10 w-full">{children}</div>
>>>>>>> Stashed changes
        </main>
      </body>
    </html>
  );
}
