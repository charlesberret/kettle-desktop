/**
 * Thin localhost client for kettle-core — same contract as kettle-vscode/src/api.ts.
 * Desktop v2 never loads core static/index.html; it only uses HTTP/NDJSON.
 *
 * Route tiers (kettle-core/API.md): ping · plugin MVP · full sitting · founding.
 */
(function (global) {
  "use strict";

  let baseUrl = "";
  let authToken = "";

  function setBaseUrl(url) {
    baseUrl = String(url || "").replace(/\/$/, "");
  }

  function getBaseUrl() {
    return baseUrl;
  }

  function setToken(token) {
    authToken = String(token || "");
  }

  function getToken() {
    return authToken;
  }

  function apiHeaders(extra) {
    const headers = Object.assign({}, extra || {});
    if (authToken) headers["X-Kettle-Token"] = authToken;
    return headers;
  }

  async function jget(path) {
    const res = await fetch(baseUrl + path, { headers: apiHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || String(res.status));
    return data;
  }

  async function jpost(path, body) {
    const res = await fetch(baseUrl + path, {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || String(res.status));
    return data;
  }

  /**
   * Consume application/x-ndjson streams (chat, sweep, interview, …).
   * onEvent(ev) for each parsed line; returns { text, error }.
   */
  async function stream(path, body, onEvent, signal) {
    const res = await fetch(baseUrl + path, {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body || {}),
      signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText || String(res.status));
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let error;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.t === "text" && typeof ev.s === "string") text += ev.s;
        if (ev.t === "error") error = ev.s || ev.error || "stream error";
        if (onEvent) onEvent(ev);
      }
    }
    if (buf.trim()) {
      try {
        const ev = JSON.parse(buf);
        if (ev.t === "text" && typeof ev.s === "string") text += ev.s;
        if (ev.t === "error") error = ev.s || ev.error || "stream error";
        if (onEvent) onEvent(ev);
      } catch {
        /* ignore trailing partial */
      }
    }
    return { text, error };
  }

  /** Register a folder — core expects `root`, not `path` (POST /api/projects/add). */
  function addProjectBody(opts) {
    const body = {
      name: opts.name,
      root: opts.root || opts.path,
    };
    if (opts.kit) body.kit = opts.kit;
    if (opts.note) body.note = opts.note;
    if (opts.max_depth != null) body.max_depth = opts.max_depth;
    return body;
  }

  global.KettleApi = {
    setBaseUrl,
    getBaseUrl,
    setToken,
    getToken,
    jget,
    jpost,
    stream,
    addProjectBody,
    ping: () => jget("/api/ping"),
    projects: () => jget("/api/projects"),
    /** Viewport refresh — allow founding heal / snapshots (default mutate). */
    queue: (project) =>
      jget("/api/queue?project=" + encodeURIComponent(project)),
    file: (project, path) =>
      jget(
        "/api/file?project=" +
          encodeURIComponent(project) +
          "&path=" +
          encodeURIComponent(path),
      ),
    save: (project, path, content) => jpost("/api/save", { project, path, content }),
    approve: (project, id) => jpost("/api/approve", { project, id }),
    comment: (project, id, text) => jpost("/api/comment", { project, id, text }),
    addProject: (opts) => jpost("/api/projects/add", addProjectBody(opts || {})),
    catalog: () => jget("/api/curator/catalog"),
    setCurator: (body) => jpost("/api/curator", body),
    interviewStatus: (project) =>
      jget("/api/interview?project=" + encodeURIComponent(project)),
    interview: (project, message, onEvent, signal) =>
      stream("/api/interview", { project, message }, onEvent, signal),
    propose: (project, onEvent, signal) =>
      stream("/api/propose", { project }, onEvent, signal),
    found: (project, onEvent, signal) =>
      stream("/api/found", { project }, onEvent, signal),
    refreshBriefs: (project, onEvent, signal) =>
      stream("/api/refresh-briefs", { project }, onEvent, signal),
    chat: (body, onEvent, signal) => stream("/api/chat", body, onEvent, signal),
    sweep: (project, onEvent, signal) =>
      stream("/api/sweep", { project }, onEvent, signal),
  };
})(typeof window !== "undefined" ? window : globalThis);
