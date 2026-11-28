// Zia Settings from the ⋯ menu: it opens, lists its sections, and closes with Escape
PanelUI.show();
// (the menu is built as it first opens)
const item = await until(() => PanelUI.panel.state === "open" && document.getElementById("zia-settings-menu-button"));
item?.doCommand();
// (the page is built once its list of settings has loaded)
const page = await until(() => document.getElementById("zia-settings")?.querySelector(".zia-set-row") && document.getElementById("zia-settings"));
const { sections, rows, markedNew } = await steady(() => ({
  sections: [...page.querySelectorAll(".zia-set-section-title")].map((el) => el.textContent.trim()),
  rows: page.querySelectorAll(".zia-set-row").length,
  markedNew: [...page.querySelectorAll(".zia-set-nav-item.new")].map((el) => el.textContent.trim()),
}));
EU.synthesizeKey("KEY_Escape", {}, window);
await until(() => !document.getElementById("zia-settings"));
done({
  menuItem: !!item,
  opened: !!page,
  sections,
  rows,
  markedNew,
  closed: !document.getElementById("zia-settings") || document.getElementById("zia-settings").hidden,
  checks: { "the menu item exists": !!item, "the page opened": !!page, "it lists its sections": sections.length > 5, "and their settings": rows > 20 },
  ziaErrors: ziaErrors(),
});
