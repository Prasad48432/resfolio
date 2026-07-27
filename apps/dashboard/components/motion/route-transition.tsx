"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * The navigation transition: the content region fades as the route changes.
 *
 * Three decisions worth stating, because each is easy to get wrong:
 *
 * **Enter-only, no exit.** There is no `AnimatePresence` here. Under the App
 * Router the outgoing page's RSC payload is already gone by the time the new
 * one commits, so an exit animation would either need the old tree kept alive
 * artificially or would animate a blank box. Worse, an exit *delays* the new
 * page by its own duration — the user waits to see the thing they clicked for.
 * Enter-only means navigation stays as fast as the data and the fade is pure
 * upside.
 *
 * **Fade, no travel.** Individual lists lift with `<Stagger>`; the page frame
 * only fades. Sliding the whole region on every navigation would be a large
 * movement on the most repeated interaction in the app, which is precisely
 * where motion turns into lag.
 *
 * **160ms**, at the fast end of doc 08's 150–200ms budget: navigation is
 * high-frequency, so this needs to be felt rather than watched.
 *
 * Keying on `routeKey` (the pathname) is what makes this fire at all — React
 * remounts the subtree when the key changes, restarting `initial`. Without the
 * key, the wrapper persists across routes and never re-animates.
 *
 * **It always renders a wrapper, and that wrapper is always a flex column.** Two
 * separate corrections, both structural rather than cosmetic:
 *
 * - This component sits between the shell's content region and the page, so it is
 *   part of the height chain the shell establishes (see `app-shell.tsx`). With no
 *   height classes, a page asking for `flex-1` was asking a `display: block`
 *   parent of `auto` height — which is why the AI chat could not be made to fill
 *   the viewport no matter what was done inside it. `min-h-0` lets a page that
 *   *is* taller overflow so the shell scrolls it.
 * - The reduced-motion branch used to return `children` bare, which meant the
 *   layout chain differed between users depending on an OS setting. A
 *   reduced-motion user would have had a subtly different chat layout, and it
 *   would only ever have been reported as "it looks broken on my machine".
 */
const FILL = "flex min-h-0 flex-col";

export function RouteTransition({
  routeKey,
  children,
}: {
  routeKey: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={FILL}>{children}</div>;
  }

  return (
    <motion.div
      key={routeKey}
      className={FILL}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}
