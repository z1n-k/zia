// The toolbar takes the site's colour, read from the top of the page: a red site, a cream
// one in the same tab, a near-black one in a new tab, and back to the red tab (shown from
// what was read, without reading again)
const base = serve({
  "/red": "<title>Red</title><body style='margin:0;background:#c81e1e'>Red",
  "/cream": "<title>Cream</title><body style='margin:0;background:#f5ecd7'>Cream",
  "/dark": "<title>Dark</title><body style='margin:0;background:#0d1117'>Dark",
});
const before = toolbarColour();
const redTab = gBrowser.addTab(`${base}/red`, { triggeringPrincipal: SYSTEM });
gBrowser.selectedTab = redTab;
await wait(3500);
const red = toolbarColour();
gBrowser.selectedBrowser.loadURI(Services.io.newURI(`${base}/cream`), { triggeringPrincipal: SYSTEM });
await wait(3500);
const cream = toolbarColour();
gBrowser.selectedTab = gBrowser.addTab(`${base}/dark`, { triggeringPrincipal: SYSTEM });
await wait(3500);
const dark = toolbarColour();
gBrowser.selectedTab = redTab;
await wait(300);
const back = toolbarColour();
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
