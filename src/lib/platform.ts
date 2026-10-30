export function isPlatformAdmin(subject: string | null): boolean {
  return Boolean(
    subject &&
    (process.env.EXPLORER_ADMIN_SUBJECTS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(subject),
  );
}
export function clerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}
