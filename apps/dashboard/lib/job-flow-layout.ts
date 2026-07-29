import type { FlowLink, FlowNode, JobFlow } from "@resfolio/job";

/**
 * Sankey geometry, without a chart library.
 *
 * **Layout is split from drawing**, the same way `lib/pdf/cover-letter-layout.ts`
 * is split from the drawing code beside it, and for the same reason: geometry you
 * cannot unit-test is geometry that renders wrong somewhere you don't look. A
 * ribbon drawn a few pixels outside the viewBox is invisible in the browser and
 * present in the PNG the user exports.
 *
 * **No dependency.** There is no charting library anywhere in this workspace and
 * this diagram does not earn the first one: three stages, at most seven nodes,
 * and links that never cross a stage boundary. `d3-sankey` solves a
 * general-graph problem — arbitrary depth, node ordering by iterative
 * relaxation, cycle breaking — none of which this shape has. What is left is
 * proportional heights and a cubic bezier.
 *
 * Everything here is in **viewBox units**, not pixels. The SVG scales to its
 * container, so a "width" below is a proportion of the diagram rather than a
 * promise about a screen.
 */

export const VIEW_WIDTH = 720;
export const VIEW_HEIGHT = 360;

const NODE_WIDTH = 14;
const PADDING_Y = 28;
/** Space between stacked nodes in one column. Fixed rather than proportional, so
 * two nodes are separated by the same gap whether there are two or five. */
const NODE_GAP = 14;
/** Below this a node is drawn as a sliver that still has to be clickable and
 * still has to hold a label beside it. One application out of fifty is a real
 * row and must not become a hairline. */
const MIN_NODE_HEIGHT = 10;
/** Where each stage's column starts. The gap between 0 and 1 is wider than
 * between 1 and 2 because that is where the labels are longest. */
const STAGE_X = [24, 330, 610] as const;

export interface LaidOutNode extends FlowNode {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Which side of the node its label sits on. The last column would push its
   * text off the right edge. */
  labelAnchor: "start" | "end";
  labelX: number;
  labelY: number;
}

export interface LaidOutLink extends FlowLink {
  /** An SVG path `d`, filled rather than stroked: a ribbon has two edges that
   * both taper, which a stroke of varying width cannot express. */
  path: string;
}

export interface FlowLayout {
  nodes: LaidOutNode[];
  links: LaidOutLink[];
  width: number;
  height: number;
}

/**
 * Place the nodes, then thread the ribbons between them.
 *
 * The vertical scale is **shared across all three stages** — one unit of count
 * is one height everywhere — which is what makes the picture readable as a
 * quantity rather than as three unrelated bar charts. It is set by the busiest
 * column, so nothing overflows the height.
 */
