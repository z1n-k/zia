// Marks a tab's browser zia-video while any of its frames shows a video
// (ZiaVideoChild.sys.mjs)

const showingFrames = new WeakMap();

export class ZiaVideoParent extends JSWindowActorParent {
  #browser = null;

  receiveMessage(message) {
    if (message.name === "ZiaVideo:Showing") {
      this.#browser ??= this.browsingContext?.top?.embedderElement;
      this.#mark(message.data?.showing);
    }
  }

  didDestroy() {
    this.#mark(false);
  }

  #mark(showing) {
    const browser = this.#browser;
    if (!browser) {
      return;
    }
    let frames = showingFrames.get(browser);
    if (!frames) {
      frames = new Set();
      showingFrames.set(browser, frames);
    }
    if (showing) {
      frames.add(this);
    } else {
      frames.delete(this);
    }
    browser.toggleAttribute("zia-video", frames.size > 0);
  }
}
