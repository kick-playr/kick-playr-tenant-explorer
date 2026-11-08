import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Explorer } from '@/components/explorer';
import { headers } from 'next/headers';
import { serverComponentRealm } from '@/lib/server-component-realm';
import { RealmUnavailable } from '@/components/realm-unavailable';
import { proxyRequest } from '@/lib/proxy';
import { ClubExplorer, type ClubSummary } from '@/components/club-explorer';

export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    section?: string;
    club?: string;
    environment?: string;
  }>;
}) {
  const result = await serverComponentRealm(
    (await headers()).get('host') ?? '',
  );
  if (!result.ok) return <RealmUnavailable />;
  const { UserButton } = await import('@clerk/nextjs');
  const { auth } = await import('@clerk/nextjs/server');
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
  const query = await searchParams;
  const teamClub =
    query.section === 'teams'
      ? access.items?.find(
          (c) => c.id === query.club && c.environment === query.environment,
        )
      : undefined;
  if (query.section === 'teams' && !teamClub)
    return (
      <main className="setup-page">
        <div className="setup-card">
          <h1>Club access unavailable</h1>
          <p>
            The requested club or environment is not available to this account.
          </p>
          <Link href="/?view=club">My clubs</Link>
        </div>
      </main>
    );
  if (
    (access.role === 'club-admin' || query.view === 'club') &&
    access.items?.length
  )
    return (
      <ClubExplorer
        staticVault={!!process.env.VAULT_APPLICATION_ID}
        clubs={access.items}
        initialSection={teamClub ? 'teams' : undefined}
        initialClub={
          teamClub
            ? { id: teamClub.id, environment: teamClub.environment }
            : undefined
        }
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
        staticVault={!!process.env.VAULT_APPLICATION_ID}
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
