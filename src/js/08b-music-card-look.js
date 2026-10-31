  // ---------- The music card's look: the progress ring, the favicon tile, the artwork's flip,
  // the time left, and which of a page's artworks it shows.
  // Used elsewhere: SVG_NS, ensureRing, showFaviconTile, flipArtwork, showTimeLeft, watchTimeLeft,
  // bestArtwork.

  const FLIP_OUT_MS = 200;
  const FLIP_IN_MS = 380;

  const SVG_NS = "http://www.w3.org/2000/svg";
  let ringCount = 0;

  function ensureRing(button) {
    if (!button || button.querySelector(":scope > .zia-ring")) {
      return;
    }
    const id = `zia-ring-gradient-${++ringCount}`;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "zia-ring");
    svg.setAttribute("viewBox", "0 0 46 46");
    svg.setAttribute("aria-hidden", "true");

    const make = (tag, attrs, parent) => {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attrs)) {
        el.setAttribute(name, value);
      }
      parent.appendChild(el);
      return el;
    };
    const gradient = make("linearGradient", { id, x1: "0", y1: "0", x2: "1", y2: "1" }, make("defs", {}, svg));
    make("stop", { offset: "0", style: "stop-color: var(--zia-media-glow-a)" }, gradient);
    make("stop", { offset: "1", style: "stop-color: var(--zia-media-glow-b)" }, gradient);
    // starts top middle and runs clockwise, as progress reads; round where this
    // Firefox can't draw a squircle (as the artwork is then)
    const squircle = typeof CSS === "undefined" || CSS.supports("corner-shape", "round");
    const shape = { d: squircle ? "M23.00 1.00 L30.50 1.00 L35.98 1.09 L38.33 1.38 L40.08 1.85 L41.47 2.53 L42.59 3.41 L43.47 4.53 L44.15 5.92 L44.62 7.67 L44.91 10.02 L45.00 15.50 L45.00 30.50 L44.91 35.98 L44.62 38.33 L44.15 40.08 L43.47 41.47 L42.59 42.59 L41.47 43.47 L40.08 44.15 L38.33 44.62 L35.98 44.91 L30.50 45.00 L15.50 45.00 L10.02 44.91 L7.67 44.62 L5.92 44.15 L4.53 43.47 L3.41 42.59 L2.53 41.47 L1.85 40.08 L1.38 38.33 L1.09 35.98 L1.00 30.50 L1.00 15.50 L1.09 10.02 L1.38 7.67 L1.85 5.92 L2.53 4.53 L3.41 3.41 L4.53 2.53 L5.92 1.85 L7.67 1.38 L10.02 1.09 L15.50 1.00 L23.00 1.00 Z" : "M23 1 L35 1 A10 10 0 0 1 45 11 L45 35 A10 10 0 0 1 35 45 L11 45 A10 10 0 0 1 1 35 L1 11 A10 10 0 0 1 11 1 Z", fill: "none", "stroke-width": "2", pathLength: "100" };
    make("path", { ...shape, class: "zia-ring-track" }, svg);
    make("path", {
      ...shape,
      class: "zia-ring-fill",
      stroke: `url(#${id})`,
      "stroke-linecap": "round",
      "stroke-dasharray": "0 100",
      "stroke-opacity": "0",
    }, svg);
    button.appendChild(svg);
  }

  const faviconTints = new Map();

  function tintFromColors(colors) {
    const m = String(colors?.[0] || "").match(/\d+(\.\d+)?/g);
    if (!m) {
      return "rgb(44, 44, 46)";
    }
    const [r, g, b] = m.map(Number).map((v) => Math.round(v * 0.32 + 26));
    return `rgb(${r}, ${g}, ${b})`;
  }

  async function showFaviconTile(card, button, art) {
    if (art) {
      button.removeAttribute("zia-favicon");
      button.removeAttribute("zia-initial");
      return;
    }
    const tab = card.browser && gBrowser.getTabForBrowser(card.browser);
    let icon =
      tab?.getAttribute("image") ||
      (tab && gBrowser.getIcon?.(tab)) ||
      card.browser?.mIconURL ||
      (card.browser?.currentURI?.spec ? `page-icon:${card.browser.currentURI.spec}` : "");
    if (/defaultFavicon|globe/i.test(icon)) {
      icon = "";
    }
    if (!icon) {
      let host = "";
      try {
        host = card.browser?.currentURI?.displayHost?.replace(/^www\./, "") || "";
      } catch (err) {
        host = "";
      }
      button.setAttribute("zia-favicon", "");
      button.setAttribute("zia-initial", (host[0] || "♪").toUpperCase());
      button.style.removeProperty("--zia-media-favicon");
      button.style.setProperty("--zia-favicon-tint", "rgb(52, 52, 56)");
      return;
    }
    button.removeAttribute("zia-initial");
    button.setAttribute("zia-favicon", icon);
    button.style.setProperty("--zia-media-favicon", `url("${icon.replace(/"/g, "%22")}")`);
    let tint = faviconTints.get(icon);
    if (!tint) {
      tint = tintFromColors(await cachedArtColors(icon));
      faviconTints.set(icon, tint);
    }
    if (button.getAttribute("zia-favicon") === icon) {
      button.style.setProperty("--zia-favicon-tint", tint);
    }
  }

  function flipArtwork(button, swap) {
    const icon = button.querySelector(":scope > .toolbarbutton-icon") || button.querySelector("image");
    if (!icon || typeof icon.animate !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      swap();
      return;
    }
    button.__ziaFlip?.cancel();
    const turnAway = icon.animate(
      [{ transform: "perspective(240px) rotateY(0deg)" }, { transform: "perspective(240px) rotateY(90deg)" }],
      { duration: FLIP_OUT_MS, easing: "cubic-bezier(0.55, 0, 1, 0.45)", fill: "forwards" }
    );
    button.__ziaFlip = turnAway;
    turnAway.finished
      .then(() => {
        swap();
        const turnBack = icon.animate(
          [
            { transform: "perspective(240px) rotateY(-90deg)" },
            { transform: "perspective(240px) rotateY(8deg)", offset: 0.75 },
            { transform: "perspective(240px) rotateY(0deg)" },
          ],
          { duration: FLIP_IN_MS, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }
        );
        button.__ziaFlip = turnBack;
        turnAway.cancel();
      })
      .catch(() => {});
  }

  function setRing(card, fraction) {
    const fill = card.focusButton?.querySelector(".zia-ring-fill");
    if (!fill) {
      return;
    }
    const pct = Math.max(0, Math.min(1, fraction || 0)) * 100;
    fill.style.strokeDasharray = pct > 0.2 ? `${pct.toFixed(2)} 100` : "0 100";
    fill.style.strokeOpacity = pct > 0.2 ? "1" : "0";
  }

  // (a "length" this long, in seconds, is a live stream's stand-in, not a real one)
  const ENDLESS_SECONDS = 900_000;

  function showTimeLeft(card) {
    const durationEl = card.durationEl;
    const bar = card.progressBar;
    if (!bar || !card.duration || card.duration >= ENDLESS_SECONDS) {
      setRing(card, 0);
      return;
    }
    const fraction = Number(bar.value) / 100;
    setRing(card, fraction);
    if (durationEl) {
      const played = fraction * card.duration;
      durationEl.textContent = `-${card.formatSecondsToTime(Math.max(0, card.duration - played))}`;
    }
  }

  function watchTimeLeft(card) {
    const el = card.currentTimeEl;
    if (!el || el.__ziaTimeLeft) {
      return;
    }
    el.__ziaTimeLeft = true;
    new MutationObserver(() => showTimeLeft(card)).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  const isStandInArtwork = (src) =>
    !src || /^(jar|chrome|resource|moz-src):/i.test(src) || /defaultFavicon|globe/i.test(src);

  function bestArtwork(artwork) {
    if (!Array.isArray(artwork)) {
      return "";
    }
    artwork = artwork.filter((a) => !isStandInArtwork(a?.src));
    if (!artwork.length) {
      return "";
    }
    const area = (a) =>
      Math.max(
        0,
        ...String(a.sizes || "")
          .split(/\s+/)
          .map((size) => size.split("x").reduce((w, h) => (parseInt(w) || 0) * (parseInt(h) || 0)))
      );
    return artwork.sort((x, y) => area(y) - area(x))[0]?.src || "";
  }
