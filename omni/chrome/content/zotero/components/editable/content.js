Object.defineProperty(exports, "__esModule", { value: true });
























var _react = require("react");var _react2 = _interopRequireDefault(_react);
var _propTypes = require("prop-types");var _propTypes2 = _interopRequireDefault(_propTypes);
var _classnames = require("classnames");var _classnames2 = _interopRequireDefault(_classnames);
var _textArea = require("../form/textArea");var _textArea2 = _interopRequireDefault(_textArea);
var _select = require("../form/select");var _select2 = _interopRequireDefault(_select);function _interopRequireDefault(e) {return e && e.__esModule ? e : { default: e };} /*
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
*/class EditableContent extends _react2.default.PureComponent {get hasValue() {const { input, value } = this.props;return !!(value || input && input.props.value);}get isSelect() {const { input, inputComponent } = this.props;return inputComponent === _select2.default || input && input.type == _select2.default;}get isTextarea() {const { input, inputComponent } = this.props;return inputComponent === _textArea2.default || input && input.type === _textArea2.default;}get displayValue() {const { options, display, input } = this.props;const value = this.props.value || input && input.props.value;const placeholder = this.props.placeholder || input && input.props.placeholder;if (!this.hasValue) {return placeholder;}
    if (display) {return display;}

    if (this.isSelect && options) {
      const displayValue = options.find((e) => e.value == value);
      return displayValue ? displayValue.label : value;
    }

    return value;
  }

  render() {
    const className = {
      'editable-content': true,
      'placeholder': !this.hasValue
    };

    return /*#__PURE__*/_react2.default.createElement("div", { className: (0, _classnames2.default)(this.props.className, className) }, this.displayValue);
  }

  static defaultProps = {
    value: '',
    placeholder: ''
  };

  static propTypes = {
    display: _propTypes2.default.string,
    input: _propTypes2.default.element,
    inputComponent: _propTypes2.default.elementType,
    options: _propTypes2.default.array,
    placeholder: _propTypes2.default.string,
    value: _propTypes2.default.oneOfType([
    _propTypes2.default.string,
    _propTypes2.default.number]
    )
  };
}exports.default =

EditableContent;