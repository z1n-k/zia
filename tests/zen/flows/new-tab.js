// A new tab (Cmd+T): the address bar lets go unless the setting says otherwise, and its
// address stays empty
await addTabs(["A"]);
// (Zia's new tab is the default search engine's home page)
const search = Services.search || ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService;
await search.init();
const engine = await search.getDefault();
const engineHost = engine.getSubmission("zia").uri.host;
BrowserCommands.openTab();
// (the tab opens on about:newtab, which Zia sends on to the search page as it starts loading)
const browser = gBrowser.selectedTab.linkedBrowser;
for (let i = 0; i < 40 && !browser.currentURI.schemeIs("https"); i++) {
  await wait(250);
}
await wait(1500);
const page = browser.currentURI.schemeIs("https") ? browser.currentURI.host : browser.currentURI.spec;
done({
  value: gURLBar.value,
  focused: gURLBar.focused,
  page,
  checks: { "the bar lets go": !gURLBar.focused, "it opened the search engine's page": page === engineHost },
  ziaErrors: ziaErrors(),
});
