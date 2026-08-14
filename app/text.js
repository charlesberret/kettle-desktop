/**
 * Small, pure text helpers for the desktop renderer (no DOM at load).
 * Browser-global module, mirrored under `window.KettleText`; unit-tested in
 * test/text.test.js via the same vm idiom as commands.js.
 */
(function (global) {
  "use strict";

  /**
   * Display-only unescape for frontmatter-derived header text.
   *
   * Frontmatter values sometimes reach the UI with escape *sequences* rendered
   * literally — a YAML title written `title: "Foo\nBar"` can arrive as the two
   * characters backslash-n rather than a real newline, so the queue header shows
   * `Foo\nBar`. Convert the common whitespace escapes back to real characters so
   * the header shows the intended whitespace (HTML flow then collapses it), not
   * the escape sequence. Purely for display — never rewrites disk. Leaves any
   * other backslash sequence untouched.
   */
  function unescapeMeta(s) {
    if (s == null) return "";
    return String(s)
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r");
  }

  global.KettleText = { unescapeMeta };
})(window);
