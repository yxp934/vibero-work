class CiteprocRsError extends Error {
    constructor(message) {
        super(message);
        this.name = "CiteprocRsError";
    }
}
class CiteprocRsDriverError extends CiteprocRsError {
    constructor(message, data) {
        super(message);
        this.data = data;
        this.name = "CiteprocRsDriverError";
    }
}
class CslStyleError extends CiteprocRsError {
    constructor(message, data) {
        super(message);
        this.data = data;
        this.name = "CslStyleError";
    }
}

function doExport(onto) {
    onto.CiteprocRsError = CiteprocRsError;
    onto.CslStyleError = CslStyleError;
    onto.CiteprocRsDriverError = CiteprocRsDriverError;
}

// So there is no way to tell wasm-bindgen to re-export JS items.
// So we have to export them onto a global, if possible, for consumers to use them eg with `instanceof`.
// At the same time, the typescript declarations have to be in a `declare global { }` block.
let env_global;
if (typeof self !== "undefined") {
    env_global = self;
} else if (typeof global !== "undefined") {
    env_global = global;
} else if (typeof window !== "undefined") {
    env_global = window;
}
if (typeof env_global !== "undefined") {
    doExport(env_global)
}
// We export to some global, because without linking, there is no way for the rust
// code to find these items
// For use in the _zotero output
// Also because wasm-bindgen is not yet capable of exporting JS items defined here
// to the wasm library consumer, so they also need a way to get at it to check if
// an error is an instanceof CiteprocRsError (eg)
//
// Note that the generated glue code uses CITEPROC_RS_ZOTERO_GLOBAL, which
// needs replacement in the Zotero build script to work.

// doExport defined in include.js

if (typeof Zotero !== "undefined" && typeof Zotero.CiteprocRs !== "undefined") {
    doExport(Zotero.CiteprocRs)
}

// Then we do one little commonjs hack so const { CiteprocRsError } = require("...") works.
if (typeof module !== "undefined") {
    module.exports = {};
    doExport(module.exports);
}
