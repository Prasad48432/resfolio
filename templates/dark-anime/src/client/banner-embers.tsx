"use client";

import { useEffect, useRef } from "react";
import type { ReactElement } from "react";

/**
 * Banner embers — a client island (doc 05).
 *
 * Glowing sparks drifting across the banner, as if carried off a fire by the
 * wind. It is **pure atmosphere over a decorative image**: nothing here is
 * content, nothing here is a destination, so the bar every other island in this
 * template has to clear (works with no JS) is met by there being nothing to
 * lose. The banner is a complete picture without it.
 *
 * The motion model is borrowed wholesale — wind approached by lerp rather than
 * applied directly, a size-derived `windFactor` so small motes outrun heavy
 * ones, a sine wave sampled on `x` for turbulence, drag on the vertical axis.
 * What changed is everything visual: no sprite is rotated, because a spark has
 * no orientation. They are pre-rendered radial glows composited additively, so
 * overlapping embers brighten instead of stacking flat alpha.
 *
 * Three things keep this cheap enough to sit under a hero:
 *
 * - **The glow is drawn once, not per frame.** Three tinted sprites are baked
 *   into offscreen canvases at mount; the loop only ever `drawImage`s them.
 *   A per-particle `createRadialGradient` would allocate a gradient object per
 *   particle per frame and is what makes canvas particle fields drop frames.
 * - **The loop is stopped, not throttled, when nobody can see it.** An
 *   `IntersectionObserver` on the canvas and `visibilitychange` on the document
 *   both cancel the rAF — scrolling past the hero or switching tabs costs zero.
 *   This matters most on the phones least able to afford it.
 * - **Nothing here touches React state.** Everything lives in the effect's
 *   closure, so the component renders exactly once for the life of the page.
 *
 * `prefers-reduced-motion` gets no canvas at all. This is the one island where
 * the doc-08 rule of "gentler, not none" doesn't apply: the effect *is* the
 * movement, and a frozen field of dots over a photo is worse than the photo.
 */

/** Tuned for a ~1200×260 strip. Density is per megapixel, not absolute, so a
 * phone-width banner doesn't get the same 60 sparks a desktop one does. */
const SETTINGS = {
  /** Sparks per megapixel of banner. */
  density: 190,
  /** Hard ceiling regardless of size — a very wide monitor stays cheap. */
  maxCount: 90,
  minSize: 1.2,
  maxSize: 3.4,
  minWind: 0.28,
  maxWind: 1.5,
  /** Negative: embers rise. Heat, not gravity — the whole reason this doesn't
   * read as snow falling sideways. */
  lift: -0.16,
  turbulence: 0.55,
  /** Fraction of the banner height the emitter spans, centred on `emitterY`. */
  emitterY: 0.62,
  emitterSpread: 0.85,
  /** Frames a spark lives before fading out and respawning. Varied per particle
   * so the field never pulses in unison. */
  minLife: 260,
  maxLife: 620,
} as const;

/** Ember tints, warm → hot. The last is the rare bright spark. */
const TINTS = [
  { core: "255, 176, 84", weight: 0.5 },
  { core: "255, 108, 34", weight: 0.85 },
  { core: "255, 236, 190", weight: 1 },
] as const;

const SPRITE_SIZE = 32;

/**
 * Bake one tint into an offscreen canvas: a hot centre falling off to nothing.
 * Drawn additively at runtime, so the falloff *is* the glow — there is no
 * separate blur pass and no shadow blur (which is per-draw and ruinous).
 */
