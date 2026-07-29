/**
 * Getting the flow out of the app.
 *
 * **A file, not a link.** This diagram is drawn from a list that names every
 * company that turned the user down; a public URL for it is a decision with its
 * own privacy posture, its own revocation UI and its own noindex rules, and
 * bolting one onto a chart component is how those get skipped. What ships is an
 * export: the user decides where it goes.
 *
 * The awkward part is that an SVG in the document is not a standalone SVG. It
 * inherits its colours from the page — every fill here is a Tailwind utility
 * resolving to a CSS custom property — so serialising the markup alone produces
 * a file that opens black-on-black, or transparent, depending on the viewer.
 * {@link inlineComputedStyles} is what fixes that, and it is the only genuinely
 * subtle thing in this file.
 */

/** Properties that carry the whole look of the diagram. Deliberately short: a
 * full computed-style dump per element is a megabyte of SVG and most of it is
 * defaults. */
const CARRIED = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "font-size",
  "font-weight",
  "font-family",
  "text-anchor",
  "dominant-baseline",
] as const;

/**
 * Freeze the rendered appearance onto the elements.
 *
 * Walks a **clone**, reading each computed style from the corresponding live
 * node — computed styles do not exist for a detached element, so the clone has
 * to be measured against its original rather than against itself.
 */
function inlineComputedStyles(live: SVGSVGElement, clone: SVGSVGElement): void {
  const liveNodes = [live, ...live.querySelectorAll("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll("*")];

  liveNodes.forEach((node, index) => {
    const target = cloneNodes[index];
    if (!(target instanceof SVGElement) && !(target instanceof HTMLElement)) {
      return;
    }
    const computed = window.getComputedStyle(node);
    for (const property of CARRIED) {
      const value = computed.getPropertyValue(property);
      if (value) {
        target.style.setProperty(property, value);
      }
    }
    // Utility classes have done their job; carrying them into the file would
    // reference a stylesheet that is not there.
    target.removeAttribute("class");
  });
}

/** The diagram as standalone SVG source, or null if there is nothing drawn. */
export function serializeFlow(svg: SVGSVGElement | null): string | null {
  if (!svg) {
    return null;
  }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg, clone);

  // A width and height, because `width="100%"` in a standalone file has nothing
  // to be a percentage of and several viewers render it as zero.
  const box = svg.viewBox.baseVal;
  clone.setAttribute("width", String(box.width || svg.clientWidth));
  clone.setAttribute("height", String(box.height || svg.clientHeight));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  return new XMLSerializer().serializeToString(clone);
}

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadFlowSvg(svg: SVGSVGElement | null): void {
  const source = serializeFlow(svg);
  if (!source) {
    return;
  }
  save(new Blob([source], { type: "image/svg+xml" }), "job-search-flow.svg");
}

/** How much bigger the raster is than the diagram's own units. 2× so the file
 * is not soft when it is dropped into a document or a message. */
const PNG_SCALE = 2;

/**
 * The same diagram, rasterised.
 *
 * Through an `Image` and a canvas rather than a library. Two details that are
 * easy to get wrong: the SVG has to be loaded as a **data URL** (a blob URL
 * taints the canvas in Safari, and a tainted canvas refuses `toBlob`), and the
 * canvas needs an explicit background — an SVG's transparency becomes black in
 * most viewers that do not composite alpha.
 */
export async function downloadFlowPng(svg: SVGSVGElement | null): Promise<void> {
  const source = serializeFlow(svg);
  if (!svg || !source) {
    return;
  }

  const box = svg.viewBox.baseVal;
  const width = (box.width || svg.clientWidth) * PNG_SCALE;
  const height = (box.height || svg.clientHeight) * PNG_SCALE;

  // The page's own background, so the export matches what is on screen in both
  // themes rather than being white in one of them.
  const background = window
    .getComputedStyle(document.body)
    .getPropertyValue("background-color");

  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

  await new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve();
        return;
      }
      context.fillStyle = background || "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) {
          save(blob, "job-search-flow.png");
        }
        resolve();
      }, "image/png");
    };
    // Silent rather than a thrown error: the diagram is still on screen and
    // still readable, and the SVG button is right beside this one.
    image.onerror = () => resolve();
    image.src = encoded;
  });
}

/** Returns whether it worked, so the caller can toast honestly. `navigator.clipboard`
 * is undefined on a non-secure origin and rejects when the document is not
 * focused, and reporting "copied" in either case is a lie the user finds out
 * about when they paste. */
export async function copyFlowSummary(summary: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(summary);
    return true;
  } catch {
    return false;
  }
}
