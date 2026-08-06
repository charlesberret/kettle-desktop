/**
 * Kettle Desktop v2 — plugin-shaped sitting over core API.
 * Stages: queue · open/edit/save · brief · ritual · chat · founding (see docs/DESKTOP_V2.md).
 */
(function () {
  "use strict";

  const Ritual = globalThis.KettleRitual;
  const $ = (id) => document.getElementById(id);
  const state = {
    projectId: null,
    projects: [],
    queue: [],
    entry: null,
    content: "",
    dirty: false,
    streaming: false,
    phase: "none",
    interviewStatus: null,
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

  function isApprovedEntry(entry) {
    if (!entry) return false;
    if (String(entry.status || "").toLowerCase() === "approved") return true;
    return entry.approved != null && String(entry.approved).trim() !== "";
  }

  function applyRitualChrome() {
    if (!Ritual) {
      $("btnApprove").disabled = !state.entry || state.streaming;
      $("btnComment").disabled = !state.entry || state.streaming;
      $("btnSweep").disabled = !state.projectId || state.streaming;
      $("btnSend").disabled = !state.projectId || state.streaming;
      return;
    }
    const controls = Ritual.ritualControls({
      phase: state.phase,
      hasProject: !!state.projectId,
      hasEntry: !!state.entry,
      approved: isApprovedEntry(state.entry),
      streaming: state.streaming,
    });
    $("btnApprove").disabled = !controls.canApprove;
    $("btnApprove").textContent = controls.approveLabel;
    $("btnComment").disabled = !controls.canComment;
    $("btnSweep").disabled = !controls.canSweep;
    $("btnSend").disabled = !state.projectId || state.streaming || controls.interviewing;
    $("commentDrawer").hidden =
      $("commentDrawer").hidden || controls.proposing || controls.interviewing;
  }

  function renderQueue() {
    const box = $("queueList");
    box.innerHTML = "";
    const entries = state.queue || [];
    $("queueEmpty").hidden = entries.length > 0;
    for (const e of entries) {
      const item = document.createElement("div");
      item.className =
        "qitem" + (state.entry && String(state.entry.id) === String(e.id) ? " active" : "");
      item.setAttribute("role", "option");
      item.dataset.id = String(e.id);
      const urg = (e.urgency || "").toLowerCase();
      const name = e.title || basename(e.path) || String(e.id);
      const proposal = Ritual && Ritual.isProposalEntry(e);
      item.innerHTML =
        '<div class="qname"><span class="dot ' +
        urg +
        '"></span>' +
        escapeHtml(name) +
        (proposal ? ' <span class="qtag">proposal</span>' : "") +
        "</div>" +
        '<div class="qmeta">' +
        escapeHtml(e.path || "") +
        (isApprovedEntry(e) ? " · approved" : "") +
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
        ? state.phase === "interviewing"
          ? "Founding interview — chat with the curator to survey the desk."
          : "Select a queue entry, or chat at project level."
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

  async function refreshPhase() {
    if (!state.projectId) {
      state.phase = "none";
      state.interviewStatus = null;
      applyRitualChrome();
      return;
    }
    let interviewStatus = "";
    try {
      const st = await KettleApi.interviewStatus(state.projectId);
      state.interviewStatus = st;
      interviewStatus = st.status || "";
    } catch {
      state.interviewStatus = null;
    }
    state.phase = Ritual
      ? Ritual.foundingPhaseFrom({
          interviewStatus,
          entries: state.queue,
          hasEntries: (state.queue || []).length > 0,
        })
      : "none";
    applyRitualChrome();
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
      await refreshPhase();
      return;
    }
    const q = await KettleApi.queue(state.projectId);
    state.queue = q.entries || [];
    renderQueue();
    await refreshPhase();
  }

  async function openEntry(entry) {
    if (state.dirty && !confirm("Discard unsaved edits?")) return;
    state.entry = entry;
    renderQueue();
    $("filePath").textContent = entry.path || "";
    $("filePath").title = entry.path || "";
    renderBrief(entry);
    renderDiff(entry);
    applyRitualChrome();
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
      applyRitualChrome();
    }
  }

  async function approveOrFound() {
    if (!state.entry || !state.projectId) return;
    let target = state.entry;
    if (Ritual && state.phase === "proposing") {
      target =
        Ritual.proposalEntryForFounding(state.queue, state.entry, true) || state.entry;
    }
    const res = await KettleApi.approve(state.projectId, target.id);
    if (res && res.founding) {
      status("founding desk…");
      state.streaming = true;
      applyRitualChrome();
      appendStream("sys", "— found desk —");
      try {
        await KettleApi.found(state.projectId, (ev) => {
          if (ev.t === "text" && ev.s) appendStream("agent", ev.s);
          else if (ev.t === "error") appendStream("err", ev.s || "error");
        });
        status("desk founded");
      } catch (e) {
        appendStream("err", String(e.message || e));
        status(String(e.message || e));
      } finally {
        state.streaming = false;
      }
    } else {
      status("approved (bookmark)");
    }
    state.entry = null;
    $("editor").value = "";
    $("filePath").textContent = "No file open";
    setDirty(false);
    renderBrief(null);
    renderDiff(null);
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
    applyRitualChrome();
    try {
      const mode = Ritual ? Ritual.chatModeForPhase(state.phase) : "chat";
      if (mode === "interview") {
        await KettleApi.interview(state.projectId, msg, (ev) => {
          if (ev.t === "text" && ev.s) appendStream("agent", ev.s);
          else if (ev.t === "error") appendStream("err", ev.s || "error");
        });
      } else {
        const body = {
          project: state.projectId,
          message: msg,
        };
        if (state.entry) body.id = state.entry.id;
        await KettleApi.chat(body, (ev) => {
          if (ev.t === "text" && ev.s) appendStream("agent", ev.s);
          else if (ev.t === "error") appendStream("err", ev.s || "error");
          else if (ev.t === "tool" && ev.path)
            appendStream("sys", "tool · " + (ev.path || ev.tool || ""));
        });
      }
      await loadQueue();
    } catch (e) {
      appendStream("err", String(e.message || e));
    } finally {
      state.streaming = false;
      applyRitualChrome();
    }
  }

  async function sweep() {
    if (!state.projectId || state.streaming) return;
    if (!confirm("Run sweep for this sitting?")) return;
    state.streaming = true;
    applyRitualChrome();
    appendStream("sys", "— sweep —");
    try {
      await KettleApi.sweep(state.projectId, (ev) => {
        if (ev.t === "text" && ev.s) appendStream("agent", ev.s);
        else if (ev.t === "error") appendStream("err", ev.s || "error");
      });
      await loadQueue();
      status("sweep finished");
    } catch (e) {
      appendStream("err", String(e.message || e));
    } finally {
      state.streaming = false;
      applyRitualChrome();
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
    // Core POST /api/projects/add requires `root` (folder path), not `path`.
    await KettleApi.addProject({ root: folder, name });
    await loadProjects();
    await loadQueue();
    status("project added");
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
      clearStream();
      await loadQueue();
    };
    $("btnRefreshQueue").onclick = () => loadQueue().catch((e) => status(String(e.message || e)));
    $("btnAddProject").onclick = () => addProject().catch((e) => status(String(e.message || e)));
    $("editor").oninput = () => setDirty($("editor").value !== state.content);
    $("btnSave").onclick = () => save().catch((e) => status(String(e.message || e)));
    $("btnApprove").onclick = () => approveOrFound().catch((e) => status(String(e.message || e)));
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
    document.addEventListener("keydown", (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "s") {
        ev.preventDefault();
        save().catch((e) => status(String(e.message || e)));
      }
    });
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
      applyRitualChrome();
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
