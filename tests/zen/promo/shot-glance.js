// uses: film.js
// uses: promo/set.js
// 5 Glance: the genie opening out of a link; the page's picture rising out of its tab and sinking
// back; a glance card springing from an essential.
const set = await dressSet();
Services.prefs.setBoolPref("zia.glance.genie", true);
// (the glanced pages loaded once beforehand, so they're ready to draw as the glance opens)
for (const url of ["https://en.wikipedia.org/wiki/Solar_wind", "https://github.com/z1n-k/zia/releases"]) {
  const warm = await openSite(url, { select: true });
  await until(() => !warm.hasAttribute("busy"), { timeout: 20000 }).catch(() => {});
  await realWait(1500);
  gBrowser.removeTab(warm, { animate: false });
}
gBrowser.selectedTab = set.tabs[3];
await realWait(1500);
const panels = gBrowser.tabpanels.getBoundingClientRect();
// (where a link sits on the Aurora article, in the page: the glance grows from there)
const link = { clientX: Math.round(panels.width * 0.42), clientY: Math.round(panels.height * 0.42), width: 120, height: 22 };
let cues = {};
pointTo(panels.left + link.clientX + 60, panels.top + link.clientY + 40);
let t = glide(cues, 0.15, { x: panels.left + link.clientX + 50, y: panels.top + link.clientY + 11 }, 0.3);
cues[t + 0.1] = async () => {
  gZenGlanceManager.openGlance({ url: "https://en.wikipedia.org/wiki/Solar_wind", ...link, triggeringPrincipal: SYSTEM });
  // (the page drawn while the clock's held, so the genie lands on it, not on a blank)
  await realWait(1200);
};
t += 1.9;
cues[t] = async () => { gZenGlanceManager.closeGlance(); await realWait(100); };
await film("5-genie", t + 1.4, cues, null, { live: true });

// a glance from an essential: its card springs out
gBrowser.selectedTab = set.essentials[1];
await realWait(1500);
cues = {};
cues[0.3] = async () => {
  gZenGlanceManager.openGlance({ url: "https://github.com/z1n-k/zia/releases", clientX: 400, clientY: 300, width: 160, height: 24, triggeringPrincipal: SYSTEM });
  await realWait(1200);
};
cues[2.4] = async () => { gZenGlanceManager.closeGlance(); await realWait(100); };
await film("5-essential", 3.6, cues, null, { live: true });
Services.prefs.clearUserPref("zia.glance.genie");
done({ checks: {} });
