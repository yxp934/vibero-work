Object.defineProperty(exports, "__esModule", { value: true });
























var _react = require("react");var _react2 = _interopRequireDefault(_react);
var _propTypes = require("prop-types");var _propTypes2 = _interopRequireDefault(_propTypes);
var _classnames = require("classnames");var _classnames2 = _interopRequireDefault(_classnames);
var _utils = require("../utils");function _interopRequireDefault(e) {return e && e.__esModule ? e : { default: e };}function _extends() {return _extends = Object.assign ? Object.assign.bind() : function (n) {for (var e = 1; e < arguments.length; e++) {var t = arguments[e];for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);}return n;}, _extends.apply(null, arguments);} /*
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
*/ //import AutoResizer from './auto-resizer';
//import Spinner from '../ui/spinner';
class TextAreaInput extends _react2.default.PureComponent {constructor(props) {super(props);this.state = { value: props.value };}cancel(event = null) {this.props.onCancel(this.hasChanged, event);}commit(event = null) {this.props.onCommit(this.state.value, this.hasChanged, event);}focus() {if (this.props.innerRef != null) {this.props.innerRef.focus();this.props.selectOnFocus && this.props.innerRef.select();}}

  UNSAFE_componentWillReceiveProps({ value }) {
    if (value !== this.props.value) {
      this.setState({ value });
    }
  }

  handleChange({ target }) {
    this.setState({ value: target.value });
    this.props.onChange(target.value);
  }

  handleBlur(event) {
    const shouldCancel = this.props.onBlur(event);
    shouldCancel ? this.cancel(event) : this.commit(event);
  }

  handleFocus(event) {
    this.props.selectOnFocus && event.target.select();
    this.props.onFocus(event);
  }

  handleKeyDown(event) {
    const { isSingleLine } = this.props;
    switch (event.key) {
      case 'Escape':
        this.cancel(event);
        break;

      case 'Enter':
        if (event.shiftKey || isSingleLine) {
          event.preventDefault();
          this.commit(event);
        }
        break;

      default:
        return;
    }
  }

  get hasChanged() {
    return this.state.value !== this.props.value;
  }

  renderInput() {
    const extraProps = Object.keys(this.props).reduce((aggr, key) => {
      if (key.match(/^(aria-|data-).*/)) {
        aggr[key] = this.props[key];
      }
      return aggr;
    }, {});
    const input = /*#__PURE__*/_react2.default.createElement("textarea", _extends({
      //autoComplete={ this.props.autoComplete }
      autoFocus: this.props.autoFocus,
      className: this.props.className,
      cols: this.props.cols,
      disabled: this.props.isDisabled,
      form: this.props.form,
      id: this.props.id,
      maxLength: this.props.maxLength,
      minLength: this.props.minLength,
      name: this.props.name,
      onBlur: this.handleBlur.bind(this),
      onChange: this.handleChange.bind(this),
      onFocus: this.handleFocus.bind(this),
      onKeyDown: this.handleKeyDown.bind(this),
      placeholder: this.props.placeholder,
      readOnly: this.props.isReadOnly,
      ref: this.props.innerRef,
      required: this.props.isRequired,
      rows: this.props.rows,
      spellCheck: this.props.spellCheck,
      tabIndex: this.props.tabIndex,
      value: this.state.value,
      wrap: this.props.wrap },
    extraProps)
    );

    return this.props.resize ?
    //<AutoResizer
    //	content={ this.state.value }
    //	vertical={ this.props.resize === 'vertical' }
    //>
    { input }
    /*</AutoResizer> */ :
    input;
  }

  renderSpinner() {
    return null;
    //return this.props.isBusy ? <Spinner /> : null;
  }

  render() {
    const className = (0, _classnames2.default)({
      'input-group': true,
      'textarea': true,
      'busy': this.props.isBusy
    }, this.props.inputGroupClassName);
    return (/*#__PURE__*/
      _react2.default.createElement("div", { className: (0, _classnames2.default)(className) },
      this.renderInput(),
      this.renderSpinner()
      ));

  }

  static defaultProps = {
    className: 'form-control',
    onBlur: _utils.noop,
    onCancel: _utils.noop,
    onChange: _utils.noop,
    onCommit: _utils.noop,
    onFocus: _utils.noop,
    tabIndex: -1,
    value: ''
  };

  static propTypes = {
    //autoComplete: PropTypes.bool,
    autoFocus: _propTypes2.default.bool,
    className: _propTypes2.default.string,
    cols: _propTypes2.default.number,
    form: _propTypes2.default.string,
    id: _propTypes2.default.string,
    inputGroupClassName: _propTypes2.default.string,
    isBusy: _propTypes2.default.bool,
    isDisabled: _propTypes2.default.bool,
    isReadOnly: _propTypes2.default.bool,
    isRequired: _propTypes2.default.bool,
    isSingleLine: _propTypes2.default.bool,
    maxLength: _propTypes2.default.number,
    minLength: _propTypes2.default.number,
    name: _propTypes2.default.string,
    onBlur: _propTypes2.default.func.isRequired,
    onCancel: _propTypes2.default.func.isRequired,
    onChange: _propTypes2.default.func.isRequired,
    onCommit: _propTypes2.default.func.isRequired,
    onFocus: _propTypes2.default.func.isRequired,
    placeholder: _propTypes2.default.string,
    resize: _propTypes2.default.oneOfType([_propTypes2.default.bool, _propTypes2.default.string]),
    rows: _propTypes2.default.number,
    selectOnFocus: _propTypes2.default.bool,
    spellCheck: _propTypes2.default.bool,
    tabIndex: _propTypes2.default.number,
    value: _propTypes2.default.string.isRequired,
    wrap: _propTypes2.default.bool
  };
}exports.default = /*#__PURE__*/

_react2.default.forwardRef((props, ref) => /*#__PURE__*/_react2.default.createElement(TextAreaInput, _extends({
  innerRef: ref }, props)
));