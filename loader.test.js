import * as crypto from "node:crypto";
import { http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { load } from "./loader.js";

const source = "console.log('Hello, world!')";

const server = setupServer(
  http.get("https://unpkg.com/histar", () => Response.redirect("https://unpkg.com/histar@0.4.1/src/index.mjs")),
  http.get("https://unpkg.com/histar@0.4.1/src/index.mjs", () => new Response(source)),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => server.resetHandlers());
afterAll(() => server.close());

it("should make a request if the import starts with https://", async () => {
  const mod = await load("https://unpkg.com/histar@0.4.1/src/index.mjs", { importAttributes: {} });
  expect(mod).toEqual({ format: "module", shortCircuit: true, source });
});

it("should follow redirects", async () => {
  const mod = await load("https://unpkg.com/histar", { importAttributes: {} });
  expect(mod).toEqual({ format: "module", shortCircuit: true, source });
});

it("should pass through if the import does not start with https://", async () => {
  const nextLoad = vi.fn();
  await load("histar", { importAttributes: {} }, nextLoad);
  expect(nextLoad).toHaveBeenCalledExactlyOnceWith("histar", { importAttributes: {} });
});

it.each(["sha256", "sha384", "sha512"])("should check hash if `integrity` is specified with %s", async (algorithm) => {
  const hash = crypto.hash(algorithm, source, "base64");
  const mod = await load("https://unpkg.com/histar@0.4.1/src/index.mjs", { importAttributes: { integrity: `${algorithm}-${hash}` } });
  expect(mod).toEqual({ format: "module", shortCircuit: true, source });
});
