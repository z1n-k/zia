// Ultra (zia.ultra, on by default) and what it draws: the drifting colour round the open
// essential, the thinking orb on a loading tab (after its first moment, then searching, in
// light, Ultra off and on, done), and the glow under the music card while you point at it.
// The orb and the glow animate on the page's clock, so their pixels are read under reduced
// motion, where each draws one still frame.
const ultra = (on) => Services.prefs.setBoolPref("zia.ultra", on);
const hash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16);
};
const pixels = (canvas) => (canvas?.width && canvas?.height ? hash(String(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data)) : "empty");
const px = (value) => String(value).replace(/-?\d+(\.\d+)?px/g, (n) => `${Math.round(parseFloat(n))}px`);

// The essential's drift: Zia's own animations on its background's ::after
Services.prefs.setBoolPref("zen.theme.essentials-favicon-bg", true);
const tiles = await addTabs(["E1", "E2"]);
for (const tab of tiles) {
  gZenPinnedTabManager.addToEssentials(tab);
}
await wait(1200);
const drift = () =>
  Object.fromEntries(
    gBrowser.tabs
      .filter((tab) => tab.hasAttribute("zen-essential"))
      .map((tab) => [
        nameOf(tab),
        (tab.querySelector(":scope > .tab-stack > .tab-background")?.getAnimations({ subtree: true }) || [])
          .filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition) && a.effect?.pseudoElement === "::after")
          .map((a) => {
            const timing = a.effect.getTiming();
            const frames = a.effect.getKeyframes().map((f) => Object.entries(f).filter(([k]) => !["composite", "computedOffset"].includes(k)).map(([k, v]) => `${k}:${v}`).join(" "));
            return `${timing.duration} ${timing.direction} ${timing.iterations} start ${a.startTime} ${a.playState} | ${frames.join(" | ")}`;
          }),
      ])
  );
gBrowser.selectedTab = named("E1");
await wait(800);
const drifts = { E1: drift() };
gBrowser.selectedTab = named("E2");
await wait(800);
drifts.E2 = drift();
ultra(false);
await wait(500);
drifts.ultraOff = drift();
ultra(true);
await wait(500);
drifts.ultraOn = drift();
Services.prefs.setBoolPref("zen.theme.essentials-favicon-bg", false);
await wait(500);
drifts.zenColourOff = drift();

// The orb on a loading tab
const [busy] = await addTabs(["Busy"]);
const orbOf = () => {
  const canvas = busy.querySelector("canvas.zia-orb");
  return {
    tab: busy.getAttribute("zia-orb"),
    canvas: canvas && `in ${canvas.parentNode.className} ${[...canvas.attributes].map((a) => `${a.name}=${a.name === "style" ? px(a.value) : a.value}`).join(" ")} ${canvas.width}x${canvas.height}`,
  };
};
const load = (changed) => gBrowser._tabAttrModified(busy, changed);
busy.setAttribute("busy", "true");
load(["busy"]);
await wait(100);
const orbs = { "a moment in": orbOf() };
await wait(600);
orbs.loading = orbOf();
Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
await wait(600);
orbs.still = { ...orbOf(), pixels: pixels(busy.querySelector("canvas.zia-orb")) };
busy.setAttribute("progress", "true");
load(["progress"]);
await wait(300);
orbs.searching = { ...orbOf(), pixels: pixels(busy.querySelector("canvas.zia-orb")) };
document.documentElement.setAttribute("zia-light", "true");
await wait(300);
orbs.light = { ...orbOf(), pixels: pixels(busy.querySelector("canvas.zia-orb")) };
document.documentElement.removeAttribute("zia-light");
await wait(300);
orbs.dark = { ...orbOf(), pixels: pixels(busy.querySelector("canvas.zia-orb")) };
ultra(false);
await wait(300);
orbs.ultraOff = orbOf();
ultra(true);
await wait(800);
orbs.ultraOn = { ...orbOf(), pixels: pixels(busy.querySelector("canvas.zia-orb")) };
busy.removeAttribute("busy");
busy.removeAttribute("progress");
load(["busy", "progress"]);
await wait(300);
orbs.loaded = orbOf();

