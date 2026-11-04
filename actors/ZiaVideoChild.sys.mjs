// Whether this page (or frame) shows a video on screen, for the compact
// sidebar to go solid over it (16-compact-mode.css). Its see-through glass
// has Firefox draw the page itself on macOS, and a video drawn that way comes
// out duller than macOS shows it, playing or paused (#564).

export class ZiaVideoChild extends JSWindowActorChild {
  #videos = new Set();
  #onScreen = new WeakSet();
  #observer = null;
  #showing = false;

  handleEvent(event) {
    if (event.type === "pagehide") {
      this.#observer?.disconnect();
      this.#videos.clear();
      this.#report();
      return;
    }
    const video = event.target;
    if (video?.localName !== "video") {
      return;
    }
    if (!this.#videos.has(video)) {
      this.#videos.add(video);
      this.#watch(video);
    }
    this.#report();
  }

  // (on screen as the page scrolls, or as a site hides it)
  #watch(video) {
    const win = this.contentWindow;
    if (!win) {
      return;
    }
    this.#observer ??= new win.IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this.#onScreen.add(entry.target);
        } else {
          this.#onScreen.delete(entry.target);
        }
      }
      this.#report();
    });
    this.#observer.observe(video);
  }

  #report() {
    let showing = false;
    for (const video of this.#videos) {
      if (!video.isConnected) {
        this.#observer?.unobserve(video);
        this.#videos.delete(video);
      } else if (this.#onScreen.has(video) && video.readyState >= 2 && video.videoWidth > 0) {
        showing = true;
      }
    }
    if (showing === this.#showing) {
      return;
    }
    this.#showing = showing;
    try {
      this.sendAsyncMessage("ZiaVideo:Showing", { showing });
    } catch (err) {
    }
  }

  didDestroy() {
    this.#observer?.disconnect();
  }
}
