'use client';

import React, { useCallback, useSyncExternalStore } from 'react';
import { useSpeechToText } from '@/hooks/useSpeechToText';

type ParagraphInputWithSttProps = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  lang?: string;
  id?: string;
};

export default function ParagraphInputWithStt({
  value,
  onChange,
  rows = 4,
  placeholder,
  className = '',
  lang = 'en-IN',
  id,
}: ParagraphInputWithSttProps) {
  const appendTranscript = useCallback(
    (chunk: string) => {
      const trimmed = chunk.trim();
      if (!trimmed) return;
      onChange(value.trim() ? `${value.trim()} ${trimmed}` : trimmed);
    },
    [value, onChange]
  );

  const { supported, listening, error, toggle } = useSpeechToText({
    lang,
    onFinalTranscript: appendTranscript,
  });
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const showMic = mounted && supported;

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className={`w-full ${showMic ? 'pr-12' : ''} ${className}`}
        />
        {showMic && (
          <button
            type="button"
            onClick={toggle}
            title={listening ? 'Stop listening' : 'Speak your shipment details'}
            aria-label={listening ? 'Stop speech input' : 'Start speech input'}
            className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${
              listening
                ? 'border-red-400/50 bg-red-500/20 text-red-200 animate-pulse'
                : 'border-violet-400/30 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden>
              {listening ? 'stop_circle' : 'mic'}
            </span>
          </button>
        )}
      </div>
      {listening && (
        <p className="text-[11px] text-violet-200/90 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
          Listening… speak your corridor, cargo, budget, and deadline.
        </p>
      )}
      {mounted && !supported && (
        <p className="text-[10px] text-outline">
          Voice input is supported in Chrome and Edge.
        </p>
      )}
      {error && (
        <p className="text-[11px] text-red-300 border border-red-400/20 bg-red-500/10 rounded-lg px-2 py-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
