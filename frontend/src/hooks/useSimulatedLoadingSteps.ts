'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getMultimodalLoadingConfig,
  multimodalStepProgress,
  type MultimodalLoadingVariant,
} from '@/lib/multimodal-loading-steps';

export function useSimulatedLoadingSteps(
  variant: MultimodalLoadingVariant,
  loading: boolean
) {
  const config = useMemo(() => getMultimodalLoadingConfig(variant), [variant]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(-1);
  const [tipIndex, setTipIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading) {
      setStartedAt(null);
      setStepIndex(-1);
      setTipIndex(0);
      setElapsed(0);
      return;
    }

    const start = Date.now();
    setStartedAt(start);
    setStepIndex(0);
    setTipIndex(0);
    setElapsed(0);

    const stepTimer = setInterval(() => {
      const ms = Date.now() - start;
      let next = 0;
      for (let i = config.stepDelaysMs.length - 1; i >= 0; i -= 1) {
        if (ms >= config.stepDelaysMs[i]) {
          next = Math.min(i, config.steps.length - 1);
          break;
        }
      }
      setStepIndex(next);
      setElapsed(ms);
    }, 350);

    const tipTimer = setInterval(() => {
      setTipIndex((i) => (i + 1) % config.tips.length);
    }, 4200);

    return () => {
      clearInterval(stepTimer);
      clearInterval(tipTimer);
    };
  }, [loading, config]);

  const progress = useMemo(
    () => multimodalStepProgress(stepIndex, config.steps.length),
    [stepIndex, config.steps.length]
  );

  const activeStep = stepIndex >= 0 ? config.steps[stepIndex] : null;
  const tip = config.tips[tipIndex] ?? config.tips[0];

  return {
    config,
    startedAt,
    stepIndex,
    progress,
    elapsed,
    activeStep,
    tip,
  };
}
