// Zia: the window side of Zia's actor. It hands a page's paints and scrolls to the browser
// window it's in (ziaOnPagePainted and ziaOnPageScroll, 01-site-colour.js and 11-split-panes.js).
// Used elsewhere: ZiaParent (as the actor's parent).

export class ZiaParent extends JSWindowActorParent {
  receiveMessage(message) {
    const browser = this.browsingContext?.top?.embedderElement;
    const win = browser?.ownerGlobal;
    if (message.name === "Zia:Scrolled") {
      win?.ziaOnPageScroll?.(browser, message.data);
    } else if (message.name === "Zia:Painted") {
      win?.ziaOnPagePainted?.(browser);
    }
  }
}
