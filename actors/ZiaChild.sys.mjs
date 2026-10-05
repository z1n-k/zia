

const THROTTLE_MS = 50;
const SETTLE_MS = 80;

export class ZiaChild extends JSWindowActorChild {
  #lastSent = 0;
  #trailingTimer = null;

  handleEvent(event) {
    switch (event.type) {
      case "scroll":
        this.#onScroll();
        break;
      case "DOMContentLoaded":
      case "pageshow":
        this.#onPageShown();
        break;
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
