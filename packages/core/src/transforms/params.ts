import { type Project, MODEL_SETTINGS } from "../project.js";

/** Values Bambu Studio writes that are outside Flash Studio's allowed range, with the replacement to use. */
const FIXES: Record<string, { valid: (v: number) => boolean; fallback: string }> = {
  raft_first_layer_expansion: { valid: (v) => v >= 0, fallback: "2" },
  tree_support_wall_count: { valid: (v) => v >= 0 && v <= 2, fallback: "0" },
};

export function fixParamRanges(p: Project): void {
  for (const [key, fix] of Object.entries(FIXES)) {
    const v = p.settings[key];
    if (typeof v === "string" && !fix.valid(Number(v))) {
      p.settings[key] = fix.fallback;
      p.report.changed.push(`${key}: ${v} → ${fix.fallback} (out of Flash Studio's range)`);
    }
  }
  // Per-object overrides live in model_settings.config as <metadata key="..." value="..."/>.
  const ms = p.archive.text(MODEL_SETTINGS);
  if (!ms) return;
  const fixed = ms.replace(/<metadata key="([a-z_]+)" value="([^"]*)"\/>/g, (all, key: string, value: string) => {
    const fix = FIXES[key];
    return fix && !fix.valid(Number(value)) ? `<metadata key="${key}" value="${fix.fallback}"/>` : all;
  });
  if (fixed !== ms) p.archive.setText(MODEL_SETTINGS, fixed);
}
