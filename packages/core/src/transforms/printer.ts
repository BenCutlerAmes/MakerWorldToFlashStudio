import data from "../data/creator5pro.json" with { type: "json" };
import { type Project, type Settings, MODEL_SETTINGS, arr } from "../project.js";

type Profile = Record<string, string | string[]>;
const profiles = data as unknown as {
  machines: Record<string, Profile>;
  processes: Record<string, Profile[]>;
  filaments: Record<string, { default: Profile; "0.25": Profile }>;
};
const { machines, processes, filaments } = profiles;

export const TOOLHEADS = 4;
export const PRINTER_NAME = "Flashforge Creator 5 Pro";

/**
 * Process settings that describe how the designer wants the part printed (strength, look, supports).
 * These are kept from the Bambu file; everything else comes from the Creator 5 Pro preset.
 */
const DESIGN_INTENT = [
  "layer_height", "initial_layer_print_height", "wall_loops", "top_shell_layers", "bottom_shell_layers",
  "top_shell_thickness", "bottom_shell_thickness", "sparse_infill_density", "sparse_infill_pattern",
  "top_surface_pattern", "bottom_surface_pattern", "internal_solid_infill_pattern", "infill_direction",
  "infill_wall_overlap", "wall_sequence", "wall_generator", "detect_thin_wall", "only_one_wall_top",
  "only_one_wall_first_layer", "seam_position", "enable_support", "support_type", "support_style",
  "support_threshold_angle", "support_on_build_plate_only", "support_critical_regions_only",
  "support_top_z_distance", "support_bottom_z_distance", "support_interface_top_layers",
  "support_interface_bottom_layers", "support_interface_spacing", "support_base_pattern",
  "support_base_pattern_spacing", "support_object_xy_distance", "support_interface_pattern",
  "tree_support_branch_angle", "tree_support_branch_diameter", "tree_support_wall_count",
  "enforce_support_layers", "raft_layers", "raft_first_layer_expansion", "brim_type", "brim_width",
  "brim_object_gap", "skirt_loops", "skirt_distance", "ironing_type", "ironing_pattern", "ironing_spacing",
  "ironing_flow", "print_sequence", "spiral_mode", "xy_hole_compensation", "xy_contour_compensation",
  "elefant_foot_compensation", "fuzzy_skin", "fuzzy_skin_thickness", "fuzzy_skin_point_distance",
  "enable_prime_tower", "reduce_infill_retraction", "is_infill_first",
  "bridge_flow", "thick_bridges", "max_bridge_length", "slice_closing_radius", "resolution",
];

/** Profile keys that name or link presets rather than being settings. */
const META_KEYS = new Set(["name", "inherits", "compatible_printers", "compatible_printers_condition", "compatible_prints", "compatible_prints_condition", "version", "filament_id", "filament_settings_id", "print_settings_id", "printer_settings_id"]);

/** Per-filament options in Bambu/Orca configs that don't share the filament_ prefix. */
const FILAMENT_KEYS = new Set([
  "nozzle_temperature", "nozzle_temperature_initial_layer", "nozzle_temperature_range_low", "nozzle_temperature_range_high",
  "hot_plate_temp", "hot_plate_temp_initial_layer", "cool_plate_temp", "cool_plate_temp_initial_layer", "eng_plate_temp",
  "eng_plate_temp_initial_layer", "textured_plate_temp", "textured_plate_temp_initial_layer", "supertack_plate_temp",
  "supertack_plate_temp_initial_layer", "temperature_vitrification", "fan_min_speed", "fan_max_speed", "fan_cooling_layer_time",
  "slow_down_layer_time", "slow_down_min_speed", "close_fan_the_first_x_layers", "full_fan_speed_layer",
  "overhang_fan_speed", "overhang_fan_threshold", "reduce_fan_stop_start_freq", "additional_cooling_fan_speed",
  "required_nozzle_HRC", "chamber_temperatures", "activate_air_filtration", "during_print_exhaust_fan_speed",
  "complete_print_exhaust_fan_speed", "pressure_advance", "enable_pressure_advance", "default_filament_colour",
]);
const isFilamentKey = (k: string) => k.startsWith("filament_") || FILAMENT_KEYS.has(k);

