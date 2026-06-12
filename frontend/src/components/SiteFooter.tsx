import Link from 'next/link';

/**
 * Minimal site-wide footer — shows legal links on all public pages.
 * Kept lightweight to avoid visual competition with the main content.
 */
export function SiteFooter() {
  return (
    <footer className="relative shrink-0 min-h-[var(--site-footer-height)] border-t border-border/40 bg-background/60 backdrop-blur-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-50"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--rail), var(--road), var(--water), var(--hybrid), transparent)',
        }}
      />
      <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} LogiFlow — Google Solution Challenge 2026
        </p>
        <nav
          aria-label="Legal navigation"
          className="flex items-center gap-3 text-[11px] text-muted-foreground"
        >
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-rail rounded"
          >
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-rail rounded"
          >
            Terms &amp; Conditions
          </Link>
        </nav>
      </div>
    </footer>
  );
}
