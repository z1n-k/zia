

const THROTTLE_MS = 50;
const SETTLE_MS = 80;
// Pull to refresh: a pause in the scrolling this long ends a gesture (Firefox doesn't tell a page
// when the fingers lift)
const PULL_GAP_MS = 140;
// (the first few moves of a gesture say nothing, so a nudge never shows the bubble)
const PULL_FIRST_MOVES = 3;
// Once the fingers lift, macOS goes on sending scroll events of next to nothing while the page
// bounces back: only a move bigger than this keeps a pull going, or the bubble sat there
const PULL_STILL_PX = 1;
// A pull this far (the window's PULL_FULL, 28w-pull-refresh) lets go as the fingers lift: when
// the movement drops under PULL_COAST of its peak for PULL_COAST_MOVES moves in a row, which is
// macOS coasting on alone (Firefox doesn't say when the fingers lift; waiting for the coast to
// end held the bubble a second or more)
const PULL_FULL = 200;
const PULL_COAST = 0.4;
const PULL_COAST_MOVES = 3;

export class ZiaChild extends JSWindowActorChild {
  #lastSent = 0;
  #trailingTimer = null;
  #wheelWindows = new WeakSet();
  #gesture = null;
  #lastWheel = 0;
  #pullTimer = null;
  #pullFrame = 0;

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
    this.#watchWheel(win);
    win.requestAnimationFrame(() =>
      win.requestAnimationFrame(() => {
        try {
          this.sendAsyncMessage("Zia:Painted", {});
        } catch (err) {
        }
      })
    );
  }

  // Pull to refresh (zia.pull-refresh, 28w-pull-refresh in the window): scrolling on up past the
  // top of the page, in a scroll that began there, is a pull; it ends when the scrolling stops.
  // Listened to passively, so scrolling never waits on it, and only reported while it's a pull.
  #watchWheel(win) {
    if (this.#wheelWindows.has(win)) {
      return;
    }
    this.#wheelWindows.add(win);
    win.addEventListener("wheel", (event) => this.#onWheel(event), { passive: true });
  }

  #onWheel(event) {
    const win = this.contentWindow;
    if (!win) {
      return;
    }
    const now = Date.now();
    const still = Math.abs(event.deltaY) <= PULL_STILL_PX;
    if (now - this.#lastWheel > PULL_GAP_MS && !still) {
      this.#gesture =
        this.#pullAllowed(event, win) && !this.#scrollsInside(event.target)
          ? { pull: 0, moves: 0, shown: false, peak: 0, calm: 0, released: false }
          : null;
    }
    // (a still event neither starts a pull nor keeps the last one's gap open)
    if (!still) {
      this.#lastWheel = now;
    }
    const gesture = this.#gesture;
    // (once let go, the rest of the gesture, the coast, is left alone)
    if (!gesture || gesture.released) {
      return;
    }
    // (a sideways swipe is the back and forward gesture's, not a pull)
    if (!this.#pullAllowed(event, win) || Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.5) {
      this.#endPull(true);
      return;
    }
    gesture.pull = Math.max(0, gesture.pull - event.deltaY);
    gesture.moves++;
    gesture.peak = Math.max(gesture.peak, Math.abs(event.deltaY));
    if (gesture.pull >= PULL_FULL) {
      gesture.calm = Math.abs(event.deltaY) < gesture.peak * PULL_COAST ? gesture.calm + 1 : 0;
      if (gesture.calm >= PULL_COAST_MOVES && gesture.shown) {
        gesture.released = true;
        win.clearTimeout(this.#pullTimer);
        this.#sendPull(gesture.pull, true);
        return;
      }
    }
    if (Math.abs(event.deltaY) > PULL_STILL_PX || !gesture.shown) {
      win.clearTimeout(this.#pullTimer);
      this.#pullTimer = win.setTimeout(() => this.#endPull(false), PULL_GAP_MS);
    }
    if (gesture.moves > PULL_FIRST_MOVES && (gesture.pull > 0 || gesture.shown) && !this.#pullFrame) {
      this.#pullFrame = win.requestAnimationFrame(() => {
        this.#pullFrame = 0;
        if (this.#gesture) {
          this.#gesture.shown = true;
          this.#sendPull(this.#gesture.pull, false);
        }
      });
    }
  }

  // a trackpad's (in pixels) or a Magic Mouse's scroll, not a pinch or a page that takes its
  // own scrolling, with the page at its top
  #pullAllowed(event, win) {
    return (
      event.deltaMode === 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.defaultPrevented &&
      win.scrollY <= 0 &&
      Services.prefs.getBoolPref("zia.pull-refresh", true)
    );
  }

  // Anything under the pointer that scrolls on its own, a chat's messages or a side panel,
  // whether or not it's at its top: only the page itself pulls to refresh. (Checking only for
  // a box scrolled away from its top missed chats that scroll from the bottom, which read a
  // scroll through their messages as a pull and reloaded the page.) Once, as a gesture starts.
  #scrollsInside(target) {
    const doc = target?.ownerDocument;
    for (let el = target; el?.nodeType === 1; el = el.parentElement || el.getRootNode()?.host) {
      if (el === doc.scrollingElement || el === doc.body || el === doc.documentElement) {
        return false;
      }
      if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll|overlay/.test(doc.defaultView.getComputedStyle(el).overflowY)) {
        return true;
      }
    }
    return false;
  }

  // cancelled: the bubble goes without reloading
  #endPull(cancelled) {
    const gesture = this.#gesture;
    this.#gesture = null;
    this.contentWindow?.clearTimeout(this.#pullTimer);
    if (gesture?.shown && !gesture.released) {
      this.#sendPull(cancelled ? 0 : gesture.pull, true);
    }
  }

  #sendPull(pull, end) {
    try {
      this.sendAsyncMessage("Zia:Pull", { pull, end });
    } catch (err) {
    }
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
