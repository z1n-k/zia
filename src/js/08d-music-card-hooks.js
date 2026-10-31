  // ---------- Zen's music card, hooked: kept with picture-in-picture, dressed by Zia whenever
  // Zen sets its icon or position, offered for media with no position, and never dragged.
  // Used elsewhere: watchMediaGlow, cardForPositionlessMedia, keepMediaCardsInPlace.

  // Zen hides a card while its video is in picture-in-picture, so the card's own
  // picture-in-picture button took the card away; this option keeps it
  const KEEP_WITH_PIP_PREF = "zia.media.keep-with-pip";

  function keepWithPip() {
    try {
      return Services.prefs.getBoolPref(KEEP_WITH_PIP_PREF, true);
    } catch (err) {
      return true;
    }
  }

  function keepCardsWithPip() {
    const front = window.gZenMediaController?.frontCard;
    const proto = front && Object.getPrototypeOf(front);
    const desc = proto && Object.getOwnPropertyDescriptor(proto, "shouldBeVisible");
    if (!desc?.get) {
      return false;
    }
    if (desc.get.__zia) {
      return true;
    }
    const original = desc.get;
    const patched = function () {
      try {
        // (fullscreen is Zen's to decide, as before)
        if (keepWithPip() && !this.isSharing && this.controller?.isBeingUsedInPIPModeOrFullscreen && !document.fullscreenElement && !window.fullScreen) {
          return gBrowser.selectedBrowser.browserId !== this.browser.browserId;
        }
      } catch (err) {
        noteError("music and sound bars: keepCardsWithPip", err);
      }
      return original.call(this);
    };
    patched.__zia = true;
    Object.defineProperty(proto, "shouldBeVisible", { ...desc, get: patched });

    const refreshCards = () => {
      for (const element of document.querySelectorAll("#zen-media-controls-toolbar .zen-media-card")) {
        try {
          element.__ziaCard?.refreshVisibility?.();
        } catch (err) {
          noteError("music and sound bars: keepCardsWithPip (2)", err);
        }
      }
    };
    watchPrefs(KEEP_WITH_PIP_PREF, refreshCards);
    return true;
  }

  function useMediaArtwork() {
    const front = window.gZenMediaController?.frontCard;
    const proto = front && Object.getPrototypeOf(front);
    if (!proto || typeof proto.updateIcon !== "function" || proto.updateIcon.__zia) {
      return !!proto?.updateIcon?.__zia;
    }
    const originalPosition = proto.updatePosition;
    if (typeof originalPosition === "function") {
      proto.updatePosition = function (...args) {
        const result = originalPosition.apply(this, args);
        try {
          const known = this.element.__ziaCard === this;
          this.element.__ziaCard = this;
          watchTimeLeft(this);
          showTimeLeft(this);
          markLiveStream(this);
          if (!known) {
            repaintSoundTabs();
          }
        } catch (err) {
          noteError("music and sound bars: useMediaArtwork", err);
        }
        return result;
      };
    }

    const original = proto.updateIcon;
    // Zen drops a card if setting it up throws, so nothing here may throw: a slip
    // over a Kick stream's picture had left Kick with no card at all
    const patched = function () {
      original.call(this);
      try {
        dressCardIcon(this);
      } catch (err) {
        noteError("music and sound bars: updateIcon", err);
      }
    };
    patched.__zia = true;
    proto.updateIcon = patched;
    try {
      front.updateIcon();
      front.updatePosition?.();
    } catch (err) {
      noteError("music and sound bars: showArt", err);
    }
    return true;
  }

  function dressCardIcon(card) {
    if (card.element && card.element.__ziaCard !== card) {
      card.element.__ziaCard = card;
      repaintSoundTabs();
    }
    const button = card.focusButton;
    let art = "";
    try {
      art = bestArtwork(card.controller?.getMetadata?.()?.artwork);
    } catch (err) {
      noteError("music and sound bars: useMediaArtwork (2)", err);
    }
    art = youTubeAvatar(card) || art;
    if (!art) {
      art = kickAvatar(card);
    }
    if (!button) {
      return;
    }
    ensureRing(button);
    if (art) {
      const previous = button.getAttribute("zia-art");
      button.setAttribute("zia-art", art);
      const showArt = () => button.style.setProperty("--zia-media-art", `url("${art.replace(/"/g, "%22")}")`);
      if (previous && previous !== art) {
        flipArtwork(button, showArt);
      } else {
        showArt();
      }
    } else {
      button.removeAttribute("zia-art");
      button.style.removeProperty("--zia-media-art");
    }
    showFaviconTile(card, button, art);
  }

  function watchMediaGlow() {
    const toolbar = document.getElementById("zen-media-controls-toolbar");
    if (!toolbar) {
      return;
    }
    let frame = null;
    let artworkReady = false;
    let keptWithPip = false;
    const refresh = () => {
      frame = null;
      if (!artworkReady) {
        artworkReady = useMediaArtwork();
      }
      if (!keptWithPip) {
        keptWithPip = keepCardsWithPip();
      }
      for (const card of toolbar.querySelectorAll(".zen-media-card")) {
        updateCardGlow(card);
      }
    };
    new MutationObserver(() => {
      if (!frame) {
        frame = requestAnimationFrame(refresh);
      }
    }).observe(toolbar, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "style", "image", "hidden", "zia-art", "zia-favicon"],
    });
    refresh();
  }

  // Zen drops a card if asking its media's position fails, and Kick's live player
  // never answers, so since Zen 1.23 Kick had no card. An active controller with
  // no position now answers an endless one (no progress line, as for any live
  // stream), and tabs already playing are offered to Zen again.
  function cardForPositionlessMedia() {
    // on the controller's own type: the one this window knows by name isn't it
    const answerPosition = (controller) => {
      const proto = controller && Object.getPrototypeOf(controller);
      const own = proto?.getPositionState;
      if (typeof own !== "function" || own.__zia) {
        return;
      }
      const patched = function () {
        try {
          return own.call(this);
        } catch (err) {
          if (!this.isActive) {
            throw err;
          }
          // an endless length: Zen hides the progress line and the card reads LIVE
          return { duration: Infinity, playbackRate: 1, position: 0 };
        }
      };
      patched.__zia = true;
      Object.defineProperty(proto, "getPositionState", { value: patched, writable: true, configurable: true, enumerable: true });
    };

    const manager = window.gZenMediaController;
    if (!manager || typeof manager.activateMediaControls !== "function" || manager.activateMediaControls.__zia) {
      return;
    }
    const original = manager.activateMediaControls;
    const activate = function (controller, browser) {
      try {
        answerPosition(controller);
      } catch (err) {
        noteError("music and sound bars: answerPosition", err);
      }
      return original.call(this, controller, browser);
    };
    activate.__zia = true;
    manager.activateMediaControls = activate;

    for (const tab of gBrowser.tabs) {
      if (!tab.hasAttribute("soundplaying")) {
        continue;
      }
      try {
        manager.activateMediaControls(tab.linkedBrowser.browsingContext?.mediaController, tab.linkedBrowser);
      } catch (err) {
        noteError("music and sound bars: cardForPositionlessMedia", err);
      }
    }
  }

  // A card dragged out of the sidebar like a toolbar button broke Zen's player
  // until restart, and nothing on it uses drags, so no drag starts there.
  function keepMediaCardsInPlace() {
    window.addEventListener(
      "dragstart",
      (event) => {
        if (event.target?.closest?.("#zen-media-controls-toolbar")) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );
  }
