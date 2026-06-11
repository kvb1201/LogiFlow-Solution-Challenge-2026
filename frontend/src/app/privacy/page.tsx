import { LegalPage } from '@/components/legal/LegalPage';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Privacy Policy',
  description: 'Privacy policy for the LogiFlow multimodal freight planning platform.',
  path: '/privacy',
});

const sections = [
  {
    heading: '1. Information Collected',
    content: (
      <>
        <p>
          When you sign in with Google, LogiFlow receives basic profile information from
          your Google account: your name, email address, and profile picture. This information
          is stored in LogiFlow&apos;s database solely to identify your account and personalise
          your experience.
        </p>
        <p>
          We do not collect financial data, sensitive personal information, or any data
          beyond what Google provides during the OAuth authentication flow.
        </p>
      </>
    ),
  },
  {
    heading: '2. Google Authentication',
    content: (
      <p>
        LogiFlow uses Google OAuth 2.0 (via Google Identity Services) as its sole
        authentication method. When you sign in, Google issues a token that LogiFlow
        verifies server-side. Your Google password is never seen or stored by LogiFlow.
        You can revoke LogiFlow&apos;s access at any time from your{' '}
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
          className="text-rail hover:underline"
        >
          Google Account permissions page
        </a>.
      </p>
    ),
  },
  {
    heading: '3. Usage Data',
    content: (
      <p>
        LogiFlow may collect anonymised usage data such as pages visited and features used,
        via Vercel Analytics and Vercel Speed Insights. This data is aggregated and not linked
        to individual users. It is used solely to understand platform performance and improve
        the user experience.
      </p>
    ),
  },
  {
    heading: '4. Shipment Planning Data',
    content: (
      <p>
        Shipment plans and reports you create are stored in LogiFlow&apos;s database and
        associated with your account. This data is used to power the &quot;My Plans&quot; feature.
        We do not sell, share, or analyse your shipment data for any purpose beyond
        operating the platform.
      </p>
    ),
  },
  {
    heading: '5. Cookies and Session Storage',
    content: (
      <p>
        LogiFlow stores your authentication token and user session in browser
        sessionStorage — not in persistent cookies. This means your session ends when you
        close the browser tab. We do not use tracking cookies or third-party advertising
        cookies.
      </p>
    ),
  },
  {
    heading: '6. Data Retention',
    content: (
      <p>
        Your account and associated shipment plans are retained in the database for as long
        as you maintain an account. As an academic project, data may be cleared periodically
        without notice. We do not guarantee long-term data persistence. Export any plans you
        wish to keep.
      </p>
    ),
  },
  {
    heading: '7. Third-Party Services',
    content: (
      <>
        <p>LogiFlow integrates with the following third-party services to provide its features:</p>
        <ul className="mt-2 space-y-1 list-disc pl-5">
          <li><strong className="text-foreground/80">Google OAuth</strong> — user authentication</li>
          <li><strong className="text-foreground/80">TomTom</strong> — road routing and geocoding</li>
          <li><strong className="text-foreground/80">OpenWeatherMap</strong> — weather overlays for route risk</li>
          <li><strong className="text-foreground/80">Supabase</strong> — database and storage</li>
          <li><strong className="text-foreground/80">Vercel</strong> — frontend hosting and analytics</li>
          <li><strong className="text-foreground/80">Google Gemini / Groq</strong> — AI-assisted route explanation</li>
        </ul>
        <p className="mt-2">
          Each of these services operates under its own privacy policy. LogiFlow transmits
          only the minimum data required to call each service (e.g. origin/destination
          coordinates for routing, not personal information).
        </p>
      </>
    ),
  },
  {
    heading: '8. Contact Information',
    content: (
      <p>
        If you have questions about this privacy policy or wish to request deletion of your
        account data, please open an issue on the project&apos;s GitHub repository or contact
        the team through the repository&apos;s listed contact channels. As an open-source
        academic project, we aim to respond to all reasonable requests in a timely manner.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      subtitle="How LogiFlow collects, uses, and protects your information."
      lastUpdated="June 2026"
      sections={sections}
    />
  );
}
