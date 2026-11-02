// bambu2ff command-line entry point (bundled to dist/bambu2ff.mjs).
import { readFileSync, statSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { Archive, inspect, convert } from "@bambu2ff/core";

const [cmd, ...args] = process.argv.slice(2);

function files(target: string): string[] {
  return statSync(target).isDirectory()
    ? readdirSync(target).filter((f) => f.toLowerCase().endsWith(".3mf")).map((f) => join(target, f))
    : [target];
}

if (cmd === "inspect") {
  const csv = args.includes("--csv");
  const targets = args.filter((a) => !a.startsWith("--"));
  const rows = targets.flatMap(files).map((f) => {
    try {
      return { file: basename(f), ...inspect(Archive.read(readFileSync(f))) };
    } catch (e) {
      return { file: basename(f), error: String(e) };
    }
  });
  if (csv) {
    const cols = ["file", "application", "productionExtension", "externalObjectFiles", "printerModel", "printerSettingsId", "printableArea", "configVersion", "plates", "objects", "filamentCount", "painted", "embeddedGcode", "buildTranslations", "odd", "error"];
    console.log(cols.join(","));
    for (const r of rows as Record<string, unknown>[]) {
      console.log(cols.map((c) => {
        const v = r[c];
        const s = Array.isArray(v) ? (c === "externalObjectFiles" || c === "embeddedGcode" || c === "odd" ? String(v.length) : v.join(" | ")) : v ?? "";
        return `"${String(s).replace(/"/g, '""')}"`;
      }).join(","));
    }
  } else {
    for (const r of rows) console.log(JSON.stringify({ ...r, entries: undefined }, null, 2));
  }
} else if (cmd === "convert") {
  const o = args.indexOf("-o");
  const outDir = o >= 0 ? args.splice(o, 2)[1] : undefined;
  const quiet = args.includes("--quiet");
  let failed = 0;
  for (const f of args.filter((a) => !a.startsWith("--")).flatMap(files)) {
    if (/_FF\.3mf$/i.test(f)) continue;
    let r: ReturnType<typeof convert>;
    try {
      r = convert(new Uint8Array(readFileSync(f)));
    } catch (e) {
      console.error(`fail  ${basename(f)}: ${e instanceof Error ? e.message : e}`);
      failed++;
      continue;
    }
    if (r.status === "skipped") {
      console.log(`skip  ${basename(f)}: ${r.reason}`);
      continue;
    }
    const out = join(outDir ?? dirname(f), basename(f).replace(/\.3mf$/i, "_FF.3mf"));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, r.bytes!);
    console.log(`ok    ${basename(f)} -> ${out}`);
    if (!quiet) {
      for (const c of r.report.changed) console.log(`        changed: ${c}`);
      for (const d of r.report.dropped) console.log(`        dropped: ${d}`);
      for (const w of r.report.warnings) console.log(`        warning: ${w}`);
    }
  }
  process.exit(failed ? 1 : 0);
} else {
  if (cmd && cmd !== "--help" && cmd !== "-h") console.error(`unknown command: ${cmd}`);
  console.log("usage:\n  bambu2ff convert <file|dir> [-o outDir] [--quiet]\n  bambu2ff inspect <file|dir> [--csv]");
  process.exit(cmd && cmd !== "--help" && cmd !== "-h" ? 1 : 0);
}
