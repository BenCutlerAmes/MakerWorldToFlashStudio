import { Archive } from "./archive.js";

export type Settings = Record<string, string | string[]>;

export interface Report {
  changed: string[];
  dropped: string[];
  warnings: string[];
}

/** A Bambu project being converted: the archive plus its parsed project settings. */
export interface Project {
  archive: Archive;
  settings: Settings;
  /** Settings as they were in the original file, for transforms that need the source printer. */
  original: Settings;
  report: Report;
}

export const ROOT_MODEL = "3D/3dmodel.model";
export const PROJECT_SETTINGS = "Metadata/project_settings.config";
export const MODEL_SETTINGS = "Metadata/model_settings.config";

export function arr(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
