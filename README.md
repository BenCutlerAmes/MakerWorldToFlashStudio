# bambu2ff — MakerWorld → Flash Studio

Converts Bambu Studio / MakerWorld `.3mf` projects so they open and slice in **Flash Studio** for the **FlashForge Creator 5 Pro**.

Two ways to use it, same converter underneath:

- **Web page** — drag and drop files, save the converted copy. Runs entirely in the browser; nothing is uploaded. Hosted at <https://bencutlerames.github.io/MakerWorldToFlashStudio/>.
- **Command line** — `bambu2ff convert <file|folder>`. Works on macOS, Windows and Linux (Node 18+).

Converted files are saved next to the original as `<name>_FF.3mf`. Originals are never modified. Files that aren't Bambu projects are left alone.

## What it fixes

Found by slicing real MakerWorld downloads with Flash Studio's own command-line slicer (details in [docs/research.md](docs/research.md)):

| Problem in Flash Studio | Fix |
|---|---|
| "Newer 3MF version" warning / "File Version 2.x not supported" for files from newer Bambu Studio | Lower the version stamp to 2.4.0.2 |
| "Param values in 3mf/config error" (`raft_first_layer_expansion`, `tree_support_wall_count` = -1) | Replace with Flash Studio defaults |
| Project still targets a Bambu printer (A1 mini, A1, P1S, P2S, H2D) with Bambu G-code | Swap in Creator 5 Pro printer, process and filament presets; keep the designer's walls, infill, supports, brim, seam, ironing, etc. |
| Objects off-centre or on the wrong plate because the bed is a different size | Re-centre each object on its own plate for the 256 × 256 mm bed |
| Prime tower colliding with parts | Move it to a free corner of each plate |
| "Print by object" too tight for the Creator 5 Pro toolhead | Fall back to "by layer" (reported) |
| More than 4 filament slots | Map used slots onto the 4 toolheads |

Each conversion prints (or shows) a report of what changed and anything to check by hand.

## Use it

```bash
npm install
npm run dev            # web page at http://localhost:5173
npm run build          # static site in packages/web/dist, CLI in packages/cli/dist
node packages/cli/dist/bambu2ff.mjs convert model.3mf
node packages/cli/dist/bambu2ff.mjs convert path/to/folder -o converted/
```

## Develop

```
packages/core   converter (pure TypeScript, no Node or DOM APIs) + tests
packages/cli    command line
packages/web    Vite single page; conversion runs in a Web Worker
scripts/        research tooling: Flash Studio CLI harness, profile resolver, bisect helper
```

- `npm test` — unit tests on synthetic 3MFs.
- `npm run inspect -- <file|dir> --csv` — summarise 3MF internals.
- `npm run fs-check -- <file|dir>` — slice with Flash Studio's CLI and report errors (set `FLASH_STUDIO_BIN` if it isn't installed in the default place).
- `npm run profiles` — regenerate `packages/core/src/data/creator5pro.json` from the installed Flash Studio's bundled profiles (re-run after Flash Studio updates).

Printer/filament presets are FlashForge's, taken from Flash Studio's bundled profiles (OrcaSlicer-derived, AGPL-3.0).
