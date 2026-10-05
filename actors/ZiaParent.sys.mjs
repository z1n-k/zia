

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
