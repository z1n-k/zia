// ==UserScript==
// @include   main
// @loadOrder 99999999999999
// @ignorecache
// ==/UserScript==

// tidy-downloads-downloads-adapter.uc.js
// Firefox Downloads API: list access, view listener factory, startup batch filter
(function () {
  "use strict";

  if (location.href !== "chrome://browser/content/browser.xhtml") return;

  window.zenTidyDownloadsDownloadsAdapter = {
    /** @returns {boolean} */
    isAvailable() {
      return !!(window.Downloads && typeof window.Downloads.getList === "function");
    },

    /**
     * @returns {Promise<{ addView: function, getAll: function, remove: function }|null>}
     */
    getAllDownloadsList() {
      if (!this.isAvailable()) {
        return Promise.resolve(null);
      }
      return window.Downloads.getList(window.Downloads.ALL);
    },

    /**
     * @param {{ onCompletedState: function, onRemoved: function }} handlers
     * @returns {{ onDownloadAdded: function, onDownloadChanged: function, onDownloadRemoved: function }}
     */
    createDownloadViewListener(handlers) {
      const { onCompletedState, onRemoved } = handlers;
      return {
        onDownloadAdded: (dl) => {
          if (dl.succeeded || dl.error) {
            onCompletedState(dl);
          }
        },
        onDownloadChanged: (dl) => {
          if (dl.succeeded || dl.error) {
            onCompletedState(dl);
          }
        },
        onDownloadRemoved: (dl) => onRemoved(dl)
      };
    },

    /**
     * View listener that receives every add/change (including in-progress) for progress UI.
     * @param {{ onDownloadSessionEvent: function }} handlers
     * @returns {{ onDownloadAdded: function, onDownloadChanged: function, onDownloadRemoved: function }}
     */
    createProgressSessionViewListener(handlers) {
      const { onDownloadSessionEvent } = handlers;
      const notify = (dl) => {
        if (typeof onDownloadSessionEvent === "function") {
          try {
            onDownloadSessionEvent(dl);
          } catch (e) {
            console.error("[DownloadsAdapter] onDownloadSessionEvent error:", e);
          }
        }
      };
      return {
        onDownloadAdded: (dl) => notify(dl),
        onDownloadChanged: (dl) => notify(dl),
        onDownloadRemoved: (dl) => notify(dl)
      };
    },

    /**
     * Completed (succeeded or error) downloads to hydrate on startup; skips entries already dismissed unless a card exists.
     * @param {unknown[]} all - result of downloadList.getAll()
     * @param {Object} ctx
     * @param {function} ctx.getDownloadKey
     * @param {Set} ctx.dismissedDownloads
     * @param {Map} ctx.activeDownloadCards
     * @param {function} ctx.debugLog
     * @returns {unknown[]}
     */
    filterInitialCompletedDownloads(all, ctx) {
      const { getDownloadKey, dismissedDownloads, activeDownloadCards, debugLog } = ctx;
      return all.filter((dl) => {
        if (!dl.succeeded && !dl.error) {
          return false;
        }

        const key = getDownloadKey(dl);

        if (dismissedDownloads.has(key) && !activeDownloadCards.has(key)) {
          debugLog(`[CreatePod] Skipping dismissed completed download: ${key}`);
          return false;
        }

        return true;
      });
    }
  };
})();
