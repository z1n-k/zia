// A new tab (Cmd+T): the address bar lets go unless the setting says otherwise, and its
// address stays empty
await addTabs(["A"]);
// (Zia's new tab is the default search engine's home page)
const search = Services.search || ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService;
await search.init();
const engine = await search.getDefault();
const engineHost = engine.getSubmission("zia").uri.host;
BrowserCommands.openTab();
await wait(2500);
done({
  value: gURLBar.value,
  focused: gURLBar.focused,
  page: gBrowser.selectedTab.linkedBrowser.currentURI.host,
  checks: { "the bar lets go": !gURLBar.focused, "it opened the search engine's page": gBrowser.selectedTab.linkedBrowser.currentURI.host === engineHost },
  ziaErrors: ziaErrors(),
});
