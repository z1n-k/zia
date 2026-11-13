

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
});

const THROTTLE_MS = 50;
// Links in Glance (zia.glance.links, 28x-glance-links in the window): a press that moves further
// than this before the click is selecting text, not following the link
const CLICK_MOVE_PX = 4;
const SETTLE_MS = 80;
export class ZiaChild extends JSWindowActorChild {
  #lastSent = 0;
  #trailingTimer = null;
  #down = null;

  handleEvent(event) {
    switch (event.type) {
      case "scroll":
        this.#onScroll();
        break;
      case "DOMContentLoaded":
      case "pageshow":
        this.#onPageShown();
        break;
      case "mousedown":
        this.#down = event.button === 0 ? [event.clientX, event.clientY] : null;
        break;
      case "click":
        this.#onClick(event);
        break;
    }
  }

  // Links in Glance: with the setting on, a plain click on a link to another page (or only
  // to another site) opens it in Glance, and Shift+click opens it in a new tab. Taken here, as
  // the click comes down, before the page's own handlers (a site's router would otherwise
  // follow it in place); the window checks it again and opens it.
  #onClick(event) {
    // (the setting as the window shares it: a website's process isn't shown Zia's own settings)
    const mode = Services.cpmm.sharedData.get("zia:glance-links");
    const down = this.#down;
    this.#down = null;
    if ((mode !== "other" && mode !== "all") || !event.isTrusted || event.button !== 0 || event.defaultPrevented ||
        event.altKey || event.ctrlKey || event.metaKey || !Services.prefs.getBoolPref("zen.glance.enabled", true)) {
      return;
    }
    // (Shift is Zen's own Glance key for some: theirs, then)
    if (event.shiftKey && Services.prefs.getStringPref("zen.glance.activation-method", "ctrl") === "shift") {
      return;
    }
    if (down && (Math.abs(event.clientX - down[0]) > CLICK_MOVE_PX || Math.abs(event.clientY - down[1]) > CLICK_MOVE_PX)) {
      return;
    }
    const [href, node] = lazy.BrowserUtils.hrefAndLinkNodeForClickEvent(event);
    if (!href || !node || node.hasAttribute?.("download")) {
      return;
    }
    let uri;
    try {
      uri = Services.io.newURI(href);
    } catch (err) {
      return;
    }
    const here = node.ownerDocument?.documentURIObject;
    // (only pages: not a place on this page, a mail link, a script or a download)
    if ((!uri.schemeIs("http") && !uri.schemeIs("https")) || (here && uri.equalsExceptRef(here))) {
      return;
    }
    if (!event.shiftKey) {
      // (a glance can't open another glance: its links go on as usual)
      const glances = Services.cpmm.sharedData.get("zia:glance-browsers");
      if (glances?.includes?.(this.browsingContext.top.browserId) || (mode === "other" && here && sameSite(uri, here))) {
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      this.sendAsyncMessage("Zia:OpenLink", { url: uri.spec, tab: event.shiftKey });
    } catch (err) {
    }
  }

  #onScroll() {
    const now = Date.now();
    if (now - this.#lastSent >= THROTTLE_MS) {
      this.#sendScroll(now);
    }
    this.contentWindow?.clearTimeout(this.#trailingTimer);
    this.#trailingTimer = this.contentWindow?.setTimeout(() => this.#sendScroll(Date.now()), SETTLE_MS);
  }

  #sendScroll(now) {
    this.#lastSent = now;
    const win = this.contentWindow;
    if (!win) {
      return;
    }
    try {
      this.sendAsyncMessage("Zia:Scrolled", { x: win.scrollX, y: win.scrollY });
    } catch (err) {
    }
  }

  #onPageShown() {
    const win = this.contentWindow;
    if (!win) {
      return;
    }
    win.requestAnimationFrame(() =>
      win.requestAnimationFrame(() => {
        try {
          this.sendAsyncMessage("Zia:Painted", {});
        } catch (err) {
        }
      })
    );
  }

  // Kick gives its streams no artwork, so the music player showed its
  // favicon: the channel's own picture is asked of Kick by the page itself
  // (as Kick's site does), for the channel named in the address.
  async receiveMessage(message) {
    if (message.name === "Zia:YouTubeLive") {
      // YouTube's player marks a live stream (where it shows its "LIVE"
      // badge in place of the time)
      return !!this.document?.querySelector(".html5-video-player.ytp-live, .html5-video-player .ytp-time-display.ytp-live");
    }
    if (message.name === "Zia:YouTubeAvatar") {
      return this.#youTubeAvatar();
    }
    if (message.name !== "Zia:KickAvatar") {
      return null;
    }
    const win = this.contentWindow;
    const slug = String(message.data?.slug || "");
    if (!win || !/^[\w-]+$/.test(slug) || !/(^|\.)kick\.com$/.test(win.location.hostname)) {
      return null;
    }
    for (const path of [`/api/v2/channels/${slug}`, `/api/v1/channels/${slug}`]) {
      try {
        const response = await win.fetch(path, { credentials: "include", headers: { Accept: "application/json" } });
        if (!response.ok) {
          continue;
        }
        const data = JSON.parse(await response.text());
        const pic = data?.user?.profile_pic || data?.user?.profilepic;
        if (typeof pic === "string" && /^https:\/\//.test(pic)) {
          return pic;
        }
      } catch (err) {
      }
    }
    return null;
  }

  // The channel's picture under a YouTube video (or beside a Short), for
  // the music player to show instead of the video's own thumbnail
  #youTubeAvatar() {
    const doc = this.document;
    if (!doc || !/(^|\.)youtube\.com$/.test(this.contentWindow?.location.hostname || "")) {
      return null;
    }
    const img = doc.querySelector(
      [
        "ytd-watch-metadata #owner #avatar img",
        "ytd-video-owner-renderer #avatar img",
        "#owner #avatar img",
        "ytd-reel-video-renderer[is-active] #avatar img",
        "ytd-reel-video-renderer[is-active] yt-decorated-avatar-view-model img",
        "ytd-reel-video-renderer[is-active] reel-channel-bar-view-model img",
      ].join(", ")
    );
    const src = img?.currentSrc || img?.src || "";
    if (!/^https:\/\//.test(src)) {
      return null;
    }
    // (a larger size than the page's, as sharp as the card shows it)
    return src.replace(/=s\d+(-)/, "=s176$1");
  }

  didDestroy() {
    this.contentWindow?.clearTimeout(this.#trailingTimer);
  }
}

// (the same site: the same registrable domain, as example.com for www. and docs.; an address
// with none, as localhost or an IP, by its host)
function sameSite(a, b) {
  const site = (uri) => {
    try {
      return Services.eTLD.getBaseDomain(uri);
    } catch (err) {
      return uri.asciiHost;
    }
  };
  try {
    return site(a) === site(b);
  } catch (err) {
    return false;
  }
}
