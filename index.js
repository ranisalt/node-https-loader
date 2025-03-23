import * as module from "node:module";

module.register("./loader.js", { parentURL: import.meta.url });
