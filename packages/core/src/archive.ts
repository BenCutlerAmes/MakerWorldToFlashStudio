import { unzipSync, zipSync, strFromU8, strToU8, type Zippable } from "fflate";

/** A 3MF package held in memory as path -> bytes. Paths have no leading slash. */
export class Archive {
  constructor(public files: Map<string, Uint8Array>) {}

  static read(bytes: Uint8Array): Archive {
    const raw = unzipSync(bytes);
    return new Archive(new Map(Object.entries(raw)));
  }

  write(): Uint8Array {
    const z: Zippable = {};
    // Fixed timestamps keep output identical between the CLI and the web page.
    for (const [path, data] of this.files) z[path] = [data, { level: 6, mtime: new Date(Date.UTC(2020, 0, 1)) }];
    return zipSync(z);
  }

  has(path: string): boolean {
    return this.files.has(normalize(path));
  }

  text(path: string): string | undefined {
    const data = this.files.get(normalize(path));
    return data && strFromU8(data);
  }

  setText(path: string, text: string): void {
    this.files.set(normalize(path), strToU8(text));
  }

  delete(path: string): void {
    this.files.delete(normalize(path));
  }

  paths(): string[] {
    return [...this.files.keys()];
  }
}

export function normalize(path: string): string {
  return path.replace(/^\/+/, "");
}