function createEmberSprite(core: string): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const mid = SPRITE_SIZE / 2;
  const gradient = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  gradient.addColorStop(0, `rgba(255, 255, 245, 0.95)`);
  gradient.addColorStop(0.22, `rgba(${core}, 0.85)`);
  gradient.addColorStop(0.55, `rgba(${core}, 0.22)`);
  gradient.addColorStop(1, `rgba(${core}, 0)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return canvas;
}

export function BannerEmbers(): ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Read once, at mount. A visitor who flips the OS setting mid-visit gets
    // the change on next navigation, which is a fair trade for not holding a
    // media-query listener open for a decoration.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const sprites = TINTS.map((tint) => createEmberSprite(tint.core)).filter(
      (sprite): sprite is HTMLCanvasElement => sprite !== null,
    );
    if (sprites.length === 0) return;

    // CSS pixels — every coordinate below is in these, with the DPR scale
    // applied to the context once per resize so the maths stays readable.
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = false;
    let visible = true;
    let onScreen = true;

    interface Ember {
      x: number;
      y: number;
      size: number;
      windFactor: number;
      vx: number;
      vy: number;
      wave: number;
      life: number;
      age: number;
      sprite: HTMLCanvasElement;
      /** Peak opacity. Most embers are dim; a few carry the scene. */
      peak: number;
      twinkleSpeed: number;
      twinklePhase: number;
    }

    const random = (min: number, max: number): number =>
      min + Math.random() * (max - min);

    function spawn(ember: Ember, initOnScreen: boolean): void {
      ember.size = random(SETTINGS.minSize, SETTINGS.maxSize);

      const centre = height * SETTINGS.emitterY;
      const spread = height * SETTINGS.emitterSpread;
      ember.y = random(centre - spread / 2, centre + spread / 2);

      // Sparks come off the fire on one side and are carried across. Seeding
      // the first generation across the full width avoids a visible wave
      // sweeping in from the left on load.
      ember.x = initOnScreen ? Math.random() * width : -random(4, width * 0.45);

      // Small motes ride the wind; big ones lag. Inverted from size so the
      // field separates into layers on its own.
      const sizeFactor =
        (ember.size - SETTINGS.minSize) /
        (SETTINGS.maxSize - SETTINGS.minSize || 1);
      ember.windFactor = Math.max(
        0.12,
        Math.min(1, 1 - (sizeFactor * 0.55 + Math.random() * 0.35)),
      );

      ember.vx = 0;
      ember.vy = random(-0.15, 0.05);
      ember.wave = Math.random() * Math.PI * 2;
      ember.life = random(SETTINGS.minLife, SETTINGS.maxLife);
      ember.age = initOnScreen ? Math.random() * ember.life * 0.6 : 0;

      // Bright sparks are rare on purpose — they are what the eye catches, and
      // a banner full of them stops being atmosphere and starts being weather.
      const roll = Math.random();
      const index = roll > 0.94 ? 2 : roll > 0.55 ? 1 : 0;
      ember.sprite = sprites[Math.min(index, sprites.length - 1)]!;
      ember.peak = index === 2 ? random(0.7, 1) : random(0.22, 0.6);

      ember.twinkleSpeed = random(0.02, 0.09);
      ember.twinklePhase = Math.random() * Math.PI * 2;
    }

    function createEmber(initOnScreen: boolean): Ember {
      const ember: Ember = {
        x: 0,
        y: 0,
        size: 0,
        windFactor: 0,
        vx: 0,
        vy: 0,
        wave: 0,
        life: 0,
        age: 0,
        sprite: sprites[0]!,
        peak: 0,
        twinkleSpeed: 0,
        twinklePhase: 0,
      };
      spawn(ember, initOnScreen);
      return ember;
    }

    let embers: Ember[] = [];

    function step(ember: Ember): void {
      const target =
        SETTINGS.minWind +
        (SETTINGS.maxWind - SETTINGS.minWind) * ember.windFactor;
      // Approach the wind rather than snap to it: a spark entering the frame
      // accelerates, which is most of why this reads as air and not as a belt.
      ember.vx += (target - ember.vx) * 0.06;
      ember.x += ember.vx;

      ember.vy += SETTINGS.lift * 0.05 * (1.4 - ember.windFactor);
      ember.vy += Math.sin(ember.x * 0.012 + ember.wave) * SETTINGS.turbulence * 0.03;
      ember.vy *= 0.97;
      ember.y += ember.vy;

      ember.age += 1;
      ember.twinklePhase += ember.twinkleSpeed;

      const buffer = 40;
      if (
        ember.age >= ember.life ||
        ember.x > width + buffer ||
        ember.y < -buffer ||
        ember.y > height + buffer
      ) {
        spawn(ember, false);
      }
    }

    function draw(ember: Ember): void {
      if (!ctx) return;

      // Fade in over the first fifth of life and out over the last third, so
      // nothing ever pops into or out of existence mid-banner.
      const progress = ember.age / ember.life;
      const envelope =
        progress < 0.2
          ? progress / 0.2
          : progress > 0.68
            ? 1 - (progress - 0.68) / 0.32
            : 1;

      const twinkle = 0.78 + Math.sin(ember.twinklePhase) * 0.22;
      const alpha = ember.peak * envelope * twinkle;
      if (alpha <= 0.01) return;

      // The sprite's own falloff means the drawn box is ~4× the "ember" — the
      // glow is most of what you see, the core is a couple of pixels.
      const box = ember.size * 4;
      ctx.globalAlpha = alpha;
      ctx.drawImage(ember.sprite, ember.x - box / 2, ember.y - box / 2, box, box);
    }

    function render(): void {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      // Additive: overlapping embers brighten, as light does. With source-over
      // they would flatten into opaque dots and the field would look pasted on.
      ctx.globalCompositeOperation = "lighter";
      for (const ember of embers) {
        step(ember);
        draw(ember);
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(render);
    }

    function start(): void {
      if (running || !visible || !onScreen || width === 0) return;
      running = true;
      frame = requestAnimationFrame(render);
    }

    function stop(): void {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
    }

    function resize(): void {
      if (!canvas || !ctx) return;
      const parent = canvas.parentElement;
      if (!parent) return;

      const nextWidth = parent.clientWidth;
      const nextHeight = parent.clientHeight;
      if (nextWidth === width && nextHeight === height) return;

      width = nextWidth;
      height = nextHeight;

      // Cap the DPR: a 3× phone would triple the fill cost of a full-bleed
      // glow field for a difference nobody can see on a soft-edged sprite.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const area = (width * height) / 1_000_000;
      const count = Math.max(
        12,
        Math.min(SETTINGS.maxCount, Math.round(area * SETTINGS.density)),
      );
      embers = Array.from({ length: count }, () => createEmber(true));
    }

    const observer = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        if (onScreen) start();
        else stop();
      },
      { threshold: 0 },
    );
    observer.observe(canvas);

    const onVisibility = (): void => {
      visible = document.visibilityState === "visible";
      if (visible) start();
      else stop();
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      start();
    });
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    document.addEventListener("visibilitychange", onVisibility);

    resize();
    start();

    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="rf-banner-embers" aria-hidden />;
}
