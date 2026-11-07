export class ZiaParent extends JSWindowActorParent {
  receiveMessage(message) {
    const browser = this.browsingContext?.top?.embedderElement;
    // (the browser's window: ownerGlobal isn't there for this module in Firefox 159, so nothing
    // the page reported reached the window)
    const win = browser?.ownerGlobal || browser?.ownerDocument?.defaultView;
    if (message.name === "Zia:Scrolled") {
      win?.ziaOnPageScroll?.(browser, message.data);
    } else if (message.name === "Zia:Painted") {
      win?.ziaOnPagePainted?.(browser);
    } else if (message.name === "Zia:Pull") {
      win?.ziaOnPagePull?.(browser, message.data);
    }
  }
}
