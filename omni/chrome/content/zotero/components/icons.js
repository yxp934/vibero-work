'use strict';function _extends() {return _extends = Object.assign ? Object.assign.bind() : function (n) {for (var e = 1; e < arguments.length; e++) {var t = arguments[e];for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);}return n;}, _extends.apply(null, arguments);}

const React = require('react');
const { element, string, object } = require('prop-types');

const Icon = (props) => {
  props = Object.assign({}, props);
  props.className = `icon icon-${props.name} ${props.className || ""}`;
  delete props.name;
  // Pass the props forward
  return /*#__PURE__*/React.createElement("span", props);
};

Icon.propTypes = {
  children: element,
  className: string,
  name: string.isRequired,
  style: object
};

const CSSIcon = (props) => {
  props = Object.assign({}, props);
  props.className = `icon icon-css icon-${props.name} ${props.className || ""}`;
  delete props.name;
  // Pass the props forward
  return /*#__PURE__*/React.createElement("span", props);
};

CSSIcon.propTypes = {
  children: element,
  className: string,
  name: string.isRequired,
  style: object
};

const CSSItemTypeIcon = (props) => {
  props = Object.assign({}, props);
  let itemType = props.itemType;
  delete props.itemType;
  return /*#__PURE__*/React.createElement(CSSIcon, _extends({ name: "item-type", "data-item-type": itemType }, props));
};

CSSItemTypeIcon.propTypes = {
  children: element,
  className: string,
  itemType: string.isRequired,
  style: object
};

module.exports = { Icon, CSSIcon, CSSItemTypeIcon };

let cssIconsCache = new Map();

module.exports.getCSSIcon = function (key) {
  if (!cssIconsCache.has(key)) {
    let iconEl = document.createElement('span');
    iconEl.classList.add('icon');
    iconEl.classList.add('icon-css');
    iconEl.classList.add(`icon-${key}`);
    cssIconsCache.set(key, iconEl);
  }

  return cssIconsCache.get(key).cloneNode(true);
};

module.exports.getCSSItemTypeIcon = function (itemType, key = 'item-type') {
  let icon = module.exports.getCSSIcon(key);
  icon.dataset.itemType = itemType;
  return icon;
};

module.exports['IconAttachSmall'] = (props) => /*#__PURE__*/React.createElement(CSSIcon, _extends({ name: "attachment", className: "icon-16" }, props));
module.exports['IconTreeitemNoteSmall'] = (props) => /*#__PURE__*/React.createElement(CSSIcon, _extends({ name: "note", className: "icon-16" }, props));