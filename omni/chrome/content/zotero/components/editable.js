Object.defineProperty(exports, "__esModule", { value: true });
























var _react = require("react");var _react2 = _interopRequireDefault(_react);
var _propTypes = require("prop-types");var _propTypes2 = _interopRequireDefault(_propTypes);
var _classnames = require("classnames");var _classnames2 = _interopRequireDefault(_classnames);
var _content = require("./editable/content");var _content2 = _interopRequireDefault(_content);
var _input = require("./form/input");var _input2 = _interopRequireDefault(_input);
var _textArea = require("./form/textArea");var _textArea2 = _interopRequireDefault(_textArea);
var _select = require("./form/select");var _select2 = _interopRequireDefault(_select);
var _utils = require("./utils");function _interopRequireDefault(e) {return e && e.__esModule ? e : { default: e };}function _extends() {return _extends = Object.assign ? Object.assign.bind() : function (n) {for (var e = 1; e < arguments.length; e++) {var t = arguments[e];for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);}return n;}, _extends.apply(null, arguments);} /*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2019 Corporation for Digital Scholarship
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
*/class Editable extends _react2.default.PureComponent {get isActive() {return (this.props.isActive || this.props.isBusy) && !this.props.isDisabled;}get isReadOnly() {return this.props.isReadOnly || this.props.isBusy;}get className() {const { input, inputComponent } = this.props;return { 'editable': true, 'editing': this.isActive, 'textarea': inputComponent === _textArea2.default || input && input.type === _textArea2.default, 'select': inputComponent === _select2.default || input && input.type === _select2.default };}renderContent() {const hasChildren = typeof this.props.children !== 'undefined';return (/*#__PURE__*/
      _react2.default.createElement(_react2.default.Fragment, null,

      hasChildren ?
      this.props.children : /*#__PURE__*/
      _react2.default.createElement(_content2.default, this.props)

      ));

  }

  renderControls() {
    const { input: InputElement, inputComponent: InputComponent } = this.props;
    if (InputElement) {
      return InputElement;
    } else {
      const { className, innerRef, ...props } = this.props;
      props.ref = innerRef;

      return /*#__PURE__*/_react2.default.createElement(InputComponent, _extends({
        className: (0, _classnames2.default)(className, "editable-control") },
      props)
      );
    }
  }

  render() {
    const { isDisabled, isReadOnly } = this.props;
    return (/*#__PURE__*/
      _react2.default.createElement("div", {
        tabIndex: isDisabled || isReadOnly ? null : this.isActive ? null : 0,
        onClick: (event) => this.props.onClick(event),
        onFocus: (event) => this.props.onFocus(event),
        onMouseDown: (event) => this.props.onMouseDown(event),
        className: (0, _classnames2.default)(this.className) },

      this.isActive ? this.renderControls() : this.renderContent()
      ));

  }
  static defaultProps = {
    inputComponent: _input2.default,
    onClick: _utils.noop,
    onFocus: _utils.noop,
    onMouseDown: _utils.noop
  };

  static propTypes = {
    children: _propTypes2.default.oneOfType([_propTypes2.default.element, _propTypes2.default.array]),
    input: _propTypes2.default.element,
    inputComponent: _propTypes2.default.elementType,
    isActive: _propTypes2.default.bool,
    isBusy: _propTypes2.default.bool,
    isDisabled: _propTypes2.default.bool,
    isReadOnly: _propTypes2.default.bool
  };
}exports.default = /*#__PURE__*/


_react2.default.forwardRef((props, ref) => /*#__PURE__*/_react2.default.createElement(Editable, _extends({
  innerRef: ref }, props)
));