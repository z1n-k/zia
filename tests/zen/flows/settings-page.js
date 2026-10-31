// Zia Settings from the ⋯ menu: it opens, lists its sections, and closes with Escape
PanelUI.show();
await wait(1000);
const item = document.getElementById("zia-settings-menu-button");
item?.doCommand();
await wait(1200);
const page = document.getElementById("zia-settings");
const sections = page ? [...page.querySelectorAll(".zia-set-section-title")].map((el) => el.textContent.trim()) : [];
const rows = page ? page.querySelectorAll(".zia-set-row").length : 0;
const markedNew = page ? [...page.querySelectorAll(".zia-set-nav-item.new")].map((el) => el.textContent.trim()) : [];
EU.synthesizeKey("KEY_Escape", {}, window);
await wait(800);
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
