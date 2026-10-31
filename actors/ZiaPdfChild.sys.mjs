// Zia: spots Firefox's PDF viewer and gives it Dia's look (ZiaPdf.sys.mjs,
// zia-pdf.css). Registered by zia.uc.js with a query string that changes
// every session, so Firefox never runs a cached copy of an older version.
// Used elsewhere: ZiaPdfChild (as the actor's child).

export class ZiaPdfChild extends JSWindowActorChild {
  handleEvent(event) {
    if (event.type !== "DOMContentLoaded") {
      return;
    }
    const doc = this.document;
    const win = this.contentWindow;
    if (!doc || !win) {
      return;
    }
    // Firefox's own viewer: its page runs from resource://pdf.js, which a
    // website's copy of PDF.js can't.
    let isViewer = false;
    try {
      isViewer =
        !!doc.getElementById("outerContainer") &&
        !!doc.getElementById("toolbarViewer") &&
        ((doc.nodePrincipal?.spec || "").startsWith("resource://pdf.js") ||
          !!doc.querySelector('script[src^="resource://pdf.js/"]'));
    } catch (err) {
      isViewer = false;
    }
    if (!isViewer) {
      return;
    }
    console.info("[Zia] PDF view: found Firefox's PDF viewer");
    try {
      if (!Services.prefs.getBoolPref("zia.pdf.dia-style", true)) {
        console.info("[Zia] PDF view: switched off in Zia's settings");
        return;
      }
    } catch (err) {
      // no pref yet: on by default
    }
    try {
      const url = "chrome://sine/content/zia/actors/ZiaPdf.sys.mjs" + new URL(import.meta.url).search;
      ChromeUtils.importESModule(url).diaPdf(win);
      console.info("[Zia] PDF view: applied");
    } catch (err) {
      console.error("[Zia] PDF view:", err);
    }
  }
}
