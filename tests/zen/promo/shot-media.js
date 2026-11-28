// uses: film.js
// uses: promo/set.js
// 8 Media: the music card in the artwork's colours, the ring and sound bars; Multiview's four
// videos. The films are the Blender Foundation's (CC BY); the browser's volume is off.
Services.prefs.setIntPref("media.autoplay.default", 0);
Services.prefs.setBoolPref("media.block-autoplay-until-in-foreground", false);
Services.prefs.setStringPref("media.volume_scale", "0.0");
Services.prefs.setIntPref("browser.tabs.delayHidingAudioPlayingIconMS", 600000);
const set = await dressSet();
// a player: a quiet generated track (the volume's off) under Sintel's own title, composer and
// poster, as a music site would give them
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
const base = serve({
  "/score.html": `<title>The Ice Dragon</title><body style="margin:0;background:#000"><audio id=a src="data:audio/wav;base64,${btoa(String.fromCharCode(...wav))}" loop preload=auto></audio><script>
navigator.mediaSession.metadata = new MediaMetadata({ title: "The Ice Dragon", artist: "Jan Morgenstern", album: "Sintel", artwork: [{ src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg", sizes: "480x270", type: "image/jpeg" }] });
const play = () => a.play().catch(() => setTimeout(play, 250));
if (a.readyState >= 1) { play(); } else { a.onloadedmetadata = play; }
</script>`,
});
const music = gBrowser.addTab(base + "/score.html", { triggeringPrincipal: SYSTEM });
const browser = music.linkedBrowser;
await until(() => browser.browsingContext?.mediaController?.isPlaying, { timeout: 60000, what: "the track to play" });
gBrowser.selectedTab = set.tabs[0];
const card = () => document.querySelector("#zen-media-controls-toolbar .zen-media-card");
await until(() => card()?.hasAttribute("zia-glow-ready"), { timeout: 30000 }).catch(() => {});
await realWait(2500);
// (the film's own pictures at true speed: slowed while each frame takes its real time)
const sidebar = document.getElementById("navigator-toolbox").getBoundingClientRect();
let cues = {};
pointTo(sidebar.right + 300, sidebar.bottom - 120);
let t = glide(cues, 0.3, spot(card()), 0.45);
t = glide(cues, t + 1.2, spot(music, 0.5), 0.4);
mediaHold(music);
await film("8-music", t + 1.4, cues, { x: 0, y: Math.round(sidebar.bottom - 560), width: Math.round(sidebar.right + 4), height: 560 }, { each: mediaStep(music) });

// Multiview: four films in one tab, as "Add to Multiview" builds it
const films = [["BigBuckBunny", 95, "Big Buck Bunny"], ["ElephantsDream", 160, "Elephants Dream"], ["TearsOfSteel", 230, "Tears of Steel"], ["Sintel", 300, "Sintel"]];
const items = films.map(([name, at, title]) => `file:${encodeURIComponent(`https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/${name}.mp4`)}@${at};${encodeURIComponent(title)}`);
const mv = gBrowser.addTab(`https://z1n-k.github.io/zia/multiview/#~zia,${items.join(",")}`, { triggeringPrincipal: SYSTEM });
gBrowser.selectedTab = mv;
await until(() => mv.linkedBrowser.browsingContext?.mediaController?.isPlaying, { timeout: 60000, what: "Multiview to play" }).catch(() => {});
await realWait(6000);
mediaHold(mv);
cues = {};
pointTo(900, 900);
t = glide(cues, 0.4, spot(gBrowser.tabpanels, 0.3, 0.3), 0.5);
await film("8-multiview", 3.2, cues, null, { each: mediaStep(mv) });
const probe = await fetch("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4", { method: "HEAD" }).then((r) => `${r.status} ${r.headers.get("content-length")}`, (e) => String(e));
done({ probe, checks: {} });
