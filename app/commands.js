/**
 * Command palette catalog for Kettle Desktop.
 * Commands map to core HTTP API / sitting actions (plugin parity + CLI surface).
 */
(function (global) {
  "use strict";

  /**
   * Simple filter: all query tokens must appear in title|category|keywords|id.
   * @param {Array<{id:string,title:string,category?:string,keywords?:string}>} items
   * @param {string} query
   */
  function filterCommands(items, query) {
    const q = String(query || "")
      .trim()
      .toLowerCase();
    if (!q) return items.slice();
    const tokens = q.split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      const hay = [item.id, item.title, item.category || "", item.keywords || ""]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }

  /**
   * Build the static command list. `run` is bound later via attachRuns(handlers).
   * when(ctx) gates availability; ctx = { projectId, entry, streaming, dirty }
   */
  function buildCatalog() {
    return [
      {
        id: "ping",
        title: "Ping Core",
        category: "Core",
        keywords: "health status doctor api version",
      },
      {
        id: "refreshQueue",
        title: "Refresh Queue",
        category: "Desk",
        keywords: "reload queue list",
      },
      {
        id: "registerProject",
        title: "Register Project…",
        category: "Desk",
        keywords: "add project folder init",
      },
      {
        id: "selectProject",
        title: "Focus Project Selector",
        category: "Desk",
        keywords: "switch project",
      },
      {
        id: "save",
        title: "Save File",
        category: "Editor",
        keywords: "write disk",
        when: (ctx) => !!(ctx.entry && ctx.dirty),
      },
      {
        id: "approve",
        title: "Approve Entry",
        category: "Ritual",
        keywords: "bookmark approve",
        when: (ctx) => !!ctx.entry,
      },
      {
        id: "comment",
        title: "Comment on Entry…",
        category: "Ritual",
        keywords: "note note for sweep",
        when: (ctx) => !!ctx.entry,
      },
      {
        id: "sweep",
        title: "Sweep Project",
        category: "Ritual",
        keywords: "close judgment accrue",
        when: (ctx) => !!(ctx.projectId && !ctx.streaming),
      },
      {
        id: "refreshBriefs",
        title: "Refresh Briefs",
        category: "Desk",
        keywords: "rewrite brief ask cold re-entry",
        when: (ctx) => !!(ctx.projectId && !ctx.streaming),
      },
      {
        id: "compactSession",
        title: "Compact Session",
        category: "Chat",
        keywords: "summarize memory distill",
        when: (ctx) => !!(ctx.projectId && !ctx.streaming),
      },
      {
        id: "clearSession",
        title: "Clear Session",
        category: "Chat",
        keywords: "reset chatlog",
        when: (ctx) => !!ctx.projectId,
      },
      {
        id: "beginFounding",
        title: "Begin Founding Interview",
        category: "Founding",
        keywords: "interview bootstrap setup",
        when: (ctx) => !!(ctx.projectId && !ctx.streaming),
      },
      {
        id: "proposeFounding",
        title: "Finish Founding → Propose",
        category: "Founding",
        keywords: "propose desk proposal",
        when: (ctx) => !!(ctx.projectId && !ctx.streaming),
      },
      {
        id: "foundDesk",
        title: "Found Desk",
        category: "Founding",
        keywords: "found charter first queue",
        when: (ctx) => !!(ctx.projectId && !ctx.streaming),
      },
      {
        id: "focusChat",
        title: "Focus Chat",
        category: "Navigation",
        keywords: "composer message",
      },
      {
        id: "focusEditor",
        title: "Focus Editor",
        category: "Navigation",
        keywords: "file body",
      },
      {
        id: "focusQueue",
        title: "Focus Queue",
        category: "Navigation",
        keywords: "entries list",
      },
      {
        id: "reloadWindow",
        title: "Reload Window",
        category: "Shell",
        keywords: "refresh app",
      },
    ];
  }

  /**
   * Palette controller. expects DOM:
   *   #cmdPalette (root), #cmdPaletteInput, #cmdPaletteList, #cmdPaletteHint
   */
  function createPalette(opts) {
    const root = opts.root;
    const input = opts.input;
    const list = opts.list;
    const getCommands = opts.getCommands; // () => command[]
    const getContext = opts.getContext; // () => ctx
    const onRun = opts.onRun; // async (cmd) => void
    const onStatus = opts.onStatus || function () {};

    let open = false;
    let filtered = [];
    let selected = 0;

    function available() {
      const ctx = getContext() || {};
      return getCommands().filter((c) => {
        if (typeof c.when === "function") {
          try {
            return !!c.when(ctx);
          } catch {
            return false;
          }
        }
        return true;
      });
    }

    function render() {
      const q = input.value;
      filtered = filterCommands(available(), q);
      if (selected >= filtered.length) selected = Math.max(0, filtered.length - 1);
      list.innerHTML = "";
      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "cmd-empty muted";
        empty.textContent = "No matching commands";
        list.appendChild(empty);
        return;
      }
      filtered.forEach((cmd, i) => {
        const row = document.createElement("div");
        row.className = "cmd-item" + (i === selected ? " active" : "");
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", i === selected ? "true" : "false");
        row.dataset.index = String(i);
        row.innerHTML =
          '<span class="cmd-title"></span><span class="cmd-cat muted"></span>';
        row.querySelector(".cmd-title").textContent = cmd.title;
        row.querySelector(".cmd-cat").textContent = cmd.category || "";
        row.onmousedown = (ev) => {
          ev.preventDefault();
          selected = i;
          void runSelected();
        };
        row.onmouseenter = () => {
          selected = i;
          highlight();
        };
        list.appendChild(row);
      });
      const active = list.querySelector(".cmd-item.active");
      if (active && typeof active.scrollIntoView === "function") {
        active.scrollIntoView({ block: "nearest" });
      }
    }

    function highlight() {
      const rows = list.querySelectorAll(".cmd-item");
      rows.forEach((row, i) => {
        row.classList.toggle("active", i === selected);
        row.setAttribute("aria-selected", i === selected ? "true" : "false");
      });
      const active = list.querySelector(".cmd-item.active");
      if (active && typeof active.scrollIntoView === "function") {
        active.scrollIntoView({ block: "nearest" });
      }
    }

    async function runSelected() {
      const cmd = filtered[selected];
      if (!cmd) return;
      close();
      try {
        await onRun(cmd);
      } catch (e) {
        onStatus(String((e && e.message) || e));
      }
    }

    function show() {
      open = true;
      root.hidden = false;
      root.setAttribute("aria-hidden", "false");
      input.value = "";
      selected = 0;
      render();
      // next frame so display applies before focus
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    }

    function close() {
      if (!open) return;
      open = false;
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      input.value = "";
      list.innerHTML = "";
    }

    function toggle() {
      if (open) close();
      else show();
    }

    function isOpen() {
      return open;
    }

    input.addEventListener("input", () => {
      selected = 0;
      render();
    });

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        if (!filtered.length) return;
        selected = (selected + 1) % filtered.length;
        highlight();
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!filtered.length) return;
        selected = (selected - 1 + filtered.length) % filtered.length;
        highlight();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        void runSelected();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        close();
      } else if (ev.key === "Tab") {
        ev.preventDefault();
      }
    });

    root.addEventListener("mousedown", (ev) => {
      if (ev.target === root) close();
    });

    return { show, close, toggle, isOpen, filterCommands };
  }

  global.KettleCommands = {
    filterCommands,
    buildCatalog,
    createPalette,
  };
})(window);
