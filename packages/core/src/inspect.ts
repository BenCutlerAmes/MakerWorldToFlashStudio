import { Archive } from "./archive.js";

export interface Inspection {
  application?: string;
  requiredExtensions?: string;
  productionExtension: boolean;
  externalObjectFiles: string[];
  bambuMetadata: boolean;
  printerModel?: string;
  printerSettingsId?: string;
  printableArea?: string;
  configVersion?: string;
  plates: number;
  objects: number;
  filamentCount: number;
  painted: boolean;
  embeddedGcode: string[];
  buildTranslations: string[];
  odd: string[];
  entries: string[];
}

const attr = (s: string, name: string) => s.match(new RegExp(`${name}="([^"]*)"`))?.[1];

export function inspect(archive: Archive): Inspection {
  const entries = archive.paths();
  const root = archive.text("3D/3dmodel.model") ?? "";
  const header = root.slice(0, 4000);
  const modelHead = header.match(/<model[^>]*>/)?.[0] ?? "";
  const externalObjectFiles = entries.filter((p) => /^3D\/Objects\/.+\.model$/.test(p));

  let settings: Record<string, unknown> = {};
  const ps = archive.text("Metadata/project_settings.config");
  if (ps) {
    try {
      settings = JSON.parse(ps);
    } catch {
      settings = {};
    }
  }
  const str = (k: string) => {
    const v = settings[k];
    return Array.isArray(v) ? v.join(",") : (v as string | undefined);
  };
  const filamentColours = settings["filament_colour"];

  const ms = archive.text("Metadata/model_settings.config") ?? "";
  const plates = (ms.match(/<plate>/g) ?? []).length;

  const modelTexts = [root, ...externalObjectFiles.map((p) => archive.text(p) ?? "")];
  const painted = modelTexts.some((t) => /paint_color=|slic3rpe:mmu_segmentation=|paint_supports=|paint_seam=/.test(t));
  const objects = (root.match(/<object /g) ?? []).length;

  const build = root.slice(root.lastIndexOf("<build"));
  const buildTranslations = [...build.matchAll(/<item [^>]*transform="([^"]*)"/g)].map((m) =>
    m[1].split(/\s+/).slice(9).join(" "),
  );

  const odd = entries.filter((p) => p.endsWith("/") || !/^[\x20-\x7e]+$/.test(p) || /\/(Model|Profile)$/.test(p));

  return {
    application: header.match(/<metadata name="Application">([^<]*)</)?.[1],
    requiredExtensions: attr(modelHead, "requiredextensions"),
    productionExtension: /requiredextensions="[^"]*\bp\b/.test(modelHead) || /p:path=/.test(root),
    externalObjectFiles,
    bambuMetadata: /BambuStudio/.test(header),
    printerModel: str("printer_model"),
    printerSettingsId: str("printer_settings_id"),
    printableArea: str("printable_area"),
    configVersion: str("version"),
    plates,
    objects,
    filamentCount: Array.isArray(filamentColours) ? filamentColours.length : 0,
    painted,
    embeddedGcode: entries.filter((p) => p.endsWith(".gcode")),
    buildTranslations,
    odd,
    entries,
  };
}
