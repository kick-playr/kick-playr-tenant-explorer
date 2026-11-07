import type { Metadata } from 'next';
import './globals.css';
import { themeCss, themeInitScript } from '@/lib/theme';
import { headers } from 'next/headers';
import { serverComponentRealm } from '@/lib/server-component-realm';
import { RealmUnavailable } from '@/components/realm-unavailable';

export const metadata: Metadata = {
  title: 'Tenant Explorer · Kick Playr',
  description: 'Kick Playr platform administration for club tenants.',
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const result = await serverComponentRealm(
    (await headers()).get('host') ?? '',
  );
  const Provider = result.ok
    ? (await import('@clerk/nextjs')).ClerkProvider
    : undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style>{themeCss}</style>

        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {result.ok && Provider ? (
          <Provider
            publishableKey={result.realm.publishableKey}
            appearance={{
              variables: {
                colorBackground: 'var(--theme-surface)',
                colorForeground: 'var(--ink)',
                colorMutedForeground: 'var(--muted)',
                colorPrimary: 'var(--green)',
                colorInput: 'var(--theme-surface)',
                colorInputForeground: 'var(--ink)',
                colorPrimaryForeground: 'var(--theme-button-ink)',
              },
            }}
            signInUrl="/sign-in"
            signInFallbackRedirectUrl="/"
            afterSignOutUrl="/"
          >
            {children}
          </Provider>
        ) : (
          <RealmUnavailable />
        )}
      </body>
    </html>
  );
}
