import * as crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { load } from "./loader.js";

vi.mock("node:fs/promises");

const source = "console.log('Hello, world!')";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  server.resetHandlers();
  vi.resetAllMocks();
});
afterAll(() => server.close());

it("should make a request if the import starts with https://", async () => {
  const url = "https://unpkg.com/histar@0.4.1/src/index.mjs";
  server.use(http.get(url, () => new Response(source)));
  vi.mocked(readFile).mockRejectedValue(new Error("ENOENT: no such file or directory"));

  const mod = await load(url, { importAttributes: {} });
  expect(mod).toEqual({ format: "module", shortCircuit: true, source });

  expect(mkdir).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("node_modules/.cache/https-loader"), expect.anything());
  expect(writeFile).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("node_modules/.cache/https-loader/"), source);
});

it("should use the cache if the file is already downloaded", async () => {
  vi.mocked(readFile).mockResolvedValue(source);

  const mod = await load("https://unpkg.com/histar@0.4.1/src/index.mjs", { importAttributes: {} });
  expect(mod).toEqual({ format: "module", shortCircuit: true, source });
});

it("should follow redirects", async () => {
  server.use(
    http.get("https://unpkg.com/histar", () => Response.redirect("https://unpkg.com/histar@0.4.1/src/index.mjs")),
    http.get("https://unpkg.com/histar@0.4.1/src/index.mjs", () => new Response(source)),
  );
  vi.mocked(readFile).mockRejectedValue(new Error("ENOENT: no such file or directory"));

  const mod = await load("https://unpkg.com/histar", { importAttributes: {} });
  expect(mod).toEqual({ format: "module", shortCircuit: true, source });
});

it("should pass through if the import does not start with https://", async () => {
  const nextLoad = vi.fn();
  await load("histar", { importAttributes: {} }, nextLoad);
  expect(nextLoad).toHaveBeenCalledExactlyOnceWith("histar", { importAttributes: {} });
});

it.each(["sha256", "sha384", "sha512"])("should check hash if `integrity` is specified with %s", async (algorithm) => {
  const url = "https://unpkg.com/histar@0.4.1/src/index.mjs";
  server.use(http.get(url, () => new Response(source)));
  vi.mocked(readFile).mockRejectedValue(new Error("ENOENT: no such file or directory"));

  const hash = crypto.hash(algorithm, source, "base64");
  const mod = await load(url, { importAttributes: { integrity: `${algorithm}-${hash}` } });
  expect(mod).toEqual({ format: "module", shortCircuit: true, source });
});

it("should check hash if the file is loaded from the cache", async () => {
  const hash = crypto.hash("sha256", source, "base64");
  vi.mocked(readFile).mockResolvedValue(source);

  const mod = await load("https://unpkg.com/histar@0.4.1/src/index.mjs", { importAttributes: { integrity: `sha256-${hash}` } });
  expect(mod).toEqual({ format: "module", shortCircuit: true, source });
});

it("should fail if the integrity format is invalid", async () => {
  const nextLoad = vi.fn();
  await expect(load("https://unpkg.com/histar@0.4.1/src/index.mjs", { importAttributes: { integrity: "invalid" } }, nextLoad)).rejects.toThrow(
    "Invalid integrity format, expected <algorithm>-<base64 hash>",
  );
  expect(nextLoad).not.toHaveBeenCalled();
});

it("should fail if the hash does not match", async () => {
  const url = "https://unpkg.com/histar@0.4.1/src/index.mjs";
  server.use(http.get(url, () => new Response(source)));
  vi.mocked(readFile).mockRejectedValue(new Error("ENOENT: no such file or directory"));

  const nextLoad = vi.fn();
  await expect(load(url, { importAttributes: { integrity: "sha256-abc" } }, nextLoad)).rejects.toThrow("Integrity check failed: expected abc, got ");
  expect(nextLoad).not.toHaveBeenCalled();
});

it("should replace the cache if the hash does not match", async () => {
  const url = "https://unpkg.com/histar@0.4.1/src/index.mjs";
  server.use(http.get(url, () => new Response(source)));
  vi.mocked(readFile).mockResolvedValue("console.log('Goodbye, world!')");

  const hash = crypto.hash("sha256", source, "base64");
  const mod = await load(url, { importAttributes: { integrity: `sha256-${hash}` } });
  expect(mod).toEqual({ format: "module", shortCircuit: true, source });

  expect(writeFile).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("node_modules/.cache/https-loader/"), source);
});
