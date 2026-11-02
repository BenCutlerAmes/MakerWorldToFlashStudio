import type { Report } from "@bambu2ff/core";

interface Reply { id: number; status: "converted" | "skipped" | "error"; reason?: string; report: Report; bytes?: Uint8Array }

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const pending = new Map<number, (r: Reply) => void>();
worker.onmessage = (e: MessageEvent<Reply>) => pending.get(e.data.id)?.(e.data);
let nextId = 0;

const drop = document.querySelector<HTMLLabelElement>("#drop")!;
const picker = document.querySelector<HTMLInputElement>("#picker")!;
const results = document.querySelector<HTMLElement>("#results")!;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

function save(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "model/3mf" }));
  const a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function handle(file: File) {
  const card = el("article", "file");
  const head = el("div", "file-head");
  const badge = el("span", "badge busy", "Converting…");
  head.append(el("span", "file-name", file.name), badge);
  card.append(head);
  results.prepend(card);

  if (!file.name.toLowerCase().endsWith(".3mf")) {
    badge.className = "badge bad";
    badge.textContent = "Not a .3mf";
    return;
  }

  const id = nextId++;
  const bytes = await file.arrayBuffer();
  const reply = await new Promise<Reply>((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ id, bytes }, [bytes]);
  });
  pending.delete(id);

  if (reply.status !== "converted") {
    badge.className = reply.status === "skipped" ? "badge skip" : "badge bad";
    badge.textContent = reply.status === "skipped" ? "No changes needed" : "Failed";
    card.append(el("p", "reason", reply.reason ?? ""));
    return;
  }

  const outName = file.name.replace(/\.3mf$/i, "_FF.3mf");
  badge.className = "badge ok";
  badge.textContent = "Converted";
  const button = el("button", undefined, `Save ${outName}`);
  button.addEventListener("click", () => save(reply.bytes!, outName));
  head.append(button);

  const notes = el("ul", "notes");
  for (const w of reply.report.warnings) notes.append(el("li", "warn", `⚠ ${w}`));
  for (const c of reply.report.changed) notes.append(el("li", undefined, c));
  for (const d of reply.report.dropped) notes.append(el("li", "muted", `Removed: ${d}`));
  card.append(notes);
}

function accept(files: FileList | null) {
  for (const f of Array.from(files ?? [])) void handle(f);
}

picker.addEventListener("change", () => {
  accept(picker.files);
  picker.value = "";
});
drop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    picker.click();
  }
});
for (const t of ["dragenter", "dragover"]) drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); });
for (const t of ["dragleave", "drop"]) drop.addEventListener(t, () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  accept(e.dataTransfer?.files ?? null);
});
// Dropping outside the zone shouldn't navigate away from the page.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());
