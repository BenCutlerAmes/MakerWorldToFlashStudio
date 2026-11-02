// Runs Flash Studio's command-line slicer on 3MF files and records what happened.
// usage: tsx scripts/fs-check.ts <file|dir> [--out dir] [--mode info|slice] [--timeout s]
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const DEFAULT_BIN =
  process.platform === "win32"
    ? "C:\\Program Files\\Flash Studio\\Flash Studio.exe"
    : "/Applications/Flash Studio.app/Contents/MacOS/Flash Studio";
const BIN = process.env.FLASH_STUDIO_BIN ?? DEFAULT_BIN;

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : def;
};
const out = resolve(opt("out", "samples/out/fs-check"));
const mode = opt("mode", "slice");
const timeoutS = Number(opt("timeout", "180"));
const targets = args.flatMap((t) =>
  statSync(t).isDirectory() ? readdirSync(t).filter((f) => f.endsWith(".3mf")).map((f) => join(t, f)) : [t],
);

interface Result { file: string; exit: number | null; timedOut: boolean; seconds: number; errors: string[]; gcode: number }

function run(file: string): Promise<Result> {
  const name = basename(file, ".3mf");
  const dir = join(out, name);
  mkdirSync(dir, { recursive: true });
  const cliArgs = mode === "info"
    ? ["--info", resolve(file)]
    : ["--debug", "2", "--slice", "0", "--outputdir", dir, "--logfile", join(dir, "slicer.log"), resolve(file)];
  const started = Date.now();
  return new Promise((done) => {
    const p = spawn(BIN, cliArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    p.stdout.on("data", (d) => (log += d));
    p.stderr.on("data", (d) => (log += d));
    let timedOut = false;
    const t = setTimeout(() => { timedOut = true; p.kill("SIGKILL"); }, timeoutS * 1000);
    p.on("close", (code) => {
      clearTimeout(t);
      writeFileSync(join(dir, "stdout.txt"), log);
      const errors = log.split("\n").filter((l) => /error|fail|invalid|not support|newer/i.test(l)).slice(0, 20);
      const gcode = readdirSync(dir).filter((f) => f.endsWith(".gcode") || f.endsWith(".gcode.3mf")).length;
      done({ file: basename(file), exit: code, timedOut, seconds: (Date.now() - started) / 1000, errors, gcode });
    });
  });
}

const results: Result[] = [];
for (const f of targets) {
  const r = await run(f);
  results.push(r);
  console.log(`${r.exit === 0 ? "OK  " : "FAIL"} exit=${r.exit}${r.timedOut ? " (timeout)" : ""} gcode=${r.gcode} ${r.seconds.toFixed(0)}s  ${r.file}`);
  for (const e of r.errors.slice(0, 3)) console.log("      " + e.trim().slice(0, 200));
}
writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
