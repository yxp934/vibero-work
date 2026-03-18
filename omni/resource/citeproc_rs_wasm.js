let wasm_bindgen;
(function () {
  const __exports = {};
  let wasm;

  let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

  cachedTextDecoder.decode();

  let cachegetUint8Memory0 = null;
  function getUint8Memory0() {
    if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== wasm.memory.buffer) {
      cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachegetUint8Memory0;
  }

  function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
  }

  const heap = new Array(32).fill(undefined);

  heap.push(undefined, null, true, false);

  let heap_next = heap.length;

  function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
  }

  function getObject(idx) {return heap[idx];}

  function dropObject(idx) {
    if (idx < 36) return;
    heap[idx] = heap_next;
    heap_next = idx;
  }

  function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
  }

  let WASM_VECTOR_LEN = 0;

  let cachedTextEncoder = new TextEncoder('utf-8');

  const encodeString = typeof cachedTextEncoder.encodeInto === 'function' ?
  function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
  } :
  function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
      read: arg.length,
      written: buf.length
    };
  };

  function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
      const buf = cachedTextEncoder.encode(arg);
      const ptr = malloc(buf.length);
      getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf);
      WASM_VECTOR_LEN = buf.length;
      return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len);

    const mem = getUint8Memory0();

    let offset = 0;

    for (; offset < len; offset++) {
      const code = arg.charCodeAt(offset);
      if (code > 0x7F) break;
      mem[ptr + offset] = code;
    }

    if (offset !== len) {
      if (offset !== 0) {
        arg = arg.slice(offset);
      }
      ptr = realloc(ptr, len, len = offset + arg.length * 3);
      const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
      const ret = encodeString(arg, view);

      offset += ret.written;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
  }

  function isLikeNone(x) {
    return x === undefined || x === null;
  }

  let cachegetInt32Memory0 = null;
  function getInt32Memory0() {
    if (cachegetInt32Memory0 === null || cachegetInt32Memory0.buffer !== wasm.memory.buffer) {
      cachegetInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachegetInt32Memory0;
  }

  function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {
      // First up with a closure we increment the internal reference
      // count. This ensures that the Rust closure environment won't
      // be deallocated while we're invoking it.
      state.cnt++;
      const a = state.a;
      state.a = 0;
      try {
        return f(a, state.b, ...args);
      } finally {
        if (--state.cnt === 0) {
          wasm.__wbindgen_export_2.get(state.dtor)(a, state.b);

        } else {
          state.a = a;
        }
      }
    };
    real.original = state;

    return real;
  }
  function __wbg_adapter_24(arg0, arg1, arg2) {
    wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__hee74a5b7602953f2(arg0, arg1, addHeapObject(arg2));
  }

  /**
  * Parses a CSL style, either independent or dependent, and returns its metadata.
  * @param {string} style
  * @returns {StyleMeta}
  */
  __exports.parseStyleMetadata = function (style) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      var ptr0 = passStringToWasm0(style, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      wasm.parseStyleMetadata(retptr, ptr0, len0);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  };

  let cachegetUint32Memory0 = null;
  function getUint32Memory0() {
    if (cachegetUint32Memory0 === null || cachegetUint32Memory0.buffer !== wasm.memory.buffer) {
      cachegetUint32Memory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachegetUint32Memory0;
  }

  function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4);
    const mem = getUint32Memory0();
    for (let i = 0; i < array.length; i++) {
      mem[ptr / 4 + i] = addHeapObject(array[i]);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
  }

  function handleError(f, args) {
    try {
      return f.apply(this, args);
    } catch (e) {
      wasm.__wbindgen_exn_store(addHeapObject(e));
    }
  }
  function __wbg_adapter_79(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures__invoke2_mut__h5e049d289685efc8(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
  }

  function getArrayU8FromWasm0(ptr, len) {
    return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len);
  }
  /**
  */
  class Driver {

    static __wrap(ptr) {
      const obj = Object.create(Driver.prototype);
      obj.ptr = ptr;

      return obj;
    }

    __destroy_into_raw() {
      const ptr = this.ptr;
      this.ptr = 0;

      return ptr;
    }

    free() {
      const ptr = this.__destroy_into_raw();
      wasm.__wbg_driver_free(ptr);
    }
    /**
    * Creates a new Driver. Use the InitOptions object, which has (for example):
    *
    * * `style` is a CSL style as a string. Independent styles only.
    * * `fetcher` must implement the `Fetcher` interface
    * * `format` is one of { "html", "rtf", "plain" }
    *
    * Throws an error if it cannot parse the style you gave it.
    * @param {InitOptions} options
    */
    constructor(options) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.driver_new(retptr, addHeapObject(options));
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        if (r2) {
          throw takeObject(r1);
        }
        return Driver.__wrap(r0);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Sets the style (which will also cause everything to be recomputed, use sparingly)
    * @param {string} style_text
    */
    setStyle(style_text) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passStringToWasm0(style_text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.driver_setStyle(retptr, this.ptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        if (r1) {
          throw takeObject(r0);
        }
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Sets the output format (which will also cause everything to be recomputed, use sparingly)
    *
    * @param {"html" | "rtf" | "plain"} format The new output format as a string, same as `new Driver`
    *
    * @param {FormatOptions | null} options If absent, this is set to the default FormatOptions.
    * @param {string} format
    * @param {FormatOptions | undefined} options
    */
    setOutputFormat(format, options) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.driver_setOutputFormat(retptr, this.ptr, ptr0, len0, isLikeNone(options) ? 0 : addHeapObject(options));
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        if (r1) {
          throw takeObject(r0);
        }
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Completely overwrites the references library.
    * This **will** delete references that are not in the provided list.
    * @param {any[]} refs
    */
    resetReferences(refs) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArrayJsValueToWasm0(refs, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.driver_resetReferences(retptr, this.ptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        if (r1) {
          throw takeObject(r0);
        }
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Inserts or overwrites references as a batch operation.
    * This **will not** delete references that are not in the provided list.
    * @param {any[]} refs
    */
    insertReferences(refs) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArrayJsValueToWasm0(refs, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.driver_insertReferences(retptr, this.ptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        if (r1) {
          throw takeObject(r0);
        }
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Inserts or overwrites a reference.
    *
    * * `refr` is a Reference object.
    * @param {Reference} refr
    */
    insertReference(refr) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.driver_insertReference(retptr, this.ptr, addHeapObject(refr));
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        if (r1) {
          throw takeObject(r0);
        }
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Removes a reference by id. If it is cited, any cites will be dangling. It will also
    * disappear from the bibliography.
    * @param {string} id
    */
    removeReference(id) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.driver_removeReference(retptr, this.ptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        if (r1) {
          throw takeObject(r0);
        }
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Sets the references to be included in the bibliography despite not being directly cited.
    *
    * * `refr` is a
    * @param {IncludeUncited} uncited
    */
    includeUncited(uncited) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.driver_includeUncited(retptr, this.ptr, addHeapObject(uncited));
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        if (r1) {
          throw takeObject(r0);
        }
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Gets a list of locales in use by the references currently loaded.
    *
    * Note that Driver comes pre-loaded with the `en-US` locale.
    * @returns {string[]}
    */
    toFetch() {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.driver_toFetch(retptr, this.ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        if (r2) {
          throw takeObject(r1);
        }
        return takeObject(r0);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Returns a random cluster id, with an extra guarantee that it isn't already in use.
    * @returns {string}
    */
    randomClusterId() {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.driver_randomClusterId(retptr, this.ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        return getStringFromWasm0(r0, r1);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(r0, r1);
      }
    }
    /**
    * Inserts or replaces a cluster with a matching `id`.
    * @param {Cluster} cluster
    */
    insertCluster(cluster) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.driver_insertCluster(retptr, this.ptr, addHeapObject(cluster));
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        if (r1) {
          throw takeObject(r0);
        }
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Removes a cluster with a matching `id`
    * @param {string} cluster_id
    */
    removeCluster(cluster_id) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passStringToWasm0(cluster_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.driver_removeCluster(retptr, this.ptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        if (r1) {
          throw takeObject(r0);
        }
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Resets all the clusters in the processor to a new list.
    *
    * * `clusters` is a Cluster[]
    * @param {any[]} clusters
    */
    initClusters(clusters) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArrayJsValueToWasm0(clusters, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.driver_initClusters(retptr, this.ptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        if (r1) {
          throw takeObject(r0);
        }
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Returns the formatted citation cluster for `cluster_id`.
    *
    * Prefer `batchedUpdates` to avoid serializing unchanged clusters on every edit. This is
    * still useful for initialization.
    * @param {string} id
    * @returns {string}
    */
    builtCluster(id) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.driver_builtCluster(retptr, this.ptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        var r3 = getInt32Memory0()[retptr / 4 + 3];
        var ptr1 = r0;
        var len1 = r1;
        if (r3) {
          ptr1 = 0;len1 = 0;
          throw takeObject(r2);
        }
        return getStringFromWasm0(ptr1, len1);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(ptr1, len1);
      }
    }
    /**
    * @deprecated Use `previewCluster` instead
    * @param {any[]} cites
    * @param {any[]} positions
    * @param {string | undefined} format
    * @returns {string}
    */
    previewCitationCluster(cites, positions, format) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArrayJsValueToWasm0(cites, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        var ptr1 = passArrayJsValueToWasm0(positions, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        var ptr2 = isLikeNone(format) ? 0 : passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len2 = WASM_VECTOR_LEN;
        wasm.driver_previewCitationCluster(retptr, this.ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        var r3 = getInt32Memory0()[retptr / 4 + 3];
        var ptr3 = r0;
        var len3 = r1;
        if (r3) {
          ptr3 = 0;len3 = 0;
          throw takeObject(r2);
        }
        return getStringFromWasm0(ptr3, len3);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(ptr3, len3);
      }
    }
    /**
    * Previews a formatted citation cluster, in a particular position.
    *
    * - `cluster`: A cluster, without an `id` field. You'll want this to contain some cites.
    * - `positions`: An array of `ClusterPosition`s as in set_cluster_order, but with a single
    *   cluster's id set to zero. The cluster with id=0 is the position to preview the cite. It
    *   can replace another cluster, or be inserted before/after/between existing clusters, in
    *   any location you can think of.
    * - `format`: an optional argument, an output format as a string, that is used only for this
    *   preview.
    * @param {PreviewCluster} preview_cluster
    * @param {any[]} positions
    * @param {string | undefined} format
    * @returns {string}
    */
    previewCluster(preview_cluster, positions, format) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArrayJsValueToWasm0(positions, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(format) ? 0 : passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        wasm.driver_previewCluster(retptr, this.ptr, addHeapObject(preview_cluster), ptr0, len0, ptr1, len1);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        var r3 = getInt32Memory0()[retptr / 4 + 3];
        var ptr2 = r0;
        var len2 = r1;
        if (r3) {
          ptr2 = 0;len2 = 0;
          throw takeObject(r2);
        }
        return getStringFromWasm0(ptr2, len2);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(ptr2, len2);
      }
    }
    /**
    * @returns {BibEntry[]}
    */
    makeBibliography() {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.driver_makeBibliography(retptr, this.ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        if (r2) {
          throw takeObject(r1);
        }
        return takeObject(r0);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * @returns {BibliographyMeta}
    */
    bibliographyMeta() {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.driver_bibliographyMeta(retptr, this.ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        if (r2) {
          throw takeObject(r1);
        }
        return takeObject(r0);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Specifies which clusters are actually considered to be in the document, and sets their
    * order. You may insert as many clusters as you like, but the ones provided here are the only
    * ones used.
    *
    * If a piece does not provide a note, it is an in-text reference. Generally, this is what you
    * should be providing for note styles, such that first-reference-note-number does not gain a
    * value, but some users put in-text references inside footnotes, and it is unclear what the
    * processor should do in this situation so you could try providing note numbers there as
    * well.
    *
    * If a piece provides a { note: N } field, then that N must be monotically increasing
    * throughout the document. Two same-N-in-a-row clusters means they occupy the same footnote,
    * e.g. this would be two clusters:
    *
    * ```text
    * Some text with footnote.[Prefix @cite, suffix. Second prefix @another_cite, second suffix.]
    * ```
    *
    * This case is recognised and the order they appear in the input here is the order used for
    * determining cite positions (ibid, subsequent, etc). But the position:first cites within
    * them will all have the same first-reference-note-number if FRNN is used in later cites.
    *
    * May error without having set_cluster_ids, but with some set_cluster_note_number-s executed.
    * @param {any[]} positions
    */
    setClusterOrder(positions) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArrayJsValueToWasm0(positions, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.driver_setClusterOrder(retptr, this.ptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        if (r1) {
          throw takeObject(r0);
        }
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Retrieve any clusters that have been touched since last time `batchedUpdates` was
    * called. Intended to be called every time an edit has been made. Every cluster in the
    * returned summary should then be reflected in any UI.
    *
    * Some built clusters may occasionally have identical contents to before.
    *
    * * returns an `UpdateSummary`
    * @returns {UpdateSummary}
    */
    batchedUpdates() {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.driver_batchedUpdates(retptr, this.ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        if (r2) {
          throw takeObject(r1);
        }
        return takeObject(r0);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Returns all the clusters and bibliography entries in the document.
    * Also drains the queue, just like batchedUpdates().
    * Use this to rehydrate a document or run non-interactively.
    * @returns {FullRender}
    */
    fullRender() {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.driver_fullRender(retptr, this.ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        if (r2) {
          throw takeObject(r1);
        }
        return takeObject(r0);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * Drains the `batchedUpdates` queue manually.
    */
    drain() {
      wasm.driver_drain(this.ptr);
    }
    /**
    * Asynchronously fetches all the locales that may be required, and saves them into the
    * engine. Uses your provided `Fetcher.fetchLocale` function.
    * @returns {Promise<any>}
    */
    fetchLocales() {
      var ret = wasm.driver_fetchLocales(this.ptr);
      return takeObject(ret);
    }
  }
  __exports.Driver = Driver;

  async function load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
      if (typeof WebAssembly.instantiateStreaming === 'function') {
        try {
          return await WebAssembly.instantiateStreaming(module, imports);

        } catch (e) {
          if (module.headers.get('Content-Type') != 'application/wasm') {
            console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

          } else {
            throw e;
          }
        }
      }

      const bytes = await module.arrayBuffer();
      return await WebAssembly.instantiate(bytes, imports);

    } else {
      const instance = await WebAssembly.instantiate(module, imports);

      if (instance instanceof WebAssembly.Instance) {
        return { instance, module };

      } else {
        return instance;
      }
    }
  }

  async function init(input) {
    if (typeof input === 'undefined') {
      let src;
      if (typeof document === 'undefined') {
        src = location.href;
      } else {
        src = document.currentScript.src;
      }
      input = src.replace(/\.js$/, '_bg.wasm');
    }
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_string_new = function (arg0, arg1) {
      var ret = getStringFromWasm0(arg0, arg1);
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_16465ddabcb4a719 = function (arg0, arg1) {
      var ret = new Zotero.CiteprocRs.CiteprocRsDriverError(takeObject(arg0), takeObject(arg1));
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_1f7db38dfd81bf2f = function (arg0) {
      var ret = new Zotero.CiteprocRs.CiteprocRsError(takeObject(arg0));
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_bb3cad8cb87701ce = function (arg0, arg1) {
      var ret = new Zotero.CiteprocRs.CslStyleError(takeObject(arg0), takeObject(arg1));
      return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_object_drop_ref = function (arg0) {
      takeObject(arg0);
    };
    imports.wbg.__wbindgen_string_get = function (arg0, arg1) {
      const obj = getObject(arg1);
      var ret = typeof obj === 'string' ? obj : undefined;
      var ptr0 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len0;
      getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    };
    imports.wbg.__wbg_error_e549f7fed6d655aa = function (arg0) {
      console.error(takeObject(arg0));
    };
    imports.wbg.__wbg_debug_4885c3f7d6f044a3 = function (arg0, arg1) {
      console.debug(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_log_bee3ea1a89f334d8 = function (arg0, arg1) {
      console.log(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_info_0547ff9513f2019b = function (arg0, arg1) {
      console.info(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_warn_a478dea6e6e05394 = function (arg0, arg1) {
      console.warn(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_error_72e88ba6901b6eee = function (arg0, arg1) {
      console.error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_object_clone_ref = function (arg0) {
      var ret = getObject(arg0);
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_get_1edc26456ed84f9b = function (arg0, arg1) {
      var ret = getObject(arg0)[takeObject(arg1)];
      return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_is_undefined = function (arg0) {
      var ret = getObject(arg0) === undefined;
      return ret;
    };
    imports.wbg.__wbindgen_is_object = function (arg0) {
      const val = getObject(arg0);
      var ret = typeof val === 'object' && val !== null;
      return ret;
    };
    imports.wbg.__wbindgen_is_function = function (arg0) {
      var ret = typeof getObject(arg0) === 'function';
      return ret;
    };
    imports.wbg.__wbindgen_json_serialize = function (arg0, arg1) {
      const obj = getObject(arg1);
      var ret = JSON.stringify(obj === undefined ? null : obj);
      var ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len0;
      getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    };
    imports.wbg.__wbg_fetchLocale_d644d4ae2ca50f81 = function (arg0, arg1, arg2) {
      var ret = getObject(arg0).fetchLocale(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_cb_drop = function (arg0) {
      const obj = takeObject(arg0).original;
      if (obj.cnt-- == 1) {
        obj.a = 0;
        return true;
      }
      var ret = false;
      return ret;
    };
    imports.wbg.__wbindgen_json_parse = function (arg0, arg1) {
      var ret = JSON.parse(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_693216e109162396 = function () {
      var ret = new Error();
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_stack_0ddaca5d1abfb52f = function (arg0, arg1) {
      var ret = getObject(arg1).stack;
      var ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len0;
      getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    };
    imports.wbg.__wbg_error_09919627ac0992f5 = function (arg0, arg1) {
      try {
        console.error(getStringFromWasm0(arg0, arg1));
      } finally {
        wasm.__wbindgen_free(arg0, arg1);
      }
    };
    imports.wbg.__wbg_call_346669c262382ad7 = function () {return handleError(function (arg0, arg1, arg2) {
        var ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
      }, arguments);};
    imports.wbg.__wbg_new_b1d61b5687f5e73a = function (arg0, arg1) {
      try {
        var state0 = { a: arg0, b: arg1 };
        var cb0 = (arg0, arg1) => {
          const a = state0.a;
          state0.a = 0;
          try {
            return __wbg_adapter_79(a, state0.b, arg0, arg1);
          } finally {
            state0.a = a;
          }
        };
        var ret = new Promise(cb0);
        return addHeapObject(ret);
      } finally {
        state0.a = state0.b = 0;
      }
    };
    imports.wbg.__wbg_resolve_d23068002f584f22 = function (arg0) {
      var ret = Promise.resolve(getObject(arg0));
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_then_2fcac196782070cc = function (arg0, arg1) {
      var ret = getObject(arg0).then(getObject(arg1));
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_then_8c2d62e8ae5978f7 = function (arg0, arg1, arg2) {
      var ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_self_1c83eb4471d9eb9b = function () {return handleError(function () {
        var ret = self.self;
        return addHeapObject(ret);
      }, arguments);};
    imports.wbg.__wbg_static_accessor_MODULE_abf5ae284bffdf45 = function () {
      var ret = module;
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_require_5b2b5b594d809d9f = function (arg0, arg1, arg2) {
      var ret = getObject(arg0).require(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_crypto_c12f14e810edcaa2 = function (arg0) {
      var ret = getObject(arg0).crypto;
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_msCrypto_679be765111ba775 = function (arg0) {
      var ret = getObject(arg0).msCrypto;
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_getRandomValues_05a60bf171bfc2be = function (arg0) {
      var ret = getObject(arg0).getRandomValues;
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_getRandomValues_3ac1b33c90b52596 = function (arg0, arg1, arg2) {
      getObject(arg0).getRandomValues(getArrayU8FromWasm0(arg1, arg2));
    };
    imports.wbg.__wbg_randomFillSync_6f956029658662ec = function (arg0, arg1, arg2) {
      getObject(arg0).randomFillSync(getArrayU8FromWasm0(arg1, arg2));
    };
    imports.wbg.__wbindgen_throw = function (arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_closure_wrapper950 = function (arg0, arg1, arg2) {
      var ret = makeMutClosure(arg0, arg1, 232, __wbg_adapter_24);
      return addHeapObject(ret);
    };

    if (typeof input === 'string' || typeof Request === 'function' && input instanceof Request || typeof URL === 'function' && input instanceof URL) {
      input = fetch(input);
    }



    const { instance, module } = await load(await input, imports);

    wasm = instance.exports;
    init.__wbindgen_wasm_module = module;

    return wasm;
  }

  wasm_bindgen = Object.assign(init, __exports);

})();
module.exports = wasm_bindgen;
if (typeof Zotero !== "undefined" && typeof Zotero.CiteprocRs !== "undefined") {
  Object.assign(Zotero.CiteprocRs, wasm_bindgen);
}