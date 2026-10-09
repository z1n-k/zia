  function updateSpaceColored() {
    let colored = false;
    if (root.getAttribute("zen-default-theme") !== "true") {
      const value = getComputedStyle(root).getPropertyValue("--zen-primary-color").trim();
      const m = value.match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3) {
        const [r, g, b] = m.slice(0, 3).map(Number);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        colored = saturation > 0.18 && max > 40;
      }
    }
    setFlag("zia-space-colored", colored);
    tintPipWindows();
  }

  // Tucked picture-in-picture strips take on the space's colour, when it has
  // one of its own, and follow it as you switch spaces.
  function tintPipWindows() {
    const tint = root.getAttribute("zia-space-colored") === "true"
      ? getComputedStyle(root).getPropertyValue("--zen-primary-color").trim()
      : "";
    for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) {
      const style = win.document?.documentElement?.style;
      if (tint) {
        style?.setProperty("--zia-space-tint", tint);
      } else {
        style?.removeProperty("--zia-space-tint");
      }
    }
  }

  function watchSpaceColor() {
    let frame = null;
    let lastKey = null;
    const schedule = () => {
      const key = `${root.getAttribute("zen-default-theme")}|${root.style.getPropertyValue("--zen-primary-color")}|${Services.prefs.getStringPref("zen.workspaces.active", "")}`;
      if (key === lastKey) {
        return;
      }
      lastKey = key;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = null;
          updateSpaceColored();
        });
      }
    };
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ["zen-default-theme", "style"] });
    window.addEventListener("ZenWorkspacesUIUpdate", schedule);
    watchPrefs("zen.workspaces.active", schedule);
    schedule();
  }

