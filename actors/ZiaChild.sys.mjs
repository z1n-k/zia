

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
});

const THROTTLE_MS = 50;
// Links in Glance (zia.glance.links, 28x-glance-links in the window): a press that moves further
// than this before the click is selecting text, not following the link
const CLICK_MOVE_PX = 4;
const SETTLE_MS = 80;
// Pull to refresh: a pause in the scrolling this long ends a gesture (Firefox doesn't tell a page
// when the fingers lift)
const PULL_GAP_MS = 140;
// (the first few moves of a gesture say nothing, so a nudge never shows the bubble)
const PULL_FIRST_MOVES = 3;
// Once the fingers lift, macOS goes on sending scroll events of next to nothing while the page
// bounces back: only a move bigger than this keeps a pull going, or the bubble sat there
const PULL_STILL_PX = 1;
const PULL_SIDEWAYS_PX = 3;
// Past PULL_FULL (the window's, 28w-pull-refresh) the reload waits for the fingers to let go,
// so pushing back up first cancels it and a form isn't lost to a pull that went too far.
// Firefox doesn't tell a page when they lift, and while they rest on the trackpad nothing comes
// at all; but a pull past the top stretches the page (macOS's overscroll), and only once
// they've lifted does it spring back, which ends with APZ's "APZ:TransformEnd". A pull past
// the mark waits for that, up to PULL_LIFT_WAIT_MS, then gives up without reloading.
const PULL_FULL = 200;
const PULL_LIFT_WAIT_MS = 4000;
// Where the page doesn't stretch (overscroll off, or overscroll-behavior: none) there's no
// spring back to wait for: the pull ends when the scrolling stops, or fades to macOS's coast of
// a few pixels a move (PULL_FADE_PX), for PULL_LET_GO_MS
const PULL_FADE_PX = 3;
const PULL_LET_GO_MS = 200;
// (a pull counts up to this far, so pushing back under PULL_FULL is a short move)
const PULL_MAX = 260;
// Pushing back counts this many times over: the stretch a pull leaves is a sliver of the
// scrolling that made it (Olly's trackpad: a 260 pull's stretch was gone after 17px of pushing
// back, and the page scrolled on under a bubble still nearly full). So the bubble goes as the
// stretch does, gone by about 13px, before the page scrolls.
const PULL_BACK_GAIN = 20;
// Pushing a pull back cancels it and nothing else: the page holds still for the rest of that
// gesture, its coast included (Olly: it scrolled down as the arrow went), until the scrolling
// has stopped for PULL_HOLD_GAP_MS (at most PULL_HOLD_MAX_MS). Held by a user sheet, so nothing of
// the page's is touched (and its !important outranks the page's; an agent sheet loaded by address
// can't be taken off again).
const PULL_HOLD_GAP_MS = 250;
const PULL_HOLD_MAX_MS = 4000;
const PULL_HOLD_SHEET = "data:text/css,:root{overflow:hidden!important}";

