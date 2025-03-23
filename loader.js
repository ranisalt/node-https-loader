import * as crypto from "node:crypto";

const integrityRegex = /^([^-]*)-(.*)$/;

/** @type {import("node:module").LoadHook} */
export async function load(url, context, nextLoad) {
  if (!url.startsWith("https://")) {
    // Let Node.js handle all other URLs.
    return nextLoad(url, context);
  }

  // For JavaScript to be loaded over the network, we need to fetch and return it.
  const res = await fetch(url);
  const source = await res.text();

  const { integrity, type = "module" } = context.importAttributes;
  if (integrity) {
    const result = integrityRegex.exec(integrity);
    if (!result) {
      throw new Error("Invalid integrity format, expected <algorithm>-<base64 hash>");
    }

    const [, algorithm, expected] = result;
    const hash = crypto.hash(algorithm, source, "base64");
    if (expected !== hash) {
      throw new Error(`Integrity check failed for ${url}: expected ${expected}, got ${hash}`);
    }
  }

  return { format: type, shortCircuit: true, source };
}
