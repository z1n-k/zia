// With Zia's glass on, pressing an essential lights it under the pointer, and the light fades
// once it's let go; with it off, nothing
const [a] = await addTabs(["A"]);
gZenPinnedTabManager.addToEssentials(a);
await wait(800);
const look = () => ({
  press: a.getAttribute("zia-glass-press"),
  vars: Object.fromEntries([...a.style].filter((name) => name.startsWith("--zia-press")).sort().map((name) => [name, a.style.getPropertyValue(name)])),
});
EU.synthesizeMouseAtCenter(a, { type: "mousedown" }, window);
await wait(200);
const glassOff = look();
EU.synthesizeMouseAtCenter(a, { type: "mouseup" }, window);
await wait(500);
Services.prefs.setBoolPref("zia.glass", true);
await wait(300);
EU.synthesizeMouse(a, 10, 12, { type: "mousedown" }, window);
await wait(200);
const pressed = look();
EU.synthesizeMouse(a, 10, 12, { type: "mouseup" }, window);
await wait(150);
const letGo = look().press;
await wait(800);
const faded = look();
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
