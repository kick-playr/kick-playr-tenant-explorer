import { BrandLogo } from '@/components/theme-logo';
import { auth } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Explorer } from '@/components/explorer';
import { headers } from 'next/headers';
import { realmForHost } from '@/lib/server-realms';
import { proxyRequest } from '@/lib/proxy';
import { ClubExplorer, type ClubSummary } from '@/components/club-explorer';

export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const realm = await realmForHost((await headers()).get('host') ?? '');
  if (!realm.publishableKey || !realm.secretKey)
    return (
      <main className="setup-page">
        <div className="setup-card">
          <BrandLogo priority />
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
  const response = await proxyRequest(
    new Request('http://explorer.internal/api/explorer/access'),
    ['access'],
    await session.getToken(),
    process.env.EXPLORER_API_ORIGIN ?? '',
  );
  const access = (await response.json()) as {
    role?: string;
    items?: ClubSummary[];
  };
  if (!response.ok)
    return (
      <main className="setup-page">
        <div className="setup-card">
          <div className="eyebrow">EXPLORER ACCESS</div>
          <h1>Administrator access required.</h1>
          <p>
            {response.status === 403
              ? 'This account has no active platform or club administrator access.'
              : 'Explorer access could not be verified. Check the API connection and try again.'}
          </p>
          <p>Your administrator can assign access to your club.</p>
          <p>
            Signed-in Clerk user ID: <code>{session.userId}</code>
          </p>
          <UserButton />
        </div>
      </main>
    );
  if (
    (access.role === 'club-admin' || (await searchParams).view === 'club') &&
    access.items?.length
  )
    return (
      <ClubExplorer
        clubs={access.items}
        account={
          <>
            {access.role === 'platform-admin' && (
              <Link className="text-button" href="/">
                Platform console
              </Link>
            )}
            <UserButton />
          </>
        }
      />
    );
  if (access.role === 'platform-admin')
    return (
      <Explorer
        account={
          <>
            {access.items?.length && (
              <Link className="text-button" href="/?view=club">
                My club settings
              </Link>
            )}
            <UserButton />
          </>
        }
      />
    );
  throw new Error('Invalid explorer access response');
}
