// Flattens a Flash Studio system profile (following "inherits") into one JSON object.
// usage: tsx scripts/resolve-profile.ts <machine|process|filament> "<profile name>" [vendorDir]
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_VENDOR =
  process.platform === "win32"
    ? "C:\\Program Files\\Flash Studio\\resources\\profiles\\Flashforge"
    : "/Applications/Flash Studio.app/Contents/Resources/profiles/Flashforge";

export function resolveProfile(kind: string, name: string, vendorDir = DEFAULT_VENDOR): Record<string, unknown> {
  // Filament profiles may inherit from the shared Orca filament library next to the vendor folder.
  const dirs = [join(vendorDir, kind), join(vendorDir, "..", "OrcaFilamentLibrary", kind)];
  // Parents resolve inside the vendor the child came from (the Flashforge and Orca libraries both
  // define fdm_filament_common, with different filament diameters).
  const byVendor = dirs.map(() => new Map<string, Record<string, unknown>>());
  for (const [i, dir] of dirs.entries()) {
    const byName = byVendor[i];
    let names: string[] = [];
    try {
      names = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const f of names) {
      const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
      if (j.name && !byName.has(j.name)) byName.set(j.name, j);
    }
  }
  const chain: Record<string, unknown>[] = [];
  let vendor = 0;
  for (let n: string | undefined = name; n; ) {
    const order = [vendor, ...byVendor.keys()];
    const found = order.find((i) => byVendor[i].has(n!));
    if (found === undefined) throw new Error(`profile not found: ${kind}/${n}`);
    vendor = found;
    const p = byVendor[found].get(n)!;
    chain.unshift(p);
    n = p.inherits as string | undefined;
  }
  const out: Record<string, unknown> = Object.assign({}, ...chain);
  delete out.inherits;
  out.name = name;
  return out;
}

if (process.argv[1]?.endsWith("resolve-profile.ts")) {
  const [kind, name, vendor] = process.argv.slice(2);
  console.log(JSON.stringify(resolveProfile(kind, name, vendor), null, 2));
}