const nearest = (value: number, options: string[]) =>
  options.reduce((best, o) => (Math.abs(Number(o) - value) < Math.abs(Number(best) - value) ? o : best));

function filamentFor(type: string, nozzle: string): Profile {
  const t = type.toUpperCase();
  const key = Object.keys(filaments).find((k) => k === t) ?? (t.startsWith("TPU") ? "TPU" : t.startsWith("PA") ? "PA-CF" : t.startsWith("PETG") ? "PETG" : "PLA");
  const entry = filaments[key];
  return nozzle === "0.25" ? entry["0.25"] : entry.default;
}

/** Chooses which original filament slots survive on the 4 toolheads and returns old slot → new slot. */
function planSlots(p: Project, count: number): Map<number, number> {
  const ms = p.archive.text(MODEL_SETTINGS) ?? "";
  const used = new Set([...ms.matchAll(/key="extruder" value="(\d+)"/g)].map((m) => Number(m[1])).filter((n) => n > 0));
  if (used.size === 0) used.add(1);
  const map = new Map<number, number>();
  const free = [1, 2, 3, 4].filter((n) => !used.has(n));
  for (const slot of [...used].sort((a, b) => a - b)) {
    if (slot <= TOOLHEADS) map.set(slot, slot);
    else if (free.length) map.set(slot, free.shift()!);
  }
  // Unused low slots keep their place so colours stay where the designer put them.
  for (let s = 1; s <= Math.min(count, TOOLHEADS); s++) if (![...map.values()].includes(s) && !map.has(s)) map.set(s, s);
  const lost = [...used].filter((s) => !map.has(s));
  if (lost.length) p.report.warnings.push(`Uses ${used.size} filaments but the Creator 5 Pro has ${TOOLHEADS} toolheads; slots ${lost.join(", ")} were moved to toolhead 1`);
  return map;
}

function remapExtruders(p: Project, map: Map<number, number>): void {
  const ms = p.archive.text(MODEL_SETTINGS);
  if (!ms) return;
  const out = ms.replace(/key="extruder" value="(\d+)"/g, (all, n: string) => {
    const v = Number(n);
    return v === 0 ? all : `key="extruder" value="${map.get(v) ?? 1}"`;
  });
  if (out !== ms) {
    p.archive.setText(MODEL_SETTINGS, out);
    if ([...map].some(([a, b]) => a !== b)) p.report.changed.push(`Filament slots remapped: ${[...map].filter(([a, b]) => a !== b).map(([a, b]) => `${a}→${b}`).join(", ")}`);
  }
}

