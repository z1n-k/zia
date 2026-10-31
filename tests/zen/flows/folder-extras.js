// A folder's extras: its glass icon holds a sheet per tab and turns into a box past three, its
// menu gives it a colour, Show Icon on Folder and Bookmark Folder, its header gets a delete
// button, and an empty folder shows a dashed slot drawn to its size
const [x, y, z, w, v] = await addTabs(["X", "Y", "Z", "W", "V"]);
const folder = gZenFolders.createFolder([x, y], { label: "F", renameFolder: false });
await wait(1000);
const icon = () => ({
  count: folder.getAttribute("zia-fi-count"),
  full: folder.hasAttribute("zia-fi-full"),
  on: [...folder.querySelectorAll(".zia-fb-sheet[zia-on]")].length,
  items: folder.ziaFolderItems,
});
const two = icon();
folder.addTabs([z]);
await wait(1200);
const three = icon();
folder.addTabs([w, v]);
await wait(2000);
const five = icon();
// the folder's menu
const menu = document.getElementById("zenFolderActions");
EU.synthesizeMouseAtCenter(folder.labelElement, { type: "contextmenu", button: 2 }, window);
await wait(600);
const colorMenu = document.getElementById("zia-folder-color-menu");
const items = {
  state: menu.state,
  colors: [...(colorMenu?.querySelectorAll("menuitem") || [])].map((item) => `${item.getAttribute("label")}${item.hasAttribute("checked") ? " (checked)" : ""}`),
  iconOnFolder: document.getElementById("zia-folder-icon-on-folder")?.hidden,
  bookmark: document.getElementById("zia-folder-bookmark")?.hidden,
};
colorMenu.querySelector("menuitem[zia-color='blue']").doCommand();
menu.hidePopup();
await wait(500);
const colored = { attr: folder.getAttribute("zia-folder-color"), kept: JSON.parse(Services.prefs.getStringPref("zia.folder-colors", "{}"))[folder.id] };
// an empty folder: its slot, and the dashes drawn to it
const empty = gZenFolders.createFolder([], { label: "E", renameFolder: false });
await wait(1500);
const root = document.documentElement;
const slot = {
  empty: empty.hasAttribute("zia-empty"),
  collapsed: empty.hasAttribute("collapsed"),
  vars: ["mt", "mb", "ms", "me", "h"].map((name) => root.style.getPropertyValue(`--zia-slot-${name}`)),
  live: empty.style.getPropertyValue("--zia-slot-dashes-live"),
  canvases: [...(document.getElementById("zia-slot-canvases")?.children || [])].map((canvas) => `${canvas.style.width}x${canvas.style.height}`),
  image: !!empty.style.getPropertyValue("--zia-slot-dashes-image"),
  page: !!root.style.getPropertyValue("--zia-slot-dashes-image"),
};
// moved out of the first folder, a tab fills the empty one
empty.addTabs([v]);
await wait(1200);
const filled = { empty: empty.hasAttribute("zia-empty"), first: icon() };
// the delete button on the header
const close = folder.querySelector(":scope > .tab-group-label-container > .zia-folder-close");
const button = close ? { tooltip: close.getAttribute("tooltiptext") } : null;
EU.synthesizeMouseAtCenter(close, {}, window);
await wait(1500);
const deleted = { connected: folder.isConnected, list: listOrder() };
Services.prefs.clearUserPref("zia.folder-colors");
done({
  two,
  three,
  five,
  items,
  colored,
  slot,
  filled,
  button,
  deleted,
  checks: {
    "a sheet per tab, up to three": two.count === "2" && three.count === "3",
    "past three it's a box": five.full && five.on > 0,
    "the menu has Zia's items": items.colors.length === 8 && items.bookmark === false,
    "a colour is set and kept": colored.attr === "blue" && colored.kept === "blue",
    "an empty folder shows its slot": slot.empty && !!slot.live && slot.canvases.length > 0,
    "a tab in it ends the slot": !filled.empty,
    "the delete button deletes it": !!button && !deleted.list.includes("X"),
  },
  ziaErrors: ziaErrors(),
});
