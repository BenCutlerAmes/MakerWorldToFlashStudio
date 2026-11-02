# Research: why MakerWorld 3MFs fail in Flash Studio

Target: **Flash Studio 1.7.20**, built on **Orca-Flashforge 2.4.2**, printer **Flashforge Creator 5 Pro** (256×256×256 mm, 4 toolheads, Klipper).

## Method
- Test set: about 25 Bambu Studio projects downloaded from MakerWorld (Bambu Studio 1.7 to 2.8; A1 mini, A1, P1S, P2S and H2D printers; 1 to 13 plates), plus a few plain core-spec 3MFs as controls. `npm run inspect -- <dir> --csv` summarises each file.
- Flash Studio has a command-line slicer (same binary, Bambu-style CLI). `scripts/fs-check.ts` slices every plate of each file and records the exit code and errors.
- `scripts/variant.ts` writes copies with one patch applied, to bisect each error.
- Profiles: `Flash Studio.app/Contents/Resources/profiles/Flashforge/{machine,process,filament}`; `scripts/resolve-profile.ts` flattens the `inherits` chain (filaments fall back to `profiles/OrcaFilamentLibrary`).

## Errors on unconverted files (CLI, `--slice 0`)
| Outcome | Share | Cause |
|---|---|---|
| Slices | ~45% | Bambu Studio ≤ 2.4 files without the bad values below. **But** they slice with the embedded *Bambu* printer config, not the Creator 5 Pro. |
| Exit 232 "Version Check: File Version 2.x not supported by current cli version 2.4.2" | ~40% | Files saved by Bambu Studio 2.5 and later |
| Exit 238 "Param values in 3mf/config error" | the rest, and every version-gated file once the version is fixed | `raft_first_layer_expansion: -1` (range ≥ 0) and `tree_support_wall_count: -1` (range 0–2) |
| Exit 205 "Relative extruder addressing requires resetting the extruder position…" | plain 3MFs | No settings in the file, so the CLI falls back to a default config. Not a Bambu problem; the converter passes these through. |

## Root causes
1. **Version gate.** The file version comes **only** from `<metadata name="Application">BambuStudio-XX.YY…` in `3D/3dmodel.model`. Changing `project_settings.config` `version` or the `slice_info.config` client version has no effect. The CLI accepts up to `02.04.02`, but the app compares against **2.4.0.2** and shows a "Newer 3MF version … unrecognized keys" dialog above that, so the converter writes `02.04.00.02`.
2. **Out-of-range values.** Newer Bambu Studio uses `-1` ("auto") for `raft_first_layer_expansion` and `tree_support_wall_count`; Orca-Flashforge rejects them. Creator 5 Pro defaults: `2` and `0`.
3. **Wrong printer.** Every Bambu project carries a full Bambu printer config (Bambu start/end/tool-change G-code with `M620`, AMS keys, bed sizes 180–350 mm). Flash Studio ships without Bambu presets, and slicing as-is would produce Bambu G-code. The converter retargets to the Creator 5 Pro machine and matching process/filament presets.
4. **Bed size / plate grid.** Objects are positioned in canvas coordinates that include each plate's offset, and plate stride is 1.2 × bed size (A1 mini 180, A1/P1S 256, H2D 350×320). Retargeting to 256×256 moves objects per plate so they stay centred on their own plate.
5. **Filament slots.** Bambu files list 1–6 filaments; the Creator 5 Pro has 4 toolheads. Used slots above 4 are moved onto free toolheads and object/part `extruder` metadata is remapped.

## Found while building the converter
6. **Missing per-filament keys.** Every per-filament option needs one value per filament (`filament_is_support's count 1 not equal to filament_colour's size 4`). Options the Creator 5 Pro presets don't define are carried over from the Bambu file, re-indexed to the new slots.
7. **Bambu-only keys break loading.** Leftover H2D/AMS keys (`nozzle_volume_type`, per-extruder arrays, AMS drying settings) caused `type must be string, but is array` and `Invalid value … ,,,1`. Settings are rebuilt from the Creator 5 Pro presets, and only designer-intent process keys are copied over.
8. **Mixed presets leave blanks.** Material presets don't share one key set (ABS defines `activate_chamber_temp_control`, PLA doesn't). A blank entry (`1,,,`) makes Flash Studio discard the whole config and fall back to a default printer, which then reports off-plate objects and the "G92 E0" error. Empty toolheads now reuse the first used material, and any remaining gaps are filled from the source file or another preset.
9. **One extruder group.** Flash Studio models the Creator 5 Pro as one "extruder" holding four toolheads (`printer_extruder_count=1`), so `filament_map` is all `1`.
10. **Profile name collision.** Flashforge's `fdm_filament_common` sets 2.85 mm filament; the Orca library's sets 1.75 mm. A profile's parents must be resolved in its own vendor folder, as the slicer does, or the Creator 5 Pro gets 2.85 mm filament.
11. **Layout on a different toolhead.** Creator 5 Pro `extruder_clearance_radius` is 92 mm, so "by object" prints laid out for Bambu printers fail with "Assembly is too close to others" (falls back to "by layer"). Prime-tower coordinates scaled from a 350 mm bed landed on a part ("gcode path conflicts found between WipeTower and …"); the tower now goes in a free corner, chosen from object bounding boxes. Bounding boxes transform every vertex (boxes of rotated parts transformed as boxes come out inflated) and skip modifier/negative parts.

## Result
After conversion, every Bambu file in the test set loads with Creator 5 Pro settings, and all but one slice every plate in the CLI. The exception has parts packed so tightly that their brims overlap; the unconverted file fails the same way, and Arrange in Flash Studio fixes it.

## Not problems (checked)
- 3MF Production Extension (`requiredextensions="p"`, `3D/Objects/*.model`): Orca-Flashforge reads it fine.
- Unknown Bambu-only config keys: ignored while the file stays a consistent Bambu config (see 7 for what breaks once it is retargeted).
- `BambuStudio:` namespace and MakerWorld metadata: accepted.

## Open items
- Painted multi-colour regions (`paint_color`) aren't remapped when a used slot above 4 moves to another toolhead.
- The CLI's `--export-3mf` crashes on macOS (needs OpenGL for thumbnails), so a reference 3MF saved by Flash Studio has to come from the app.
- Some dialogs only appear in the app, not the CLI (the 2.4.0.2 version check was one); converted files should also be opened in the app.