export class ZiaChild extends JSWindowActorChild {
  #lastSent = 0;
  #trailingTimer = null;
  #wheelWindows = new WeakSet();
  #gesture = null;
  #lastWheel = 0;
  #pullTimer = null;
  #pullFrame = 0;
  #liftWatch = null;
  #hold = null;
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
    if (this.#hold) {
      this.#holdOn(win);
    }
    // (a pull past the mark that waits for the spring back stays, whatever comes in the
    // meantime: macOS sends a scroll or two as the fingers lift, after a gap)
    const waiting = this.#gesture?.springs && this.#gesture.pull >= PULL_FULL;
    if (now - this.#lastWheel > PULL_GAP_MS && !still && !waiting) {
      // (a pull still on show is over: it went without a word before, and its bubble stayed)
      if (this.#gesture?.shown) {
        this.#endPull(true);
      }
      this.#gesture =
        this.#pullAllowed(event, win) && !this.#scrollsInside(event)
          ? { pull: 0, moves: 0, shown: false, springs: this.#springsBack(win) }
          : null;
    }
    // (a still event neither starts a pull nor keeps the last one's gap open)
    if (!still) {
      this.#lastWheel = now;
    }
    const gesture = this.#gesture;
    if (!gesture) {
      return;
    }
    // (a resting finger's pixel of jitter isn't pushing back; held before anything else, as
    // a quick push back has the page off its top by its first move)
    const pushesBack = gesture.shown && event.deltaY > PULL_STILL_PX;
    if (pushesBack) {
      this.#holdOn(win);
    }
    // (a sideways swipe is the back and forward gesture's, not a pull; a slow pull's drift of a
    // pixel or two sideways is still a pull)
    if (!this.#pullAllowed(event, win) || (Math.abs(event.deltaX) > PULL_SIDEWAYS_PX && Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.5)) {
      this.#endPull(true);
      return;
    }
    gesture.pull = Math.min(PULL_MAX, Math.max(0, gesture.pull - event.deltaY * (pushesBack ? PULL_BACK_GAIN : 1)));
    gesture.moves++;
    // (pushed all the way back: over now, not after the scrolling stops, as the page scrolls on)
    if (gesture.shown && gesture.pull === 0 && event.deltaY > 0) {
      this.#endPull(true);
      return;
    }
    // (past PULL_FULL, a pull waits for the spring back, or else for the scrolling to fade;
    // pushing back holds it open)
    const armed = gesture.pull >= PULL_FULL;
    if (armed && gesture.springs) {
      this.#watchLift();
      win.clearTimeout(this.#pullTimer);
      this.#pullTimer = win.setTimeout(() => this.#endPull(true), PULL_LIFT_WAIT_MS);
    } else {
      const holds = armed ? event.deltaY > PULL_STILL_PX || -event.deltaY > PULL_FADE_PX : Math.abs(event.deltaY) > PULL_STILL_PX;
      if (holds || !gesture.shown) {
        win.clearTimeout(this.#pullTimer);
        this.#pullTimer = win.setTimeout(() => this.#endPull(false), armed ? PULL_LET_GO_MS : PULL_GAP_MS);
      }
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

  // The page held still while a pull is pushed back, until the scrolling stops
  #holdOn(win) {
    if (!this.#hold) {
      try {
        win.windowUtils.loadSheetUsingURIString(PULL_HOLD_SHEET, win.windowUtils.USER_SHEET);
      } catch (err) {
        return;
      }
      this.#hold = { win, since: Date.now(), timer: 0 };
      // (and back to the top, for what scrolled before the hold took)
      if (win.scrollY > 0) {
        win.scrollTo({ top: 0, behavior: "instant" });
      }
    }
    win.clearTimeout(this.#hold.timer);
    const left = PULL_HOLD_MAX_MS - (Date.now() - this.#hold.since);
    this.#hold.timer = win.setTimeout(() => this.#holdOff(), Math.max(0, Math.min(PULL_HOLD_GAP_MS, left)));
  }

  #holdOff() {
    const hold = this.#hold;
    this.#hold = null;
    if (!hold) {
      return;
    }
    try {
      hold.win.clearTimeout(hold.timer);
      if (hold.win.scrollY > 0) {
        hold.win.scrollTo({ top: 0, behavior: "instant" });
      }
      hold.win.windowUtils.removeSheetUsingURIString(PULL_HOLD_SHEET, hold.win.windowUtils.USER_SHEET);
    } catch (err) {
    }
  }

  // Whether a pull past the top stretches this page, so letting go springs it back
  #springsBack(win) {
    try {
      const doc = win.document;
      const stops = [doc.documentElement, doc.body].some((el) => el && win.getComputedStyle(el).overscrollBehaviorY === "none");
      return !stops && win.windowUtils.asyncPanZoomEnabled && Services.prefs.getBoolPref("apz.overscroll.enabled", false);
    } catch (err) {
      return false;
    }
  }

  // The fingers have lifted: APZ ends its transform once the stretched page has sprung back
  // (one notice for the whole content process, so it only counts during a pull past the mark)
  #watchLift() {
    if (this.#liftWatch) {
      return;
    }
    this.#liftWatch = {
      observe: () => {
        if (this.#gesture?.springs && this.#gesture.pull >= PULL_FULL) {
          this.#endPull(false);
        }
      },
    };
    Services.obs.addObserver(this.#liftWatch, "APZ:TransformEnd");
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
  // scroll through their messages as a pull and reloaded the page.) Into web components too,
  // closed ones included: Reddit's chat scrolls inside one, and the event only names the
  // component outside it. Once, as a gesture starts.
  #scrollsInside(event) {
    const doc = event.target?.ownerDocument;
    const win = doc?.defaultView;
    if (!win) {
      return false;
    }
    // (down to what's really under the pointer, through each component's shadow)
    let el = event.target;
    for (let depth = 0; depth < 20 && el?.nodeType === 1; depth++) {
      const shadow = el.openOrClosedShadowRoot;
      const inner = shadow?.elementFromPoint?.(event.clientX, event.clientY);
      if (!inner || inner === el) {
        break;
      }
      el = inner;
    }
    for (; el?.nodeType === 1; el = el.parentElement || el.getRootNode()?.host) {
      if (el === doc.scrollingElement || el === doc.body || el === doc.documentElement) {
        return false;
      }
      if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll|overlay/.test(win.getComputedStyle(el).overflowY)) {
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
    if (gesture?.shown) {
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
    this.contentWindow?.clearTimeout(this.#pullTimer);
    this.#holdOff();
    if (this.#liftWatch) {
      Services.obs.removeObserver(this.#liftWatch, "APZ:TransformEnd");
      this.#liftWatch = null;
    }
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
