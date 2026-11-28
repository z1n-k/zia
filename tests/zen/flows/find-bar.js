// The find bar: it opens empty (not with the last search, nor the system's find clipboard on
// macOS), and its match count reads as "1/3"
// (waits on what it's waiting for, polled, up to a limit)
const pollFor = async (ok, ms = 4000) => {
  for (let waited = 0; waited < ms && !ok(); waited += 50) {
    await wait(50);
  }
};
await addTabs([]);
const tab = gBrowser.addTab("data:text/html,<title>Find</title><p>apple pie, apple tart, apple cake</p>", { triggeringPrincipal: SYSTEM });
tab.setAttribute("zia-test", "Find");
gBrowser.selectedTab = tab;
await pollFor(() => tab.linkedBrowser.currentURI?.spec.startsWith("data:") && !tab.hasAttribute("busy"));
await wait(300);
// the system's find clipboard holds an earlier search
const clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
if (Services.clipboard.isClipboardTypeSupported(Ci.nsIClipboard.kFindClipboard)) {
  clipboard.copyStringToClipboard("elsewhere", Ci.nsIClipboard.kFindClipboard);
}
const findbar = await gBrowser.getFindBar(tab);
const field = () => findbar._findField.value;
const count = () => findbar.querySelector(".found-matches")?.getAttribute("zia-count") ?? null;
findbar.onFindCommand();
// (a fixed wait: what's checked is that the clipboard's search never arrives)
await wait(800);
const opened = { hidden: findbar.hidden, field: field() };
EU.sendString("apple", window);
await pollFor(() => /\/3$/.test(count() || ""));
const searched = { field: field(), count: count() };
findbar.onFindAgainCommand(false);
await pollFor(() => count() !== searched.count);
const again = { count: count() };
findbar.close(true);
await pollFor(() => findbar.hidden);
findbar.onFindCommand();
await wait(800);
const reopened = { hidden: findbar.hidden, field: field() };
findbar.close(true);
await wait(300);
done({
  opened,
  searched,
  again,
  reopened,
  checks: {
    "it opens empty": opened.field === "",
    "the count reads as n/m": /^\d+\/3$/.test(searched.count || ""),
    "it reopens empty": reopened.field === "",
  },
  ziaErrors: ziaErrors(),
});