/** Replaces the Bambu printer, process and filament presets with Creator 5 Pro equivalents. */
export function retargetPrinter(p: Project): void {
  const s = p.settings;
  const nozzle = nearest(Number(arr(s.nozzle_diameter)[0] ?? 0.4), Object.keys(machines));
  const machine = machines[nozzle];
  const fromPrinter = (s.printer_settings_id as string) ?? "unknown printer";
  if (nozzle !== String(Number(arr(s.nozzle_diameter)[0] ?? 0.4))) p.report.warnings.push(`Nozzle ${arr(s.nozzle_diameter)[0]} mm mapped to ${nozzle} mm (closest Creator 5 Pro nozzle)`);

  // Filaments: decide slot layout before overwriting anything.
  const colours = arr(s.filament_colour);
  const types = arr(s.filament_type);
  const slotMap = planSlots(p, colours.length);
  const sourceOf: number[] = []; // new slot index (0-based) -> original slot (1-based) or 0 for padding
  for (let n = 1; n <= TOOLHEADS; n++) sourceOf.push([...slotMap].find(([, to]) => to === n)?.[0] ?? 0);
  const chosen = sourceOf.map((src) => filamentFor(src ? types[src - 1] ?? "PLA" : "PLA", nozzle));
  remapExtruders(p, slotMap);

  // Process: closest Creator 5 Pro layer height, then keep the designer's intent settings.
  const lh = Number(s.layer_height ?? 0.2);
  const proc = processes[nozzle].reduce((best, o) => (Math.abs(Number(o.layer_height) - lh) < Math.abs(Number(best.layer_height) - lh) ? o : best));
  // Settings are rebuilt from the Creator 5 Pro presets; Bambu-only keys (AMS, H2D extruder variants,
  // per-filament arrays sized for the old slot count) would otherwise break Flash Studio's loader.
  const out: Settings = { name: "project_settings", from: "project", version: (s.version as string) ?? "" };
  for (const [k, v] of Object.entries(proc)) if (!META_KEYS.has(k)) out[k] = v;
  for (const [k, v] of Object.entries(machine)) if (!META_KEYS.has(k)) out[k] = v;

  // Filament keys become per-slot arrays built from the chosen presets.
  const filamentKeys = new Set(chosen.flatMap((f) => Object.keys(f)).filter((k) => !META_KEYS.has(k) && Array.isArray(chosen[0][k])));
  for (const k of filamentKeys) out[k] = chosen.map((f) => arr(f[k])[0] ?? "");

  // Per-filament options the presets don't define (e.g. filament_is_support) must still have one value per slot.
  const origCount = colours.length;
  for (const [k, v] of Object.entries(s)) {
    if (out[k] !== undefined || !Array.isArray(v) || v.length !== origCount || !isFilamentKey(k)) continue;
    out[k] = sourceOf.map((src) => v[(src || 1) - 1] ?? v[0]);
  }

  // Keep the designer's intent on top of the preset.
  const intentDiffs: string[] = [];
  for (const k of DESIGN_INTENT) {
    if (s[k] === undefined) continue;
    if (JSON.stringify(s[k]) !== JSON.stringify(out[k])) intentDiffs.push(k);
    out[k] = s[k];
  }
  for (const k of ["wipe_tower_x", "wipe_tower_y", "wipe_tower_rotation_angle"]) if (s[k] !== undefined) out[k] = s[k];

  out.filament_colour = sourceOf.map((src, i) => (src && colours[src - 1]) || arr(machine.extruder_colour)[i] || "#FFFFFF");
  out.filament_settings_id = chosen.map((f) => f.name as string);
  out.filament_ids = chosen.map((f) => (f.filament_id as string) ?? "");
  // Flash Studio models the Creator 5 Pro as one "extruder" group holding all four toolheads.
  out.filament_map = sourceOf.map(() => "1");
  out.extruder_colour = out.filament_colour;

  out.printer_settings_id = machine.name as string;
  out.printer_model = PRINTER_NAME;
  out.print_settings_id = proc.name as string;
  out.print_compatible_printers = [machine.name as string];
  out.inherits_group = ["", ...chosen.map(() => ""), ""];
  out.different_settings_to_system = [intentDiffs.join(";"), ...chosen.map(() => ""), ""];
  out.curr_bed_type = "Textured PEI Plate";

  p.settings = out;
  p.report.changed.push(`Printer: ${fromPrinter} → ${machine.name}`);
  p.report.changed.push(`Process: ${s.print_settings_id ?? "?"} → ${proc.name}, keeping the designer's ${intentDiffs.length} customised settings (${intentDiffs.slice(0, 8).join(", ")}${intentDiffs.length > 8 ? ", …" : ""})`);
  p.report.changed.push(`Filaments: ${chosen.map((f, i) => `T${i + 1} ${f.name} ${out.filament_colour[i]}`).join("; ")}`);
}
