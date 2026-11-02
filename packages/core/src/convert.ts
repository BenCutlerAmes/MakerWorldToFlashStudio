import { Archive } from "./archive.js";
import { type Project, type Report, type Settings, PROJECT_SETTINGS, ROOT_MODEL } from "./project.js";
import { capVersion } from "./transforms/version.js";
import { fixParamRanges } from "./transforms/params.js";
import { removeSlicedData } from "./transforms/cleanup.js";
import { retargetPrinter } from "./transforms/printer.js";
import { replate } from "./transforms/geometry.js";
import { fitToBed } from "./transforms/layout.js";

export interface ConvertResult {
  status: "converted" | "skipped";
  reason?: string;
  bytes?: Uint8Array;
  report: Report;
}

export function isBambuProject(a: Archive): boolean {
  const head = a.text(ROOT_MODEL)?.slice(0, 4000) ?? "";
  return /<metadata name="Application">BambuStudio-/.test(head) && a.has(PROJECT_SETTINGS);
}

export function convert(input: Uint8Array): ConvertResult {
  const report: Report = { changed: [], dropped: [], warnings: [] };
  let archive: Archive;
  try {
    archive = Archive.read(input);
  } catch {
    return { status: "skipped", reason: "Not a valid 3MF (zip) file", report };
  }
  if (!archive.has(ROOT_MODEL)) return { status: "skipped", reason: "Not a 3MF file (no 3D/3dmodel.model)", report };
  if (!isBambuProject(archive)) return { status: "skipped", reason: "Not a Bambu Studio / MakerWorld project; Flash Studio can open it as is", report };

  const settings = JSON.parse(archive.text(PROJECT_SETTINGS)!) as Settings;
  const p: Project = { archive, settings, original: structuredClone(settings), report };

  capVersion(p);
  retargetPrinter(p);
  replate(p, p.settings.printable_area);
  fitToBed(p);
  fixParamRanges(p);
  removeSlicedData(p);
  if (/paint_color=/.test(archive.paths().filter((x) => x.endsWith(".model")).map((x) => archive.text(x)).join("")))
    report.warnings.push("Has painted multi-colour regions; check colours in Flash Studio");

  archive.setText(PROJECT_SETTINGS, JSON.stringify(p.settings, null, 4));
  return { status: "converted", bytes: archive.write(), report };
}
