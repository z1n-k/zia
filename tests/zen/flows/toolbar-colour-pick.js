// A site's toolbar colour picked by hand, from the address bar's right-click menu: a click on
// the page keeps the colour under it, a typed hex is kept with Enter, and Reset goes back to
// the colour read from the page
const base = serve({ "/page": "<title>Page</title><body style='margin:0;background:#e0a020'><div style='height:120px;background:#1e50c8'></div>Page" });
const first = toolbarColour().props["--zia-site-bg"];
gBrowser.selectedTab = gBrowser.addTab(`${base}/page`, { triggeringPrincipal: SYSTEM });
// (loaded, and its colour read and held: Zia looks again a few times after a load)
await until(() => gBrowser.selectedBrowser.currentURI.spec === `${base}/page` && !gBrowser.selectedBrowser.webProgress.isLoadingDocument);
await until(() => toolbarColour().props["--zia-site-bg"] !== first);
const read = (await steady(toolbarColour, { quiet: 1000 })).props["--zia-site-bg"];
const saved = () => Services.prefs.getStringPref("zia.toolbar.manual-colors", "");

// The address's own menu, and Zia's items on it
async function openMenu() {
  const input = gURLBar.inputField;
  EU.synthesizeMouseAtCenter(input, { type: "contextmenu", button: 2 }, window);
  const menu = await until(() => [...document.querySelectorAll("menupopup")].find((popup) => popup.state === "open"));
  const item = (label) => [...(menu?.querySelectorAll("menuitem") || [])].find((el) => el.getAttribute("label") === label);
  return { menu, pick: item("Toolbar Color for This Site…"), reset: item("Reset Toolbar Color") };
}

let menu = await openMenu();
const items = { pick: !!menu.pick && !menu.pick.hidden, reset: !!menu.reset && !menu.reset.hidden };
menu.menu?.hidePopup();
menu.pick?.doCommand();
// (it opens once it has a picture of the page to pick from)
const overlay = await until(() => document.getElementById("zia-color-pick"));
const picker = {
  open: !!overlay,
  hint: overlay?.querySelector(".zia-color-pick-hint")?.textContent,
  input: overlay?.querySelector(".zia-color-pick-input")?.value,
  resetShown: overlay ? !overlay.querySelector(".zia-color-pick-reset").hidden : null,
};
// (over the blue band first, then a click below it, on the amber)
const box = overlay?.getBoundingClientRect();
if (overlay) {
  EU.synthesizeMouse(overlay, 200, 60, { type: "mousemove" }, window);
  await until(() => overlay.querySelector(".zia-color-pick-hex")?.textContent);
}
const hover = await steady(() => ({
  loupe: overlay?.querySelector(".zia-color-pick-hex")?.textContent,
  toolbar: toolbarColour().props["--zia-site-bg"],
}));
if (overlay) {
  EU.synthesizeMouse(overlay, 200, 300, { type: "mousemove" }, window);
  EU.synthesizeMouse(overlay, 200, 300, { type: "mousedown" }, window);
  EU.synthesizeMouse(overlay, 200, 300, { type: "mouseup" }, window);
}
await until(() => !document.getElementById("zia-color-pick"));
const clicked = await steady(() => ({ closed: !document.getElementById("zia-color-pick"), saved: saved(), toolbar: toolbarColour().props["--zia-site-bg"] }));

// Again, a hex typed in
menu = await openMenu();
const resetOffered = !!menu.reset && !menu.reset.hidden;
menu.menu?.hidePopup();
menu.pick?.doCommand();
const input = await until(() => document.querySelector("#zia-color-pick .zia-color-pick-input"));
const prefilled = input?.value;
if (input) {
  input.focus();
  input.select();
  EU.sendString("#336699", window);
  await until(() => input.value === "#336699");
  EU.synthesizeKey("KEY_Enter", {}, window);
}
await until(() => !document.getElementById("zia-color-pick"));
const typed = await steady(() => ({ prefilled, closed: !document.getElementById("zia-color-pick"), saved: saved(), toolbar: toolbarColour().props["--zia-site-bg"] }));

// And reset
menu = await openMenu();
menu.menu?.hidePopup();
menu.reset?.doCommand();
// (the page's colour read again, and held)
await until(() => toolbarColour().props["--zia-site-bg"] !== typed.toolbar);
const reset = await steady(() => ({ saved: saved(), toolbar: toolbarColour().props["--zia-site-bg"] }), { quiet: 1000 });
done({
  read,
  items,
  picker,
  overlaySize: box ? [Math.round(box.width), Math.round(box.height)] : null,
  hover,
  clicked,
  resetOffered,
  typed,
  reset,
  checks: {
    "the menu offers it": items.pick,
    "the picker opens": picker.open,
    "a click keeps the colour under it": clicked.toolbar === "rgb(224, 160, 32)",
    "a typed hex is kept": typed.toolbar === "rgb(51, 102, 153)",
    "reset reads the page again": reset.toolbar === read,
  },
  ziaErrors: ziaErrors(),
});
