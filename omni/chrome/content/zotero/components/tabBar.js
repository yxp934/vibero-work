/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2020 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
                     https://www.zotero.org
    
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

'use strict';Object.defineProperty(exports, "__esModule", { value: true });

var _react = require("react");var _react2 = _interopRequireDefault(_react);
var _propTypes = require("prop-types");var _propTypes2 = _interopRequireDefault(_propTypes);
var _classnames = require("classnames");var _classnames2 = _interopRequireDefault(_classnames);function _interopRequireDefault(e) {return e && e.__esModule ? e : { default: e };}function _extends() {return _extends = Object.assign ? Object.assign.bind() : function (n) {for (var e = 1; e < arguments.length; e++) {var t = arguments[e];for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);}return n;}, _extends.apply(null, arguments);}
const { CSSIcon, CSSItemTypeIcon } = require('./icons');

const SCROLL_ARROW_SCROLL_BY = 222;

const Tab = /*#__PURE__*/(0, _react.memo)((props) => {
  const { icon, id, index, isBeingDragged, isItemType, onContextMenu, onDragEnd, onDragStart, onTabClick, onTabClose, onTabMouseDown, selected, title, renderTitle } = props;

  const handleTabMouseDown = (0, _react.useCallback)((event) => onTabMouseDown(event, id), [onTabMouseDown, id]);
  const handleContextMenu = (0, _react.useCallback)((event) => onContextMenu(event, id), [onContextMenu, id]);
  const handleTabClick = (0, _react.useCallback)((event) => onTabClick(event, id), [onTabClick, id]);
  const handleDragStart = (0, _react.useCallback)((event) => onDragStart(event, id, index), [onDragStart, id, index]);
  const handleTabClose = (0, _react.useCallback)((event) => onTabClose(event, id), [onTabClose, id]);

  let titleText;
  let titleHTML;
  if (renderTitle) {
    let parentElement = document.createElement('div');
    titleText = Zotero.Utilities.Internal.renderItemTitle(title, parentElement);
    titleHTML = parentElement.innerHTML;
  } else
  {
    titleText = title;
    titleHTML = null;
  }

  return (/*#__PURE__*/
    _react2.default.createElement("div", {
      key: id,
      "data-id": id,
      className: (0, _classnames2.default)('tab', { selected, dragging: isBeingDragged }),
      draggable: true,
      onMouseDown: handleTabMouseDown,
      onContextMenu: handleContextMenu,
      onClick: handleTabClick,
      onAuxClick: handleTabClick,
      onDragStart: handleDragStart,
      onDragEnd: onDragEnd,
      tabIndex: "-1" },

    isItemType ? /*#__PURE__*/
    _react2.default.createElement(CSSItemTypeIcon, { itemType: icon, className: "tab-icon" }) : /*#__PURE__*/
    _react2.default.createElement(CSSIcon, { name: icon, className: "tab-icon" }),

    titleHTML ? /*#__PURE__*/
    _react2.default.createElement("div", { className: "tab-name", title: titleText, dangerouslySetInnerHTML: { __html: titleHTML } }) : /*#__PURE__*/
    _react2.default.createElement("div", { className: "tab-name", title: titleText }, titleText), /*#__PURE__*/
    _react2.default.createElement("div", {
      className: "tab-close",
      onClick: handleTabClose }, /*#__PURE__*/

    _react2.default.createElement(CSSIcon, { name: "x-8", className: "icon-16" })
    )
    ));

});

Tab.displayName = 'Tab';
Tab.propTypes = {
  icon: _propTypes2.default.string,
  id: _propTypes2.default.string.isRequired,
  index: _propTypes2.default.number.isRequired,
  isBeingDragged: _propTypes2.default.bool.isRequired,
  isItemType: _propTypes2.default.bool,
  onContextMenu: _propTypes2.default.func.isRequired,
  onDragEnd: _propTypes2.default.func.isRequired,
  onDragStart: _propTypes2.default.func.isRequired,
  onTabClick: _propTypes2.default.func.isRequired,
  onTabClose: _propTypes2.default.func.isRequired,
  onTabMouseDown: _propTypes2.default.func.isRequired,
  selected: _propTypes2.default.bool.isRequired,
  title: _propTypes2.default.string.isRequired,
  renderTitle: _propTypes2.default.bool
};


