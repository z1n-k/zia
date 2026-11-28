// uses: film.js
// uses: promo/set.js
// 9 And more: the find bar, the Library, Bookmarks and History beside the page, a PDF.
const set = await dressSet();
gBrowser.selectedTab = set.tabs[3];
await realWait(1500);

// find in page
let cues = {};
cues[0.2] = async () => { EU.synthesizeKey("f", { accelKey: true }, window); await realWait(200); };
let t = 0.8;
for (const ch of "aurora") {
  cues[t] = async () => { EU.sendString(ch, window); await realWait(80); };
  t += 0.08;
}
cues[t + 0.7] = async () => { EU.synthesizeKey("KEY_Enter", {}, window); await realWait(80); };
cues[t + 1.1] = async () => { EU.synthesizeKey("KEY_Enter", {}, window); await realWait(80); };
cues[t + 1.8] = async () => { EU.synthesizeKey("KEY_Escape", {}, window); await realWait(80); };
await film("9-find", t + 2.4, cues);

// the Library
cues = {};
cues[0.2] = async () => { document.getElementById("cmd_zenToggleLibrary").doCommand(); await realWait(200); };
cues[2.2] = async () => { document.getElementById("cmd_zenToggleLibrary").doCommand(); await realWait(200); };
await film("9-library", 3.0, cues);

// History beside the page
cues = {};
cues[0.2] = async () => { SidebarController.show("viewHistorySidebar"); await realWait(400); };
cues[2.0] = async () => { SidebarController.hide(); await realWait(200); };
await film("9-history", 2.7, cues);

// a PDF in Zia's viewer
const pdf = gBrowser.addTab("https://arxiv.org/pdf/1706.03762", { triggeringPrincipal: SYSTEM });
gBrowser.selectedTab = pdf;
await until(() => !pdf.hasAttribute("busy"), { timeout: 30000 }).catch(() => {});
await realWait(5000);
cues = {};
pointTo(900, 600);
t = glide(cues, 0.2, spot(gBrowser.tabpanels, 0.5, 0.45), 0.6);
await film("9-pdf", 1.8, cues);
done({ checks: {} });
