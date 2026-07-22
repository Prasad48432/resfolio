/**
 * Layout for the pretty public resume route (`/r/<username>`). It supplies the
 * same on-screen "paper on a desk" backdrop as `/render/*` so a resume reads as
 * a physical page — this route lives outside the `/render` group, so it can't
 * inherit that layout. Print stays pure white (the backdrop is `@media screen`
 * only), so a "print to PDF" from the browser is exactly the page.
 */
export default function ResumeRouteLayout({
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
