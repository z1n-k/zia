  // Tips: what a tab's buttons say they do, and the cards shown in place of the tips of
  // the spaces and add-ons.
  // Used elsewhere: watchButtonTooltips, watchTipCards.
  const TIP_MARK = "zia-tip";
  const TIPPED =
    "toolbarbutton[zen-workspace-id], toolbarbutton.webextension-browser-action, " +
    "toolbarbutton[data-extensionid], #unified-extensions-button";
  const TIP_ATTR = "zia-tip-text";
  // longer than a tab's grace: the row's gaps between buttons are wider
  const TIP_GRACE = 300;
  const TIP_CARD_OUT_MS = 120;

  // a reworded button's own tip, for when it's handed back
  const tipOriginals = new WeakMap();

  // The tip card and the button it's for, the covered button under the pointer (see
  // tipIsOurs), and the card's timers
  const tipCard = { card: null, current: null, hovered: null, showTimer: 0, hideTimer: 0, closeTimer: 0 };

  // What a tab's buttons say they do. On a tab holding a glance the close
  // shuts the glance (28g-glance-thumbs.js) and the minus lets the glance
  // go, and on a pinned tab the minus only lets the tab go: nothing
  // switches, though Zen's word for the minus is "Unload and switch to
  // tab" either way. The tips are reworded while that wouldn't be true,
  // and handed back to Fluent when it would.
  function watchButtonTooltips() {
    // Fluent rewrites a button's tip when its args change (a multiselect
    // growing, say), so the rewording is put back whenever the tip or the
    // marks it's set off change. (A tip is only set when it differs, so
    // this settles.)
    new MutationObserver(retipAllTabs).observe(gBrowser.tabContainer, {
      subtree: true,
      attributes: true,
      attributeFilter: ["zen-glance-tab", "pinned", "tooltiptext", "data-l10n-args"],
    });
    for (const type of ["TabOpen", "TabPinned", "TabUnpinned"]) {
      gBrowser.tabContainer.addEventListener(type, retipAllTabs);
    }
    retipAllTabs();
  }

  function retipButton(button, text) {
    if (!button) {
      return;
    }
    if (text) {
      if (!tipOriginals.has(button)) {
        tipOriginals.set(button, button.getAttribute("tooltiptext"));
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
      setAttr(button, "tooltiptext", tipOriginals.get(button));
    }
    tipOriginals.delete(button);
  }

  function retipTab(tab) {
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
  }

  function retipAllTabs() {
    for (const tab of gBrowser.tabs) {
      retipTab(tab);
    }
  }

  // The spaces at the foot of the sidebar and the add-ons along the top
  // get the cards tabs get: a beat on the first hover, then the next one
  // is there at once, so a sweep across them reads them all, as Arc does
  // (#339). Their own tips are stashed so only the card shows — the stash
  // follows, as Zen rewrites a space's tip when the space is renamed and
  // an add-on on its own changes. What's in a pop-up or a menu keeps
  // Firefox's tip.
  function watchTipCards() {
    // (the window itself, not the sidebar's box: the top row's add-ons
    // sit outside it. New buttons — an add-on installed, a space made —
    // are stashed as they land, and a tip Zen rewrites is re-stashed,
    // the wrapper's along with the button's.)
    stashTipsUnder(document);
    new MutationObserver(restashTips).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["tooltiptext"] });

    window.addEventListener("popupshowing", onTooltipShowing, true);
    window.addEventListener("popupshown", onTooltipShown, true);
    root.addEventListener("mouseover", onTipOver);
    root.addEventListener("mouseout", onTipOut);
    for (const type of ["mousedown", "dragstart", "contextmenu", "popupshown"]) {
      window.addEventListener(type, () => hideTipCard(), true);
    }
    window.addEventListener("wheel", () => hideTipCard(), { passive: true, capture: true });
    window.addEventListener("blur", hideTipCard);
  }

  function inPopup(el) {
    return !!el.closest("popup, menupopup, panel, tooltip");
  }

  function stashTip(el) {
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
  }

  function stashTipsUnder(node) {
    if (node?.matches?.(TIPPED)) {
      stashTip(node);
    }
    for (const el of node?.querySelectorAll?.(TIPPED) || []) {
      stashTip(el);
    }
  }

  function restashTips(records) {
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.target?.matches?.(TIPPED) || record.target?.querySelector?.(TIPPED)) {
          stashTip(record.target);
        }
      } else {
        for (const node of record.addedNodes) {
          stashTipsUnder(node);
        }
      }
    }
  }

  function placeTipCard(el) {
    const card = tipCard.card;
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
  }

  function showTipCard(el) {
    const text =
      el.getAttribute(TIP_ATTR) ||
      el.getAttribute("tooltiptext") ||
      el.getAttribute("aria-label") ||
      el.getAttribute("label") ||
      "";
    if (!text.trim()) {
      return;
    }
    if (!tipCard.card) {
      tipCard.card = document.createElementNS(XHTML_NS, "div");
      tipCard.card.id = "zia-tip-card";
      tipCard.card.hidden = true;
      root.appendChild(tipCard.card);
    }
    const card = tipCard.card;
    const wasUp = !card.hidden && !card.hasAttribute("zia-closing");
    tipCard.current = el;
    card.textContent = text;
    card.hidden = false;
    placeTipCard(el);
    clearTimeout(tipCard.closeTimer);
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
  }

  function hideTipCard() {
    const card = tipCard.card;
    clearTimeout(tipCard.showTimer);
    clearTimeout(tipCard.hideTimer);
    tipCard.current = null;
    if (card && !card.hidden && !card.hasAttribute("zia-closing")) {
      card.removeAttribute("zia-snap");
      card.setAttribute("zia-closing", "true");
    }
    clearTimeout(tipCard.closeTimer);
    tipCard.closeTimer = setTimeout(() => {
      if (tipCard.card?.hasAttribute("zia-closing")) {
        tipCard.card.hidden = true;
        tipCard.card.removeAttribute("zia-closing");
        tipCard.card.removeAttribute("zia-open");
      }
    }, TIP_CARD_OUT_MS);
  }

  function tippedTarget(node) {
    const el = node?.closest?.(TIPPED);
    if (!el || inPopup(el)) {
      return null;
    }
    // one that slipped past the watcher is stashed as it's hovered
    stashTip(el);
    return el;
  }

  // the covered button under the pointer, before its card is even up:
  // a native tip anchored to it — or to a wrapper around it — is shut
  // at the door, so a card and a Firefox tip never double up
  function tipIsOurs(trigger) {
    if (!trigger) {
      return false;
    }
    if (tippedTarget(trigger)) {
      return true;
    }
    const el = tipCard.hovered || tipCard.current;
    return !!el && (el.contains(trigger) || trigger.contains(el));
  }

  function onTooltipShowing(event) {
    const popup = event.target;
    if (popup?.localName !== "tooltip") {
      return;
    }
    if (tipIsOurs(popup.triggerNode || document.tooltipNode)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onTooltipShown(event) {
    const popup = event.target;
    if (popup?.localName === "tooltip" && tipIsOurs(popup.triggerNode || document.tooltipNode)) {
      popup.hidePopup?.();
    }
  }

  function onTipOver(event) {
    const el = tippedTarget(event.target);
    if (!el || el.contains(event.relatedTarget)) {
      return;
    }
    tipCard.hovered = el;
    clearTimeout(tipCard.hideTimer);
    if (el === tipCard.current) {
      return;
    }
    clearTimeout(tipCard.showTimer);
    if (tipCard.current) {
      showTipCard(el);
      return;
    }
    tipCard.showTimer = setTimeout(() => {
      if (el.isConnected && el.matches(":hover")) {
        showTipCard(el);
      }
    }, TAB_CARD_DELAY);
  }

  function onTipOut(event) {
    const el = tippedTarget(event.target);
    if (!el || el.contains(event.relatedTarget)) {
      return;
    }
    tipCard.hovered = null;
    clearTimeout(tipCard.showTimer);
    clearTimeout(tipCard.hideTimer);
    tipCard.hideTimer = setTimeout(hideTipCard, TIP_GRACE);
  }
