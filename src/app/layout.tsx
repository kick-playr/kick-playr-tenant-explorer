import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { themeCss, themeInitScript } from '@/lib/theme';
import { headers } from 'next/headers';
import { realmForHost } from '@/lib/server-realms';

export const metadata: Metadata = {
  title: 'Tenant Explorer · Kick Playr',
  description: 'Kick Playr platform administration for club tenants.',
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const realm = await realmForHost((await headers()).get('host') ?? '');
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style>{themeCss}</style>

        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {realm.publishableKey ? (
          <ClerkProvider
            publishableKey={realm.publishableKey}
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
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
