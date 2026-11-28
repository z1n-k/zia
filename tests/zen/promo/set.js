// The promo's set, the same in every shot: one space ("Studio"), real sites, essentials, and a
// coloured folder with an icon, the window filling a 1080p screen.
// uses: film.js (loaded before this, by the shot)

const SET = {
  essentials: ["https://www.youtube.com/@NASA", "https://github.com/z1n-k/zia", "https://www.figma.com/", "https://linear.app/", "https://open.spotify.com/"],
  folder: { label: "Inspiration", color: "blue", tabs: ["https://godly.website/", "https://dribbble.com/shots/popular", "https://land-book.com/"] },
  tabs: ["https://stripe.com/", "https://www.apple.com/macbook-air/", "https://www.theverge.com/", "https://en.wikipedia.org/wiki/Aurora"],
};

async function openSite(url, { select = false } = {}) {
  const tab = gBrowser.addTab(url, { triggeringPrincipal: SYSTEM, inBackground: !select });
  if (select) {
    gBrowser.selectedTab = tab;
  }
  return tab;
}

async function loaded(tabs, timeout = 45000) {
  await until(() => tabs.every((t) => !t.hasAttribute("busy") && t.linkedBrowser.currentURI.spec !== "about:blank"), { what: "the set's sites to load", timeout }).catch(() => {});
}

// Zen's own notices (the "Update Complete!" card) off the set
function clearNotices() {
  for (const el of document.querySelectorAll("*")) {
    if (el.childElementCount === 0 && /Update Complete!/.test(el.textContent || "")) {
      const card = el.closest("[class*=notification], [id*=notification], vbox, box");
      (card?.closest(".zen-sidebar-notification, #zen-sidebar-notifications, [class*=sidebar-notification]") || card)?.remove();
    }
  }
}

async function nameSpace(name) {
  document.getElementById("context_zenEditWorkspace").doCommand();
  await until(() => document.activeElement?.closest?.("#tab-label-input"));
  EU.synthesizeKey("a", { accelKey: true }, window);
  EU.sendString(name, window);
  EU.synthesizeKey("KEY_Enter", {}, window);
  await until(() => gZenWorkspaces.getActiveWorkspace().name === name).catch(() => {});
}

async function dressSet() {
  await stage();
  const startTabs = [...gBrowser.tabs];
  clearNotices();
  await nameSpace("Studio");
  const essentials = [];
  for (const url of SET.essentials) {
    essentials.push(await openSite(url));
  }
  for (const tab of essentials) {
    gZenPinnedTabManager.addToEssentials(tab);
  }
  const folderTabs = [];
  for (const url of SET.folder.tabs) {
    folderTabs.push(await openSite(url));
  }
  const folder = gZenFolders.createFolder(folderTabs, { label: SET.folder.label, renameFolder: false });
  const tabs = [];
  for (const url of SET.tabs) {
    tabs.push(await openSite(url));
  }
  // (each site loaded once: Zen leaves tabs opened in the background unloaded)
  for (const tab of [...essentials, ...folderTabs, ...tabs]) {
    gBrowser.selectedTab = tab;
    await until(() => !tab.hasAttribute("pending") && tab.linkedBrowser.currentURI.spec !== "about:blank", { timeout: 20000 }).catch(() => {});
  }
  // (the blank tab the profile starts with goes)
  for (const tab of startTabs) {
    if (tab.isConnected && !essentials.includes(tab)) {
      gBrowser.removeTab(tab, { animate: false });
    }
  }
  gBrowser.selectedTab = tabs[0];
  await loaded([...essentials, ...folderTabs, ...tabs]);
  // the folder's colour, as its menu sets it
  const prefs = JSON.parse(Services.prefs.getStringPref("zia.folder-colors", "{}"));
  prefs[folder.id] = SET.folder.color;
  Services.prefs.setStringPref("zia.folder-colors", JSON.stringify(prefs));
  folder.setAttribute("zia-folder-color", SET.folder.color);
  clearNotices();
  await atRest();
  await realWait(1500);
  clearNotices();
  return { essentials, folder, folderTabs, tabs };
}
