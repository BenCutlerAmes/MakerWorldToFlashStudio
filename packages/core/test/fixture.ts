import { zipSync, strToU8 } from "fflate";

export interface FixtureOptions {
  version?: string;
  printer?: "A1 mini" | "A1" | "H2D";
  plates?: number;
  /** Extruder (filament slot) per object; one object per plate. */
  extruders?: number[];
  filaments?: { type: string; colour: string }[];
  settings?: Record<string, unknown>;
  bambu?: boolean;
}

const BEDS = { "A1 mini": 180, A1: 256, H2D: 350 };

const cube = (id: number, s = 20) => `<object id="${id}" type="model"><mesh><vertices>
${[[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]].map(([x, y, z]) => `<vertex x="${x - s / 2}" y="${y - s / 2}" z="${z}"/>`).join("\n")}
</vertices><triangles><triangle v1="0" v2="2" v3="1"/></triangles></mesh></object>`;

/** Builds a small Bambu Studio-style project 3MF: one 20 mm cube per plate, centred on its plate. */
export function bambuFixture(o: FixtureOptions = {}): Uint8Array {
  const printer = o.printer ?? "A1 mini";
  const bed = BEDS[printer];
  const plates = o.plates ?? 1;
  const cols = Math.ceil(Math.sqrt(plates) - 1e-9);
  const filaments = o.filaments ?? [{ type: "PLA", colour: "#FF0000" }];
  const objects = Array.from({ length: plates }, (_, i) => i);
  const app = o.bambu === false ? "" : `<metadata name="Application">BambuStudio-${o.version ?? "02.07.01.62"}</metadata>`;
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
 ${app}
 <resources>${objects.map((i) => cube(i + 1)).join("")}</resources>
 <build>${objects
   .map((i) => {
     const x = (i % cols) * bed * 1.2 + bed / 2;
     const y = -Math.floor(i / cols) * bed * 1.2 + bed / 2;
     return `<item objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 ${x} ${y} 0" printable="1"/>`;
   })
   .join("")}</build>
</model>`;
  const modelSettings = `<?xml version="1.0" encoding="UTF-8"?>
<config>
${objects.map((i) => `  <object id="${i + 1}"><metadata key="extruder" value="${o.extruders?.[i] ?? 1}"/></object>`).join("\n")}
${objects.map((i) => `  <plate><metadata key="plater_id" value="${i + 1}"/><metadata key="gcode_file" value="Metadata/plate_${i + 1}.gcode"/><model_instance><metadata key="object_id" value="${i + 1}"/></model_instance></plate>`).join("\n")}
</config>`;
  const settings = {
    version: o.version ?? "02.07.01.62",
    printer_settings_id: `Bambu Lab ${printer} 0.4 nozzle`,
    printer_model: `Bambu Lab ${printer}`,
    print_settings_id: "0.20mm Standard @BBL",
    nozzle_diameter: ["0.4"],
    printable_area: ["0x0", `${bed}x0`, `${bed}x${bed}`, `0x${bed}`],
    layer_height: "0.2",
    wall_loops: "5",
    sparse_infill_density: "35%",
    raft_first_layer_expansion: "-1",
    tree_support_wall_count: "-1",
    filament_type: filaments.map((f) => f.type),
    filament_colour: filaments.map((f) => f.colour),
    filament_is_support: filaments.map(() => "0"),
    machine_start_gcode: "M620 S0 ; Bambu AMS",
    ...o.settings,
  };
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    "_rels/.rels": strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'),
    "3D/3dmodel.model": strToU8(model),
  };
  if (o.bambu !== false) {
    files["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
    files["Metadata/model_settings.config"] = strToU8(modelSettings);
    files["Metadata/plate_1.gcode"] = strToU8("; bambu gcode");
    files["Metadata/slice_info.config"] = strToU8("<config/>");
  }
  return zipSync(files);
}
