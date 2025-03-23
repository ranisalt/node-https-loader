// @ts-check

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as qs from "node:querystring";
import { findUp } from "find-up";

const integrityRegex = /^([^-]*)-(.*)$/;

/**
 * @param {string} source
 * @param {string} [integrity]
 */
function checkIntegrity(source, integrity) {
  if (!integrity) {
    return;
  }

  const result = integrityRegex.exec(integrity);
  if (!result) {
    throw new Error("Invalid integrity format, expected <algorithm>-<base64 hash>");
  }

  const [, algorithm, expected] = result;
  const hash = crypto.hash(algorithm, source, "base64");
  if (expected !== hash) {
    throw new Error(`Integrity check failed: expected ${expected}, got ${hash}`);
  }
}

/**
 * @param {string} name
 * @returns {Promise<string | undefined>}
 */
async function findCacheDirectory(name) {
  const packageJson = await findUp("package.json");
  if (!packageJson) {
    return;
  }

  const cacheDir = path.join(path.dirname(packageJson), "node_modules", ".cache", name);
  await fs.mkdir(cacheDir, { recursive: true });
  return cacheDir;
}

/** @type {import("node:module").ResolveHook} */
export async function resolve(specifier, context, nextResolve) {
  const { parentURL } = context;
  if (!parentURL || !parentURL.startsWith("https://")) {
    // Let Node.js handle all other URLs.
    return nextResolve(specifier, context);
  }

  const { href } = new URL(specifier, parentURL);
  return { url: href, shortCircuit: true };
}

/**
 * @param {string} type
 * @returns {import("node:module").ModuleFormat}
 */
function typeToFormat(type) {
  switch (type) {
    case "builtin":
    case "commonjs":
    case "commonjs-typescript":
    case "json":
    case "module":
    case "module-typescript":
    case "wasm":
      return type;
    default:
      return "commonjs";
  }
}

/** @type {import("node:module").LoadHook} */
export async function load(url, context, nextLoad) {
  if (!url.startsWith("https://")) {
    // Let Node.js handle all other URLs.
    return nextLoad(url, context);
  }

  const cacheDir = await findCacheDirectory("https-loader");
  if (!cacheDir) {
    throw new Error("Cache directory not found");
  }

  const filePath = path.resolve(cacheDir, qs.escape(url.substring(8)));

  let source;

  const { integrity, type = "module" } = context.importAttributes;
  try {
    source = await fs.readFile(filePath, "utf8");
    checkIntegrity(source, integrity);
  } catch {
    const res = await fetch(url);
    source = await res.text();
    checkIntegrity(source, integrity);

    await fs.writeFile(filePath, source);
  }

  return { format: typeToFormat(type), shortCircuit: true, source };
}
