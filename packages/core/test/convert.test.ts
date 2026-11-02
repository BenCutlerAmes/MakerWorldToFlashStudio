import { describe, expect, it } from "vitest";
import { Archive, convert } from "../src/index.js";
import { buildItemBoxes } from "../src/bbox.js";
import { plateColumns } from "../src/transforms/geometry.js";
import { bambuFixture } from "./fixture.js";

function run(bytes: Uint8Array) {
  const r = convert(bytes);
  expect(r.status).toBe("converted");
  const a = Archive.read(r.bytes!);
  return { r, a, settings: JSON.parse(a.text("Metadata/project_settings.config")!), model: a.text("3D/3dmodel.model")! };
}

const translations = (model: string) =>
  [...model.matchAll(/<item [^>]*transform="([^"]*)"/g)].map((m) => m[1].split(" ").slice(9, 11).map(Number));

describe("convert", () => {
  it("skips files that are not Bambu projects", () => {
    expect(convert(bambuFixture({ bambu: false })).status).toBe("skipped");
    expect(convert(new Uint8Array([1, 2, 3])).status).toBe("skipped");
  });

  it("caps the Bambu Studio version Flash Studio checks", () => {
    const { model } = run(bambuFixture({ version: "02.07.01.62" }));
    expect(model).toContain("BambuStudio-02.04.02.00");
    const { model: old } = run(bambuFixture({ version: "01.10.01.50" }));
    expect(old).toContain("BambuStudio-01.10.01.50");
  });

  it("replaces out-of-range values", () => {
    const { settings } = run(bambuFixture());
    expect(settings.raft_first_layer_expansion).toBe("2");
    expect(settings.tree_support_wall_count).toBe("0");
  });

  it("retargets printer, process and filaments to the Creator 5 Pro", () => {
    const { settings } = run(bambuFixture({ filaments: [{ type: "PETG", colour: "#00FF00" }] }));
    expect(settings.printer_settings_id).toBe("Flashforge Creator 5 Pro 0.4 nozzle");
    expect(settings.printer_model).toBe("Flashforge Creator 5 Pro");
    expect(settings.printable_area).toEqual(["0x0", "256x0", "256x256", "0x256"]);
    expect(settings.machine_start_gcode).not.toContain("M620");
    expect(settings.filament_settings_id[0]).toBe("Generic PETG @FF C5P");
    expect(settings.filament_colour[0]).toBe("#00FF00");
    expect(settings.filament_diameter).toEqual(["1.75", "1.75", "1.75", "1.75"]);
    expect(settings.filament_is_support).toHaveLength(4);
  });

  it("keeps the designer's process settings", () => {
    const { settings } = run(bambuFixture());
    expect(settings.wall_loops).toBe("5");
    expect(settings.sparse_infill_density).toBe("35%");
    expect(settings.print_settings_id).toBe("0.20mm Standard @FF C5");
  });

  it("re-centres objects on each plate for the bigger bed", () => {
    expect(plateColumns(1)).toBe(1);
    expect(plateColumns(2)).toBe(2);
    expect(plateColumns(5)).toBe(3);
    const { model } = run(bambuFixture({ printer: "A1 mini", plates: 3 }));
    // 3 plates -> 2 columns; plate stride = 1.2 x bed
    expect(translations(model)).toEqual([
      [128, 128],
      [128 + 256 * 1.2, 128],
      [128, 128 - 256 * 1.2],
    ]);
  });

  it("leaves objects alone when the bed size already matches", () => {
    const { model } = run(bambuFixture({ printer: "A1" }));
    expect(translations(model)).toEqual([[128, 128]]);
  });

  it("moves filament slots above 4 onto free toolheads", () => {
    const filaments = ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"].map((colour) => ({ type: "PLA", colour }));
    const { r, a, settings } = run(bambuFixture({ plates: 2, extruders: [1, 6], filaments }));
    expect(a.text("Metadata/model_settings.config")).toMatch(/key="extruder" value="2"/);
    expect(settings.filament_colour[1]).toBe("#666666");
    expect(r.report.changed.join()).toContain("6→2");
  });

  it("removes Bambu G-code and slice results", () => {
    const { a } = run(bambuFixture());
    expect(a.has("Metadata/plate_1.gcode")).toBe(false);
    expect(a.has("Metadata/slice_info.config")).toBe(false);
  });

  it("places the prime tower away from objects", () => {
    const { settings } = run(bambuFixture());
    const x = Number(settings.wipe_tower_x[0]);
    const y = Number(settings.wipe_tower_y[0]);
    // cube occupies 118..138 on both axes
    expect(x + 35 < 118 || x > 138 || y + 52 < 118 || y > 138).toBe(true);
  });

  it("computes bounding boxes through build transforms", () => {
    const boxes = buildItemBoxes(Archive.read(bambuFixture()));
    expect(boxes[0].box).toMatchObject({ minX: 80, maxX: 100, minZ: 0, maxZ: 20 });
  });
});
