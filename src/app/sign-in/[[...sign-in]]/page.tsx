import { BrandLogo } from '@/components/theme-logo';
import { SignIn } from '@clerk/nextjs';
export default function SignInPage() {
  return (
    <main className="setup-page">
      <div>
        <div className="sign-in-brand">
          <BrandLogo priority />
          <h1>Tenant Explorer</h1>
          <p>Sign in with your platform operator account.</p>
        </div>
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <SignIn path="/sign-in" routing="path" fallbackRedirectUrl="/" />
        ) : (
          <p>Configure Clerk in .env.local before signing in.</p>
        )}
      </div>
    </main>
  );
}
