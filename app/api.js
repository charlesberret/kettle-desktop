/**
 * Thin localhost client for kettle-core — same contract as kettle-vscode/src/api.ts.
 * Desktop v2 never loads core static/index.html; it only uses HTTP/NDJSON.
 */
(function (global) {
  "use strict";

  let baseUrl = "";

  function setBaseUrl(url) {
    baseUrl = String(url || "").replace(/\/$/, "");
  }

  function getBaseUrl() {
    return baseUrl;
  }

  async function jget(path) {
    const res = await fetch(baseUrl + path);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || String(res.status));
    return data;
  }

  async function jpost(path, body) {
    const res = await fetch(baseUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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

  global.KettleApi = {
    setBaseUrl,
    getBaseUrl,
    jget,
    jpost,
    stream,
    ping: () => jget("/api/ping"),
    projects: () => jget("/api/projects"),
    queue: (project) => jget("/api/queue?project=" + encodeURIComponent(project) + "&mutate=1"),
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
    addProject: (body) => jpost("/api/projects/add", body),
    catalog: () => jget("/api/curator/catalog"),
    setCurator: (body) => jpost("/api/curator", body),
  };
})(window);
