import { type Project, ROOT_MODEL, MODEL_SETTINGS, arr } from "../project.js";

/** Gap between plates on the Orca/Bambu canvas, as a fraction of plate size (LOGICAL_PART_PLATE_GAP). */
const PLATE_GAP = 1 / 5;

interface Bed { x0: number; y0: number; w: number; d: number }

export function bedOf(printableArea: string | string[] | undefined): Bed {
  const pts = arr(printableArea).map((p) => p.split("x").map(Number));
  if (!pts.length) return { x0: 0, y0: 0, w: 256, d: 256 };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) };
}

/** Same rule as PartPlateList::compute_colum_count. */
export function plateColumns(count: number): number {
  const v = Math.sqrt(count);
  const r = Math.round(v);
  return v > r ? r + 1 : r;
}

export function plateOrigin(index: number, cols: number, bed: Bed): [number, number] {
  const col = index % cols;
  const row = Math.floor(index / cols);
  return [col * bed.w * (1 + PLATE_GAP), -row * bed.d * (1 + PLATE_GAP)];
}

/** Object id -> 0-based plate index, from model_settings.config. */
export function platesByObject(ms: string): { map: Map<string, number>; count: number } {
  const map = new Map<string, number>();
  const plates = [...ms.matchAll(/<plate>([\s\S]*?)<\/plate>/g)];
  plates.forEach((m, i) => {
    const id = Number(m[1].match(/key="plater_id" value="(\d+)"/)?.[1] ?? i + 1) - 1;
    for (const o of m[1].matchAll(/key="object_id" value="(\d+)"/g)) map.set(o[1], id);
  });
  return { map, count: Math.max(plates.length, 1) };
}

/**
 * Moves every object so it keeps its spot relative to the centre of its own plate on the Creator 5 Pro bed.
 * Plates are laid out in a grid whose spacing depends on bed size, so a different bed moves every plate.
 */
export function replate(p: Project, newArea: string | string[]): void {
  const oldBed = bedOf(p.original.printable_area);
  const newBed = bedOf(newArea);
  if (oldBed.w === newBed.w && oldBed.d === newBed.d && oldBed.x0 === newBed.x0 && oldBed.y0 === newBed.y0) return;

  const ms = p.archive.text(MODEL_SETTINGS) ?? "";
  const { map, count } = platesByObject(ms);
  const cols = plateColumns(count);
  const model = p.archive.text(ROOT_MODEL)!;
  const buildStart = model.lastIndexOf("<build");
  let moved = 0;
  const build = model.slice(buildStart).replace(/<item ([^>]*?)transform="([^"]*)"/g, (all, pre: string, t: string) => {
    const id = pre.match(/objectid="(\d+)"/)?.[1] ?? "";
    const v = t.trim().split(/\s+/).map(Number);
    if (v.length !== 12) return all;
    const plate = map.get(id) ?? 0;
    const [ox, oy] = plateOrigin(plate, cols, oldBed);
    const [nx, ny] = plateOrigin(plate, cols, newBed);
    const lx = v[9] - ox - (oldBed.x0 + oldBed.w / 2);
    const ly = v[10] - oy - (oldBed.y0 + oldBed.d / 2);
    v[9] = round(nx + newBed.x0 + newBed.w / 2 + lx);
    v[10] = round(ny + newBed.y0 + newBed.d / 2 + ly);
    moved++;
    return `<item ${pre}transform="${v.join(" ")}"`;
  });
  p.archive.setText(ROOT_MODEL, model.slice(0, buildStart) + build);

  if (moved) p.report.changed.push(`Bed ${oldBed.w}×${oldBed.d} → ${newBed.w}×${newBed.d} mm: re-centred ${moved} object(s) on ${count} plate(s)`);
  if (oldBed.w > newBed.w || oldBed.d > newBed.d)
    p.report.warnings.push(`Source bed (${oldBed.w}×${oldBed.d} mm) is larger than the Creator 5 Pro's; check plates for objects past the edge and use Arrange in Flash Studio`);
}

const round = (n: number) => Math.round(n * 1000) / 1000;
