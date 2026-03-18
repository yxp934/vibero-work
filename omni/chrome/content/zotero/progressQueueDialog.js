
























var _react = require("react");var _react2 = _interopRequireDefault(_react);
var _reactDom = require("react-dom");var _reactDom2 = _interopRequireDefault(_reactDom);
var _progressQueueTable = require("components/progressQueueTable");var _progressQueueTable2 = _interopRequireDefault(_progressQueueTable);function _interopRequireDefault(e) {return e && e.__esModule ? e : { default: e };} /*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2018 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
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
*/let _progressQueue;function _init() {var io = window.arguments[0];_progressQueue = io.progressQueue;document.title = Zotero.getString(_progressQueue.getTitle());const domEl = document.querySelector('#tree');_reactDom2.default.createRoot(domEl).render(/*#__PURE__*/_react2.default.createElement(_progressQueueTable2.default, { onActivate: _handleActivate, progressQueue: _progressQueue }));} /**
 * Focus items in Zotero library when double-clicking them in the Retrieve
 * metadata window.
 * @param {Event} event
 * @param {Number[]} indices to activate
 * @private
 */async function _handleActivate(event, indices) {if (event && event.type === 'dblclick') {let itemID = _progressQueue.getRows()[indices[0]].id;if (!itemID) return;
    let item = await Zotero.Items.getAsync(itemID);
    if (!item) return;

    if (item.parentItemID) itemID = item.parentItemID;

    let win = Services.wm.getMostRecentWindow("navigator:browser");
    if (win) {
      win.ZoteroPane.selectItem(itemID);
      win.focus();
    }
  }
}