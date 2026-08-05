/**
 * Plugin-shaped ritual enablement — same rules as kettle-vscode/src/ritualParity.ts.
 * Desktop sitting chrome must not invent a second founding formula.
 *
 * Dual-load: CommonJS (tests) and browser global `KettleRitual` (app/index.html).
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.KettleRitual = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isProposalEntry(entry) {
    if (!entry) return false;
    if (String(entry.id) === "desk-proposal" || entry.founding_phase === "proposal") {
      return true;
    }
    const p = String(entry.path || "").replace(/\\/g, "/");
    return p.endsWith("/DESK-PROPOSAL.md") || p === "DESK-PROPOSAL.md";
  }

  function proposalEntryForFounding(entries, selected, proposing) {
    if (isProposalEntry(selected)) return selected;
    return proposing ? (entries || []).find(isProposalEntry) : undefined;
  }

  /**
   * Chat route for founding phase. Only interviewing uses /api/interview;
   * proposal revision is ordinary /api/chat.
   */
  function chatModeForPhase(phase) {
    return phase === "interviewing" ? "interview" : "chat";
  }

  function shouldPostCompact(status) {
    return status && status.has_session === true;
  }

  /**
   * Derive a coarse founding phase from queue + interview status (desktop scaffold).
   * Prefer core GET /api/interview when available; fall back to proposal entry.
   */
  function foundingPhaseFrom(input) {
    const status = (input && input.interviewStatus) || "";
    if (status === "interviewing" || status === "proposing" || status === "founded") {
      return status;
    }
    if ((input && input.entries || []).some(isProposalEntry)) return "proposing";
    if (input && input.hasEntries) return "founded";
    return "none";
  }

  /** Host-side copy of the canonical ritual enablement bar. */
  function ritualControls(input) {
    const phase = input.phase || "none";
    const interviewing = phase === "interviewing";
    const proposing = phase === "proposing";
    const canFileAct = input.hasEntry && !interviewing && !input.streaming;
    return {
      interviewing,
      proposing,
      canApprove: proposing
        ? input.hasEntry && !input.streaming
        : canFileAct && !input.approved,
      canComment: canFileAct && !proposing,
      canSweep:
        input.hasProject && !interviewing && !proposing && !input.streaming,
      approveLabel: proposing ? "Found Desk" : "Approve",
    };
  }

  return {
    chatModeForPhase,
    foundingPhaseFrom,
    isProposalEntry,
    proposalEntryForFounding,
    ritualControls,
    shouldPostCompact,
  };
});
