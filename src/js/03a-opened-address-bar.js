  // The opened address bar lined up with where its text was as it was clicked (or with its
  // place at the top), kept inside the window, and reaching up to the window's top edge.
  // Used elsewhere: noteUrlbarPressed, rememberClosedText, alignOpenedUrlbarSoon.

  // (the closed text's place counts if taken as the bar was clicked, and the click if
  // it's this recent as the bar opens)
  const CLOSED_TEXT_FRESH_MS = 100;
  const OPENED_BY_CLICK_MS = 1500;
  // (passes after the bar opens, for late layout changes)
  const ALIGN_AGAIN_AT = [60, 200];

  // How far the opened bar's been moved, down and across; where the closed text was, and
  // when (closedTextRect); and when the bar was last pressed
  let openOffset = 0;
  let openOffsetX = 0;
  let closedTextRect = null;
  let clickedUrlbarAt = 0;

  // (29, as the bar's pressed)
  function noteUrlbarPressed() {
    clickedUrlbarAt = Date.now();
  }

  function desiredOpenTop() {
    return parseFloat(getComputedStyle(root).getPropertyValue("--zia-urlbar-open-top")) || 0;
  }

  function rememberClosedText() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    if (!urlbar || urlbar.hasAttribute("breakout-extend") || root.getAttribute("zia-split") === "true") {
      return;
    }
    // At the bottom, the opened pop-up is pinned by its bottom edge to where
    // the closed bar sits, so it grows upwards instead of off the screen.
    const bar = urlbar.getBoundingClientRect();
    if (bar.width) {
      root.style.setProperty("--zia-url-left", `${Math.round(bar.left)}px`);
      root.style.setProperty("--zia-url-width", `${Math.round(bar.width)}px`);
      root.style.setProperty("--zia-url-bottom", `${Math.round(window.innerHeight - bar.bottom)}px`);
    }
    const title = document.getElementById("zia-url-title");
    const input = urlbar.querySelector(".urlbar-input");
    const titleRect = title?.getBoundingClientRect();
    const rect = titleRect?.width ? titleRect : input?.getBoundingClientRect();
    if (rect?.width) {
      closedTextRect = { left: rect.left, centerY: rect.top + rect.height / 2, at: Date.now() };
    }
  }

  function alignOpenedUrlbar() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    const single = root.getAttribute("zen-single-toolbar") === "true";
    matchClosedWidth(urlbar, single);
    // (and in the sidebar, with Zen's single toolbar, it opens where Zen puts it: moved to
    // keep the text where it was, it went past the window's left edge)
    if (urlbar) {
      setStyle(urlbar, "--zia-pop-reach-top", null);
    }
    if ((urlbar?.getAttribute("zen-floating-urlbar") === "true" && !urlbarAtBottom()) || single) {
      openOffset = 0;
      openOffsetX = 0;
      root.style.setProperty("--zia-urlbar-open-offset", "0px");
      root.style.setProperty("--zia-urlbar-open-offset-x", "0px");
      return;
    }
    if (!urlbar?.hasAttribute("breakout-extend")) {
      return;
    }
    // Only while it's shown over the window: a modal dialog (Cmd+Q's quit or close, say)
    // takes every pop-up down, the opened bar too, while it stays marked opened, and measured
    // there, back in the toolbar, it was moved further out of place each time
    if (urlbar.matches?.("[popover]") && !urlbar.matches(":popover-open")) {
      return;
    }
    if (root.getAttribute("zia-split") === "true") {
      return;
    }
    const input = urlbar.querySelector(".urlbar-input");
    const inputRect = input?.getBoundingClientRect();
    if (keepTextWhereClicked(urlbar, inputRect)) {
      return;
    }

    const top = urlbar.getBoundingClientRect().top;
    const diff = desiredOpenTop() - top;
    if (Math.abs(diff) > 0.5) {
      openOffset += diff;
      root.style.setProperty("--zia-urlbar-open-offset", `${openOffset}px`);
    }
    reachWindowTop(urlbar);
  }

  // Opened as wide as the closed bar: Zen measures that as the layout changes, but not
  // as compact mode takes the sidebar away, so it opened at its width beside the sidebar
  function matchClosedWidth(urlbar, single) {
    const container = document.getElementById("urlbar-container");
    if (urlbar?.hasAttribute("breakout-extend") && urlbar.getAttribute("zen-floating-urlbar") !== "true" && !single && container) {
      const width = `${container.getBoundingClientRect().width}px`;
      if (width !== "0px" && urlbar.style.getPropertyValue("--urlbar-width") !== width) {
        urlbar.style.setProperty("--urlbar-width", width);
      }
    }
  }

  // At the bottom the pop-up grows upwards from the bar, so the text always
  // stays where it was, however the bar was opened. True if it was moved so.
  function keepTextWhereClicked(urlbar, inputRect) {
    // (lined up only with where the text was at that click: taken earlier, say before compact
    // mode moved the bar, or with Zen's new tab bar still open as it was clicked, the old
    // spot sent the pop-up up and to the left)
    const fresh = !!closedTextRect && (urlbarAtBottom() || clickedUrlbarAt - closedTextRect.at < CLOSED_TEXT_FRESH_MS);
    const openedByClick = (urlbarAtBottom() || Date.now() - clickedUrlbarAt < OPENED_BY_CLICK_MS) && fresh;
    // (with the text centred, it's kept where it was by its centring, watchCenteredAddress:
    // lined up by the left of its box as well, the opened pop-up went off to the left, #515)
    const centred =
      Services.prefs.getBoolPref("zia.urlbar.center-text", false) &&
      !Services.prefs.getBoolPref("zia.urlbar.center-text.pop-up-left", false);
    if (!openedByClick && openOffsetX) {
      openOffsetX = 0;
      root.style.setProperty("--zia-urlbar-open-offset-x", "0px");
    }
    if (!openedByClick || !inputRect?.width) {
      return false;
    }
    const dx = centred ? -openOffsetX : closedTextRect.left - inputRect.left;
    const dy = closedTextRect.centerY - (inputRect.top + inputRect.height / 2);
    if (Math.abs(dx) > 0.5) {
      openOffsetX += dx;
      root.style.setProperty("--zia-urlbar-open-offset-x", `${openOffsetX}px`);
    }
    if (Math.abs(dy) > 0.5) {
      openOffset += dy;
      root.style.setProperty("--zia-urlbar-open-offset", `${openOffset}px`);
    }
    if (!urlbarAtBottom()) {
      keepOpenedUrlbarInWindow(urlbar);
    }
    reachWindowTop(urlbar);
    return true;
  }

  // Moved to keep the text where it was, the pop-up stays inside the window: with the page
  // edge to edge the bar sits against the window's edge, and the bigger pop-up round the
  // same text went past it and was cut off
  function keepOpenedUrlbarInWindow(urlbar) {
    const box = urlbar.getBoundingClientRect();
    if (!box.width) {
      return;
    }
    const dy = box.top < 0 ? -box.top : 0;
    const dx = box.left < 0 ? -box.left : box.right > window.innerWidth ? window.innerWidth - box.right : 0;
    if (dy > 0.5) {
      openOffset += dy;
      root.style.setProperty("--zia-urlbar-open-offset", `${openOffset}px`);
    }
    if (Math.abs(dx) > 0.5) {
      openOffsetX += dx;
      root.style.setProperty("--zia-urlbar-open-offset-x", `${openOffsetX}px`);
    }
  }

  // The pop-up at the top of the window reaches up to its top edge, as Dia's does: it stopped
  // the card's gap short of it. Its background grows up into that gap, so the address and
  // the results stay where they are. Not at the bottom, in the sidebar or floating.
  function reachWindowTop(urlbar) {
    const top = urlbar.getBoundingClientRect().top;
    const reach = !urlbarAtBottom() && top > 0 && top < 24 ? top : 0;
    setStyle(urlbar, "--zia-pop-reach-top", reach ? `${reach}px` : null);
  }

  function alignOpenedUrlbarSoon() {
    // Straight away, before the opened bar is first drawn, so the text doesn't
    // visibly jump; the later passes only catch late layout changes.
    alignOpenedUrlbar();
    requestAnimationFrame(alignOpenedUrlbar);
    // (not cancelled: each measures the bar as it is then)
    for (const ms of ALIGN_AGAIN_AT) {
      setTimeout(alignOpenedUrlbar, ms);
    }
  }
