// The toolbar's buttons in motion: back slides through as it's clicked, reload and stop
// turn into each other as a page loads, and reload's arrowhead springs back on hover
const base = serve({ "/one": "<title>One</title><body>One", "/two": "<title>Two</title><body>Two" });
const browser = () => gBrowser.selectedBrowser;
// (a page loaded, with reload back from stop and its morph over, and everything at rest)
const loaded = async (path) => {
  await until(() => browser().currentURI.spec === `${base}${path}` && !browser().webProgress.isLoadingDocument && !document.getElementById("reload-button")?.hasAttribute("displaystop") && !document.getElementById("stop-reload-button")?.hasAttribute("zia-morph"), { what: `${path} to load` });
  await atRest();
};
gBrowser.selectedTab = gBrowser.addTab(`${base}/one`, { triggeringPrincipal: SYSTEM });
await loaded("/one");
const container = document.getElementById("stop-reload-button");
const morphs = [];
const watcher = new MutationObserver(() => morphs.push(container.getAttribute("zia-morph") || "(none)"));
if (container) {
  watcher.observe(container, { attributes: true, attributeFilter: ["zia-morph"] });
}
gBrowser.selectedBrowser.loadURI(Services.io.newURI(`${base}/two`), { triggeringPrincipal: SYSTEM });
await loaded("/two");
watcher.disconnect();
// (a load slower than the morph lets the first one end before the next: that gap's left out)
const morphsSeen = morphs.filter((morph, i) => morph !== "(none)" || i === morphs.length - 1);

const back = document.getElementById("back-button");
let slide = null;
let slideCleared = null;
if (back && !back.hasAttribute("disabled")) {
  EU.synthesizeMouseAtCenter(back, {}, window);
  slide = back.getAttribute("zia-slide");
  await until(() => !back.hasAttribute("zia-slide"));
  slideCleared = !back.hasAttribute("zia-slide");
  // (back on the first page, as hovering reload while it's coming back from stop does nothing)
  await loaded("/one");
}

const reload = document.getElementById("reload-button");
let cut = null;
if (reload) {
  // (each read once its spring, eased a frame at a time, has come to rest)
  const cutNow = () => reload.style.getPropertyValue("--zia-reload-cut");
  const resting = cutNow();
  reload.dispatchEvent(new MouseEvent("mouseenter"));
  await until(() => cutNow() !== resting);
  cut = { hovered: await steady(cutNow) };
  reload.dispatchEvent(new MouseEvent("mouseleave"));
  await until(() => cutNow() !== cut.hovered);
  cut.left = await steady(cutNow);
}
done({
  morphs: morphsSeen,
  slide,
  slideCleared,
  cut,
  checks: {
    "reload turns into stop and back": morphs.includes("to-stop") && morphs.includes("to-reload"),
    "back slides as it's clicked": slide === "true" && slideCleared,
    "reload's arrowhead springs back on hover": cut?.hovered === "20deg" && cut?.left === "0deg",
  },
  ziaErrors: ziaErrors(),
});
