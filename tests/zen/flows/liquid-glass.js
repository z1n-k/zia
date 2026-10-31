// With Zia's glass on, pressing an essential lights it under the pointer, and the light fades
// once it's let go; with it off, nothing
const [a] = await addTabs(["A"]);
gZenPinnedTabManager.addToEssentials(a);
await until(() => a.hasAttribute("zen-essential"));
await atRest();
const look = () => ({
  press: a.getAttribute("zia-glass-press"),
  vars: Object.fromEntries([...a.style].filter((name) => name.startsWith("--zia-press")).sort().map((name) => [name, a.style.getPropertyValue(name)])),
});
// (off, a press a moment in lights nothing)
EU.synthesizeMouseAtCenter(a, { type: "mousedown" }, window);
await wait(200);
const glassOff = look();
EU.synthesizeMouseAtCenter(a, { type: "mouseup" }, window);
await atRest();
Services.prefs.setBoolPref("zia.glass", true);
await until(() => Services.prefs.getBoolPref("zia.glass"));
EU.synthesizeMouse(a, 10, 12, { type: "mousedown" }, window);
await until(() => look().press === "in");
const pressed = await steady(look, { quiet: 200 });
// (what the press turns to first once let go: watched, as it only lasts the fade)
const turns = [];
const watcher = new MutationObserver(() => turns.push(a.getAttribute("zia-glass-press")));
watcher.observe(a, { attributes: true, attributeFilter: ["zia-glass-press"] });
EU.synthesizeMouse(a, 10, 12, { type: "mouseup" }, window);
await until(() => turns.length);
const letGo = turns[0];
await until(() => !a.hasAttribute("zia-glass-press"));
watcher.disconnect();
const faded = await steady(look);
Services.prefs.clearUserPref("zia.glass");
done({
  glassOff,
  pressed,
  letGo,
  faded,
  checks: {
    "off, no light": !glassOff.press,
    "pressed, it lights": pressed.press === "in" && !!pressed.vars["--zia-press-light"],
    "let go, it fades": letGo === "out",
    "and clears": !faded.press && Object.keys(faded.vars).length === 0,
  },
  ziaErrors: ziaErrors(),
});
