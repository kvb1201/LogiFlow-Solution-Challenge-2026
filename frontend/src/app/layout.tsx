import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LogiFlow | Logistics Intelligence',
  description: 'AI-powered multimodal logistics optimization system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark min-h-screen antialiased" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{__html: `
          .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
          }
        `}} />
      </head>
      <body className="min-h-dvh bg-[var(--color-background)] text-[var(--color-on-surface)] flex flex-col font-body overflow-x-hidden" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
