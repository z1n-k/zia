// The toolbar takes the site's colour, read from the top of the page: a red site, a cream
// one in the same tab, a near-black one in a new tab, and back to the red tab (shown from
// what was read, without reading again)
const base = serve({
  "/red": "<title>Red</title><body style='margin:0;background:#c81e1e'>Red",
  "/cream": "<title>Cream</title><body style='margin:0;background:#f5ecd7'>Cream",
  "/dark": "<title>Dark</title><body style='margin:0;background:#0d1117'>Dark",
});
const before = toolbarColour();
// (each read once the page has loaded and its colour has been taken in and held: Zia looks
// again a few times after a load, as late as 4.5 seconds in)
const loaded = async (path, last) => {
  const browser = gBrowser.selectedBrowser;
  await until(() => browser.currentURI.spec === `${base}${path}` && !browser.webProgress.isLoadingDocument, { what: `${path} to load` });
  await until(() => toolbarColour().props["--zia-site-bg"] !== last.props["--zia-site-bg"], { what: `the colour of ${path}` });
  return steady(toolbarColour, { quiet: 1000 });
};
const redTab = gBrowser.addTab(`${base}/red`, { triggeringPrincipal: SYSTEM });
gBrowser.selectedTab = redTab;
const red = await loaded("/red", before);
gBrowser.selectedBrowser.loadURI(Services.io.newURI(`${base}/cream`), { triggeringPrincipal: SYSTEM });
const cream = await loaded("/cream", red);
gBrowser.selectedTab = gBrowser.addTab(`${base}/dark`, { triggeringPrincipal: SYSTEM });
const dark = await loaded("/dark", cream);
gBrowser.selectedTab = redTab;
// (back to the first tab: shown from what was read, so no load to wait for)
await until(() => toolbarColour().props["--zia-site-bg"] !== dark.props["--zia-site-bg"]);
const back = await steady(toolbarColour);
done({
  before,
  red,
  cream,
  dark,
  back,
  checks: {
    "red is read": red.props["--zia-site-bg"] === "rgb(200, 30, 30)",
    "cream is read": cream.props["--zia-site-bg"] === "rgb(245, 236, 215)",
    "cream takes dark ink": cream.marks.includes("zia-site-light"),
    "near-black is read": dark.props["--zia-site-bg"] === "rgb(13, 17, 23)",
    "the tab shows its own colour again": back.props["--zia-site-bg"] === cream.props["--zia-site-bg"],
  },
  ziaErrors: ziaErrors(),
});
