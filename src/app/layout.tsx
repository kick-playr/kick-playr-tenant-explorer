import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { themeInitScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Tenant Explorer · Kick Playr',
  description: 'Kick Playr platform administration for club tenants.',
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <ClerkProvider
            appearance={{
              variables: {
                colorBackground: 'var(--theme-surface, #ffffff)',
                colorForeground: 'var(--ink)',
                colorMutedForeground: 'var(--muted)',
                colorPrimary: 'var(--green)',
                colorInput: 'var(--theme-surface, #ffffff)',
                colorInputForeground: 'var(--ink)',
                colorPrimaryForeground: 'var(--theme-button-ink, #ffffff)',
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
