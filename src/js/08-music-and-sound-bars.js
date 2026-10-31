  // ---------- Music: colours read off pictures, for the music card's glow and the chosen tab's
  // The artwork's (or favicon's) colours under the music card, and the chosen tab's glow in its
  // favicon's colours (zia.tabs.favicon-glow).
  // Used elsewhere: artUrlOf, readPixels, cachedArtColors, readFaviconPalette,
  // faviconPaletteCache, noteFaviconPalette, updateCardGlow, watchSelectedTabGlow.

  const ARTWORK_WAIT_MS = 1500;
  const GROUPED_GLOW_MS = 50;

  const mediaColorCache = new Map();

  function artUrlOf(card) {
    const artwork = card.querySelector(".zen-media-focus-button[zia-art]")?.getAttribute("zia-art");
    if (artwork) {
      return artwork;
    }
    const favicon = card.querySelector(".zen-media-focus-button[zia-favicon]")?.getAttribute("zia-favicon");
    if (favicon) {
      return favicon;
    }
    const img = card.querySelector(".zen-media-focus-button image, .zen-media-focus-button .toolbarbutton-icon");
    if (!img) {
      return "";
    }
    const src = img.getAttribute("src") || img.src || "";
    if (src) {
      return src;
    }
    const listStyle = getComputedStyle(img).listStyleImage || "";
    const match = listStyle.match(/url\(["']?(.*?)["']?\)/);
    return match ? match[1] : "";
  }

  function boost([r, g, b]) {
    const avg = (r + g + b) / 3;
    const k = 1.6;
    return [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(avg + (v - avg) * k))));
  }

  // the image's pixels at size by size, or null
  function readPixels(url, size) {
    return new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElementNS(XHTML_NS, "canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, size, size);
          resolve(ctx.getImageData(0, 0, size, size).data);
        } catch (err) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function readArtColors(url) {
    const size = 24;
    const data = await readPixels(url, size);
    if (!data) {
      return null;
    }
    const halves = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (data[i + 3] < 128) {
          continue;
        }
        const h = halves[x < size / 2 ? 0 : 1];
        h[0] += data[i];
        h[1] += data[i + 1];
        h[2] += data[i + 2];
        h[3]++;
      }
    }
    const colors = halves.map((h) => (h[3] ? boost([h[0] / h[3], h[1] / h[3], h[2] / h[3]]) : null));
    if (!colors[0] && !colors[1]) {
      return null;
    }
    const a = colors[0] || colors[1];
    const b = colors[1] || colors[0];
    return [`rgb(${a.join(", ")})`, `rgb(${b.join(", ")})`];
  }

  async function cachedArtColors(url) {
    if (!mediaColorCache.has(url)) {
      mediaColorCache.set(url, await readArtColors(url));
    }
    return mediaColorCache.get(url);
  }

  // up to three of the favicon's strongest hues, for the selected tab's glow;
  // null for grey, white and black icons (the glow stays white)
  async function readFaviconPalette(url) {
    const data = await readPixels(url, 32);
    if (!data) {
      return null;
    }
    const bins = Array.from({ length: 12 }, () => [0, 0, 0, 0]);
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 128) {
        continue;
      }
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max ? (max - min) / max : 0;
      if (sat < 0.3 || max < 60) {
        continue;
      }
      let hue;
      if (max === r) {
        hue = ((g - b) / (max - min) + 6) % 6;
      } else if (max === g) {
        hue = (b - r) / (max - min) + 2;
      } else {
        hue = (r - g) / (max - min) + 4;
      }
      const bin = bins[Math.floor(hue * 2) % 12];
      bin[0] += r * sat;
      bin[1] += g * sat;
      bin[2] += b * sat;
      bin[3] += sat;
    }
    const ranked = bins.filter((bin) => bin[3] >= 6).sort((x, y) => y[3] - x[3]);
    if (!ranked.length) {
      return null;
    }
    const top = ranked[0][3];
    const colors = ranked
      .filter((bin) => bin[3] >= top * 0.12)
      .slice(0, 3)
      .map((bin) => bin.slice(0, 3).map((v) => Math.round(v / bin[3])));
    if (colors.length === 1) {
      const [r, g, b] = colors[0];
      colors.push([r, g, b].map((v) => Math.round(v + (255 - v) * 0.35)));
      colors.push([r, g, b].map((v) => Math.round(v * 0.7)));
    } else if (colors.length === 2) {
      colors.push(colors[0].map((v, k) => Math.round((v + colors[1][k]) / 2)));
    }
    return colors.map((c) => `rgb(${c.join(", ")})`);
  }

  const faviconPaletteCache = new Map();

  function noteFaviconPalette(url, palette) {
    faviconPaletteCache.set(url, palette);
  }

  async function faviconPalette(tab) {
    const url = tab.getAttribute("image") || "";
    let palette = faviconPaletteCache.get(url);
    if (palette === undefined) {
      palette = await readFaviconPalette(url);
      faviconPaletteCache.set(url, palette);
    }
    return (tab.getAttribute("image") || "") === url ? palette : undefined;
  }

  async function glowSelectedTab() {
    const tab = gBrowser.selectedTab;
    if (!tab || tab.hasAttribute("zen-essential") || !Services.prefs.getBoolPref("zia.tabs.favicon-glow", false)) {
      return;
    }
    // a split glows left in the left tab's colours, right in the right tab's
    const split = tab.closest("tab-group[split-view-group]");
    if (split) {
      const tabs = [...split.querySelectorAll(".tabbrowser-tab")];
      const palettes = await Promise.all(tabs.map(faviconPalette));
      if (!tabs.length || palettes.every((palette) => !palette)) {
        split.removeAttribute("zia-glow");
        return;
      }
      const white = "rgba(255, 255, 255, 0.23)";
      const left = palettes[0]?.[0] || white;
      const right = palettes[palettes.length - 1]?.[0] || white;
      split.style.setProperty("--zia-glow-1", left);
      split.style.setProperty("--zia-glow-2", right);
      split.style.setProperty("--zia-glow-3", palettes[0]?.[1] || palettes[palettes.length - 1]?.[1] || white);
      split.setAttribute("zia-glow", "true");
      return;
    }
    const palette = await faviconPalette(tab);
    if (palette === undefined) {
      return;
    }
    if (palette) {
      palette.forEach((color, i) => tab.style.setProperty(`--zia-glow-${i + 1}`, color));
      tab.setAttribute("zia-glow", "true");
    } else {
      tab.removeAttribute("zia-glow");
    }
  }

  function watchSelectedTabGlow() {
    gBrowser.tabContainer.addEventListener("TabSelect", glowSelectedTab);
    gBrowser.tabContainer.addEventListener("TabAttrModified", (event) => {
      if (!event.detail?.changed?.includes("image")) {
        return;
      }
      const split = gBrowser.selectedTab?.closest("tab-group[split-view-group]");
      if (event.target === gBrowser.selectedTab || (split && split.contains(event.target))) {
        glowSelectedTab();
      }
    });
    for (const type of ["TabGrouped", "TabUngrouped"]) {
      // (not kept: it looks at whichever tab is chosen when it runs)
      window.addEventListener(type, () => setTimeout(glowSelectedTab, GROUPED_GLOW_MS));
    }
    const onPref = () => {
      glowSelectedTab();
      repaintSoundTabs();
    };
    watchPrefs("zia.tabs.favicon-glow", onPref);
    glowSelectedTab();
  }

  async function updateCardGlow(card) {
    const url = artUrlOf(card);
    if (card.__ziaArtUrl === url) {
      return;
    }
    card.__ziaArtUrl = url;
    const isArtwork = !!card.querySelector(".zen-media-focus-button[zia-art]");
    if (!isArtwork) {
      if (!card.hasAttribute("zia-glow-ready")) {
        card.setAttribute("zia-glow-pending", "true");
      }
      await new Promise((resolve) => setTimeout(resolve, ARTWORK_WAIT_MS));
      if (card.__ziaArtUrl !== url) {
        return;
      }
    }

    const colors = await cachedArtColors(url);
    if (card.__ziaArtUrl !== url) {
      return;
    }
    if (colors) {
      card.style.setProperty("--zia-media-glow-a", colors[0]);
      card.style.setProperty("--zia-media-glow-b", colors[1]);
    } else {
      card.style.removeProperty("--zia-media-glow-a");
      card.style.removeProperty("--zia-media-glow-b");
    }
    card.removeAttribute("zia-glow-pending");
    card.setAttribute("zia-glow-ready", "true");
    card.__ziaColors = colors;
    paintSoundBars(card, colors);
  }
