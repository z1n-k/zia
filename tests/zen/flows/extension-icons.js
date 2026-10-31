// Zia's Change icon menus: in the toolbar's right-click menu (only for an extension's button, so
// hidden here, with no extensions in the test profile), and in place of Zen's Change icon on a
// folder's and a space's menus
const [a, b] = await addTabs(["A", "B"]);
const describe = (menu) =>
  menu && {
    hidden: menu.hidden,
    items: [...menu.querySelectorAll("menuitem, menuseparator")].map((el) =>
      [el.getAttribute("label") || el.localName, el.hidden && "hidden", el.disabled && "disabled", el.getAttribute("checked") === "true" && "checked"].filter(Boolean).join(" ")
    ),
  };
const nav = document.getElementById("nav-bar");
const toolbarMenu = document.getElementById("toolbar-context-menu");
toolbarMenu.openPopup(nav, "after_start", 0, 0, true, false, null);
await wait(600);
const toolbar = {
  separator: toolbarMenu.querySelector(".zia-ext-icon-separator")?.hidden,
  menu: describe(toolbarMenu.querySelector(".zia-ext-icon-menu")),
};
toolbarMenu.hidePopup();
await wait(300);

const folder = gZenFolders.createFolder([a, b], { renameFolder: false, label: "F" });
await wait(800);
const folderMenu = document.getElementById("zenFolderActions");
EU.synthesizeMouseAtCenter(folder.labelElement, { type: "contextmenu", button: 2 }, window);
await wait(600);
const onFolder = {
  open: folderMenu.state,
  zia: describe(folderMenu.querySelector(".zia-own-icon-menu")),
  zensHidden: document.getElementById("context_zenFolderChangeIcon").hidden,
};
folderMenu.hidePopup();
await wait(300);

const spaceMenu = document.getElementById("zenWorkspaceMoreActions");
spaceMenu.openPopup(nav, "after_start", 0, 0, true, false, null);
await wait(600);
const onSpace = {
  zia: describe(spaceMenu.querySelector(".zia-own-icon-menu")),
  zensHidden: document.getElementById("context_zenEditWorkspaceIcon").hidden,
};
spaceMenu.hidePopup();
await wait(300);
done({
  toolbar,
  onFolder,
  onSpace,
  checks: {
    "no extension, no menu": toolbar.separator === true && toolbar.menu?.hidden === true,
    "the folder's menu has Zia's in place of Zen's": onFolder.zia?.hidden === false && onFolder.zensHidden,
    "so has the space's": onSpace.zia?.hidden === false && onSpace.zensHidden,
  },
  ziaErrors: ziaErrors(),
});
