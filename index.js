import * as module from "node:module";

module.register(import.meta.resolve("./loader.js"));
