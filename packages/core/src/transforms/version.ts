import { type Project, ROOT_MODEL } from "../project.js";

/** Newest Bambu Studio file version Flash Studio (Orca-Flashforge 2.4.2) accepts. */
export const MAX_VERSION = "02.04.02.00";

const num = (v: string) => v.split(".").map(Number);
const newer = (a: string, b: string) => {
  const [x, y] = [num(a), num(b)];
  for (let i = 0; i < 4; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

/** Flash Studio rejects files whose Application metadata names a newer slicer version. */
export function capVersion(p: Project): void {
  const model = p.archive.text(ROOT_MODEL)!;
  const m = model.match(/<metadata name="Application">BambuStudio-([\d.]+)</);
  if (m && newer(m[1], MAX_VERSION)) {
    p.archive.setText(ROOT_MODEL, model.replace(m[0], `<metadata name="Application">BambuStudio-${MAX_VERSION}<`));
    p.report.changed.push(`File version ${m[1]} → ${MAX_VERSION} (Flash Studio refuses newer Bambu Studio versions)`);
  }
  const v = p.settings.version;
  if (typeof v === "string" && newer(v, MAX_VERSION)) p.settings.version = MAX_VERSION;
}
