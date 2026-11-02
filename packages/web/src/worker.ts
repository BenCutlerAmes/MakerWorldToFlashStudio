import { convert } from "@bambu2ff/core";

self.onmessage = (e: MessageEvent<{ id: number; bytes: ArrayBuffer }>) => {
  const { id, bytes } = e.data;
  try {
    const r = convert(new Uint8Array(bytes));
    const out = r.bytes;
    (self as unknown as Worker).postMessage({ id, status: r.status, reason: r.reason, report: r.report, bytes: out }, out ? [out.buffer] : []);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, status: "error", reason: String(err), report: { changed: [], dropped: [], warnings: [] } });
  }
};
