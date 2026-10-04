  // ---------- Picture-in-picture: Dia's look, and tucking into the screen edge
  const PIP_PLAYER_URL = "chrome://global/content/pictureinpicture/player.xhtml";
  const PIP_SCRIPT_URL = "chrome://sine/content/zia/zia-pip.js";

  function decoratePipWindow(win) {
    try {
      if (win.__ziaPipLoaded || win.location?.href !== PIP_PLAYER_URL) {
        return;
      }
      Services.scriptloader.loadSubScript(PIP_SCRIPT_URL, win);
      tintPipWindows();
    } catch (err) {
      console.error("[Zia] Couldn't set up picture-in-picture:", err);
    }
  }
  function watchPipWindows() {
    const observer = (subject, topic) => {
      if (topic !== "domwindowopened") {
        return;
      }
      subject.addEventListener(
        "load",
        () => {
          // The player fills in its controls on load; give it a moment first.
          setTimeout(() => decoratePipWindow(subject), 0);
        },
        { once: true }
      );
    };
    Services.ww.registerNotification(observer);
    window.addEventListener("unload", () => Services.ww.unregisterNotification(observer));
    for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) {
      decoratePipWindow(win);
    }
  }

