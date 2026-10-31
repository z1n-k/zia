// The address bar's paperclip copies the page's link and turns into a tick for a moment
const base = serve({ "/page": "<title>Page</title><body>Page" });
gBrowser.selectedTab = gBrowser.addTab(`${base}/page?q=1`, { triggeringPrincipal: SYSTEM });
await wait(2000);
const button = document.getElementById("zia-copy-link-button");
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
await wait(300);
const copied = unported(clipboard());
const tick = !!button?.hasAttribute("zia-copied");
await wait(1500);
const back = !button?.hasAttribute("zia-copied");
// (and hidden on a page that isn't a website)
gBrowser.selectedTab = gBrowser.addTab("data:text/html,<title>Data</title>Data", { triggeringPrincipal: SYSTEM });
await wait(1000);
done({
  shownOnPage,
  copied,
  tick,
  back,
  hiddenOffSite: !!button?.hidden,
  checks: { "it shows on a website": shownOnPage, "the link is copied": copied === "http://localhost:PORT/page?q=1", "it turns into a tick": tick, "and back": back },
  ziaErrors: ziaErrors(),
});
