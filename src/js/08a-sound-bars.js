  // ---------- Sound bars: a playing tab's, and the music card's, in the artwork's colours
  // Four bars that move while sound plays and shrink to dots when muted, as SVG images
  // the CSS shows; clicking a tab's mutes it.
  // Used elsewhere: paintSoundBars, repaintSoundTabs, watchTabSoundBars.

  const soundBarCache = new Map();

  function lighten(color, amount = 0.35) {
    const m = String(color).match(/\d+(\.\d+)?/g);
    if (!m) {
      return "rgb(255, 255, 255)";
    }
    const [r, g, b] = m.map(Number).map((v) => Math.round(v + (255 - v) * amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  let soundBarToken = 0;
  // four bars, shrinking to dots when muted
  const BAR_X = [1.6, 5.2, 8.8, 12.4];
  const BAR_W = 2;
  const BAR_REST = [
    [4.5, 7],
    [2.5, 11],
    [3.5, 9],
    [5.25, 5.5],
  ];

  // still under reduced motion, unless the "always move" option is on
  const SOUND_BARS_ALWAYS_PREF = "zia.sound-bars.always-move";
  const soundBarsAlwaysMove = () => Services.prefs.getBoolPref(SOUND_BARS_ALWAYS_PREF, false);

  // dark in light mode: white bars went missing on the white selected tab
  const plainBarInk = () => (root.hasAttribute("zia-light") ? "rgb(28, 28, 32)" : "rgb(255, 255, 255)");
  let barInkWatched = false;
  function watchBarInk() {
    if (barInkWatched) {
      return;
    }
    barInkWatched = true;
    new MutationObserver(redrawSoundBars).observe(root, { attributes: true, attributeFilter: ["zia-light"] });
  }

  function soundBarImages(colors) {
    watchBarInk();
    const always = soundBarsAlwaysMove();
    const ink = plainBarInk();
    const key = `${colors ? colors.join("|") : ink}|${always}`;
    let images = soundBarCache.get(key);
    if (images) {
      return images;
    }
    const a = colors ? lighten(colors[0]) : ink;
    const b = colors ? lighten(colors[1]) : ink;
    const gradient = `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="1.6" y1="0" x2="14.4" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
    const image = (style, bars) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${gradient}${style}<g fill="url(#g)">${bars}</g></svg>`)}`;
    const resting = BAR_X.map((x, i) => `<rect x="${x}" y="${BAR_REST[i][0]}" width="${BAR_W}" height="${BAR_REST[i][1]}" rx="1"/>`).join("");
    const wave = image(
      `<style>rect{transform-box:fill-box;transform-origin:center;animation:grow .26s cubic-bezier(.2,.9,.3,1) both,z .6s .26s ease-in-out infinite alternate}` +
        [0.55, 0.68, 0.5, 0.74].map((d, i) => `.b${i}{animation-duration:.26s,${d}s;animation-delay:0s,${(0.26 + i * 0.05).toFixed(2)}s}`).join("") +
        `@keyframes grow{from{height:2px;y:7px}to{height:11px;y:2.5px}}` +
        `@keyframes z{from{transform:scaleY(.22)}to{transform:scaleY(1)}}` +
        (always ? "" : `@media (prefers-reduced-motion:reduce){rect{animation:none;transform:scaleY(.6)}}`) +
        `</style>`,
      BAR_X.map((x, i) => `<rect class="b${i}" x="${x}" y="2.5" width="${BAR_W}" height="11" rx="1"/>`).join("")
    );
    const dots = image(
      `<style>rect{animation:shrink .28s cubic-bezier(.4,0,.2,1) forwards}@keyframes shrink{to{height:${BAR_W}px;y:${8 - BAR_W / 2}px}}` +
        (always ? "" : `@media (prefers-reduced-motion:reduce){rect{animation-duration:1ms}}`) +
        `</style>`,
      resting
    );
    images = { waveData: wave, dotsData: dots, stillData: image("", resting) };
    soundBarCache.set(key, images);
    return images;
  }

  function freshSoundBars(colors) {
    const images = soundBarImages(colors);
    const n = ++soundBarToken;
    return {
      wave: `url("${images.waveData}#${n}")`,
      dots: `url("${images.dotsData}#${n}")`,
      still: `url("${images.stillData}")`,
    };
  }

  function applyCardSoundBars(element) {
    const fresh = freshSoundBars(element.__ziaColors ?? null);
    element.style.setProperty("--zia-sound-wave", fresh.wave);
    element.style.setProperty("--zia-sound-still", fresh.still);
    element.style.setProperty("--zia-sound-muted", fresh.dots);
  }

  function watchCardSoundState(element) {
    if (element.__ziaSoundWatch) {
      return;
    }
    element.__ziaSoundWatch = true;
    let last = "";
    new MutationObserver(() => {
      const state = `${element.classList.contains("playing")}|${element.hasAttribute("muted")}`;
      if (state !== last) {
        last = state;
        applyCardSoundBars(element);
      }
    }).observe(element, { attributes: true, attributeFilter: ["class", "muted"] });
  }

  const soundBarCards = new Set();

  function paintSoundBars(card, colors) {
    soundBarCards.add(card);
    card.__ziaColors = colors;
    applyCardSoundBars(card);
    watchCardSoundState(card);
    repaintSoundTabs();
  }

  // a tab's bars are drawn before its player's colours are known: recolour them as
  // they arrive (tabs whose colours haven't changed are left alone)
  function repaintSoundTabs() {
    for (const tab of gBrowser.tabs) {
      paintTabSoundBars(tab);
    }
  }

  function tabMediaColors(tab) {
    const toolbar = document.getElementById("zen-media-controls-toolbar");
    for (const element of toolbar?.querySelectorAll(".zen-media-card") || []) {
      if (element.__ziaCard?.browser === tab.linkedBrowser) {
        return element.__ziaColors ?? null;
      }
    }
    return null;
  }

  // Until the player has the artwork's colours, the site's own colours stand in.
  function tabFallbackColors(tab) {
    const url = tab.getAttribute("image") || "";
    const palette = faviconPaletteCache.get(url);
    if (palette === undefined) {
      readFaviconPalette(url).then((result) => {
        noteFaviconPalette(url, result);
        if (result) {
          paintTabSoundBars(tab);
        }
      });
      return null;
    }
    return palette ? [palette[0], palette[1] || palette[0]] : null;
  }

  function applyTabSoundBars(tab) {
    const essential = tab.hasAttribute("zen-essential");
    const tinted = !essential && Services.prefs.getBoolPref("zia.tabs.favicon-glow", false);
    const colors = tinted ? tabMediaColors(tab) || tabFallbackColors(tab) : null;
    const key = `${colors ? colors.join("|") : plainBarInk()}|${essential}|${tab.hasAttribute("soundplaying")}|${tab.hasAttribute("muted")}|${soundBarsAlwaysMove()}`;
    if (tab.__ziaSoundKey === key) {
      return;
    }
    tab.__ziaSoundKey = key;
    const fresh = freshSoundBars(colors);
    tab.style.setProperty("--zia-sound-wave", fresh.wave);
    tab.style.setProperty("--zia-sound-muted", fresh.dots);
  }

  function ensureTabSound(tab) {
    if (tab.querySelector(".zia-tab-sound")) {
      return;
    }
    const content = tab.querySelector(".tab-content");
    if (!content) {
      return;
    }
    const bars = document.createElementNS(XHTML_NS, "span");
    bars.className = "zia-tab-sound";
    bars.setAttribute("role", "button");
    bars.addEventListener("mousedown", (event) => event.stopPropagation());
    bars.addEventListener("click", (event) => {
      event.stopPropagation();
      tab.toggleMuteAudio();
    });
    const before =
      content.querySelector(":scope > .tab-audio-button") || content.querySelector(":scope > .tab-label-container");
    content.insertBefore(bars, before);
  }

  function paintTabSoundBars(tab) {
    if (tab?.hasAttribute("soundplaying") || tab?.hasAttribute("muted")) {
      ensureTabSound(tab);
      applyTabSoundBars(tab);
      const bars = tab.querySelector(".zia-tab-sound");
      bars?.setAttribute("title", tab.hasAttribute("muted") ? "Unmute tab" : "Mute tab");
    }
  }

  // every playing tab and player redrawn
  function redrawSoundBars() {
    repaintSoundTabs();
    for (const card of soundBarCards) {
      if (!card.isConnected) {
        soundBarCards.delete(card);
        continue;
      }
      try {
        applyCardSoundBars(card);
      } catch (err) {
        noteError("music and sound bars: redraw", err);
      }
    }
  }

  function watchTabSoundBars() {
    watchPrefs(SOUND_BARS_ALWAYS_PREF, redrawSoundBars);
    gBrowser.tabContainer.addEventListener("TabAttrModified", (event) => {
      const changed = event.detail?.changed || [];
      if (changed.includes("soundplaying") || changed.includes("muted")) {
        paintTabSoundBars(event.target);
      }
      if (changed.includes("image")) {
        for (const element of document.querySelectorAll(".zen-media-card")) {
          const card = element.__ziaCard;
          if (card?.browser === event.target.linkedBrowser) {
            try {
              card.updateIcon();
            } catch (err) {
              noteError("music and sound bars: watchTabSoundBars", err);
            }
          }
        }
      }
    });
    repaintSoundTabs();
  }
