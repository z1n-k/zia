// Something playing in a background tab: the music card Zia dresses (artwork, ring, time
// left, sound bars in the artwork's colours), the playing tab's own sound bars, muting the
// tab from them, and pausing. The tab plays a six-second tone on a loop (Zen offers no card
// for under three), with its own title, artist and two-colour artwork, and the browser's
// volume at nothing.
Services.prefs.setIntPref("media.autoplay.default", 0);
Services.prefs.setBoolPref("media.block-autoplay-until-in-foreground", false);
Services.prefs.setStringPref("media.volume_scale", "0.0");
// (Firefox keeps a tab's sound mark a few seconds after it stops: kept for good, so the paused
// tab reads the same however long the pause takes to land)
Services.prefs.setIntPref("browser.tabs.delayHidingAudioPlayingIconMS", 600000);
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
// (saying, if it never does, how the tab stood)
const tabState = () => `the tone to play (the tab: ${music.linkedBrowser.currentURI.spec.split("/").pop()}, ${["busy", "pending", "activemedia-blocked", "soundplaying", "muted"].filter((name) => music.hasAttribute(name)).join(" ") || "no marks"}, ${controller() ? "a" : "no"} media controller)`;
await until(() => controller()?.isPlaying, { what: tabState, timeout: 30000 });

const card = () => document.querySelector("#zen-media-controls-toolbar .zen-media-card");
// (the bars' images are numbered as they're made, so a fresh one restarts its animation)
const image = (value) => {
  const url = value.replace(/^url\("|"\)$/g, "");
  let h = 0x811c9dc5;
  const bare = url.replace(/#\d+$/, "");
  for (let i = 0; i < bare.length; i++) {
    h = Math.imul(h ^ bare.charCodeAt(i), 0x01000193) >>> 0;
  }
  return value ? `${h.toString(16)}${/#\d+$/.test(url) ? " numbered" : ""}` : "";
};
const zia = (el) => Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith("zia-")).map((a) => [a.name, a.name === "zia-art" ? (a.value.startsWith("data:image/png") ? "the artwork" : a.value) : a.value]));
const vars = (el) => Object.fromEntries([...el.style].filter((p) => p.startsWith("--zia")).sort().map((p) => [p, /sound/.test(p) ? image(el.style.getPropertyValue(p)) : el.style.getPropertyValue(p).replace(/data:image\/png[^"]*/, "the artwork")]));
const ring = (el) =>
  el
    ? [...el.querySelectorAll("*")].map((node) => `${node.localName} ${["class", "id", "offset", "style", "stroke", "stroke-linecap", "stroke-width", "pathLength", "fill"].filter((a) => node.hasAttribute(a) && (a !== "style" || node.localName === "stop")).map((a) => `${a}=${node.getAttribute(a).replace(/\d+$/, "n")}`).join(" ")}`)
    : null;
const cardState = () => {
  const el = card();
  if (!el) {
    return null;
  }
  const button = el.querySelector(".zen-media-focus-button");
  const box = el.getBoundingClientRect();
  return {
    classes: [...el.classList].sort(),
    attributes: zia(el),
    vars: vars(el),
    size: `${Math.round(box.width)}x${Math.round(box.height)}`,
    title: el.querySelector(".zen-media-title")?.textContent.trim(),
    artist: el.querySelector(".zen-media-artist")?.textContent.trim(),
    button: button && { attributes: zia(button), vars: vars(button) },
    ring: ring(el.querySelector(".zia-ring")),
    // (how much is left, and how far round the ring is, depends on how long it's played: only that it counts down)
    timeLeft: /^-\d+:\d\d$/.test(el.querySelector("#zen-media-duration, .zen-media-duration")?.textContent.trim() || ""),
  };
};
const bars = (tab) => {
  const el = tab.querySelector(".zia-tab-sound");
  return {
    soundplaying: tab.hasAttribute("soundplaying"),
    muted: tab.hasAttribute("muted"),
    bars: el && `${el.localName}.${el.className} role=${el.getAttribute("role")} title=${el.getAttribute("title")} after ${el.nextElementSibling?.className.split(" ")[0]}`,
    vars: vars(tab),
  };
};

// (Zen's card up and Zia's dressing done: the artwork on it, its colours read and painted into
// the bars, the ring, and the playing tab's own bars; then as it stays)
await until(() => card()?.hasAttribute("zia-glow-ready") && card().querySelector(".zen-media-focus-button[zia-art]") && card().querySelector(".zia-ring") && card().style.getPropertyValue("--zia-sound-still") && music.querySelector(".zia-tab-sound") && music.style.getPropertyValue("--zia-sound-wave"), { what: "the music card, dressed", timeout: 20000 });
const playing = await steady(() => ({ card: cardState(), tab: bars(music), otherTab: bars(other) }), { quiet: 500 });
EU.synthesizeMouseAtCenter(music.querySelector(".zia-tab-sound"), {}, window);
await until(() => music.hasAttribute("muted"));
const muted = await steady(() => ({ card: cardState(), tab: bars(music) }), { quiet: 500 });
EU.synthesizeMouseAtCenter(music.querySelector(".zia-tab-sound"), {}, window);
await until(() => !music.hasAttribute("muted"));
const unmuted = await steady(() => ({ tab: bars(music) }), { quiet: 500 });
card().querySelector(".zen-media-playpause-button").doCommand();
await until(() => !card().classList.contains("playing"));
const paused = await steady(() => ({ card: cardState(), tab: bars(music) }), { quiet: 500 });
done({
  playing,
  muted,
  unmuted,
  paused,
  checks: {
    "Zen showed a card": !!playing.card,
    "Zia put the artwork on it": playing.card?.button?.attributes["zia-art"] === "the artwork",
    "the tab shows its sound bars": !!playing.tab.bars,
    "the bars mute the tab": muted.tab.muted && !unmuted.tab.muted,
    "it paused": !paused.card?.classes.includes("playing"),
  },
  ziaErrors: ziaErrors(),
});
