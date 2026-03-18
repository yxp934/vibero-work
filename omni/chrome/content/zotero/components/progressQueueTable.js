Object.defineProperty(exports, "__esModule", { value: true });























var _react = require("react");var _react2 = _interopRequireDefault(_react);
var _propTypes = require("prop-types");var _propTypes2 = _interopRequireDefault(_propTypes);
var _icons = require("components/icons");

var _virtualizedTable = require("components/virtualized-table");var _virtualizedTable2 = _interopRequireDefault(_virtualizedTable);
var _utils = require("./utils");function _interopRequireDefault(e) {return e && e.__esModule ? e : { default: e };} /*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2022 Corporation for Digital Scholarship
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
*/function getImageByStatus(status) {let statusIconName;if (status === Zotero.ProgressQueue.ROW_PROCESSING) {statusIconName = 'refresh';} else if (status === Zotero.ProgressQueue.ROW_FAILED) {statusIconName = 'cross';} else if (status === Zotero.ProgressQueue.ROW_SUCCEEDED) {statusIconName = 'tick';} else {return document.createElement('span');}const icon = (0, _icons.getCSSIcon)(statusIconName);icon.classList.add('icon-16');return icon;}const ProgressQueueTable = ({ onActivate = _utils.noop, progressQueue }) => {
  const treeRef = (0, _react.useRef)(null);
  const htmlID = (0, _react.useRef)((0, _utils.nextHTMLID)());

  const getRowCount = (0, _react.useCallback)(() => progressQueue.getTotal(), [progressQueue]);

  const rowToTreeItem = (0, _react.useCallback)((index, selection, oldDiv = null, columns) => {
    let rows = progressQueue.getRows();
    let row = rows[index];

    let div;
    if (oldDiv) {
      div = oldDiv;
      div.innerHTML = "";
    } else
    {
      div = document.createElement('div');
      div.className = "row";
    }

    div.classList.toggle('selected', selection.isSelected(index));

    for (let column of columns) {
      if (column.dataKey === 'success') {
        let span = document.createElement('span');
        if (!span.ownerGlobal) {
          // If this script was imported from a non-window context, we'll have a global object that looks like
          // a Window and document.createElement() will succeed, but the returned Element object won't have
          // an ownerGlobal. Trying to append a child or set its innerHTML will segfault Zotero. For now,
          // let's just abort if we get an invalid Element.
          // TODO: Remove once we're using ES modules
          return div;
        }
        span.className = `cell icon ${column.className}`;
        span.appendChild(getImageByStatus(row.status));
        div.appendChild(span);
      } else
      {
        div.appendChild((0, _virtualizedTable.renderCell)(index, row[column.dataKey], column));
      }
    }
    return div;
  }, [progressQueue]);

  const columns = progressQueue.getColumns();

  const tableColumns = [
  { dataKey: 'success', fixedWidth: true, width: "26" },
  { dataKey: 'fileName', label: Zotero.getString(columns[0]) },
  { dataKey: 'message', label: Zotero.getString(columns[1]) }];


  const refreshTree = (0, _react.useCallback)(() => treeRef.current.invalidate(), []);

  (0, _react.useEffect)(() => {
    progressQueue.addListener('rowadded', refreshTree);
    progressQueue.addListener('rowupdated', refreshTree);
    progressQueue.addListener('rowdeleted', refreshTree);

    return () => {
      progressQueue.removeListener('rowadded', refreshTree);
      progressQueue.removeListener('rowupdated', refreshTree);
      progressQueue.removeListener('rowdeleted', refreshTree);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (/*#__PURE__*/
    _react2.default.createElement(_virtualizedTable2.default, {
      getRowCount: getRowCount,
      ref: treeRef,
      id: htmlID.current + '-progress-queue-table',
      renderItem: rowToTreeItem,
      showHeader: true,
      columns: tableColumns,
      onActivate: onActivate }
    ));

};

ProgressQueueTable.propTypes = {
  onActivate: _propTypes2.default.func,
  progressQueue: _propTypes2.default.object.isRequired
};exports.default = /*#__PURE__*/

(0, _react.memo)(ProgressQueueTable);