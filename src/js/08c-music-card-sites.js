  // ---------- The music card's pictures and LIVE from the sites themselves (Kick, YouTube),
  // asked through Zia's actor (actors/ZiaChild.sys.mjs).
  // Used elsewhere: kickAvatar, youTubeAvatar, markLiveStream.

  const YOUTUBE_AVATAR_RETRY_MS = 1500;
  const YOUTUBE_LIVE_RECHECK_MS = 10000;

  function ziaActor(browser) {
    try {
      return browser?.browsingContext?.currentWindowGlobal?.getActor("Zia") || null;
    } catch (err) {
      return null;
    }
  }

  // Kick streams have no artwork: the channel's picture instead, asked of Kick
  // once per channel (actors/ZiaChild.sys.mjs)
  const kickAvatars = new Map();

  function kickSlug(browser) {
    try {
      const uri = browser?.currentURI;
      if (!/^(www\.)?kick\.com$/.test(uri?.host || "")) {
        return "";
      }
      const slug = uri.filePath.split("/")[1] || "";
      return /^[\w-]+$/.test(slug) ? slug.toLowerCase() : "";
    } catch (err) {
      return "";
    }
  }

  function kickAvatar(card) {
    const slug = kickSlug(card.browser);
    if (!slug) {
      return "";
    }
    if (kickAvatars.has(slug)) {
      return kickAvatars.get(slug) || "";
    }
    kickAvatars.set(slug, null);
    const actor = ziaActor(card.browser);
    if (!actor) {
      kickAvatars.delete(slug);
      return "";
    }
    try {
      actor
        .sendQuery("Zia:KickAvatar", { slug })
        .then((pic) => {
          kickAvatars.set(slug, pic || "");
          if (pic && kickSlug(card.browser) === slug) {
            card.updateIcon();
          }
        })
        .catch(() => kickAvatars.delete(slug));
    } catch (err) {
      kickAvatars.delete(slug);
    }
    return "";
  }

  // optional: a YouTube video shows its channel's picture, asked again a few
  // times while the page is still putting it up
  const YOUTUBE_AVATAR_PREF = "zia.media.youtube-channel-art";
  const youTubeAvatars = new Map();

  function youTubeVideo(browser) {
    try {
      const uri = browser?.currentURI;
      if (!/^(www\.|m\.)?youtube\.com$/.test(uri?.host || "")) {
        return "";
      }
      const url = new URL(uri.spec);
      const id = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|live)\/([\w-]+)/)?.[1] || "";
      return /^[\w-]+$/.test(id) ? id : "";
    } catch (err) {
      return "";
    }
  }

  function youTubeAvatar(card) {
    try {
      if (!Services.prefs.getBoolPref(YOUTUBE_AVATAR_PREF, false)) {
        return "";
      }
    } catch (err) {
      return "";
    }
    const video = youTubeVideo(card.browser);
    if (!video) {
      return "";
    }
    const known = youTubeAvatars.get(video);
    if (known?.pic || known?.asking) {
      return known.pic || "";
    }
    const tries = (known?.tries || 0) + 1;
    if (tries > 6) {
      return "";
    }
    const actor = ziaActor(card.browser);
    if (!actor) {
      return "";
    }
    youTubeAvatars.set(video, { asking: true, tries });
    actor
      .sendQuery("Zia:YouTubeAvatar", {})
      .then((pic) => {
        youTubeAvatars.set(video, { pic: pic || "", tries });
        if (youTubeVideo(card.browser) !== video) {
          return;
        }
        if (pic) {
          card.updateIcon();
        } else {
          // (not kept: it checks it's still the same video first)
          setTimeout(() => {
            if (youTubeVideo(card.browser) === video) {
              card.updateIcon();
            }
          }, YOUTUBE_AVATAR_RETRY_MS);
        }
      })
      .catch(() => youTubeAvatars.set(video, { tries }));
    return "";
  }

  // A YouTube live stream reports a position and length, so Zen showed a jumping
  // progress line: YouTube's player is asked, and the card shows LIVE instead.
  const youTubeLiveChecked = new WeakMap();

  function markLiveStream(card) {
    const element = card.element;
    const browser = card.browser;
    if (!element || !browser) {
      return;
    }
    let host = "";
    try {
      host = browser.currentURI?.host || "";
    } catch (err) {
      host = "";
    }
    // a Kick channel's page is live; its player reports a few seconds at a time,
    // which looped the progress line every three seconds
    if (/^(www\.)?kick\.com$/.test(host)) {
      let path = "";
      try {
        path = browser.currentURI.filePath;
      } catch (err) {
        path = "";
      }
      element.toggleAttribute("zia-live", /^\/[\w-]+\/?$/.test(path));
      return;
    }
    if (!/(^|\.)youtube\.com$/.test(host)) {
      element.removeAttribute("zia-live");
      return;
    }
    const spec = browser.currentURI.spec;
    const last = youTubeLiveChecked.get(element);
    if (last && last.spec === spec && Date.now() - last.at < YOUTUBE_LIVE_RECHECK_MS) {
      return;
    }
    youTubeLiveChecked.set(element, { spec, at: Date.now() });
    ziaActor(browser)
      ?.sendQuery("Zia:YouTubeLive", {})
      .then((live) => {
        if (card.browser?.currentURI?.spec === spec) {
          element.toggleAttribute("zia-live", !!live);
        }
      })
      .catch(() => {});
  }
