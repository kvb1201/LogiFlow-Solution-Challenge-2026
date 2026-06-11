'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { transcribeSpeechAudio } from '@/services/api';

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export type UseSpeechToTextOptions = {
  lang?: string;
  onFinalTranscript: (text: string) => void;
};

export function useSpeechToText({ lang = 'en-IN', onFinalTranscript }: UseSpeechToTextOptions) {
  const supported = useSyncExternalStore(
    () => () => {},
    () =>
      !!getSpeechRecognition() ||
      (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia),
    () => false
  );
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [serverMode, setServerMode] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const serverModeRef = useRef(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopServerRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      stopStream();
      setListening(false);
    }
  }, [stopStream]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      stopServerRecording();
      stopStream();
    };
  }, [stopServerRecording, stopStream]);

  const stop = useCallback(() => {
    if (serverModeRef.current) {
      stopServerRecording();
      return;
    }
    recognitionRef.current?.stop();
    setListening(false);
  }, [stopServerRecording]);

  const startServerRecording = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone recording is not available in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickRecorderMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        setListening(false);
        stopStream();
        recorderRef.current = null;
        const blob = new Blob(chunksRef.current, {
          type: mime || recorder.mimeType || 'audio/webm',
        });
        chunksRef.current = [];
        if (blob.size < 800) {
          setError('Recording too short — hold the mic and speak your shipment details.');
          return;
        }
        try {
          setHint('Transcribing…');
          const text = await transcribeSpeechAudio(blob);
          if (text.trim()) onFinalTranscript(text.trim());
          setHint(null);
        } catch (e: unknown) {
          setHint(null);
          setError(
            e instanceof Error
              ? e.message
              : 'Server transcription failed — type your brief or try again.'
          );
        }
      };
      recorder.onerror = () => {
        setError('Recording failed — try again or type your brief.');
        setListening(false);
        stopStream();
      };
      recorderRef.current = recorder;
      recorder.start(250);
      serverModeRef.current = true;
      setServerMode(true);
      setListening(true);
      setHint('Recording… tap the mic again when you finish speaking.');
    } catch {
      setError('Microphone permission denied. Allow mic access in browser settings.');
      setListening(false);
    }
  }, [onFinalTranscript, stopStream]);

  const startWebSpeech = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      void startServerRecording();
      return;
    }
    setError(null);
    setHint(null);

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalChunk += result[0].transcript;
        }
      }
      if (finalChunk.trim()) {
        onFinalTranscript(finalChunk.trim());
      }
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Allow mic access and try again.');
        setListening(false);
        return;
      }
      if (event.error === 'network' || event.error === 'service-not-available') {
        recognition.abort();
        recognitionRef.current = null;
        setListening(false);
        serverModeRef.current = true;
        setServerMode(true);
        void startServerRecording();
        return;
      }
      setError(`Speech error: ${event.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      if (!serverModeRef.current) setListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      setHint('Listening… speak origin, destination, weight, and deadline.');
    } catch {
      void startServerRecording();
    }
  }, [lang, onFinalTranscript, startServerRecording]);

  const start = useCallback(() => {
    if (serverModeRef.current) {
      void startServerRecording();
      return;
    }
    startWebSpeech();
  }, [startServerRecording, startWebSpeech]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, error, hint, serverMode, toggle, stop, start };
}
