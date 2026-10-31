// The address bar's paperclip copies the page's link and turns into a tick for a moment
const base = serve({ "/page": "<title>Page</title><body>Page" });
gBrowser.selectedTab = gBrowser.addTab(`${base}/page?q=1`, { triggeringPrincipal: SYSTEM });
const button = document.getElementById("zia-copy-link-button");
// (loaded, and the paperclip shown for a website)
await until(() => gBrowser.selectedBrowser.currentURI.spec === `${base}/page?q=1` && !gBrowser.selectedBrowser.webProgress.isLoadingDocument && !button?.hidden);
await atRest();
const clipboard = () => {
  try {
    const transfer = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
    transfer.init(null);
    transfer.addDataFlavor("text/plain");
    Services.clipboard.getData(transfer, Ci.nsIClipboard.kGlobalClipboard, window.browsingContext.currentWindowContext);
    const data = {};
    transfer.getTransferData("text/plain", data);
    return data.value.QueryInterface(Ci.nsISupportsString).data;
  } catch (e) {
    return null;
  }
};
Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString("before");
const shownOnPage = !!button && !button.hidden;
if (button) {
  EU.synthesizeMouseAtCenter(button, {}, window);
}
// (the tick comes once the paperclip has popped out, and stays a second or so)
await until(() => button?.hasAttribute("zia-copied"));
const copied = unported(clipboard());
const tick = !!button?.hasAttribute("zia-copied");
await until(() => !button?.hasAttribute("zia-copied"));
const back = !button?.hasAttribute("zia-copied");
// (and hidden on a page that isn't a website)
gBrowser.selectedTab = gBrowser.addTab("data:text/html,<title>Data</title>Data", { triggeringPrincipal: SYSTEM });
await until(() => gBrowser.selectedBrowser.currentURI.schemeIs("data") && button?.hidden);
done({
  shownOnPage,
  copied,
  tick,
  back,
  hiddenOffSite: !!button?.hidden,
  checks: { "it shows on a website": shownOnPage, "the link is copied": copied === "http://localhost:PORT/page?q=1", "it turns into a tick": tick, "and back": back },
  ziaErrors: ziaErrors(),
});
