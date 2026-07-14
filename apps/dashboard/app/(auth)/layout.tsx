/** Auth screens: minimal chrome (docs/architecture/08-dashboard-ux.md). */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      {children}
    </main>
  );
}