// The glow under the music card (see music.js for the tab that plays)
Services.prefs.setIntPref("media.autoplay.default", 0);
Services.prefs.setBoolPref("media.block-autoplay-until-in-foreground", false);
Services.prefs.setStringPref("media.volume_scale", "0.0");
const rate = 8000;
const samples = rate * 6;
const wav = new Uint8Array(44 + samples);
const view = new DataView(wav.buffer);
const text = (at, s) => [...s].forEach((c, i) => (wav[at + i] = c.charCodeAt(0)));
text(0, "RIFF");
view.setUint32(4, 36 + samples, true);
text(8, "WAVEfmt ");
[[16, 16, 4], [20, 1, 2], [22, 1, 2], [24, rate, 4], [28, rate, 4], [32, 1, 2], [34, 8, 2]].forEach(([at, value, size]) => (size === 4 ? view.setUint32(at, value, true) : view.setUint16(at, value, true)));
text(36, "data");
view.setUint32(40, samples, true);
for (let i = 0; i < samples; i++) {
  wav[44 + i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 440 * i) / rate));
}
const page = `<title>Zia Song</title><audio id=a src="data:audio/wav;base64,${btoa(String.fromCharCode(...wav))}" loop preload=auto></audio><script>
const art = document.createElement("canvas");
art.width = art.height = 32;
const ctx = art.getContext("2d");
ctx.fillStyle = "rgb(220, 40, 50)";
ctx.fillRect(0, 0, 16, 32);
ctx.fillStyle = "rgb(30, 80, 230)";
ctx.fillRect(16, 0, 16, 32);
navigator.mediaSession.metadata = new MediaMetadata({ title: "Zia Song", artist: "Zia Test", artwork: [{ src: art.toDataURL(), sizes: "32x32", type: "image/png" }] });
a.onloadedmetadata = () => a.play();
</script>`;
const file = PathUtils.join(PathUtils.profileDir, "music.html");
await IOUtils.writeUTF8(file, page);
const music = gBrowser.addTab(PathUtils.toFileURI(file), { triggeringPrincipal: SYSTEM });
music.setAttribute("zia-test", "Music");
const [other] = await addTabs(["Other"]);
gBrowser.selectedTab = other;
const controller = () => music.linkedBrowser.browsingContext?.mediaController;
for (let i = 0; i < 40 && !controller()?.isPlaying; i++) {
  await wait(250);
}
await wait(2500);
const card = document.querySelector("#zen-media-controls-toolbar .zen-media-card");
const glowOf = () => {
  const root = card?.querySelector(".zia-glow");
  if (!root) {
    return null;
  }
  const props = [...root.style].filter((p) => p.startsWith("--zg-")).sort();
  return {
    attributes: [...root.attributes].filter((a) => a.name !== "style").map((a) => `${a.name}=${a.value}`).sort(),
    layers: [...root.children].map((el) => `${el.localName}.${(el.getAttribute("class") || "").trim().replace(/\s+/g, ".")} ${hash(el.getAttribute("style") || "")}`),
    values: Object.fromEntries(["--zg-glow", "--zg-h", "--zg-w", "--zg-hue", "--zg-x3", "--zg-l3"].map((p) => [p, root.style.getPropertyValue(p)])),
    allValues: hash(props.map((p) => `${p}:${root.style.getPropertyValue(p)}`).join(";")),
    canvas: `${root.querySelector("canvas").width}x${root.querySelector("canvas").height} ${pixels(root.querySelector("canvas"))}`,
  };
};
const glows = { playing: glowOf() };
EU.synthesizeMouseAtCenter(card, { type: "mousemove" }, window);
await wait(2000);
glows.pointedAt = glowOf();
EU.synthesizeMouseAtCenter(other, { type: "mousemove" }, window);
await wait(1500);
glows.left = glowOf();
ultra(false);
await wait(500);
glows.ultraOff = glowOf();
done({
  drifts,
  orbs,
  glows,
  checks: {
    "the open essential drifts": drifts.E1.E1.length === 3 && drifts.E2.E2.length === 3 && !drifts.E2.E1.length,
    "the drift stops with Ultra off": !drifts.ultraOff.E2.length,
    "a loading tab shows an orb, but not at once": !orbs["a moment in"].canvas && !!orbs.loading.canvas,
    "the orb goes when it's loaded": !orbs.loaded.canvas && !orbs.loaded.tab,
    "the card glows while pointed at": !!glows.pointedAt?.attributes.includes("data-on=") && !glows.left?.attributes.includes("data-on="),
    "no glow with Ultra off": glows.ultraOff === null,
  },
  ziaErrors: ziaErrors(),
});
