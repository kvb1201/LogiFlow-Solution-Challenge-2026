/** Google OAuth web client ID — server-readable (Vercel env / backend parity). */
export function getGoogleClientId(): string {
  return (
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
    ''
  );
}
