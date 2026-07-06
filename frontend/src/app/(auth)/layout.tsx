export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Auth pages (login/register/forgot) are intentionally minimal — no store
  // header or footer, just the form.
  return <>{children}</>;
}
