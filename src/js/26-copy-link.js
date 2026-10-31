  // Copying a tab's link: the address bar's paperclip, popping into a tick once copied (and
  // the hover card's Copy link, 27).
  // Used elsewhere: inSplit, copyLink, COPY_ICON, showCopiedIcon, showCopied, addCopyLinkButton.

  const POP_OUT_MS = 130;
  const TICK_POP_IN_MS = 380;
  const PAPERCLIP_POP_IN_MS = 320;
  const COPIED_SHOWN_MS = 1200;

  const inSplit = (tab) => !!tab?.group?.hasAttribute?.("split-view-group");

  function copyLink(tab) {
    const uri = tab?.linkedBrowser?.currentURI;
    if (!uri || !/^https?$/.test(uri.scheme)) {
      return;
    }
    if (tab === gBrowser.selectedTab && typeof window.gZenCommonActions?.copyCurrentURLToClipboard === "function") {
      window.gZenCommonActions.copyCurrentURLToClipboard();
      return;
    }
    Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(uri.displaySpec);
    try {
      window.gZenUIManager?.showToast?.("zen-copy-current-url-confirmation");
    } catch (err) {
      noteError("copy link: copyLink", err);
    }
  }

  // Copying pops the paperclip into a tick: the paperclip shrinks, tilts
  // and fades, then the tick springs in, running a touch past full size.
  // After a moment the tick pops back into the paperclip the same way.
  const POP_SPRING = "cubic-bezier(0.3, 1.4, 0.5, 1)";
  const COPIED_ICON = "chrome://sine/content/zia/icons/ui/check.svg";
  const COPY_ICON = "chrome://sine/content/zia/icons/ui/paperclip.svg";

  function popIcon(icon, toTick, swap) {
    icon?.ziaPop?.cancel();
    if (typeof icon?.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      swap();
      return;
    }
    const out = icon.animate(
      toTick
        ? [{ opacity: 1, scale: 1, rotate: "0deg" }, { opacity: 0, scale: 0.35, rotate: "-40deg" }]
        : [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.5 }],
      { duration: POP_OUT_MS, easing: "ease-in", fill: "forwards" }
    );
    icon.ziaPop = out;
    out.finished.then(
      () => {
        swap();
        icon.ziaPop = icon.animate(
          toTick
            ? [
                { opacity: 0, scale: 0.35, rotate: "25deg" },
                { opacity: 1, scale: 1.18, rotate: "0deg", offset: 0.6 },
                { opacity: 1, scale: 1, rotate: "0deg" },
              ]
            : [{ opacity: 0, scale: 0.5, rotate: "-20deg" }, { opacity: 1, scale: 1, rotate: "0deg" }],
          { duration: toTick ? TICK_POP_IN_MS : PAPERCLIP_POP_IN_MS, easing: POP_SPRING }
        );
        out.cancel();
      },
      () => {}
    );
  }

  // The icon is an <img> (hover card, split pane bar) or the address bar
  // button's <image>, whose picture comes from CSS on [zia-copied].
  function showCopiedIcon(button, icon) {
    const set = (copied) => () => {
      button.toggleAttribute("zia-copied", copied);
      if (icon?.localName === "img") {
        icon.setAttribute("src", copied ? COPIED_ICON : COPY_ICON);
      }
    };
    popIcon(icon, true, set(true));
    clearTimeout(button.ziaCopiedTimer);
    button.ziaCopiedTimer = setTimeout(() => popIcon(icon, false, set(false)), COPIED_SHOWN_MS);
  }

  function showCopied(button) {
    showCopiedIcon(button, button.querySelector(button.localName === "button" ? "img" : "image"));
  }

  // The paperclip goes beside Zen's site settings button, which Zen adds
  // to the address bar itself, sometimes only after Zia has started (with
  // Zia just installed into an open window, say); until then Zia waits for
  // it, as Zen's own copy button is hidden for the paperclip (zia.css)
  function addCopyLinkButton() {
    if (document.getElementById("zia-copy-link-button")) {
      return;
    }
    const siteData = document.getElementById("zen-site-data-icon-button");
    if (!siteData) {
      waitForSiteDataButton();
      return;
    }
    const button = makeCopyLinkButton();
    siteData.before(button);
    // As faint as the site settings icon beside it (a fixed see-through
    // level); its colour follows the toolbar in CSS.
    const siteIcon = siteData.querySelector("image");
    if (siteIcon) {
      const style = getComputedStyle(siteIcon);
      button.firstChild.style.fillOpacity = style.fillOpacity;
      button.firstChild.style.opacity = style.opacity;
    }
    showCopyLinkOnWebsites(button);
  }

  function waitForSiteDataButton() {
    const urlbar = document.getElementById("urlbar");
    if (!urlbar || addCopyLinkButton.waiting) {
      return;
    }
    addCopyLinkButton.waiting = new MutationObserver(() => {
      if (document.getElementById("zen-site-data-icon-button")) {
        addCopyLinkButton.waiting.disconnect();
        safely("addCopyLinkButton", addCopyLinkButton);
      }
    });
    addCopyLinkButton.waiting.observe(urlbar, { childList: true, subtree: true });
  }

  function makeCopyLinkButton() {
    const button = document.createXULElement("hbox");
    button.id = "zia-copy-link-button";
    button.className = "urlbar-page-action";
    button.setAttribute("role", "button");
    button.setAttribute("tooltiptext", "Copy link");
    const icon = document.createXULElement("image");
    icon.className = "urlbar-icon";
    button.appendChild(icon);
    button.addEventListener("click", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.stopPropagation();
      try {
        copyLink(gBrowser.selectedTab);
        showCopied(button);
      } catch (err) {
        console.error("[Zia] Copy link failed:", err);
      }
    });
    return button;
  }

  // Only a website's link is copied, so the button shows only there
  function showCopyLinkOnWebsites(button) {
    const update = () => {
      const uri = gBrowser.selectedBrowser?.currentURI;
      button.hidden = !uri || !/^https?$/.test(uri.scheme);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", update);
    gBrowser.addProgressListener({
      onLocationChange: (progress) => {
        if (progress.isTopLevel) {
          update();
        }
      },
      QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),
    });
    update();
  }

