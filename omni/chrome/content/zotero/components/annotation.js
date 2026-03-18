/*
    ***** BEGIN LICENSE BLOCK *****

    Copyright © 2021 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
                     https://digitalscholar.org

    This file is part of Zotero.

    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.

    ***** END LICENSE BLOCK *****
*/

'use strict';

var _react = require("react");var _react2 = _interopRequireDefault(_react);
var _reactDom = require("react-dom");var _reactDom2 = _interopRequireDefault(_reactDom);
var _propTypes = require("prop-types");var _propTypes2 = _interopRequireDefault(_propTypes);
var _classnames = require("classnames");var _classnames2 = _interopRequireDefault(_classnames);function _interopRequireDefault(e) {return e && e.__esModule ? e : { default: e };}

// This is a quick reimplementation of the annotation for use in the conflict resolution window.
// We'll want to replace this with a single component shared between the PDF reader and the rest
// of the codebase.
function AnnotationBox({ data }) {
  var textStyle = {
    borderLeft: "2px solid " + data.color
  };

  return (/*#__PURE__*/
    _react2.default.createElement("div", { className: "AnnotationBox" }, /*#__PURE__*/
    _react2.default.createElement("div", { className: "title" }, Zotero.getString('itemTypes.annotation')), /*#__PURE__*/
    _react2.default.createElement("div", { className: "container" }, /*#__PURE__*/
    _react2.default.createElement("div", { className: "header" }, /*#__PURE__*/
    _react2.default.createElement("div", null, Zotero.Cite.getLocatorString('page'), " ", data.pageLabel)
    ),
    data.text !== undefined ? /*#__PURE__*/
    _react2.default.createElement("div", { className: "text", style: textStyle }, data.text) :
    '',
    data.type == 'image'
    // TODO: Localize
    // TODO: Render from PDF based on position, if file is the same? Or don't
    // worry about it?
    ? /*#__PURE__*/_react2.default.createElement("div", { className: "image-placeholder" }, "[image not shown]") :
    '',
    data.comment !== undefined ? /*#__PURE__*/
    _react2.default.createElement("div", { className: "comment" }, data.comment) :
    ''
    )
    ));

}

Zotero.AnnotationBox = /*#__PURE__*/(0, _react.memo)(AnnotationBox);

Zotero.AnnotationBox.render = (root, props) => {
  root.render(/*#__PURE__*/_react2.default.createElement(AnnotationBox, props));
};