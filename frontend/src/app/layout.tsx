import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'LogiFlow | Multimodal Logistics',
  description:
    'LogiFlow — rail, road, and air cargo intelligence for India. Optimize routes, compare cost and risk, and use live data where it matters.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
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
        </main>
      </body>
    </html>
  );
}
