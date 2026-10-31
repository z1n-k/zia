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
await until(() => browser.currentURI.schemeIs("https"), { what: "the search engine's page", timeout: 20000 });
// (and loaded, as the page can take the focus as it arrives, and Zia lets go of it again
// up to a second and a half in: read once that's all held still a while)
await until(() => !browser.webProgress?.isLoadingDocument, { what: "the search engine's page to load", timeout: 20000 });
const seen = await steady(() => ({ value: gURLBar.value, focused: gURLBar.focused, page: browser.currentURI.schemeIs("https") ? browser.currentURI.host : browser.currentURI.spec }), { quiet: 1600 });
const page = seen.page;
done({
  value: seen.value,
  focused: seen.focused,
  page,
  checks: { "the bar lets go": !gURLBar.focused, "it opened the search engine's page": page === engineHost },
  ziaErrors: ziaErrors(),
});
