import { auth } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { Explorer } from '@/components/explorer';
import { clerkConfigured, isPlatformAdmin } from '@/lib/platform';

export const dynamic = 'force-dynamic';
export default async function Page() {
  if (!clerkConfigured())
    return (
      <main className="setup-page">
        <div className="setup-card">
          <span className="brand-mark">
            k<span>.</span>
          </span>
          <div className="eyebrow">KICK PLAYR · PLATFORM CONSOLE</div>
          <h1>Connect your explorer.</h1>
          <p>
            The frontend is ready. Configure Clerk, the explorer API origin, and
            the platform administrator IDs in <code>.env.local</code> to sign
            in.
          </p>
          <p>
            Use <code>.env.example</code> in each repository for the required
            values. The API uses the existing tenant control database and
            requires a separate credential encryption key.
          </p>
          <span className="setup-label">Waiting for configuration</span>
        </div>
      </main>
    );
  const session = await auth();
  if (!session.userId) redirect('/sign-in');
  if (!isPlatformAdmin(session.userId))
    return (
      <main className="setup-page">
        <div className="setup-card">
          <div className="eyebrow">PLATFORM ACCESS</div>
          <h1>Administrator access required.</h1>
          <p>
            This account is signed in, but is not in the explorer’s platform
            administrator allowlist.
          </p>
          <p>Use an authorized operator account.</p>
          <UserButton />
        </div>
      </main>
    );
  return <Explorer account={<UserButton />} />;
}
