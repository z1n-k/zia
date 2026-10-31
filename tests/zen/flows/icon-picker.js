// Zia's icon picker, opened as a folder's "Change icon" opens Zen's picker: the Zia tab shows the
// icons, a search narrows them, Solid switches their style, a search with no match says so, and
// clicking an icon sets it on the folder.
const [x, y] = await addTabs(["X", "Y"]);
const folder = gZenFolders.createFolder([x, y], { label: "F", renameFolder: false });
await wait(800);
const panel = document.getElementById("PanelUI-zen-emojis-picker");
gZenFolders.changeFolderUserIcon(folder);
await wait(800);
const zia = document.getElementById("zia-icons-tab");
EU.synthesizeMouseAtCenter(zia, {}, window);
await wait(500);
const search = document.getElementById("zia-icons-search");
const grid = document.getElementById("zia-icons-grid");
const state = () => {
  const items = [...grid.querySelectorAll(".zia-icon-item")];
  return {
    count: items.length,
    first: items.slice(0, 6).map((item) => `${item.getAttribute("tooltiptext")} ${item.style.listStyleImage}`),
    empty: document.getElementById("zia-icons-empty").hidden ? "" : document.getElementById("zia-icons-empty").textContent,
    style: [...document.querySelectorAll(".zia-icons-style-option")].filter((button) => button.hasAttribute("selected")).map((button) => button.textContent),
  };
};
const tabs = [...document.getElementById("PanelUI-zen-emojis-buttons-wrapper").children].map((tab) => `${tab.getAttribute("label")}${tab.classList.contains("selected") ? " (selected)" : ""}`);
const shown = { open: panel.state, tabs, focused: document.activeElement === search, placeholder: search.placeholder, ...state() };

search.focus();
EU.sendString("heart", window);
await wait(300);
const searched = state();
const [outline, solid] = document.querySelectorAll(".zia-icons-style-option");
EU.synthesizeMouseAtCenter(solid, {}, window);
await wait(300);
const filled = { pref: Services.prefs.getStringPref("zia.icons.style", ""), ...state() };
EU.synthesizeMouseAtCenter(outline, {}, window);
await wait(300);
search.select();
EU.sendString("qqqzzzq", window);
await wait(300);
const nothing = state();
search.select();
EU.sendString("wallet", window);
await wait(300);
const item = grid.querySelector(".zia-icon-item");
const want = item.style.listStyleImage;
EU.synthesizeMouseAtCenter(item, {}, window);
await wait(500);
const icon = folder.iconURL;
const stillOpen = panel.state;
panel.hidePopup();
await wait(500);

done({
  shown,
  searched,
  filled,
  nothing,
  icon,
  stillOpen,
  closed: panel.state,
  checks: {
    "the picker opens on Zia's icons": shown.open === "open" && shown.tabs.some((tab) => tab === "Zia (selected)") && shown.count > 50,
    "a search narrows them": searched.count > 0 && searched.count < shown.count && searched.first[0].startsWith("heart url"),
    "Solid switches their style": filled.pref === "filled" && filled.style.join() === "Solid" && filled.count > 0 && filled.first.every((one) => one.includes("/filled/")),
    "no match says so": nothing.count === 0 && nothing.empty === "No icons found",
    "clicking one sets it on the folder": want === `url("${icon}")`,
  },
  ziaErrors: ziaErrors(),
});
