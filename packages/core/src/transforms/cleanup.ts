import { type Project, MODEL_SETTINGS } from "../project.js";

/** Removes sliced Bambu G-code and slicing results, which are for the wrong printer. */
export function removeSlicedData(p: Project): void {
  const removed: string[] = [];
  for (const path of p.archive.paths()) {
    if (/^Metadata\/plate_\d+\.gcode(\.md5)?$/.test(path) || path === "Metadata/slice_info.config") {
      p.archive.delete(path);
      removed.push(path);
    }
  }
  const ms = p.archive.text(MODEL_SETTINGS);
  if (ms) p.archive.setText(MODEL_SETTINGS, ms.replace(/(<metadata key="gcode_file" value=")[^"]*"/g, '$1"'));
  if (removed.some((r) => r.endsWith(".gcode"))) p.report.dropped.push("Pre-sliced Bambu G-code (re-slice in Flash Studio)");
}
