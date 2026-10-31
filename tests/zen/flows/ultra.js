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
await until(() => tiles.every((tab) => tab.hasAttribute("zen-essential")));
await atRest();
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
// (each read once the open essential's drift has come or gone, and held)
const drifting = async (name) => {
  await until(() => Object.entries(drift()).every(([tile, list]) => (tile === name ? list.length > 0 : !list.length)));
  return steady(drift);
};
gBrowser.selectedTab = named("E1");
const drifts = { E1: await drifting("E1") };
gBrowser.selectedTab = named("E2");
drifts.E2 = await drifting("E2");
ultra(false);
drifts.ultraOff = await drifting(null);
ultra(true);
drifts.ultraOn = await drifting("E2");
Services.prefs.setBoolPref("zen.theme.essentials-favicon-bg", false);
drifts.zenColourOff = await drifting(null);

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
// (a moment in, well before the orb's own wait: a timer of Zia's due later, so always after this)
await wait(100);
const orbs = { "a moment in": orbOf() };
await until(() => orbOf().canvas);
orbs.loading = await steady(orbOf);
// (each still frame read once it's drawn afresh, from the last one, and held)
const drawn = { pixels: null };
const redrawn = async () => {
  const before = drawn.pixels;
  await until(() => busy.querySelector("canvas.zia-orb") && pixels(busy.querySelector("canvas.zia-orb")) !== before);
  const seen = await steady(() => ({ ...orbOf(), pixels: pixels(busy.querySelector("canvas.zia-orb")) }));
  drawn.pixels = seen.pixels;
  return seen;
};
Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
orbs.still = await redrawn();
busy.setAttribute("progress", "true");
load(["progress"]);
orbs.searching = await redrawn();
document.documentElement.setAttribute("zia-light", "true");
orbs.light = await redrawn();
document.documentElement.removeAttribute("zia-light");
orbs.dark = await redrawn();
ultra(false);
await until(() => !orbOf().canvas);
orbs.ultraOff = await steady(orbOf);
ultra(true);
drawn.pixels = null;
orbs.ultraOn = await redrawn();
busy.removeAttribute("busy");
busy.removeAttribute("progress");
load(["busy", "progress"]);
await until(() => !orbOf().canvas && !orbOf().tab);
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
// (played once it knows its length: already, if that came before this ran, as it can on a busy
// Mac; and asked again if the first ask is turned down, till it plays)
const play = () => a.play().catch(() => setTimeout(play, 250));
if (a.readyState >= 1) {
  play();
} else {
  a.onloadedmetadata = play;
}
</script>`;
const file = PathUtils.join(PathUtils.profileDir, "music.html");
await IOUtils.writeUTF8(file, page);
const music = gBrowser.addTab(PathUtils.toFileURI(file), { triggeringPrincipal: SYSTEM });
music.setAttribute("zia-test", "Music");
const [other] = await addTabs(["Other"]);
gBrowser.selectedTab = other;
const controller = () => music.linkedBrowser.browsingContext?.mediaController;
await until(() => controller()?.isPlaying, { what: "the tone to play", timeout: 30000 });
// (Zen's card up, dressed by Zia as in music.js, with its glow in)
const card = await until(() => {
  const el = document.querySelector("#zen-media-controls-toolbar .zen-media-card");
  return el?.hasAttribute("zia-glow-ready") && el.querySelector(".zen-media-focus-button[zia-art]") && el.querySelector(".zia-glow") && el;
}, { what: "the music card, dressed, with its glow", timeout: 20000 });
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
const glows = { playing: await steady(glowOf, { quiet: 500 }) };
EU.synthesizeMouseAtCenter(card, { type: "mousemove" }, window);
// (lit, its still frame drawn, and held)
await until(() => glowOf()?.attributes.includes("data-on=") && glowOf().values["--zg-glow"]);
glows.pointedAt = await steady(glowOf, { quiet: 500 });
EU.synthesizeMouseAtCenter(other, { type: "mousemove" }, window);
await until(() => !glowOf()?.attributes.includes("data-on="));
glows.left = await steady(glowOf, { quiet: 500 });
ultra(false);
await until(() => glowOf() === null);
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
