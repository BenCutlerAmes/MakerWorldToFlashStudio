// Generates packages/core/src/data/creator5pro.json from Flash Studio's bundled profiles.
// usage: tsx scripts/build-profiles.ts [vendorDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { resolveProfile } from "./resolve-profile.js";

const vendor = process.argv[2];
const NOZZLES = ["0.25", "0.4", "0.6", "0.8"];
const machineName = (n: string) => `Flashforge Creator 5 Pro ${n} nozzle`;

const PROCESSES: Record<string, string[]> = {
  "0.25": ["0.08mm Standard @FF C5 0.25 nozzle", "0.10mm Standard @FF C5 0.25 nozzle", "0.12mm Standard @FF C5 0.25 nozzle", "0.14mm Standard @FF C5 0.25 nozzle"],
  "0.4": ["0.08mm Standard @FF C5", "0.10mm Standard @FF C5", "0.12mm Standard @FF C5", "0.20mm Standard @FF C5", "0.24mm Standard @FF C5"],
  "0.6": ["0.18mm Standard @FF C5 0.6 nozzle", "0.30mm Standard @FF C5 0.6 nozzle", "0.42mm Standard @FF C5 0.6 nozzle"],
  "0.8": ["0.32mm Standard @FF C5 0.8 nozzle", "0.4mm Standard @FF C5 0.8 nozzle", "0.48mm Standard @FF C5 0.8 nozzle"],
};

// Bambu filament_type -> Flash Studio generic preset (0.4/0.6/0.8 name, 0.25 name)
const FILAMENTS: Record<string, [string, string]> = {
  PLA: ["Generic PLA @FF C5P", "Generic HS PLA @FF C5P 0.25 nozzle"],
  "PLA-CF": ["Generic PLA-CF @FF C5P", "Generic HS PLA @FF C5P 0.25 nozzle"],
  PETG: ["Generic PETG @FF C5P", "Generic PETG @FF C5P 0.25 nozzle"],
  "PETG-CF": ["Generic PETG-CF @FF C5P", "Generic PETG @FF C5P 0.25 nozzle"],
  ABS: ["Generic ABS @FF C5P", "Generic ABS @FF C5P 0.25 nozzle"],
  ASA: ["Generic ASA @FF C5P", "Generic ASA @FF C5P 0.25 nozzle"],
  HIPS: ["Generic HIPS @FF C5P", "Generic HIPS @FF C5P 0.25 nozzle"],
  PVA: ["Generic PVA @FF C5P", "Generic PVA @FF C5P 0.25 nozzle"],
  TPU: ["Generic TPU-95A @FF C5P", "Generic TPU-95A @FF C5P"],
  "PA-CF": ["Generic PA-CF @FF C5P", "Generic PA-CF @FF C5P"],
};

const strip = (p: Record<string, unknown>) => {
  for (const k of ["setting_id", "instantiation", "from", "type", "compatible_printers_condition", "description"]) delete p[k];
  return p;
};

const data = {
  source: "Flash Studio bundled Flashforge profiles",
  machines: Object.fromEntries(NOZZLES.map((n) => [n, strip(resolveProfile("machine", machineName(n), vendor))])),
  processes: Object.fromEntries(NOZZLES.map((n) => [n, PROCESSES[n].map((p) => strip(resolveProfile("process", p, vendor)))])),
  filaments: Object.fromEntries(
    Object.entries(FILAMENTS).map(([type, [std, small]]) => [
      type,
      { default: { ...strip(resolveProfile("filament", std, vendor)), name: std }, "0.25": { ...strip(resolveProfile("filament", small, vendor)), name: small } },
    ]),
  ),
};

mkdirSync("packages/core/src/data", { recursive: true });
writeFileSync("packages/core/src/data/creator5pro.json", JSON.stringify(data));
console.log("wrote", JSON.stringify(data).length, "bytes");
