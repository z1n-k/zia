// The toolbar's buttons in motion: back slides through as it's clicked, reload and stop
// turn into each other as a page loads, and reload's arrowhead springs back on hover
const base = serve({ "/one": "<title>One</title><body>One", "/two": "<title>Two</title><body>Two" });
gBrowser.selectedTab = gBrowser.addTab(`${base}/one`, { triggeringPrincipal: SYSTEM });
await wait(1200);
const container = document.getElementById("stop-reload-button");
const morphs = [];
const watcher = new MutationObserver(() => morphs.push(container.getAttribute("zia-morph") || "(none)"));
if (container) {
  watcher.observe(container, { attributes: true, attributeFilter: ["zia-morph"] });
}
gBrowser.selectedBrowser.loadURI(Services.io.newURI(`${base}/two`), { triggeringPrincipal: SYSTEM });
await wait(1500);
watcher.disconnect();

const back = document.getElementById("back-button");
let slide = null;
let slideCleared = null;
if (back && !back.hasAttribute("disabled")) {
  EU.synthesizeMouseAtCenter(back, {}, window);
  slide = back.getAttribute("zia-slide");
  await wait(600);
  slideCleared = !back.hasAttribute("zia-slide");
}

const reload = document.getElementById("reload-button");
let cut = null;
if (reload) {
  reload.dispatchEvent(new MouseEvent("mouseenter"));
  await wait(600);
  cut = { hovered: reload.style.getPropertyValue("--zia-reload-cut") };
  reload.dispatchEvent(new MouseEvent("mouseleave"));
  await wait(600);
  cut.left = reload.style.getPropertyValue("--zia-reload-cut");
}
done({
  morphs,
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
