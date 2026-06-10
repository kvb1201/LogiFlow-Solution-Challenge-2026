/** Strip deployment / dev hints before showing API text in the UI. */
export function sanitizeUserMessage(message: string): string {
  const m = message.trim();
  if (!m) return m;

  if (
    /generativelanguage\.googleapis\.com|HTTPSConnectionPool|RESOURCE_EXHAUSTED|HTTP 429|quota|rate.?limit|retry in [\d.]+s/i.test(
      m
    )
  ) {
    return 'AI assist is temporarily unavailable. Route planning still works — use the form below.';
  }

  if (
    /GEMINI_API_KEY|GROQ_API_KEY|start the API server|Render free tier|on the backend/i.test(
      m
    )
  ) {
    if (/wake|unavailable|cold|starting|503|502|504/i.test(m)) {
      return 'LogiFlow is starting up. Please wait about 30 seconds and try again.';
    }
    return 'We could not fully understand that brief. Please check origin and destination.';
  }

  return m
    .replace(/\s*[—–-]\s*set GEMINI_API_KEY.*$/i, '')
    .replace(/\s*[—–-]\s*set GROQ_API_KEY.*$/i, '')
    .trim();
}

export const SERVICE_WAKING_MSG =
  'LogiFlow is starting up. Please wait about 30 seconds and try again.';
