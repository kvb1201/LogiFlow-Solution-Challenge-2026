'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface Section {
  heading: string;
  content: React.ReactNode;
}

interface LegalPageProps {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: Section[];
}

/**
 * Shared layout for legal pages (Terms & Conditions, Privacy Policy).
 * Matches the LogiFlow dark design system.
 */
export function LegalPage({ title, subtitle, lastUpdated, sections }: LegalPageProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
      {/* Back nav */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 focus:outline-none focus-visible:ring-1 focus-visible:ring-rail rounded"
        aria-label="Back to LogiFlow home"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to home
      </Link>

      {/* Header */}
      <header className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">{title}</h1>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
        <p className="text-xs text-muted-foreground mt-2">Last updated: {lastUpdated}</p>
      </header>

      {/* Sections */}
      <div className="space-y-8">
        {sections.map((section, i) => (
          <section
            key={i}
            className="rounded-xl border border-border/50 bg-surface/40 backdrop-blur-sm p-6 sm:p-7"
          >
            <h2 className="text-base font-semibold text-foreground mb-3">{section.heading}</h2>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
              {section.content}
            </div>
          </section>
        ))}
      </div>

      {/* Footer nav */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground border-t border-border/40 pt-8">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms" className="hover:text-foreground transition-colors">Terms &amp; Conditions</Link>
        <span aria-hidden="true">·</span>
        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
        <span aria-hidden="true">·</span>
        <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
      </div>
    </div>
  );
}
