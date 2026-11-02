import { type Box, buildItemBoxes } from "../bbox.js";
import { type Project, MODEL_SETTINGS } from "../project.js";
import { bedOf, plateColumns, plateOrigin, platesByObject } from "./geometry.js";

const TOWER_MARGIN = 10;

interface Rect { x0: number; y0: number; x1: number; y1: number }
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const gap = (a: Box, b: Box) => Math.max(a.minX - b.maxX, b.minX - a.maxX, a.minY - b.maxY, b.minY - a.maxY, 0);

/** Checks what fits on the Creator 5 Pro bed after re-plating, and fixes what can be fixed automatically. */
export function fitToBed(p: Project): void {
  const bed = bedOf(p.settings.printable_area);
  const { map, count } = platesByObject(p.archive.text(MODEL_SETTINGS) ?? "");
  const cols = plateColumns(count);
  const perPlate: Box[][] = Array.from({ length: count }, () => []);

  for (const { objectId, box } of buildItemBoxes(p.archive)) {
    if (!Number.isFinite(box.minX)) continue;
    const plate = map.get(objectId) ?? 0;
    const [ox, oy] = plateOrigin(plate, cols, bed);
    perPlate[plate]?.push({ ...box, minX: box.minX - ox, maxX: box.maxX - ox, minY: box.minY - oy, maxY: box.maxY - oy });
  }

  perPlate.forEach((boxes, i) => {
    const outside = boxes.filter((b) => b.minX < bed.x0 - 0.5 || b.minY < bed.y0 - 0.5 || b.maxX > bed.x0 + bed.w + 0.5 || b.maxY > bed.y0 + bed.d + 0.5);
    if (outside.length) p.report.warnings.push(`Plate ${i + 1}: ${outside.length} object(s) extend past the 256 mm bed; select the plate and use Arrange in Flash Studio`);
  });

  // Printing one object at a time needs room for the whole toolhead between objects.
  if (p.settings.print_sequence === "by object") {
    const clearance = Number(p.settings.extruder_clearance_radius ?? 0);
    const tight = perPlate.findIndex((boxes) => boxes.some((a, i) => boxes.some((b, j) => j > i && gap(a, b) < clearance)));
    if (tight >= 0) {
      p.settings.print_sequence = "by layer";
      p.report.changed.push(`Print sequence "by object" → "by layer": objects on plate ${tight + 1} are closer than the Creator 5 Pro's ${clearance} mm toolhead clearance`);
    }
  }

  // Place each plate's prime tower in a free corner of that plate.
  const w = Number(p.settings.prime_tower_width ?? 35);
  const depth = w * 1.5; // depth grows with purge volume; leave room for it
  const xs = [bed.x0 + bed.w - w - TOWER_MARGIN, bed.x0 + TOWER_MARGIN];
  const ys = [bed.y0 + bed.d - depth - TOWER_MARGIN, bed.y0 + TOWER_MARGIN];
  const towerX: string[] = [];
  const towerY: string[] = [];
  perPlate.forEach((boxes) => {
    const rects = boxes.map((b) => ({ x0: b.minX - TOWER_MARGIN, y0: b.minY - TOWER_MARGIN, x1: b.maxX + TOWER_MARGIN, y1: b.maxY + TOWER_MARGIN }));
    const candidates = xs.flatMap((x) => ys.map((y) => ({ x0: x, y0: y, x1: x + w, y1: y + depth })));
    const spot = candidates.find((c) => !rects.some((r) => overlaps(c, r))) ?? candidates[0];
    towerX.push(String(spot.x0));
    towerY.push(String(spot.y0));
  });
  p.settings.wipe_tower_x = towerX;
  p.settings.wipe_tower_y = towerY;
}