const TabBar = /*#__PURE__*/(0, _react.forwardRef)(function (props, ref) {
  const [tabs, setTabs] = (0, _react.useState)([]);
  const [dragging, setDragging] = (0, _react.useState)(false);
  const [dragMouseX, setDragMouseX] = (0, _react.useState)(0);
  const dragIDRef = (0, _react.useRef)(null);
  const dragGrabbedDeltaXRef = (0, _react.useRef)();
  const tabsInnerContainerRef = (0, _react.useRef)();
  const tabsRef = (0, _react.useRef)();
  const startArrowRef = (0, _react.useRef)();
  const endArrowRef = (0, _react.useRef)();
  // Used to throttle mouse movement
  const mouseMoveWaitUntil = (0, _react.useRef)(0);

  (0, _react.useImperativeHandle)(ref, () => ({ setTabs }));

  (0, _react.useEffect)(() => {
    let handleResize = Zotero.Utilities.throttle(() => {
      updateScrollArrows();
      updateOverflowing();
    }, 300, { leading: false });
    window.addEventListener('resize', handleResize);
    props.onLoad();
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  (0, _react.useEffect)(() => {
    // Scroll selected tab into view
    let selectedTabNode = tabsInnerContainerRef.current.querySelector(".tab.selected");
    if (!selectedTabNode || dragging) return;
    selectedTabNode.scrollIntoView({ behavior: 'smooth' });
  }, [tabs]);

  (0, _react.useLayoutEffect)(updateScrollArrows);
  (0, _react.useLayoutEffect)(updateOverflowing, [tabs]);

  // Use offsetLeft and offsetWidth to calculate and translate tab X position
  (0, _react.useLayoutEffect)(() => {
    if (!dragIDRef.current) return;
    let tab = Array.from(tabsRef.current.children).find((x) => x.dataset.id === dragIDRef.current);
    if (tab) {
      // While the actual tab node retains its space between other tabs,
      // we use CSS translation to move it to the left/right side to
      // position it under the mouse
      let x = dragMouseX - tab.offsetLeft - dragGrabbedDeltaXRef.current;

      let firstTab = tabsRef.current.firstChild;
      let lastTab = tabsRef.current.lastChild;

      // Don't allow to move tab beyond the second and the last tab
      if (Zotero.rtl) {
        if (tab.offsetLeft + x < lastTab.offsetLeft ||
        tab.offsetLeft + tab.offsetWidth + x > firstTab.offsetLeft) {
          x = 0;
        }
      } else
      if (tab.offsetLeft + x > lastTab.offsetLeft ||
      tab.offsetLeft + x < firstTab.offsetLeft + firstTab.offsetWidth) {
        x = 0;
      }

      tab.style.transform = dragging ? `translateX(${x}px)` : 'unset';
    }
  });

  function updateScrollArrows() {
    let scrollable = tabsRef.current.scrollWidth !== tabsRef.current.clientWidth;
    if (scrollable) {
      tabsInnerContainerRef.current.classList.add('scrollable');

      if (tabsRef.current.scrollLeft !== 0) {
        startArrowRef.current.classList.add('active');
      } else
      {
        startArrowRef.current.classList.remove('active');
      }

      if (tabsRef.current.scrollWidth - tabsRef.current.clientWidth !== Math.abs(tabsRef.current.scrollLeft)) {
        endArrowRef.current.classList.add('active');
      } else
      {
        endArrowRef.current.classList.remove('active');
      }
    } else
    {
      tabsInnerContainerRef.current.classList.remove('scrollable');
    }
  }

  function updateOverflowing() {
    tabsInnerContainerRef.current.querySelectorAll('.tab-name').forEach((tabNameDOM) => {
      tabNameDOM.classList.toggle('overflowing', tabNameDOM.scrollWidth > tabNameDOM.clientWidth);
    });
  }

  const handleTabMouseDown = (0, _react.useCallback)((event, id) => {
    // Don't select tab if it'll be closed with middle button click on mouse up
    // or on right-click
    if ([1, 2].includes(event.button)) {
      return;
    }

    if (event.target.closest('.tab-close')) {
      return;
    }
    props.onTabSelect(id);
    event.stopPropagation();
  }, [props.onTabSelect]);

  const handleContextMenu = (0, _react.useCallback)((event, id) => {
    let { screenX, screenY } = event;
    // Popup gets immediately closed without this
    setTimeout(() => {
      props.onContextMenu(screenX, screenY, id);
    });
  }, [props.onContextMenu]);

  const handleTabClick = (0, _react.useCallback)((event, id) => {
    if (event.button === 1) {
      props.onTabClose(id);
    }
  }, [props.onTabClose]);

  const handleDragStart = (0, _react.useCallback)((event, id, index) => {
    // Library tab is not draggable
    if (index === 0) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    // We don't want the generated image from the target element,
    // therefore setting an empty image
    let img = document.createElement('img');
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    event.dataTransfer.setDragImage(img, 0, 0);
    // Some data needs to be set, although this is not used anywhere
    event.dataTransfer.setData('zotero/tab', id);
    // Store the relative mouse to tab X position where the tab was grabbed
    dragGrabbedDeltaXRef.current = event.clientX - event.target.offsetLeft;
    // Enable dragging
    setDragging(true);
    // Store the current tab id
    dragIDRef.current = id;
  }, []);

  const handleDragEnd = (0, _react.useCallback)(() => {
    setDragging(false);
    props.refocusReader();
  }, [props.refocusReader]);

  const handleTabBarDragOver = (0, _react.useCallback)((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    // Throttle
    if (!dragIDRef.current || mouseMoveWaitUntil.current > Date.now()) {
      return;
    }

    setDragMouseX(event.clientX);

    // Get the current tab DOM node
    let tabIndex = Array.from(tabsRef.current.children).findIndex((x) => x.dataset.id === dragIDRef.current);
    let tab = tabsRef.current.children[tabIndex];

    // Calculate the center points of each tab
    let points = Array.from(tabsRef.current.children).map((child) => {
      return child.offsetLeft + child.offsetWidth / 2;
    });

    // Calculate where the new tab left and right (x1, x2) side points should
    // be relative to the current mouse position, and take into account
    // the initial relative mouse to tab position where the tab was grabbed
    let x1 = event.clientX - dragGrabbedDeltaXRef.current;
    let x2 = event.clientX - dragGrabbedDeltaXRef.current + tab.offsetWidth;

    let index = null;
    // Try to determine if the new tab left or right side is crossing
    // the middle point of the previous or the next tab, and use its index if so
    for (let i = 0; i < points.length - 1; i++) {
      if (i === tabIndex || i + 1 === tabIndex) {
        continue;
      }
      let p1 = points[i];
      let p2 = points[i + 1];
      if (
      Zotero.rtl && (x2 < p1 && x2 > p2 || x1 < p1 && x1 > p2) ||
      !Zotero.rtl && (x2 > p1 && x2 < p2 || x1 > p1 && x1 < p2))
      {
        index = i + 1;
        break;
      }
    }

    // If the new tab position doesn't fit between the central points
    // of other tabs, check if it's moved beyond the last tab
    if (index === null) {
      let p = points[points.length - 1];
      if (Zotero.rtl && x1 < p || !Zotero.rtl && x2 > p) {
        index = points.length;
      }
    }

    if (index !== null) {
      props.onTabMove(dragIDRef.current, index);
    }
    mouseMoveWaitUntil.current = Date.now() + 20;
  }, [props.onTabMove]);

  const handleTabClose = (0, _react.useCallback)((event, id) => {
    props.onTabClose(id);
    event.stopPropagation();
  }, [props.onTabClose]);


  const handleWheel = (0, _react.useCallback)((event) => {
    // Normalize wheel speed
    let x = event.deltaX || event.deltaY;
    if (x && event.deltaMode) {
      if (event.deltaMode === 1) {
        x *= 20;
      } else
      {
        x *= 400;
      }
    }
    window.requestAnimationFrame(() => {
      tabsRef.current.scrollLeft += x;
    });
  }, []);

  const handleClickScrollStart = (0, _react.useCallback)(() => {
    tabsRef.current.scrollTo({
      left: tabsRef.current.scrollLeft - SCROLL_ARROW_SCROLL_BY * (Zotero.rtl ? -1 : 1),
      behavior: 'smooth'
    });
  }, []);

  const handleClickScrollEnd = (0, _react.useCallback)(() => {
    tabsRef.current.scrollTo({
      left: tabsRef.current.scrollLeft + SCROLL_ARROW_SCROLL_BY * (Zotero.rtl ? -1 : 1),
      behavior: 'smooth'
    });
  }, []);

  // Prevent maximizing/minimizing window
  const handleScrollArrowDoubleClick = (0, _react.useCallback)((event) => {
    event.preventDefault();
  }, []);

  return (/*#__PURE__*/
    _react2.default.createElement("div", null, /*#__PURE__*/
    _react2.default.createElement("div", {
      ref: tabsInnerContainerRef,
      className: "tab-bar-inner-container",
      onWheel: handleWheel }, /*#__PURE__*/

    _react2.default.createElement("div", { className: "pinned-tabs" }, /*#__PURE__*/
    _react2.default.createElement("div", {
      className: "tabs" },

    tabs.length ? /*#__PURE__*/
    _react2.default.createElement(Tab, _extends({},
    tabs[0], {
      key: tabs[0].id,
      index: 0,
      isBeingDragged: false,
      onContextMenu: handleContextMenu,
      onDragEnd: handleDragEnd,
      onDragStart: handleDragStart,
      onTabClick: handleTabClick,
      onTabClose: handleTabClose,
      onTabMouseDown: handleTabMouseDown })
    ) :
    null
    )
    ), /*#__PURE__*/
    _react2.default.createElement("div", {
      ref: startArrowRef,
      className: "scroll-start-arrow",
      style: { transform: Zotero.rtl ? 'scaleX(-1)' : undefined } }, /*#__PURE__*/

    _react2.default.createElement("button", {
      "data-l10n-id": "zotero-toolbar-tabs-scroll-backwards",
      onClick: handleClickScrollStart,
      onDoubleClick: handleScrollArrowDoubleClick }, /*#__PURE__*/

    _react2.default.createElement(CSSIcon, { name: "chevron-tabs", className: "icon-20" })
    )
    ), /*#__PURE__*/
    _react2.default.createElement("div", { className: "tabs-wrapper" }, /*#__PURE__*/
    _react2.default.createElement("div", {
      ref: tabsRef,
      className: "tabs",
      onDragOver: handleTabBarDragOver,
      onScroll: updateScrollArrows,
      dir: Zotero.dir },

    tabs.map((tab, index) => /*#__PURE__*/_react2.default.createElement(Tab, _extends({},
    tab, {
      key: tab.id,
      index: index,
      isBeingDragged: dragging && dragIDRef.current === tab.id,
      onContextMenu: handleContextMenu,
      onDragEnd: handleDragEnd,
      onDragStart: handleDragStart,
      onTabClick: handleTabClick,
      onTabClose: handleTabClose,
      onTabMouseDown: handleTabMouseDown })
    ))
    )
    ), /*#__PURE__*/
    _react2.default.createElement("div", {
      ref: endArrowRef,
      className: "scroll-end-arrow",
      style: { transform: Zotero.rtl ? 'scaleX(-1)' : undefined } }, /*#__PURE__*/

    _react2.default.createElement("button", {
      "data-l10n-id": "zotero-toolbar-tabs-scroll-forwards",
      onClick: handleClickScrollEnd,
      onDoubleClick: handleScrollArrowDoubleClick }, /*#__PURE__*/

    _react2.default.createElement(CSSIcon, { name: "chevron-tabs", className: "icon-20" })
    )
    )
    )
    ));

});

TabBar.displayName = 'TabBar';

TabBar.propTypes = {
  onTabSelect: _propTypes2.default.func.isRequired,
  onTabClose: _propTypes2.default.func.isRequired,
  onLoad: _propTypes2.default.func.isRequired,
  onTabMove: _propTypes2.default.func.isRequired,
  refocusReader: _propTypes2.default.func.isRequired,
  onContextMenu: _propTypes2.default.func.isRequired,
  tabs: _propTypes2.default.arrayOf(
    _propTypes2.default.shape({
      icon: _propTypes2.default.element.isRequired,
      id: _propTypes2.default.string.isRequired,
      index: _propTypes2.default.number.isRequired,
      isBeingDragged: _propTypes2.default.bool.isRequired,
      onContextMenu: _propTypes2.default.func.isRequired,
      onDragEnd: _propTypes2.default.func.isRequired,
      onDragStart: _propTypes2.default.func.isRequired,
      onTabClick: _propTypes2.default.func.isRequired,
      onTabMouseDown: _propTypes2.default.func.isRequired,
      selected: _propTypes2.default.bool.isRequired,
      title: _propTypes2.default.string.isRequired
    })
  ).isRequired
};exports.default =

TabBar;