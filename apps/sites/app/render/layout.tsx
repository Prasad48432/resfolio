/**
 * Layout for the private render surfaces (`/render/*`). It supplies the
 * on-screen "paper on a desk" backdrop so a resume preview reads as a physical
 * page, scoped here so it never bleeds onto full-bleed public portfolio pages.
 * Print stays pure white (the backdrop is `@media screen` only) so PDF output
 * is exactly the page.
 */
export default function RenderLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <style>{`
        @media screen {
          body {
            background: #edeae3;
            padding: 24px 0;
          }
        }
      `}</style>
      {children}
    </>
  );
}
