// ==UserScript==
// @include   main
// @loadOrder 99999999999998
// @ignorecache
// ==/UserScript==

// tidy-downloads-store.uc.js
// Mutable application state for Zen Tidy Downloads (maps, sets, refs, UI throttle prefs)
(function () {
  "use strict";

  if (location.href !== "chrome://browser/content/browser.xhtml") return;

  window.zenTidyDownloadsStore = {
    /**
     * Create a fresh state bag for one browser window / script run.
     * @param {{ getPref?: function }} options
     * @returns {ZenTidyDownloadsStore}
     */
    createStore(options = {}) {
      const { getPref } = options;
      let minUi = 150;
      let filePreviewEnabled = false;
      try {
        if (typeof getPref === "function") {
          minUi = getPref("extensions.downloads.ui_update_min_interval_ms", 150);
          filePreviewEnabled = getPref("extensions.downloads.enable_file_preview", false);
        }
      } catch (e) {
        // keep defaults
      }

      return {
        activeDownloadCards: new Map(),
        renamedFiles: new Set(),
        cardUpdateThrottle: new Map(),
        /** @type {number} */
        lastUIUpdateTime: 0,
        MIN_UI_UPDATE_INTERVAL_MS: minUi,
        filePreviewEnabled,
        sidebarWidthRef: { value: "" },
        focusedKeyRef: { current: null },
        orderedPodKeys: [],
        lastRotationDirection: null,
        dismissedDownloads: new Set(),
        stickyPods: new Set(),
        permanentlyDeletedPaths: new Set(),
        permanentlyDeletedMeta: new Map(),
        MAX_PERMANENTLY_DELETED_PATHS: 50,
        actualDownloadRemovedEventListeners: new Set(),
        dismissedPodsData: new Map(),
        dismissEventListeners: new Set(),
        /**
         * Downloads currently in the "progress" phase (not yet succeeded/
         * error/canceled/removed). Keyed by the same canonical getDownloadKey
         * used by activeDownloadCards so the pie renderer and the pods
         * pipeline share one identity space. The library pie owns the
         * lifecycle writes to this map today; after the Step 4 refactor the
         * pod-lifecycle module will own it and renderers become read-only.
         * @type {Map<string, unknown>}
         */
        progressingDownloads: new Map(),
        progressPileListeners: new Set(),
        /** @type {Map<string, number>} throttle timestamps for progress pile upserts */
        progressPileUpsertThrottle: new Map(),
        /** @type {WeakMap<object, string>} last canonical pile key per Download object (rekey) */
        progressPileKeyByDownload: new WeakMap(),
        /**
         * When true, zen-stuff must not open the dismissed pile from library/sizer/pod
         * hover — the master rename-success tooltip is intentionally shown.
         * Toggled only from tidy-downloads-tooltip-layout (not inferred from DOM).
         */
        pileHoverBlockedByRenameTooltip: false,
        /**
         * When true, rename-success chrome was dismissed (autohide, close, sticky transition, etc.).
         * compact-visibility and managePod must not force the cards container back to flex until
         * updateUIForFocusedDownload opens a new rename-tooltip session.
         */
        masterRenameTooltipSuppressed: false,
        /**
         * While true, `#userchrome-download-cards-container` and `.master-tooltip` must stay painted
         * (display flex / visible) so CSS opacity/transform transitions run; callers clear after
         * MASTER_TOOLTIP_FADEOUT_MS and then apply display:none.
         */
        masterTooltipFadeoutActive: false,
        /**
         * Download keys with AI rename still in flight after sticky pod creation.
         * Used for tooltip fade coordination in `makePodStickyCore` (not pile-expand gating).
         * @type {Set<string>}
         */
        pileHoverExpandBlockedUntilAIDoneKeys: new Set()
      };
    }
  };
})();
