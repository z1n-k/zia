  // What a tab's buttons say they do. On a tab holding a glance the close
  // shuts the glance (28g-glance-thumbs.js) and the minus lets the glance
  // go, and on a pinned tab the minus only lets the tab go: nothing
  // switches, though Zen's word for the minus is "Unload and switch to
  // tab" either way. The tips are reworded while that wouldn't be true,
  // and handed back to Fluent when it would.
  function watchButtonTooltips() {
    const TIP_MARK = "zia-tip";
    const originals = new WeakMap();

    const retipButton = (button, text) => {
      if (!button) {
        return;
      }
      if (text) {
        if (!originals.has(button)) {
          originals.set(button, button.getAttribute("tooltiptext"));
        }
        if (button.getAttribute("tooltiptext") !== text) {
          button.setAttribute("tooltiptext", text);
        }
        button.setAttribute(TIP_MARK, "true");
        return;
      }
      if (!button.hasAttribute(TIP_MARK)) {
        return;
      }
      button.removeAttribute(TIP_MARK);
      const id = button.getAttribute("data-l10n-id");
      let args = {};
      try {
        args = JSON.parse(button.getAttribute("data-l10n-args") || "{}");
      } catch (err) {
        args = {};
      }
      if (id && document.l10n) {
        document.l10n.setAttributes(button, id, args);
      } else {
        setAttr(button, "tooltiptext", originals.get(button));
      }
      originals.delete(button);
    };

    const retip = (tab) => {
      if (!tab?.classList?.contains("tabbrowser-tab")) {
        return;
      }
      const glance = tab.hasAttribute("zen-glance-tab") || !!glanceOnTab(tab);
      retipButton(
        tab.querySelector(":scope > .tab-stack > .tab-content > .tab-close-button"),
        glance ? "Close glance" : null
      );
      retipButton(
        tab.querySelector(":scope > .tab-stack > .tab-content > .tab-reset-button"),
        glance ? "Unload glance" : tab.pinned ? "Unload tab" : null
      );
    };

    const retipAll = () => {
      for (const tab of gBrowser.tabs) {
        retip(tab);
      }
    };

    // Fluent rewrites a button's tip when its args change (a multiselect
    // growing, say), so the rewording is put back whenever the tip or the
    // marks it's set off change. (A tip is only set when it differs, so
    // this settles.)
    new MutationObserver(retipAll).observe(gBrowser.tabContainer, {
      subtree: true,
      attributes: true,
      attributeFilter: ["zen-glance-tab", "pinned", "tooltiptext", "data-l10n-args"],
    });
    for (const type of ["TabOpen", "TabPinned", "TabUnpinned"]) {
      gBrowser.tabContainer.addEventListener(type, retipAll);
    }
    retipAll();
  }

  // The spaces at the foot of the sidebar and the add-ons along the top
  // get the cards tabs get: a beat on the first hover, then the next one
  // is there at once, so a sweep across them reads them all, as Arc does
  // (#339). Their own tips are stashed so only the card shows — the stash
  // follows, as Zen rewrites a space's tip when the space is renamed and
  // an add-on on its own changes. What's in a pop-up or a menu keeps
  // Firefox's tip.
  function watchTipCards() {
    const TIPPED =
      "toolbarbutton[zen-workspace-id], toolbarbutton.webextension-browser-action, " +
      "toolbarbutton[data-extensionid], #unified-extensions-button";
    const TIP_ATTR = "zia-tip-text";
    // longer than a tab's grace: the row's gaps between buttons are wider
    const TIP_GRACE = 300;
    const inPopup = (el) => !!el.closest("popup, menupopup, panel, tooltip");

    const stash = (el) => {
      // an add-on's own tip can sit on a wrapper over the button (the
      // "unified-extensions-item" toolbaritem carries it too), and a tip
      // hunts up through ancestors, so the stash climbs to the toolbar
      for (let n = el; n && !inPopup(n); n = n.parentElement) {
        const text = n.getAttribute?.("tooltiptext");
        if (text !== null && text !== undefined) {
          if (text) {
            n.setAttribute(TIP_ATTR, text);
          }
          n.removeAttribute("tooltiptext");
        }
        if (n.matches?.("toolbar, #navigator-toolbox")) {
          break;
        }
      }
    };
    const stashUnder = (node) => {
      if (node?.matches?.(TIPPED)) {
        stash(node);
      }
      for (const el of node?.querySelectorAll?.(TIPPED) || []) {
        stash(el);
      }
    };
    // (the window itself, not the sidebar's box: the top row's add-ons
    // sit outside it. New buttons — an add-on installed, a space made —
    // are stashed as they land, and a tip Zen rewrites is re-stashed,
    // the wrapper's along with the button's.)
    stashUnder(document);
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          if (record.target?.matches?.(TIPPED) || record.target?.querySelector?.(TIPPED)) {
            stash(record.target);
          }
        } else {
          for (const node of record.addedNodes) {
            stashUnder(node);
          }
        }
      }
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["tooltiptext"] });

    let card = null;
    let current = null;
    let showTimer = 0;
    let hideTimer = 0;
    let closeTimer = 0;
    const CARD_OUT_MS = 120;
    const cardUp = () => card && !card.hidden && !card.hasAttribute("zia-closing");

    const place = (el) => {
      const box = el.getBoundingClientRect();
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      // below like a tip, unless there's no room: the spaces sit at the
      // window's foot, so theirs go above the icons
      const below = box.bottom + TAB_CARD_GAP + height <= window.innerHeight - TAB_CARD_GAP;
      const y = below ? box.bottom + TAB_CARD_GAP : box.top - height - TAB_CARD_GAP;
      const x = Math.max(
        TAB_CARD_GAP,
        Math.min(box.left + box.width / 2 - width / 2, window.innerWidth - width - TAB_CARD_GAP)
      );
      card.style.left = `${Math.round(x)}px`;
      card.style.top = `${Math.round(y)}px`;
      card.style.transformOrigin = `center ${below ? "top" : "bottom"}`;
    };

    const show = (el) => {
      const text =
        el.getAttribute(TIP_ATTR) ||
        el.getAttribute("tooltiptext") ||
        el.getAttribute("aria-label") ||
        el.getAttribute("label") ||
        "";
      if (!text.trim()) {
        return;
      }
      if (!card) {
        card = document.createElementNS(XHTML_NS, "div");
        card.id = "zia-tip-card";
        card.hidden = true;
        root.appendChild(card);
      }
      const wasUp = cardUp();
      current = el;
      card.textContent = text;
      card.hidden = false;
      place(el);
      clearTimeout(closeTimer);
      card.removeAttribute("zia-closing");
      if (wasUp) {
        card.setAttribute("zia-snap", "true");
        card.setAttribute("zia-open", "true");
        return;
      }
      card.removeAttribute("zia-snap");
      card.removeAttribute("zia-open");
      void card.offsetWidth;
      card.setAttribute("zia-open", "true");
    };

    const hide = () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      current = null;
      if (card && !card.hidden && !card.hasAttribute("zia-closing")) {
        card.removeAttribute("zia-snap");
        card.setAttribute("zia-closing", "true");
      }
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        if (card?.hasAttribute("zia-closing")) {
          card.hidden = true;
          card.removeAttribute("zia-closing");
          card.removeAttribute("zia-open");
        }
      }, CARD_OUT_MS);
    };

    const tippedTarget = (node) => {
      const el = node?.closest?.(TIPPED);
      if (!el || inPopup(el)) {
        return null;
      }
      // one that slipped past the watcher is stashed as it's hovered
      stash(el);
      return el;
    };

    // the covered button under the pointer, before its card is even up:
    // a native tip anchored to it — or to a wrapper around it — is shut
    // at the door, so a card and a Firefox tip never double up
    let hovered = null;
    const tipIsOurs = (trigger) => {
      if (!trigger) {
        return false;
      }
      if (tippedTarget(trigger)) {
        return true;
      }
      const el = hovered || current;
      return !!el && (el.contains(trigger) || trigger.contains(el));
    };
    window.addEventListener(
      "popupshowing",
      (event) => {
        const popup = event.target;
        if (popup?.localName !== "tooltip") {
          return;
        }
        if (tipIsOurs(popup.triggerNode || document.tooltipNode)) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );
    window.addEventListener(
      "popupshown",
      (event) => {
        const popup = event.target;
        if (popup?.localName === "tooltip" && tipIsOurs(popup.triggerNode || document.tooltipNode)) {
          popup.hidePopup?.();
        }
      },
      true
    );

    root.addEventListener("mouseover", (event) => {
      const el = tippedTarget(event.target);
      if (!el || el.contains(event.relatedTarget)) {
        return;
      }
      hovered = el;
      clearTimeout(hideTimer);
      if (el === current) {
        return;
      }
      clearTimeout(showTimer);
      if (current) {
        show(el);
        return;
      }
      showTimer = setTimeout(() => {
        if (el.isConnected && el.matches(":hover")) {
          show(el);
        }
      }, TAB_CARD_DELAY);
    });
    root.addEventListener("mouseout", (event) => {
      const el = tippedTarget(event.target);
      if (!el || el.contains(event.relatedTarget)) {
        return;
      }
      hovered = null;
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, TIP_GRACE);
    });
    for (const type of ["mousedown", "dragstart", "contextmenu", "popupshown"]) {
      window.addEventListener(type, () => hide(), true);
    }
    window.addEventListener("wheel", () => hide(), { passive: true, capture: true });
    window.addEventListener("blur", hide);
  }
