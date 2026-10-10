  // ---------- Room for the essentials above every space's tabs
  // Zen pads a space's tabs clear of the essentials as you go to it, but a space made
  // this session started at 0 and its tabs slid in under them (Windows). With shared
  // essentials each space gets that room; one being made or animated is left to Zen.
  function keepRoomForEssentials() {
    const separate = () => {
      try {
        return Services.prefs.getBoolPref("zen.workspaces.separate-essentials", false);
      } catch (err) {
        return false;
      }
    };
    const essentials = () =>
      [...document.querySelectorAll(".zen-essentials-container")].find((el) => !el.hidden && el.getBoundingClientRect().width);

    const fit = () => {
      if (separate() || root.hasAttribute("zen-creating-workspace")) {
        return;
      }
      const box = essentials();
      if (!box) {
        return;
      }
      const room = Math.max(2, box.getBoundingClientRect().height);
      for (const space of document.querySelectorAll("zen-workspace")) {
        if (space.querySelector("zen-workspace-creation") || space.getAnimations().length) {
          continue;
        }
        const now = parseFloat(space.style.paddingTop);
        if (!(Math.abs(now - room) < 0.5)) {
          space.style.paddingTop = `${room}px`;
        }
      }
    };

    // as a switch starts (the space coming in already has its room as it
    // slides), and once it has settled
    new MutationObserver((records) => {
      if (records.some((record) => record.target.localName === "zen-workspace")) {
        fit();
        setTimeout(fit, 400);
      }
    }).observe(document.getElementById("navigator-toolbox") || root, { subtree: true, attributes: true, attributeFilter: ["active"] });

    let watched = null;
    const resize = new ResizeObserver(() => fit());
    const watch = () => {
      const box = essentials();
      if (box && box !== watched) {
        watched?.isConnected && resize.unobserve(watched);
        watched = box;
        resize.observe(box);
      }
    };
    watch();
    setInterval(watch, 5000);
    fit();
  }

