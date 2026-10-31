  // The screenshot buttons as Zia's tiles: flat, a squircle, a hairline, lighter
  // on hover, as the site panel's (25c-screenshots.css draws the card round
  // them). They're drawn inside the element, out of reach of chrome.css, so
  // their look is put in there as each one appears. Full page, Firefox's
  // primary button, is a tile like the other rather than a bright one.
  // Used elsewhere: watchScreenshotButtons.
  const SCREENSHOT_BUTTON_RULES = `
    moz-button-group {
      gap: 6px !important;
    }
    .screenshot-button,
    .mini-window-option {
      appearance: none !important;
      margin: 0 !important;
      border: none !important;
      border-radius: var(--zia-glass-button-radius, 10px) !important;
      corner-shape: var(--zia-squircle, round) !important;
      background-color: color-mix(in srgb, currentColor 7%, transparent) !important;
      box-shadow: inset 0 0 0 0.5px color-mix(in srgb, currentColor 6%, transparent) !important;
      color: inherit !important;
      font-weight: 500 !important;
      stroke: color-mix(in srgb, currentColor 30%, transparent) !important;
      transition: background-color 0.12s ease, transform 0.12s ease !important;
    }
    .screenshot-button:hover,
    .mini-window-option:hover {
      background-color: color-mix(in srgb, currentColor 12%, transparent) !important;
    }
    .screenshot-button:hover:active,
    .mini-window-option:hover:active {
      background-color: color-mix(in srgb, currentColor 20%, transparent) !important;
      transform: scale(0.97);
    }
    .screenshot-button:focus-visible,
    .mini-window-option:focus-visible {
      outline: 2px solid color-mix(in srgb, currentColor 40%, transparent) !important;
      outline-offset: 1px !important;
    }
    .mini-window-option[data-default] {
      background-color: color-mix(in srgb, currentColor 12%, transparent) !important;
    }
  `;

  // The preview of a shot, with its Retry, Close, Copy and Download, is a page of its own
  // in a dialog over the tab, which chrome.css doesn't reach: Zia's look is put in as it's
  // made (zia-screenshots.css; a sheet put in this way isn't held back by the page's rules)
  const SCREENSHOT_PREVIEW_URL = "chrome://browser/content/screenshots/screenshots-preview.html";
  // (how long after the overlay comes or goes the toolbar's colour is read again)
  const SCREENSHOT_SAMPLE_MS = 100;
  let screenshotSheet = null;

  function styleScreenshotButtons(el) {
    const shadow = el?.shadowRoot;
    if (!shadow || shadow.ziaStyled) {
      return;
    }
    try {
      if (!screenshotSheet) {
        screenshotSheet = new window.CSSStyleSheet();
        screenshotSheet.replaceSync(SCREENSHOT_BUTTON_RULES);
      }
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, screenshotSheet];
      shadow.ziaStyled = true;
    } catch (err) {
      noteError("screenshots: buttons", err);
    }
  }

  // (each put in the window as a screenshot starts, over the page or, in older
  // Firefox, in the window's pop-ups; drawn inside as it goes in, so styled after)
  function findScreenshotButtons(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    if (node.localName === "screenshots-buttons") {
      styleScreenshotButtons(node);
    } else if (node.firstElementChild) {
      node.querySelectorAll("screenshots-buttons").forEach(styleScreenshotButtons);
    }
  }

  // The toolbar's colour read again as a screenshot starts and ends, as on a scroll:
  // its overlay darkens the page, and the toolbar kept the page's colour (#477).
  // (Firefox shows and hides the buttons' panel, and the overlay with it)
  function onScreenshotRecords(records) {
    for (const record of records) {
      record.addedNodes.forEach(findScreenshotButtons);
      const panels = record.type === "childList" ? [...record.addedNodes] : [record.target];
      if (panels.some((node) => node.classList?.contains("screenshotsPagePanel"))) {
        // (not kept: reading the colour once more is harmless)
        setTimeout(requestScrollSample, SCREENSHOT_SAMPLE_MS);
      }
    }
  }

  function styleScreenshotPreview(doc) {
    const win = doc?.defaultView;
    if (!doc?.documentURI?.startsWith(SCREENSHOT_PREVIEW_URL) || win?.browsingContext?.topChromeWindow !== window) {
      return;
    }
    try {
      win.windowUtils.loadSheetUsingURIString("chrome://sine/content/zia/zia-screenshots.css", win.windowUtils.AUTHOR_SHEET);
    } catch (err) {
      noteError("screenshots: preview", err);
    }
  }

  function watchScreenshotButtons() {
    const observer = new MutationObserver(onScreenshotRecords);
    for (const id of ["tabbrowser-tabpanels", "mainPopupSet"]) {
      const where = document.getElementById(id);
      if (where) {
        observer.observe(where, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
      }
    }
    window.addEventListener("unload", () => observer.disconnect());
    document.querySelectorAll("screenshots-buttons").forEach(styleScreenshotButtons);

    Services.obs.addObserver(styleScreenshotPreview, "document-element-inserted");
    window.addEventListener("unload", () => Services.obs.removeObserver(styleScreenshotPreview, "document-element-inserted"), { once: true });
  }
