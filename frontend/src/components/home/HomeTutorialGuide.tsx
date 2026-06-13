'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CircleHelp, PanelLeftClose, X } from 'lucide-react';
import { HOME_TUTORIAL_STEPS } from '@/lib/home-tutorial-steps';
import { accentVar } from '@/lib/pipeline-theme';
import { HomeTutorialStepVisual } from './HomeTutorialVisuals';

const TUTORIAL_INSET = '18rem';
const HIGHLIGHT_CLASS = 'home-tutorial-target';

function useTutorialHighlight(targetId: string | undefined, active: boolean) {
  useEffect(() => {
    if (!active || !targetId) return;

    const el = document.getElementById(targetId);
    if (!el) return;

    el.classList.add(HIGHLIGHT_CLASS);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    return () => {
      el.classList.remove(HIGHLIGHT_CLASS);
    };
  }, [active, targetId]);
}

export function HomeTutorialGuide() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const step = HOME_TUTORIAL_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === HOME_TUTORIAL_STEPS.length - 1;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const root = document.documentElement;
    if (!open) {
      root.classList.remove('home-tutorial-active');
      root.style.removeProperty('--home-tutorial-inset');
      return;
    }
    root.classList.add('home-tutorial-active');
    root.style.setProperty('--home-tutorial-inset', TUTORIAL_INSET);
    return () => {
      root.classList.remove('home-tutorial-active');
      root.style.removeProperty('--home-tutorial-inset');
    };
  }, [open]);

  useTutorialHighlight(step.highlightId, open);

  const close = useCallback(() => {
    setOpen(false);
    setStepIndex(0);
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
      el.classList.remove(HIGHLIGHT_CLASS);
    });
  }, []);

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, HOME_TUTORIAL_STEPS.length - 1));
  }, []);

  const goPrev = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  if (!mounted) return null;

  const dockedPanel = (
    <aside
      className={`fixed z-[199990] flex flex-col border-border/50 bg-background/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out pointer-events-auto
        inset-x-0 bottom-0 max-h-[42dvh] rounded-t-2xl border-t
        lg:inset-x-auto lg:bottom-0 lg:left-0 lg:top-14 lg:max-h-none lg:w-72 lg:rounded-none lg:border-r lg:border-t-0
        ${open ? 'translate-y-0 lg:translate-x-0' : 'translate-y-full lg:-translate-x-full'}`}
      role="complementary"
      aria-label="LogiFlow home tutorial"
      aria-hidden={!open}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border/40 px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-hybrid">
            Try it live · {stepIndex + 1}/{HOME_TUTORIAL_STEPS.length}
          </p>
          <h2 className="mt-0.5 font-headline text-sm font-bold leading-snug text-foreground sm:text-base">
            {step.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={close}
          className="shrink-0 rounded-lg border border-border/40 p-1.5 text-muted-foreground hover:bg-surface/40 hover:text-foreground"
          aria-label="Close tutorial"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
        <div className="mb-3 rounded-lg border border-border/30 bg-surface/15 px-3 py-3">
          <HomeTutorialStepVisual visual={step.visual} />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">{step.body}</p>
        {step.tip ? (
          <p className="mt-2 rounded-lg border border-border/30 bg-surface/10 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Try now: </span>
            {step.tip}
          </p>
        ) : null}
        <p className="mt-2 text-[10px] text-muted-foreground/80">
          The page stays interactive — use the highlighted section while you read.
        </p>
      </div>

      <div className="shrink-0 space-y-2 border-t border-border/40 px-3 py-2.5 sm:px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center gap-1">
          {HOME_TUTORIAL_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Step ${i + 1}`}
              onClick={() => setStepIndex(i)}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === stepIndex ? '1rem' : '0.35rem',
                background:
                  i === stepIndex
                    ? accentVar('hybrid')
                    : 'color-mix(in oklab, var(--foreground) 22%, transparent)',
              }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={isFirst}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-border/40 py-2 text-xs font-medium disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={close}
              className="inline-flex flex-[1.15] items-center justify-center rounded-lg py-2 text-xs font-semibold text-background"
              style={{ background: accentVar('hybrid') }}
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex flex-[1.15] items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold text-background"
              style={{ background: accentVar('hybrid') }}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );

  return createPortal(
    <>
      {dockedPanel}
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="fixed bottom-6 right-4 z-[199980] flex items-center gap-2 rounded-full border border-border/50 bg-surface/95 py-2.5 pl-3.5 pr-4 text-foreground shadow-lg backdrop-blur-md transition-all hover:scale-[1.02] hover:brightness-105 sm:right-6"
        style={{
          boxShadow: `0 8px 32px -8px ${accentVar('hybrid')}, 0 0 0 1px color-mix(in oklab, ${accentVar('hybrid')} 28%, transparent)`,
        }}
        aria-label={open ? 'Close home tutorial' : 'Open home tutorial — need help?'}
        title={open ? 'Close guide' : 'Need help?'}
      >
        {open ? (
          <>
            <PanelLeftClose className="h-4 w-4 shrink-0" style={{ color: accentVar('hybrid') }} />
            <span className="text-xs font-semibold">Close guide</span>
          </>
        ) : (
          <>
            <CircleHelp className="h-4 w-4 shrink-0" style={{ color: accentVar('hybrid') }} />
            <span className="text-xs font-semibold tracking-tight">Need help?</span>
          </>
        )}
      </button>
    </>,
    document.body,
  );
}
