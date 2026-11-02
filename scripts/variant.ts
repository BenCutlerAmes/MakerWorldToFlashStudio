// Bisect helper: writes a copy of a 3MF with selected experimental patches applied.
// usage: tsx scripts/variant.ts <in.3mf> <out.3mf> patch[,patch...]
import { readFileSync, writeFileSync } from "node:fs";
import { Archive } from "../packages/core/src/archive.js";

const [input, output, list = ""] = process.argv.slice(2);
const a = Archive.read(readFileSync(input));
const VERSION = "02.04.02.00";

const patches: Record<string, () => void> = {
  // Application metadata in the root model
  app: () => a.setText("3D/3dmodel.model", a.text("3D/3dmodel.model")!.replace(/(<metadata name="Application">BambuStudio-)[\d.]+/, `$1${VERSION}`)),
  // "version" key in project_settings.config
  psver: () => {
    const s = JSON.parse(a.text("Metadata/project_settings.config")!);
    s.version = VERSION;
    a.setText("Metadata/project_settings.config", JSON.stringify(s, null, 4));
  },
  // out-of-range values Bambu Studio writes
  params: () => {
    const s = JSON.parse(a.text("Metadata/project_settings.config")!);
    s.raft_first_layer_expansion = "2";
    s.tree_support_wall_count = "0";
    a.setText("Metadata/project_settings.config", JSON.stringify(s, null, 4));
  },
  // client version header in slice_info.config
  sliceinfo: () => {
    const t = a.text("Metadata/slice_info.config");
    if (t) a.setText("Metadata/slice_info.config", t.replace(/(X-BBL-Client-Version" value=")[\d.]+/, `$1${VERSION}`));
  },
};

for (const name of list.split(",").filter(Boolean)) {
  if (!patches[name]) throw new Error(`unknown patch ${name}`);
  patches[name]();
}
writeFileSync(output, a.write());
