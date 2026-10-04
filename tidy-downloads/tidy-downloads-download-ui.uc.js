// ==UserScript==
// @include   main
// @ignorecache
// ==/UserScript==

// tidy-downloads-download-ui.uc.js
// Rename-success tooltip shell. Anchored later by tidy-downloads-tooltip.
(function () {
  "use strict";

  if (location.href !== "chrome://browser/content/browser.xhtml") return;

  const TOOLTIP_MARKUP = `
    <div class="ai-sparkle-layer">
      <div class="sparkle-icon"></div>
      <div class="sparkle-icon"></div>
      <div class="sparkle-icon"></div>
      <div class="sparkle-icon"></div>
      <div class="sparkle-icon"></div>
    </div>
    <div class="card-status">Tooltip Status</div>
    <div class="card-title">Tooltip Title</div>
    <div class="card-original-filename">Original Filename</div>
    <div class="card-progress">Tooltip Progress</div>
    <div class="card-filesize">File Size</div>
    <div class="tooltip-buttons-container">
      <span class="card-undo-button" title="Undo Rename" tabindex="0" role="button">↩</span>
      <span class="card-close-button" title="Close" tabindex="0" role="button">✕</span>
    </div>
    <div class="tooltip-tail"></div>
  `;

  /**
   * Keep the card in the sidebar column, directly after the media toolbar,
   * so showing it pushes that toolbar up instead of painting over it.
   * @param {HTMLElement} container
   * @returns {boolean}
   */
  function mountTooltipContainer(container) {
    const media = document.getElementById("zen-media-controls-toolbar");
    if (media?.parentNode) {
      if (container.previousElementSibling !== media) {
        media.parentNode.insertBefore(container, media.nextSibling);
      }
      return true;
    }
    const toolbar = document.getElementById("TabsToolbar");
    const foot = document.getElementById("zen-sidebar-foot-buttons");
    if (!toolbar) return false;
    if (foot?.parentNode === toolbar) {
      if (container.nextElementSibling !== foot) toolbar.insertBefore(container, foot);
    } else if (container.parentNode !== toolbar) {
      toolbar.appendChild(container);
    }
    return true;
  }

  window.zenTidyDownloadsDownloadUi = {
    mountTooltipContainer,
    /**
     * @param {Object} ctx
     * @param {function} ctx.debugLog
     * @param {function} ctx.getFocusedKey
     * @param {function} ctx.onClose
     * @param {function} ctx.onUndo
     */
    init(ctx) {
      const { debugLog, getFocusedKey, onClose, onUndo } = ctx;

      let container = document.getElementById("userchrome-download-cards-container");
      let tooltip = container?.querySelector(".master-tooltip") || null;

      if (!container) {
        container = document.createElement("div");
        container.id = "userchrome-download-cards-container";
        tooltip = document.createElement("div");
        tooltip.className = "details-tooltip master-tooltip";
        tooltip.innerHTML = TOOLTIP_MARKUP;
        container.appendChild(tooltip);
      }
      mountTooltipContainer(container);

      const closeBtn = tooltip.querySelector(".card-close-button");
      if (closeBtn && !closeBtn.dataset.tidyBound) {
        closeBtn.dataset.tidyBound = "true";
        const handleClose = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const key = getFocusedKey();
          if (key) onClose(key);
        };
        closeBtn.addEventListener("click", handleClose);
        closeBtn.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") handleClose(event);
        });
      }

      const undoBtn = tooltip.querySelector(".card-undo-button");
      if (undoBtn && !undoBtn.dataset.tidyBound) {
        undoBtn.dataset.tidyBound = "true";
        const handleUndo = async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const key = getFocusedKey();
          if (key) await onUndo(key);
        };
        undoBtn.addEventListener("click", handleUndo);
        undoBtn.addEventListener("keydown", async (event) => {
          if (event.key === "Enter" || event.key === " ") await handleUndo(event);
        });
      }

      debugLog?.("Rename tooltip shell ready");

      return {
        getDownloadCardsContainer: () => container,
        getMasterTooltip: () => tooltip
      };
    }
  };
})();
