"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import ResfolioLogo from "@/components/brand/resfolio-logo";
import { TEST_IDS } from "@/lib/testids";

const links = [
  { label: "Product", href: "#how" },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Hysteresis: raise the threshold to enter the "scrolled" state and lower
    // it to leave, so a border that toggles right at the boundary can't
    // flicker on tiny scroll jitters.
    const onScroll = () => {
      setScrolled((prev) => {
        const y = window.scrollY;
        if (!prev && y > 24) return true;
        if (prev && y < 8) return false;
        return prev;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-testid={TEST_IDS.siteNav}
      className="fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300"
      style={{
        // Always-present border whose color fades in — never added/removed, so
        // the layout can't shift and the hairline can't flicker.
        borderColor: scrolled ? "var(--color-border)" : "transparent",
        background: scrolled ? "rgba(246, 241, 232, 0.8)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
      }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
        <a href="#top" data-testid={TEST_IDS.navLogo} className="group">
          <ResfolioLogo size={28} className="text-foreground" />
        </a>

        <nav
          aria-label="Primary"
          data-testid={TEST_IDS.navLinks}
          className="hidden items-center gap-8 text-[13px] text-foreground/70 md:flex"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              data-testid={`nav-link-${l.label.toLowerCase()}`}
              className="transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="#waitlist"
            data-testid={TEST_IDS.navCtaGetStarted}
            className="hidden h-9 items-center gap-2 rounded-full bg-accent px-5 text-[13px] font-semibold text-white shadow-[0_6px_20px_rgba(240,89,43,0.28)] transition hover:bg-accent-soft sm:inline-flex"
          >
            Join Waitlist
            <span aria-hidden>→</span>
          </a>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="nav-mobile-panel"
            data-testid={TEST_IDS.navMobileToggle}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/80 md:hidden"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="nav-mobile-panel"
          data-testid={TEST_IDS.navMobilePanel}
          className="border-t border-border bg-background/95 backdrop-blur-xl md:hidden"
        >
          <div className="flex flex-col gap-3 px-6 py-4 text-sm">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-2 text-foreground/80"
              >
                {l.label}
              </a>
            ))}
            <a
              href="#waitlist"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-[13px] font-semibold text-white"
            >
              Join Waitlist →
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
