// ==UserScript==
// @include   main
// @loadOrder    99999999999999
// @ignorecache
// ==/UserScript==

// tidy-downloads.uc.js
// AI rename for completed downloads, surfaced on Zen's native library badge.
(function () {
  "use strict";

  const { classes: Cc, interfaces: Ci } = Components;

  if (location.href !== "chrome://browser/content/browser.xhtml") return;
  if (document.documentElement.getAttribute("windowtype") !== "navigator:browser") return;

  try {
    if (window.toolbar && !window.toolbar.visible) return;
    if (window.opener) return;
  } catch (_e) {}

  // Zia: on with "Rename finished downloads with AI" in Zia's settings
  // (zia.features.tidy-downloads)
  try {
    if (!Services.prefs.getBoolPref("zia.features.tidy-downloads", false)) return;
  } catch (_e) {
    return;
  }

  setTimeout(() => {
    const missing = ["#navigator-toolbox", "#browser", "#sidebar-box"].filter(
      (selector) => !document.querySelector(selector)
    );
    if (missing.length > 0) return;
    if (window.outerWidth < 400 || window.outerHeight < 300) return;
    if (document.documentElement.hasAttribute("dlgtype")) return;

    if (window.__zenTidyDownloadsBundleExecuted) return;
    window.__zenTidyDownloadsBundleExecuted = true;

    const REQUIRED_MODULES = [
      { name: "utils", test: () => window.zenTidyDownloadsUtils },
      { name: "store", test: () => window.zenTidyDownloadsStore?.createStore },
      { name: "downloadsAdapter", test: () => window.zenTidyDownloadsDownloadsAdapter },
      { name: "fileOps", test: () => window.zenTidyDownloadsFileOps?.createRenameHandlers },
      { name: "aiRename", test: () => window.zenTidyDownloadsAIRename?.init },
      { name: "downloadUi", test: () => window.zenTidyDownloadsDownloadUi?.init },
      { name: "tooltip", test: () => window.zenTidyDownloadsTooltip?.init },
      { name: "toasts", test: () => window.zenTidyDownloadsToasts }
    ];

    (function tryInit(attempt) {
      const missingModules = REQUIRED_MODULES.filter((mod) => !mod.test()).map((mod) => mod.name);
      if (missingModules.length === 0) {
        initializeMainScript();
        return;
      }
      if (attempt < 40) {
        setTimeout(() => tryInit(attempt + 1), 50);
        return;
      }
      console.error(
        `[Tidy Downloads] Missing modules after 2s: ${missingModules.join(", ")}.`
      );
    })(0);
  }, 100);

  /**
   * Download objects are shared by every window's view, so the flag itself
   * keeps a second window from renaming the same file.
   */
  function claimDownload(download) {
    if (download.__zenTidyAiClaimed) return false;
    download.__zenTidyAiClaimed = true;
    return true;
  }

  function initializeMainScript() {
    const Utils = window.zenTidyDownloadsUtils;
    if (!Utils || window.__zenTidyDownloadsMainInitialized) return;
    window.__zenTidyDownloadsMainInitialized = true;

    const {
      getPref,
      SecurityUtils,
      RateLimiter,
      debugLog,
      redactSensitiveData,
      AI_PROVIDER_PREF,
      MISTRAL_API_KEY_PREF,
      MISTRAL_MODEL_PREF,
      OPENAI_API_KEY_PREF,
      OPENAI_MODEL_PREF,
      ANTHROPIC_API_KEY_PREF,
      ANTHROPIC_MODEL_PREF,
      GOOGLE_API_KEY_PREF,
      GOOGLE_MODEL_PREF,
      OLLAMA_BASE_URL_PREF,
      OLLAMA_MODEL_PREF,
      OPENROUTER_API_KEY_PREF,
      OPENROUTER_MODEL_PREF,
      OPENAI_COMPAT_API_KEY_PREF,
      OPENAI_COMPAT_BASE_URL_PREF,
      OPENAI_COMPAT_MODEL_PREF,
      DISABLE_AUTOHIDE_PREF,
      IMAGE_EXTENSIONS,
      PATH_SEPARATOR,
      sanitizeFilename,
      formatBytes,
      clearCardTimers
    } = Utils;

    const Toasts = window.zenTidyDownloadsToasts;
    const showSimpleToast = Toasts?.showSimpleToast || (() => {});
    const showRenameToast = Toasts?.showRenameToast || (() => null);

    const store = window.zenTidyDownloadsStore.createStore({ getPref });
    const { activeDownloadCards, renamedFiles, focusedKeyRef, orderedPodKeys } = store;

    const fileOpsApi = window.zenTidyDownloadsFileOps.init({ SecurityUtils, debugLog });
    const { getContentTypeFromFilename } = fileOpsApi;

    let masterTooltipDOMElement = null;
    let downloadCardsContainer = null;
    let tooltipApi = null;
    let addToAIRenameQueue = () => false;
    let cancelAIProcessForDownload = async () => false;
    let downloadsList = null;
    let downloadView = null;

    function updateUIForFocusedDownload(key, significant) {
      tooltipApi?.updateUIForFocusedDownload(key, significant);
    }

    function removeCard(key) {
      const card = activeDownloadCards.get(key);
      if (card) clearCardTimers(card);
      activeDownloadCards.delete(key);
      const index = orderedPodKeys.indexOf(key);
      if (index > -1) orderedPodKeys.splice(index, 1);
      if (focusedKeyRef.current === key) {
        focusedKeyRef.current = null;
        tooltipApi?.dismissMasterRenameTooltip();
      }
    }

    function scheduleCardRemoval(key) {
      const card = activeDownloadCards.get(key);
      if (!card) return;
      clearCardTimers(card, { autohide: true, deferredSticky: false });
      if (getPref(DISABLE_AUTOHIDE_PREF, false)) return;
      const delay = getPref("extensions.downloads.autohide_delay_ms", 10000);
      card.autohideTimeoutId = setTimeout(() => removeCard(key), delay);
    }

    function performAutohideSequence(key) {
      removeCard(key);
    }

    let migrateAIRenameKeysImpl = () => {};
    const tidyDeps = {
      SecurityUtils,
      debugLog,
      sanitizeFilename,
      PATH_SEPARATOR,
      Cc,
      Ci,
      scheduleCardRemoval,
      performAutohideSequence,
      updateUIForFocusedDownload,
      getMasterTooltip: () => masterTooltipDOMElement,
      fireCustomEvent() {},
      migrateAIRenameKeys(oldKey, newKey) {
        migrateAIRenameKeysImpl(oldKey, newKey);
      }
    };

    const { renameDownloadFileAndUpdateRecord, undoRename } =
      window.zenTidyDownloadsFileOps.createRenameHandlers({
        store,
        deps: tidyDeps
      });
    window.zenTidyDownloadsFileOps.undoRename = undoRename;

    const aiApi = window.zenTidyDownloadsAIRename.init({
      store,
      deps: {
        ...tidyDeps,
        managePodVisibilityAndAnimations: () => tooltipApi?.syncChrome?.(),
        renameDownloadFileAndUpdateRecord,
        getPref,
        RateLimiter,
        redactSensitiveData,
        formatBytes,
        getContentTypeFromFilename,
        AI_PROVIDER_PREF,
        MISTRAL_API_KEY_PREF,
        MISTRAL_MODEL_PREF,
        OPENAI_API_KEY_PREF,
        OPENAI_MODEL_PREF,
        ANTHROPIC_API_KEY_PREF,
        ANTHROPIC_MODEL_PREF,
        GOOGLE_API_KEY_PREF,
        GOOGLE_MODEL_PREF,
        OLLAMA_BASE_URL_PREF,
        OLLAMA_MODEL_PREF,
        OPENROUTER_API_KEY_PREF,
        OPENROUTER_MODEL_PREF,
        OPENAI_COMPAT_API_KEY_PREF,
        OPENAI_COMPAT_BASE_URL_PREF,
        OPENAI_COMPAT_MODEL_PREF,
        IMAGE_EXTENSIONS,
        previewApi: null,
        showRenameToast,
        showSimpleToast,
        getDownloadKey: (download) => download?.target?.path || "",
        flushDeferredStickyIfPileCollapsed() {},
        finishDeferredStickyAfterAISuccess: async () => false,
        scheduleDeferredStickyAbsorbIfNeeded() {}
      }
    });

    if (aiApi) {
      addToAIRenameQueue = aiApi.addToAIRenameQueue;
      cancelAIProcessForDownload = aiApi.cancelAIProcessForDownload;
      migrateAIRenameKeysImpl = aiApi.migrateAIRenameKeys;
    }

    const ui = window.zenTidyDownloadsDownloadUi.init({
      debugLog,
      getFocusedKey: () => focusedKeyRef.current,
      onClose: (key) => removeCard(key),
      onUndo: async (key) => {
        const ok = await undoRename(key, { skipAutohideAfterSuccess: true });
        if (!ok) {
          showSimpleToast("Undo failed");
          return;
        }
        const keyAfter = focusedKeyRef.current;
        if (keyAfter) removeCard(keyAfter);
      }
    });
    downloadCardsContainer = ui.getDownloadCardsContainer();
    masterTooltipDOMElement = ui.getMasterTooltip();

    tooltipApi = window.zenTidyDownloadsTooltip.init({
      store,
      debugLog,
      formatBytes,
      getMasterTooltip: () => masterTooltipDOMElement,
      getDownloadCardsContainer: () => downloadCardsContainer,
      showRenameToast
    });

    function basename(path) {
      return String(path || "").split(/[\\/]/).pop() || "download";
    }

    function rememberCard(download) {
      const key = download.target.path;
      let card = activeDownloadCards.get(key);
      if (!card) {
        card = {
          key,
          download,
          originalFilename: basename(key),
          phase: "completed"
        };
        activeDownloadCards.set(key, card);
        orderedPodKeys.push(key);
      }
      return card;
    }

    function maybeEnqueue(download) {
      if (!download?.succeeded || download.canceled || download.error) return;
      if (download.launchWhenSucceeded) {
        debugLog("[Tidy] Skipping AI rename because the file opens when done");
        return;
      }
      if (!getPref("extensions.downloads.enable_ai_renaming", true)) return;
      const path = download.target?.path;
      if (!path) return;
      if (renamedFiles.has(path)) return;

      if (!claimDownload(download)) return;

      const card = rememberCard(download);
      addToAIRenameQueue(card.key, download, card.originalFilename);
    }

    function forgetDownload(download) {
      const keys = [];
      for (const [key, card] of activeDownloadCards) {
        if (card.download === download) keys.push(key);
      }
      for (const key of keys) {
        cancelAIProcessForDownload(key);
        removeCard(key);
      }
    }

    async function start() {
      const list = await window.zenTidyDownloadsDownloadsAdapter.getAllDownloadsList();
      if (!list) {
        console.error("Zen Tidy Downloads: Downloads API not available");
        return;
      }
      downloadsList = list;

      let booting = true;
      const preexisting = new WeakSet();
      const tryEnqueue = (download) => {
        try {
          maybeEnqueue(download);
        } catch (e) {
          console.error("[Tidy Downloads] enqueue failed", e);
          debugLog("[Tidy] enqueue failed", {
            message: e?.message || String(e),
            path: download?.target?.path
          });
        }
      };
      downloadView = {
        onDownloadAdded(download) {
          if (booting) {
            if (download.succeeded || download.canceled || download.error) {
              preexisting.add(download);
            }
            return;
          }
          tryEnqueue(download);
        },
        onDownloadChanged(download) {
          if (booting || preexisting.has(download)) return;
          tryEnqueue(download);
        },
        onDownloadRemoved(download) {
          preexisting.delete(download);
          forgetDownload(download);
        }
      };
      list.addView(downloadView);
      booting = false;
      debugLog("Tidy Downloads is watching new downloads");
    }

    window.addEventListener("beforeunload", () => {
      try {
        downloadsList?.removeView?.(downloadView);
      } catch (_e) {}
    }, { once: true });

    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  }
})();
