"use strict";
(self["webpackChunkreader"] = self["webpackChunkreader"] || []).push([[317],{

/***/ 9317:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   renderMathInternal: () => (/* binding */ renderMathInternal)
/* harmony export */ });
/* harmony import */ var mathjax_full_js_handlers_html__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(353);
/* harmony import */ var mathjax_full_js_mathjax__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(1039);
/* harmony import */ var mathjax_full_js_input_tex__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(4928);
/* harmony import */ var mathjax_full_js_input_tex__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(mathjax_full_js_input_tex__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var mathjax_full_js_input_tex_AllPackages__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(1909);
/* harmony import */ var mathjax_full_js_output_chtml__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(4090);
/* harmony import */ var mathjax_full_js_output_chtml__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(mathjax_full_js_output_chtml__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var mathjax_full_js_adaptors_HTMLAdaptor__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(2519);
/* harmony import */ var mathjax_full_js_adaptors_HTMLAdaptor__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(mathjax_full_js_adaptors_HTMLAdaptor__WEBPACK_IMPORTED_MODULE_5__);






let registered = false;
function renderMathInternal(doc) {
  if (!registered) {
    // MathJax wants nodeValue not to be nullable, so we have to cast to any. It'll be fine.
    (0,mathjax_full_js_handlers_html__WEBPACK_IMPORTED_MODULE_0__/* .RegisterHTMLHandler */ .J)(new mathjax_full_js_adaptors_HTMLAdaptor__WEBPACK_IMPORTED_MODULE_5__.HTMLAdaptor(doc.defaultView ?? window));
    registered = true;
  }
  let mjDoc = mathjax_full_js_mathjax__WEBPACK_IMPORTED_MODULE_1__.mathjax.document(doc, {
    InputJax: new mathjax_full_js_input_tex__WEBPACK_IMPORTED_MODULE_2__.TeX({
      packages: mathjax_full_js_input_tex_AllPackages__WEBPACK_IMPORTED_MODULE_3__/* .AllPackages */ .B
    }),
    OutputJax: new mathjax_full_js_output_chtml__WEBPACK_IMPORTED_MODULE_4__.CHTML({
      fontURL: new URL('mathjax-fonts', document.location.href).toString()
    })
  });
  mjDoc.render();
  for (let item of mjDoc.math) {
    if (item.typesetRoot.nodeType === Node.ELEMENT_NODE) {
      item.typesetRoot.dataset.tex = item.math;
    }
  }
}

/***/ })

}]);