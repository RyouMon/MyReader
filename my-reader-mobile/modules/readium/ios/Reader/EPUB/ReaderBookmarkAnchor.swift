import Foundation

let captureReaderBookmarkAnchorScript = #"""
JSON.stringify((function () {
  function firstText(node) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) return node;
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    return walker.nextNode();
  }
  function pointAt(x, y) {
    if (document.caretPositionFromPoint) {
      var position = document.caretPositionFromPoint(x, y);
      if (position) {
        var positionNode = position.offsetNode.nodeType === Node.TEXT_NODE
          ? position.offsetNode
          : firstText(position.offsetNode.childNodes[position.offset]) || firstText(position.offsetNode);
        if (positionNode) return { node: positionNode, offset: position.offset };
      }
    }
    if (!document.caretRangeFromPoint) return null;
    var range = document.caretRangeFromPoint(x, y);
    if (!range) return null;
    var rangeNode = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer
      : firstText(range.startContainer.childNodes[range.startOffset]) || firstText(range.startContainer);
    return rangeNode ? { node: rangeNode, offset: range.startOffset } : null;
  }
  function anchorOffset(text, requested) {
    if (!text.length) return 0;
    var offset = Math.min(Math.max(0, requested), text.length - 1);
    if (/\s/.test(text.charAt(offset))) {
      for (var distance = 1; distance < text.length; distance += 1) {
        var after = offset + distance;
        if (after < text.length && !/\s/.test(text.charAt(after))) { offset = after; break; }
        var before = offset - distance;
        if (before >= 0 && !/\s/.test(text.charAt(before))) { offset = before; break; }
      }
    }
    var code = text.charCodeAt(offset);
    return code >= 0xDC00 && code <= 0xDFFF && offset > 0 ? offset - 1 : offset;
  }
  function rectFor(point) {
    if (!point.node.data.trim()) return null;
    var offset = anchorOffset(point.node.data, point.offset);
    var length = String.fromCodePoint(point.node.data.codePointAt(offset)).length;
    var range = document.createRange();
    range.setStart(point.node, offset);
    range.setEnd(point.node, Math.min(point.node.data.length, offset + length));
    return range.getClientRects()[0] || range.getBoundingClientRect();
  }
  function escapeCss(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, function (character) {
      return "\\" + character.codePointAt(0).toString(16) + " ";
    });
  }
  function selectorFor(element) {
    if (element.id) {
      var direct = "#" + escapeCss(element.id);
      if (document.querySelectorAll(direct).length === 1) return direct;
    }
    var parts = [];
    var current = element;
    while (current) {
      var part = current.localName;
      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (sibling) {
          return sibling.localName === current.localName;
        });
        if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
      }
      parts.unshift(part);
      if (current.id) {
        var idSelector = "#" + escapeCss(current.id);
        if (document.querySelectorAll(idSelector).length === 1) { parts[0] = idSelector; break; }
      }
      current = parent;
    }
    return parts.join(" > ");
  }

  var centerX = window.innerWidth / 2;
  var centerY = window.innerHeight / 2;
  var offsets = [0, -0.08, 0.08, -0.16, 0.16];
  var best = null;
  offsets.forEach(function (yOffset) {
    offsets.slice(0, 3).forEach(function (xOffset) {
      var point = pointAt(
        centerX + window.innerWidth * xOffset,
        centerY + window.innerHeight * yOffset
      );
      if (!point || !point.node.data.trim()) return;
      var rect = rectFor(point);
      if (!rect) return;
      var distance = Math.hypot(
        rect.left + rect.width / 2 - centerX,
        rect.top + rect.height / 2 - centerY
      );
      if (!best || distance < best.distance) best = { point: point, distance: distance };
    });
  });
  if (!best || !best.point.node.parentElement) return null;

  var parent = best.point.node.parentElement;
  var cssSelector = selectorFor(parent);
  var textNodes = Array.prototype.filter.call(parent.childNodes, function (node) {
    return node.nodeType === Node.TEXT_NODE;
  });
  var textNodeIndex = textNodes.indexOf(best.point.node);
  if (!cssSelector || textNodeIndex < 0) return null;
  var content = best.point.node.data;
  var charOffset = anchorOffset(content, best.point.offset);
  var highlight = String.fromCodePoint(content.codePointAt(charOffset));
  var before = content.slice(Math.max(0, charOffset - 32), charOffset);
  var after = content.slice(charOffset + highlight.length, charOffset + 33);
  var text = { highlight: highlight };
  if (before) text.before = before;
  if (after) text.after = after;
  return {
    cssSelector: cssSelector,
    domRange: { start: {
      cssSelector: cssSelector,
      textNodeIndex: textNodeIndex,
      charOffset: charOffset
    } },
    text: text
  };
})())
"""#

func readerBookmarkVisibilityScript(domRangeJSON: String) -> String {
  return #"""
JSON.stringify((function (point) {
  if (!point || !point.start) return false;
  var element = document.querySelector(point.start.cssSelector);
  if (!element) return false;
  var textNodes = Array.prototype.filter.call(element.childNodes, function (node) {
    return node.nodeType === Node.TEXT_NODE;
  });
  var node = textNodes[point.start.textNodeIndex];
  if (!node || !node.data.length) return false;
  var offset = Math.min(Math.max(0, point.start.charOffset || 0), node.data.length - 1);
  var code = node.data.charCodeAt(offset);
  if (code >= 0xDC00 && code <= 0xDFFF && offset > 0) offset -= 1;
  var length = String.fromCodePoint(node.data.codePointAt(offset)).length;
  var range = document.createRange();
  range.setStart(node, offset);
  range.setEnd(node, Math.min(node.data.length, offset + length));
  return Array.prototype.some.call(range.getClientRects(), function (rect) {
    return rect.right > 0 && rect.bottom > 0 &&
      rect.left < window.innerWidth && rect.top < window.innerHeight;
  });
})(\#(domRangeJSON)))
"""#
}
