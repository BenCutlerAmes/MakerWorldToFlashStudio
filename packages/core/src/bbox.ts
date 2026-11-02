import { Archive, normalize } from "./archive.js";
import { MODEL_SETTINGS, ROOT_MODEL } from "./project.js";

export interface Box { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }

const EMPTY: Box = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

export function parseTransform(t: string | undefined): number[] {
  const v = (t ?? "").trim().split(/\s+/).map(Number);
  return v.length === 12 && v.every(Number.isFinite) ? v : IDENTITY;
}

/** 3MF transforms are row-major 4x3 with points as row vectors. */
function apply(m: number[], x: number, y: number, z: number): [number, number, number] {
  return [x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]];
}

function extend(b: Box, x: number, y: number, z: number): Box {
  return { minX: Math.min(b.minX, x), minY: Math.min(b.minY, y), minZ: Math.min(b.minZ, z), maxX: Math.max(b.maxX, x), maxY: Math.max(b.maxY, y), maxZ: Math.max(b.maxZ, z) };
}

const union = (a: Box, b: Box): Box => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), minZ: Math.min(a.minZ, b.minZ), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY), maxZ: Math.max(a.maxZ, b.maxZ) });

/** Parts that aren't printed (modifiers, negative volumes, support blockers), as "objectId/partId". */
function nonPrintingParts(a: Archive): Set<string> {
  const out = new Set<string>();
  const ms = a.text(MODEL_SETTINGS) ?? "";
  for (const o of ms.matchAll(/<object id="([^"]+)">([\s\S]*?)<\/object>/g))
    for (const part of o[2].matchAll(/<part id="([^"]+)" subtype="([^"]+)"/g)) if (part[2] !== "normal_part") out.add(`${o[1]}/${part[1]}`);
  return out;
}

/** Row-major 4x3 product: apply a, then b. */
function compose(a: number[], b: number[]): number[] {
  const r = new Array(12);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j] + (i === 3 ? b[9 + j] : 0);
  return r;
}

type Node = { mesh: Float64Array } | { parts: { path?: string; id: string; transform: number[] }[] };

/**
 * Bounding box of the printed parts of each build item, in world (canvas) coordinates.
 * Vertices are transformed individually so rotated parts get a tight box.
 */
export function buildItemBoxes(a: Archive): { objectId: string; box: Box }[] {
  const skip = nonPrintingParts(a);
  const files = new Map<string, Map<string, Node>>();
  const objectsIn = (path: string): Map<string, Node> => {
    const key = normalize(path);
    let nodes = files.get(key);
    if (nodes) return nodes;
    nodes = new Map();
    files.set(key, nodes);
    for (const m of (a.text(key) ?? "").matchAll(/<object\s([^>]*)>([\s\S]*?)<\/object>/g)) {
      const id = m[1].match(/\bid="([^"]+)"/)?.[1] ?? "";
      if (m[2].includes("<mesh")) {
        const v: number[] = [];
        for (const x of m[2].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)) v.push(+x[1], +x[2], +x[3]);
        nodes.set(id, { mesh: Float64Array.from(v) });
      } else {
        const parts = [...m[2].matchAll(/<component\s([^>]*)\/>/g)].map((c) => ({
          id: c[1].match(/objectid="([^"]+)"/)?.[1] ?? "",
          path: c[1].match(/p:path="([^"]+)"/)?.[1],
          transform: parseTransform(c[1].match(/transform="([^"]*)"/)?.[1]),
        }));
        nodes.set(id, { parts: parts.filter((p) => !skip.has(`${id}/${p.id}`)) });
      }
    }
    return nodes;
  };
  const boxOf = (node: Node | undefined, m: number[], file: string, depth = 0): Box => {
    if (!node || depth > 8) return EMPTY;
    if ("mesh" in node) {
      let b = EMPTY;
      const v = node.mesh;
      for (let i = 0; i < v.length; i += 3) b = extend(b, ...apply(m, v[i], v[i + 1], v[i + 2]));
      return b;
    }
    return node.parts.reduce((b, p) => {
      const f = p.path ? normalize(p.path) : file;
      return union(b, boxOf(objectsIn(f).get(p.id), compose(p.transform, m), f, depth + 1));
    }, EMPTY);
  };
  const root = a.text(ROOT_MODEL) ?? "";
  const objects = objectsIn(ROOT_MODEL);
  const build = root.slice(root.lastIndexOf("<build"));
  return [...build.matchAll(/<item\s([^>]*)\/?>/g)].map((m) => {
    const objectId = m[1].match(/objectid="([^"]+)"/)?.[1] ?? "";
    return { objectId, box: boxOf(objects.get(objectId), parseTransform(m[1].match(/transform="([^"]*)"/)?.[1]), ROOT_MODEL) };
  });
}
