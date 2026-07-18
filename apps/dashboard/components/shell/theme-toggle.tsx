"use client";

import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@resfolio/ui";
import { motion, useReducedMotion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { DURATION, EASE_OUT } from "@/components/motion/motion";
import { themeOptionTestId, TEST_IDS } from "@/lib/testids";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * The light / dark / system switch, inside the user menu.
 *
 * Only the *active* theme spells its name; the other two are icons. Three
 * equal labelled buttons had to share a 224px menu, which left three cramped
 * 11px labels competing for attention when the answer to "which theme am I on"
 * is exactly one of them. Icons carry the choice, the label confirms the
 * current state, and a tooltip covers the rest — the Linear/Raycast posture.
 *
 * The active pill is a shared `layoutId`, so switching *slides* it to the new
 * option instead of cross-fading two backgrounds; the label animates its own
 * width so the row re-flows rather than jumping. Both ride the design system's
 * curve (`EASE_OUT`/`DURATION` from components/motion) — this is a leaf, which
 * is where doc 08 allows Framer, but the curve is still not a local decision.
 *
 * A segmented control, not menu items: selecting a theme must not close the
 * menu you are comparing from.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const reduceMotion = useReducedMotion();

  // `theme` is a localStorage value, so the server cannot know it. Until
  // mounted, nothing is marked active — better a momentarily neutral row than
  // one that asserts the wrong theme and then corrects itself.
  useEffect(() => setMounted(true), []);

  // Reduced motion means gentler, not none (doc 08): the pill stops sliding
  // and the label stops animating its width, but state still changes.
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: DURATION, ease: EASE_OUT };

  return (
    <div className="flex items-center justify-between w-full px-2">
      <span className="text-sm">Theme</span>
      <div
        className="px-1 py-1"
        role="radiogroup"
        aria-label="Theme"
        data-testid={TEST_IDS.themeToggle}
      >
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface-warm p-1">
          {THEMES.map(({ value, label, icon: Icon }) => {
            const selected = mounted && theme === value;

            return (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={label}
                    onClick={() => setTheme(value)}
                    className={cn(
                      "relative flex size-8 cursor-pointer items-center justify-center rounded-lg",
                      "transition-all duration-200 ease-out",
                      selected
                        ? "text-brand"
                        : "text-muted hover:-translate-y-0.5 hover:scale-105 hover:text-foreground active:scale-95",
                    )}
                    data-testid={themeOptionTestId(value)}
                  >
                    {selected && (
                      <motion.span
                        layoutId="theme-active-pill"
                        aria-hidden
                        transition={transition}
                        className="absolute inset-0 rounded-full bg-brand/10 ring-1 ring-brand/20 shadow-sm dark:bg-brand/15"
                      />
                    )}

                    <Icon
                      className="relative z-10 size-4 shrink-0"
                      aria-hidden
                    />
                  </button>
                </TooltipTrigger>

                <TooltipContent side="top" sideOffset={8}>
                  {label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}