export function layoutJobFlow(flow: JobFlow): FlowLayout {
  const empty: FlowLayout = {
    nodes: [],
    links: [],
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
  };

  if (flow.nodes.length === 0) {
    return empty;
  }

  const stages = [0, 1, 2].map((stage) =>
    flow.nodes.filter((node) => node.stage === stage),
  );

  const usable = VIEW_HEIGHT - PADDING_Y * 2;

  // The scale the tallest column can afford, once its gaps and its minimum node
  // heights are paid for. Taking the minimum across columns is what keeps one
  // unit of count the same height in all of them.
  let scale = Infinity;
  for (const nodes of stages) {
    if (nodes.length === 0) {
      continue;
    }
    const total = nodes.reduce((sum, node) => sum + node.count, 0);
    if (total === 0) {
      continue;
    }
    const gaps = NODE_GAP * (nodes.length - 1);
    // Every node is at least `MIN_NODE_HEIGHT` tall, so the space the scale gets
    // to distribute is what remains after the shortest possible column.
    const floor = MIN_NODE_HEIGHT * nodes.length;
    scale = Math.min(scale, Math.max(usable - gaps - floor, 0) / total);
  }
  if (!Number.isFinite(scale)) {
    return empty;
  }

  const heightOf = (count: number): number =>
    MIN_NODE_HEIGHT + count * scale;

  const placed = new Map<string, LaidOutNode>();
  const nodes: LaidOutNode[] = [];

  stages.forEach((columnNodes, stage) => {
    if (columnNodes.length === 0) {
      return;
    }

    const heights = columnNodes.map((node) => heightOf(node.count));
    const columnHeight =
      heights.reduce((sum, height) => sum + height, 0) +
      NODE_GAP * (columnNodes.length - 1);
    // Centred vertically. A column of one node hanging from the top beside a
    // column of four reads as a mistake rather than as a shape.
    let y = PADDING_Y + Math.max((usable - columnHeight) / 2, 0);

    columnNodes.forEach((node, index) => {
      const height = heights[index] ?? MIN_NODE_HEIGHT;
      const x = STAGE_X[stage] ?? STAGE_X[0];
      const last = stage === 2;

      const laid: LaidOutNode = {
        ...node,
        x,
        y,
        width: NODE_WIDTH,
        height,
        labelAnchor: last ? "end" : "start",
        labelX: last ? x - 8 : x + NODE_WIDTH + 8,
        labelY: y + height / 2,
      };

      placed.set(node.id, laid);
      nodes.push(laid);
      y += height + NODE_GAP;
    });
  });

  /**
   * Ribbons leave their source stacked in the order the links were declared,
   * and arrive at their target the same way.
   *
   * The offsets are tracked per node rather than recomputed, because a source
   * with three outgoing ribbons has to pay each of them out from where the last
   * one ended — otherwise they overlap and the picture reads as one thick band.
   */
  const outUsed = new Map<string, number>();
  const inUsed = new Map<string, number>();

  const links: LaidOutLink[] = [];

  for (const edge of flow.links) {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (!from || !to) {
      continue;
    }

    // A ribbon is sized against its endpoints' own heights, so the widths
    // leaving a node always sum to that node's height even though the height
    // carries a minimum the counts do not know about.
    const outTotal = totalOut(flow.links, edge.from);
    const inTotal = totalIn(flow.links, edge.to);
    const outHeight = outTotal === 0 ? 0 : (edge.count / outTotal) * from.height;
    const inHeight = inTotal === 0 ? 0 : (edge.count / inTotal) * to.height;

    const y0 = from.y + (outUsed.get(edge.from) ?? 0);
    const y1 = to.y + (inUsed.get(edge.to) ?? 0);
    outUsed.set(edge.from, (outUsed.get(edge.from) ?? 0) + outHeight);
    inUsed.set(edge.to, (inUsed.get(edge.to) ?? 0) + inHeight);

    const x0 = from.x + from.width;
    const x1 = to.x;
    // Control points at the horizontal midpoint: the standard Sankey curve, and
    // the one that keeps a ribbon's tangent horizontal where it meets a node so
    // the join reads as continuous rather than as a kink.
    const mid = (x0 + x1) / 2;

    links.push({
      ...edge,
      path: [
        `M ${round(x0)} ${round(y0)}`,
        `C ${round(mid)} ${round(y0)}, ${round(mid)} ${round(y1)}, ${round(x1)} ${round(y1)}`,
        `L ${round(x1)} ${round(y1 + inHeight)}`,
        `C ${round(mid)} ${round(y1 + inHeight)}, ${round(mid)} ${round(y0 + outHeight)}, ${round(x0)} ${round(y0 + outHeight)}`,
        "Z",
      ].join(" "),
    });
  }

  return { nodes, links, width: VIEW_WIDTH, height: VIEW_HEIGHT };
}

function totalOut(links: readonly FlowLink[], id: string): number {
  return links
    .filter((edge) => edge.from === id)
    .reduce((sum, edge) => sum + edge.count, 0);
}

function totalIn(links: readonly FlowLink[], id: string): number {
  return links
    .filter((edge) => edge.to === id)
    .reduce((sum, edge) => sum + edge.count, 0);
}

/** Two decimals. A path `d` with sixteen significant figures per coordinate is
 * several kilobytes of noise in an exported SVG. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
