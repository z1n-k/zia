// ==UserScript==
// @include   main
// @ignorecache
// ==/UserScript==

// tidy-downloads-tooltip.uc.js
// Rename-success tooltip anchored to the native library button badge.
(function () {
  "use strict";

  if (location.href !== "chrome://browser/content/browser.xhtml") return;

  const TAIL_HALF = 8;

  window.zenTidyDownloadsTooltip = {
    /**
     * @param {Object} ctx
     * @param {Object} ctx.store
     * @param {function} ctx.debugLog
     * @param {function} ctx.formatBytes
     * @param {function} ctx.getMasterTooltip
     * @param {function} ctx.getDownloadCardsContainer
     * @param {function} ctx.showRenameToast
     * @returns {{ updateUIForFocusedDownload: function, managePodVisibilityAndAnimations: function, dismissMasterRenameTooltip: function, syncChrome: function }}
     */
    init(ctx) {
      const {
        store,
        debugLog,
        formatBytes,
        getMasterTooltip,
        getDownloadCardsContainer,
        showRenameToast
      } = ctx;
      const { activeDownloadCards, focusedKeyRef } = store;
      const MASTER_TOOLTIP_FADEOUT_MS = window.zenTidyDownloadsUtils.MASTER_TOOLTIP_FADEOUT_MS;
      const toastedKeys = new Set();
      let observersArmed = false;

      function isCompactMode() {
        const root = document.documentElement;
        return (
          root.getAttribute("zen-compact-mode") === "true" ||
          root.getAttribute("zen-sidebar-expanded") === "false"
        );
      }

      function isStackOpen() {
        const foot = document.getElementById("zen-sidebar-foot-buttons");
        return foot?.hasAttribute("zen-library-stack-open") === true;
      }

      function isFullscreen() {
        return document.documentElement.getAttribute("inDOMFullscreen") === "true";
      }

      function isLibraryPanelOpen() {
        return document.querySelector("zen-library")?.getAttribute("open") === "true";
      }

      function libraryButton() {
        return document.getElementById("zen-library-button");
      }

      function badgeIsVisible(badge) {
        if (!badge?.isConnected) return false;
        const style = getComputedStyle(badge);
        if (style.visibility === "hidden" || style.display === "none") return false;
        const rect = badge.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      /**
       * Badge when Zen is showing it, otherwise the button's top-right corner,
       * which is where the badge sits.
       * @returns {DOMRect|{left:number,top:number,width:number,height:number,right:number,bottom:number}|null}
       */
      function anchorRect() {
        const badge = document.getElementById("library-button-badge");
        if (badgeIsVisible(badge)) {
          return badge.getBoundingClientRect();
        }
        const button = libraryButton();
        if (!button) return null;
        const buttonRect = button.getBoundingClientRect();
        const size = 16;
        const top = buttonRect.top - 4;
        return {
          left: buttonRect.right - size,
          top,
          width: size,
          height: size,
          right: buttonRect.right,
          bottom: top + size
        };
      }

      function chromeBlocksTooltip() {
        return (
          isCompactMode() ||
          isStackOpen() ||
          isLibraryPanelOpen() ||
          isFullscreen() ||
          !libraryButton()
        );
      }

      function eligible(cardData) {
        const download = cardData?.download;
        return !!(download?.succeeded && download.aiName);
      }

      function hideNow(tooltip, container) {
        store.masterRenameTooltipSuppressed = true;
        store.masterTooltipFadeoutActive = false;
        if (tooltip) {
          tooltip.removeAttribute("data-visible");
          tooltip.style.display = "none";
          tooltip.style.opacity = "0";
          tooltip.style.transform = "scaleY(0.8) translateY(10px)";
          tooltip.style.pointerEvents = "none";
          tooltip.style.visibility = "hidden";
        }
        if (container) {
          container.style.display = "none";
          container.style.visibility = "hidden";
          container.style.pointerEvents = "none";
        }
      }

      function fadeOut(tooltip, container) {
        const painted = tooltip && getComputedStyle(tooltip).display !== "none" && parseFloat(getComputedStyle(tooltip).opacity) > 0.01;
        if (!painted) {
          hideNow(tooltip, container);
          return;
        }
        store.masterRenameTooltipSuppressed = true;
        store.masterTooltipFadeoutActive = true;
        tooltip.style.opacity = "0";
        tooltip.style.transform = "scaleY(0.8) translateY(10px)";
        tooltip.style.pointerEvents = "none";
        tooltip.removeAttribute("data-visible");
        window.setTimeout(() => {
          store.masterTooltipFadeoutActive = false;
          if (store.masterRenameTooltipSuppressed === false) return;
          hideNow(tooltip, container);
        }, MASTER_TOOLTIP_FADEOUT_MS);
      }

      function fillTooltip(tooltip, cardData) {
        const download = cardData.download;
        const titleEl = tooltip.querySelector(".card-title");
        const statusEl = tooltip.querySelector(".card-status");
        const originalEl = tooltip.querySelector(".card-original-filename");
        const progressEl = tooltip.querySelector(".card-progress");
        const sizeEl = tooltip.querySelector(".card-filesize");
        const undoEl = tooltip.querySelector(".card-undo-button");
        const sparkle = tooltip.querySelector(".ai-sparkle-layer");

        let displayName = download.aiName || cardData.originalFilename || "File";
        const path = download.target?.path;
        if (path) {
          const actual = path.split(/[\\/]/).pop();
          if (actual) displayName = actual;
        }
        if (titleEl) {
          titleEl.textContent = displayName;
          titleEl.title = displayName;
        }
        if (statusEl) {
          statusEl.textContent = "Download renamed to:";
          statusEl.style.color = "#a0a0a0";
        }
        if (originalEl) {
          originalEl.textContent = cardData.originalFilename || "";
          originalEl.title = cardData.originalFilename || "";
          originalEl.style.display = cardData.originalFilename ? "block" : "none";
        }
        if (progressEl) progressEl.style.display = "none";
        let size = download.currentBytes;
        if (!(typeof size === "number" && size > 0)) size = download.totalBytes;
        if (sizeEl) {
          sizeEl.textContent = formatBytes(size || 0);
          sizeEl.style.display = "block";
        }
        if (undoEl) undoEl.style.display = "inline-flex";
        if (sparkle) sparkle.classList.add("visible");
      }

      function showToastInstead(cardData) {
        const key = cardData?.key;
        const download = cardData?.download;
        if (!key || !download?.aiName || toastedKeys.has(key)) return;
        toastedKeys.add(key);
        const oldName = cardData.originalFilename || "";
        showRenameToast?.(download.aiName, oldName, async (dismissPreviousToast) => {
          dismissPreviousToast?.();
          const undo = window.zenTidyDownloadsFileOps?.undoRename;
          if (typeof undo !== "function") return;
          const ok = await undo(key, { skipAutohideAfterSuccess: false });
          const toast = window.zenTidyDownloadsToasts?.showSimpleToast;
          if (typeof toast === "function") {
            toast(ok ? "Rename reverted" : "Undo failed");
          }
        });
      }

      function place(tooltip, container) {
        window.zenTidyDownloadsDownloadUi?.mountTooltipContainer?.(container);
        container.style.position = "relative";
        container.style.left = "auto";
        container.style.top = "auto";
        container.style.right = "auto";
        container.style.bottom = "auto";
        container.style.width = "100%";
        tooltip.style.width = "100%";

        const anchor = anchorRect();
        const tail = tooltip.querySelector(".tooltip-tail");
        if (!anchor || !tail) return;
        const cardRect = tooltip.getBoundingClientRect();
        if (cardRect.width <= 0) return;
        const anchorCenter = anchor.left + anchor.width / 2;
        const tailLeft = Math.min(
          cardRect.width - TAIL_HALF * 2 - 4,
          Math.max(4, anchorCenter - cardRect.left - TAIL_HALF)
        );
        tail.style.left = `${Math.round(tailLeft)}px`;
        tail.style.right = "auto";
      }

      /**
       * The tooltip carries its own visibility, so hiding only the container
       * would leave the card painted.
       */
      function setChromeHidden(tooltip, container, hidden) {
        if (hidden) {
          container.style.display = "none";
          tooltip.style.pointerEvents = "none";
          return;
        }
        container.style.display = "flex";
        container.style.visibility = "visible";
        tooltip.style.visibility = "visible";
        tooltip.style.pointerEvents = "auto";
      }

      function show(tooltip, container, cardData, animate) {
        store.masterRenameTooltipSuppressed = false;
        fillTooltip(tooltip, cardData);
        container.style.display = "flex";
        container.style.pointerEvents = "none";
        tooltip.style.display = "flex";
        setChromeHidden(tooltip, container, chromeBlocksTooltip());
        place(tooltip, container);
        if (animate) {
          tooltip.style.opacity = "0";
          tooltip.style.transform = "scaleY(0.8) translateY(10px)";
          tooltip.style.pointerEvents = "none";
          tooltip.removeAttribute("data-visible");
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (store.masterRenameTooltipSuppressed) return;
              if (focusedKeyRef.current !== cardData.key) return;
              tooltip.style.opacity = "1";
              tooltip.style.transform = "scaleY(1) translateY(0)";
              tooltip.setAttribute("data-visible", "true");
              setChromeHidden(tooltip, container, chromeBlocksTooltip());
            });
          });
        } else {
          tooltip.style.opacity = "1";
          tooltip.style.transform = "scaleY(1) translateY(0)";
          tooltip.setAttribute("data-visible", "true");
        }
      }

      function updateUIForFocusedDownload(keyToFocus, isNewOrSignificantUpdate = false) {
        const tooltip = getMasterTooltip();
        const container = getDownloadCardsContainer();
        if (!tooltip) return;

        focusedKeyRef.current = keyToFocus;
        const cardData = keyToFocus ? activeDownloadCards.get(keyToFocus) : null;
        if (!eligible(cardData)) {
          if (!store.masterTooltipFadeoutActive) {
            fadeOut(tooltip, container);
          }
          return;
        }

        if (isCompactMode()) {
          hideNow(tooltip, container);
          showToastInstead(cardData);
          return;
        }
        if (!libraryButton()) {
          hideNow(tooltip, container);
          showToastInstead(cardData);
          return;
        }

        const animate = isNewOrSignificantUpdate === true;
        show(tooltip, container, cardData, animate);
        debugLog?.("[Tooltip] Showing rename tooltip", { key: keyToFocus });
      }

      function dismissMasterRenameTooltip() {
        const tooltip = getMasterTooltip();
        const container = getDownloadCardsContainer();
        fadeOut(tooltip, container);
        return true;
      }

      function syncChrome() {
        const tooltip = getMasterTooltip();
        const container = getDownloadCardsContainer();
        const cardData = focusedKeyRef.current ? activeDownloadCards.get(focusedKeyRef.current) : null;
        if (!tooltip || !container || !eligible(cardData) || store.masterRenameTooltipSuppressed) {
          return;
        }
        if (isCompactMode()) {
          hideNow(tooltip, container);
          showToastInstead(cardData);
          return;
        }
        if (!libraryButton()) {
          hideNow(tooltip, container);
          showToastInstead(cardData);
          return;
        }
        if (isStackOpen() || isLibraryPanelOpen() || isFullscreen()) {
          setChromeHidden(tooltip, container, true);
          return;
        }
        setChromeHidden(tooltip, container, false);
        place(tooltip, container);
      }

      function armObservers() {
        if (observersArmed) return;
        observersArmed = true;
        const onChange = () => {
          try {
            syncChrome();
          } catch (e) {
            debugLog?.("[Tooltip] sync failed", e);
          }
        };
        const rootObserver = new MutationObserver(onChange);
        rootObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["zen-compact-mode", "inDOMFullscreen", "zen-sidebar-expanded"]
        });

        const watchFoot = () => {
          const foot = document.getElementById("zen-sidebar-foot-buttons");
          if (!foot || foot.dataset.tidyTooltipWatch === "true") {
            return foot?.dataset.tidyTooltipWatch === "true";
          }
          foot.dataset.tidyTooltipWatch = "true";
          const footObserver = new MutationObserver(onChange);
          footObserver.observe(foot, {
            attributes: true,
            attributeFilter: ["zen-library-stack-open", "zen-library-badge"]
          });
          if (typeof ResizeObserver === "function") {
            const resizeObserver = new ResizeObserver(onChange);
            resizeObserver.observe(foot);
            const sidebar = document.getElementById("sidebar-box");
            if (sidebar) resizeObserver.observe(sidebar);
          }
          return true;
        };
        const watchButton = () => {
          const button = libraryButton();
          if (!button || button.dataset.tidyTooltipWatch === "true") {
            return button?.dataset.tidyTooltipWatch === "true";
          }
          button.dataset.tidyTooltipWatch = "true";
          button.addEventListener("mouseenter", () => {
            dismissMasterRenameTooltip();
          });
          return true;
        };

        const watchLibrary = () => {
          const library = document.querySelector("zen-library");
          if (!library || library.dataset.tidyTooltipWatch === "true") {
            return library?.dataset.tidyTooltipWatch === "true";
          }
          library.dataset.tidyTooltipWatch = "true";
          const libraryObserver = new MutationObserver(onChange);
          libraryObserver.observe(library, { attributes: true, attributeFilter: ["open"] });
          return true;
        };
        const watchAll = () => [watchFoot(), watchLibrary(), watchButton()].every(Boolean);
        if (!watchAll()) {
          const wait = new MutationObserver(() => {
            if (watchAll()) wait.disconnect();
          });
          wait.observe(document.documentElement, { childList: true, subtree: true });
        }
        window.addEventListener("resize", onChange);
      }

      armObservers();

      return {
        updateUIForFocusedDownload,
        managePodVisibilityAndAnimations() {},
        dismissMasterRenameTooltip,
        syncChrome
      };
    }
  };
})();
