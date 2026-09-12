/**
 * Kettle Desktop v2 scaffold — plugin-shaped sitting over core API.
 * Stages: queue · open/edit/save · brief · ritual · chat (see docs/DESKTOP_V2.md).
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = {
    projectId: null,
    projects: [],
    queue: [],
    entry: null,
    content: "",
    dirty: false,
    streaming: false,
  };

  function status(msg) {
    const el = $("status");
    el.textContent = msg || "";
    el.classList.toggle("show", !!msg);
    if (msg) setTimeout(() => el.classList.remove("show"), 4000);
  }

  function showBoot(msg) {
    $("boot").hidden = false;
    $("app").hidden = true;
    $("bootMsg").textContent = msg || "Starting Kettle…";
  }

  function showApp() {
    $("boot").hidden = true;
    $("app").hidden = false;
  }

  function basename(p) {
    if (!p) return "";
    const parts = String(p).replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || p;
  }

  function setDirty(d) {
    state.dirty = !!d;
    $("dirtyMark").hidden = !state.dirty;
    $("btnSave").disabled = !state.dirty || !state.entry;
  }

  function appendStream(kind, text) {
    if (!text) return;
    const line = document.createElement("div");
    line.className = "line " + (kind || "sys");
    line.textContent = text;
    $("stream").appendChild(line);
    $("stream").scrollTop = $("stream").scrollHeight;
  }

  function clearStream() {
    $("stream").innerHTML = "";
  }

  function setRitualEnabled(on) {
    $("btnApprove").disabled = !on;
    $("btnComment").disabled = !on;
    $("btnSweep").disabled = !state.projectId || state.streaming;
    $("btnSend").disabled = !state.projectId || state.streaming;
  }

  function renderQueue() {
    const box = $("queueList");
    box.innerHTML = "";
    const entries = state.queue || [];
    $("queueEmpty").hidden = entries.length > 0;
    for (const e of entries) {
      const item = document.createElement("div");
      item.className = "qitem" + (state.entry && String(state.entry.id) === String(e.id) ? " active" : "");
      item.setAttribute("role", "option");
      item.dataset.id = String(e.id);
      const urg = (e.urgency || "").toLowerCase();
      // Frontmatter titles can arrive with literal \n / \t escapes (LAB-28);
      // unescape for display so the header shows whitespace, not the sequence.
      const name =
        KettleText.unescapeMeta(e.title) || basename(e.path) || String(e.id);
      item.innerHTML =
        '<div class="qname"><span class="dot ' +
        urg +
        '"></span>' +
        escapeHtml(name) +
        "</div>" +
        '<div class="qmeta">' +
        escapeHtml(e.path || "") +
        (e.approved ? " · approved" : "") +
        "</div>";
      item.onclick = () => openEntry(e).catch((err) => status(String(err.message || err)));
      box.appendChild(item);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderBrief(entry) {
    const take = $("briefTakeaway");
    const body = $("briefBody");
    if (!entry) {
      take.hidden = true;
      body.textContent = state.projectId
        ? "Select a queue entry, or chat at project level."
        : "Select a project to begin.";
      body.classList.add("muted");
      return;
    }
    const ask = (entry.ask || "").trim();
    const brief = (entry.brief || "").trim();
    if (ask) {
      take.hidden = false;
      take.textContent = ask;
    } else {
      take.hidden = true;
    }
    body.textContent = brief || "(no brief prepared)";
    body.classList.toggle("muted", !brief);
  }

  function renderDiff(entry) {
    const el = $("diffBadge");
    const d = entry && entry.diff;
    if (!d || (d.added == null && d.removed == null)) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML =
      '<span class="add">+' +
      (d.added || 0) +
      '</span> <span class="del">−' +
      (d.removed || 0) +
      "</span>";
  }

  async function loadProjects() {
    const data = await KettleApi.projects();
    state.projects = data.projects || [];
    const sel = $("projectSel");
    sel.innerHTML = "";
    if (!state.projects.length) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "No projects — add one";
      sel.appendChild(o);
      return;
    }
    for (const p of state.projects) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.name || p.id;
      sel.appendChild(o);
    }
    if (!state.projectId || !state.projects.some((p) => p.id === state.projectId)) {
      state.projectId = state.projects[0].id;
    }
    sel.value = state.projectId;
  }

  async function loadQueue() {
    if (!state.projectId) {
      state.queue = [];
      renderQueue();
      return;
    }
    const q = await KettleApi.queue(state.projectId);
    state.queue = q.entries || [];
    renderQueue();
  }

  async function openEntry(entry) {
    if (state.dirty && !confirm("Discard unsaved edits?")) return;
    state.entry = entry;
    renderQueue();
    $("filePath").textContent = entry.path || "";
    $("filePath").title = entry.path || "";
    renderBrief(entry);
    renderDiff(entry);
    setRitualEnabled(true);
    const f = await KettleApi.file(state.projectId, entry.path);
    state.content = f.content || "";
    $("editor").value = state.content;
    setDirty(false);
  }

  async function save() {
    if (!state.entry || !state.dirty) return;
    await KettleApi.save(state.projectId, state.entry.path, $("editor").value);
    state.content = $("editor").value;
    setDirty(false);
    status("saved");
    await loadQueue();
    const fresh = state.queue.find((e) => String(e.id) === String(state.entry.id));
    if (fresh) {
      state.entry = fresh;
      renderDiff(fresh);
    }
  }

  async function approve() {
    if (!state.entry) return;
    await KettleApi.approve(state.projectId, state.entry.id);
    status("approved (bookmark)");
    await loadQueue();
  }

  async function sendComment() {
    if (!state.entry) return;
    const text = $("commentIn").value.trim();
    if (!text) return;
    await KettleApi.comment(state.projectId, state.entry.id, text);
    $("commentIn").value = "";
    $("commentDrawer").hidden = true;
    status("comment saved");
    await loadQueue();
  }

  async function chat() {
    if (!state.projectId || state.streaming) return;
    const msg = $("chatIn").value.trim();
    if (!msg) return;
    $("chatIn").value = "";
    appendStream("user", msg);
    state.streaming = true;
    setRitualEnabled(!!state.entry);
    try {
      const body = {
        project: state.projectId,
        message: msg,
      };
      if (state.entry) body.id = state.entry.id;
      await KettleApi.stream("/api/chat", body, (ev) => {
        if (ev.t === "text" && ev.s) appendStream("agent", ev.s);
        else if (ev.t === "error") appendStream("err", ev.s || "error");
        else if (ev.t === "tool" && ev.path) appendStream("sys", "tool · " + (ev.path || ev.tool || ""));
      });
    } catch (e) {
      appendStream("err", String(e.message || e));
    } finally {
      state.streaming = false;
      setRitualEnabled(!!state.entry);
    }
  }

  async function sweep() {
    if (!state.projectId || state.streaming) return;
    if (!confirm("Run sweep for this sitting?")) return;
    state.streaming = true;
    setRitualEnabled(!!state.entry);
    appendStream("sys", "— sweep —");
    try {
      await KettleApi.stream(
        "/api/sweep",
        { project: state.projectId },
        (ev) => {
          if (ev.t === "text" && ev.s) appendStream("agent", ev.s);
          else if (ev.t === "error") appendStream("err", ev.s || "error");
        },
      );
      await loadQueue();
      status("sweep finished");
    } catch (e) {
      appendStream("err", String(e.message || e));
    } finally {
      state.streaming = false;
      setRitualEnabled(!!state.entry);
    }
  }

  async function loadModels() {
    try {
      const cat = await KettleApi.catalog();
      const sel = $("modelSel");
      sel.innerHTML = "";
      const models = cat.visible || cat.models || [];
      const active =
        (cat.active && cat.active.models && cat.active.models.chat) ||
        (cat.active && cat.active.model) ||
        "";
      if (!models.length) {
        const o = document.createElement("option");
        o.textContent = "default model";
        o.value = "";
        sel.appendChild(o);
        return;
      }
      for (const m of models) {
        const o = document.createElement("option");
        o.value = m.id;
        o.textContent = m.label || m.id;
        o.dataset.provider = m.provider || "";
        sel.appendChild(o);
      }
      if (active) sel.value = active;
    } catch {
      /* catalog optional at scaffold */
    }
  }

  async function addProject() {
    const bridge = window.kettle;
    if (!bridge || !bridge.pickFolder) {
      status("folder picker unavailable");
      return;
    }
    const folder = await bridge.pickFolder();
    if (!folder) return;
    const name = basename(folder);
    await KettleApi.addProject({ path: folder, name });
    await loadProjects();
    await loadQueue();
    status("project added");
  }

  function streamHandler(ev) {
    if (ev.t === "text" && ev.s) appendStream("agent", ev.s);
    else if (ev.t === "error") appendStream("err", ev.s || "error");
    else if (ev.t === "tool" && ev.path) appendStream("sys", "tool · " + (ev.path || ev.tool || ""));
    else if (ev.t === "notice" && ev.s) appendStream("sys", ev.s);
  }

  async function runProjectStream(path, label, extraBody) {
    if (!state.projectId || state.streaming) return;
    state.streaming = true;
    setRitualEnabled(!!state.entry);
    appendStream("sys", "— " + label + " —");
    try {
      const body = Object.assign({ project: state.projectId }, extraBody || {});
      await KettleApi.stream(path, body, streamHandler);
      await loadQueue();
      status(label + " finished");
    } catch (e) {
      appendStream("err", String(e.message || e));
      status(String(e.message || e));
    } finally {
      state.streaming = false;
      setRitualEnabled(!!state.entry);
    }
  }

  async function pingCore() {
    const p = await KettleApi.ping();
    const bits = [
      p.app || "kettle",
      p.version || "",
      p.port != null ? "port " + p.port : "",
      KettleApi.getBaseUrl(),
    ].filter(Boolean);
    status(bits.join(" · "));
    appendStream("sys", "ping · " + bits.join(" · "));
  }

  async function refreshBriefs() {
    await runProjectStream("/api/refresh-briefs", "refresh briefs");
  }

  async function compactSession() {
    if (!confirm("Compact this project's chat session?")) return;
    await runProjectStream("/api/compact", "compact");
  }

  async function clearSession() {
    if (!state.projectId) return;
    if (!confirm("Clear session chatlog for this project?")) return;
    await KettleApi.clearSession(state.projectId);
    clearStream();
    status("session cleared");
  }

  async function beginFounding() {
    await runProjectStream("/api/interview", "founding interview");
  }

  async function proposeFounding() {
    if (!confirm("Finish founding and write DESK-PROPOSAL.md?")) return;
    await runProjectStream("/api/propose", "propose");
  }

  async function foundDesk() {
    if (!confirm("Found the desk (charter + first queue)? Requires an approved proposal.")) return;
    await runProjectStream("/api/found", "found");
  }

  function focusProjectSel() {
    $("projectSel").focus();
  }

  function focusChat() {
    $("chatIn").focus();
  }

  function focusEditor() {
    $("editor").focus();
  }

  function focusQueue() {
    const active = document.querySelector("#queueList .qitem.active");
    const first = document.querySelector("#queueList .qitem");
    const el = active || first;
    if (el) el.focus();
    else $("queueList").focus();
  }

  function reloadWindow() {
    location.reload();
  }

  let palette = null;

  function paletteContext() {
    return {
      projectId: state.projectId,
      entry: state.entry,
      streaming: state.streaming,
      dirty: state.dirty,
    };
  }

  async function runCommand(cmd) {
    const id = cmd && cmd.id;
    switch (id) {
      case "ping":
        return pingCore();
      case "refreshQueue":
        await loadQueue();
        status("queue refreshed");
        return;
      case "registerProject":
        return addProject();
      case "selectProject":
        return focusProjectSel();
      case "save":
        return save();
      case "approve":
        return approve();
      case "comment":
        $("commentDrawer").hidden = false;
        $("commentIn").focus();
        return;
      case "sweep":
        return sweep();
      case "refreshBriefs":
        return refreshBriefs();
      case "compactSession":
        return compactSession();
      case "clearSession":
        return clearSession();
      case "beginFounding":
        return beginFounding();
      case "proposeFounding":
        return proposeFounding();
      case "foundDesk":
        return foundDesk();
      case "focusChat":
        return focusChat();
      case "focusEditor":
        return focusEditor();
      case "focusQueue":
        return focusQueue();
      case "reloadWindow":
        return reloadWindow();
      default:
        status("unknown command: " + id);
    }
  }

  function initPalette() {
    if (!globalThis.KettleCommands) {
      console.warn("[desk] KettleCommands missing — command palette disabled");
      return null;
    }
    const catalog = KettleCommands.buildCatalog();
    return KettleCommands.createPalette({
      root: $("cmdPalette"),
      input: $("cmdPaletteInput"),
      list: $("cmdPaletteList"),
      getCommands: () => catalog,
      getContext: paletteContext,
      onRun: runCommand,
      onStatus: status,
    });
  }

  function wire() {
    $("projectSel").onchange = async () => {
      if (state.dirty && !confirm("Discard unsaved edits?")) {
        $("projectSel").value = state.projectId;
        return;
      }
      state.projectId = $("projectSel").value || null;
      state.entry = null;
      $("editor").value = "";
      $("filePath").textContent = "No file open";
      setDirty(false);
      renderBrief(null);
      renderDiff(null);
      setRitualEnabled(false);
      clearStream();
      await loadQueue();
    };
    $("btnRefreshQueue").onclick = () => loadQueue().catch((e) => status(String(e.message || e)));
    $("btnAddProject").onclick = () => addProject().catch((e) => status(String(e.message || e)));
    $("editor").oninput = () => setDirty($("editor").value !== state.content);
    $("btnSave").onclick = () => save().catch((e) => status(String(e.message || e)));
    $("btnApprove").onclick = () => approve().catch((e) => status(String(e.message || e)));
    $("btnComment").onclick = () => {
      $("commentDrawer").hidden = !$("commentDrawer").hidden;
    };
    $("btnCommentCancel").onclick = () => {
      $("commentDrawer").hidden = true;
    };
    $("btnCommentSend").onclick = () => sendComment().catch((e) => status(String(e.message || e)));
    $("btnSweep").onclick = () => sweep().catch((e) => status(String(e.message || e)));
    $("btnSend").onclick = () => chat().catch((e) => status(String(e.message || e)));
    $("chatIn").onkeydown = (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        chat().catch((e) => status(String(e.message || e)));
      }
    };
    $("modelSel").onchange = async () => {
      const id = $("modelSel").value;
      if (!id) return;
      const opt = $("modelSel").selectedOptions[0];
      try {
        await KettleApi.setCurator({
          model: id,
          provider: opt && opt.dataset.provider,
          task: "chat",
        });
        status("model " + id);
      } catch (e) {
        status(String(e.message || e));
      }
    };
    palette = initPalette();
    document.addEventListener("keydown", (ev) => {
      const mod = ev.metaKey || ev.ctrlKey;
      // Cmd+Shift+P — also registered on the app menu. Always show (not toggle)
      // so a dual delivery from menu accelerator + keydown cannot flash closed.
      // Escape dismisses.
      if (mod && ev.shiftKey && (ev.key === "P" || ev.key === "p")) {
        ev.preventDefault();
        if (palette) palette.show();
        return;
      }
      if (mod && !ev.shiftKey && (ev.key === "s" || ev.key === "S")) {
        ev.preventDefault();
        save().catch((e) => status(String(e.message || e)));
        return;
      }
      if (ev.key === "Escape" && palette && palette.isOpen()) {
        ev.preventDefault();
        palette.close();
      }
    });
    // Menu: always open (idempotent). Prefer this over toggle so a second
    // delivery of the same shortcut from the accelerator cannot close the bar.
    window.openCommandPalette = () => {
      if (palette) palette.show();
    };
  }

  async function boot() {
    showBoot("Connecting to core…");
    wire();
    try {
      const bridge = window.kettle;
      if (!bridge || !bridge.getCoreUrl) {
        throw new Error("preload bridge missing (window.kettle)");
      }
      const url = await bridge.getCoreUrl();
      if (!url) throw new Error("core URL not ready");
      KettleApi.setBaseUrl(url);
      // Auth token for the /api/ gate — fetch before the first ping.
      if (bridge.getCoreToken) {
        KettleApi.setToken(await bridge.getCoreToken());
      }
      const ping = await KettleApi.ping();
      if (ping.app !== "kettle" && ping.app !== "setsweep") {
        throw new Error("unexpected app identity: " + ping.app);
      }
      await loadProjects();
      await loadQueue();
      await loadModels();
      showApp();
      setRitualEnabled(false);
      $("btnSweep").disabled = !state.projectId;
      $("btnSend").disabled = !state.projectId;
      status((ping.app || "kettle") + " " + (ping.version || "") + " · " + url);
    } catch (e) {
      showBoot("Failed to start: " + (e.message || e));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
