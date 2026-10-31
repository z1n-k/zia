// Cmd held: a number on every visible tab (two digits widen the key); Cmd+1 then Cmd+0 lights
// the tenth tab's key, and letting go of Cmd chooses that tab and the keys slide away. Then Cmd held and something else pressed puts
// them away with nothing chosen.
await addTabs(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]);
gBrowser.selectedTab = named("A");
await until(() => named("A").linkedBrowser.docShellIsActive);
await atRest();
const root = document.documentElement;
const keys = () =>
  gBrowser.visibleTabs
    .filter((tab) => tab.querySelector(".zia-tab-number"))
    .map((tab) => {
      const key = tab.querySelector(".zia-tab-number");
      const box = key.getBoundingClientRect();
      return {
        tab: nameOf(tab),
        text: key.textContent,
        wide: key.hasAttribute("zia-wide"),
        target: key.hasAttribute("zia-target"),
        box: [box.left, box.top, box.width, box.height].map(Math.round),
      };
    });
const flags = () => ["zia-tab-numbers", "zia-tab-numbers-leaving"].filter((name) => root.hasAttribute(name));

EU.synthesizeKey("KEY_Meta", { type: "keydown" }, window);
// (the keys in, and come to rest)
await until(() => flags().includes("zia-tab-numbers") && keys().length);
await atRest();
const held = { flags: flags(), keys: keys() };
const targets = () => keys().filter((key) => key.target).map((key) => key.text);
EU.synthesizeKey("1", { type: "keydown", metaKey: true }, window);
EU.synthesizeKey("1", { type: "keyup", metaKey: true }, window);
await until(() => targets().length);
const first = targets();
EU.synthesizeKey("0", { type: "keydown", metaKey: true }, window);
await until(() => targets().join() !== first.join());
await atRest();
const typed = { flags: flags(), keys: keys() };
EU.synthesizeKey("0", { type: "keyup", metaKey: true }, window);
EU.synthesizeKey("KEY_Meta", { type: "keyup" }, window);
// (a moment after letting go, while the keys slide away: the flag for it goes on a timer of
// Zia's due later, so always after this)
await wait(30);
const lettingGo = flags();
await until(() => !flags().length);
await atRest();
const chosen = nameOf(gBrowser.selectedTab);
const after = flags();

EU.synthesizeKey("KEY_Meta", { type: "keydown" }, window);
await until(() => flags().includes("zia-tab-numbers"));
await atRest();
const heldAgain = flags();
// (again a moment in, as they slide away)
EU.synthesizeKey("x", { type: "keydown", metaKey: true }, window);
await wait(50);
const otherKey = flags();
EU.synthesizeKey("x", { type: "keyup", metaKey: true }, window);
EU.synthesizeKey("KEY_Meta", { type: "keyup" }, window);
await until(() => !flags().length);
await atRest();

done({
  held,
  first,
  typed,
  lettingGo,
  chosen,
  after,
  heldAgain,
  otherKey,
  stillChosen: nameOf(gBrowser.selectedTab),
  checks: {
    "holding Cmd numbers the tabs": held.flags.includes("zia-tab-numbers") && held.keys.length >= 3,
    "two digits widen the key": held.keys.some((key) => key.wide && key.text === "10") && held.keys.some((key) => !key.wide && key.text === "9"),
    "Cmd+1 then Cmd+0 lights the tenth": first.join() === "1" && typed.keys.filter((key) => key.target).map((key) => key.text).join() === "10",
    "letting go chooses it": chosen === typed.keys.find((key) => key.target)?.tab,
    "and the keys slide away": lettingGo.includes("zia-tab-numbers-leaving") && after.length === 0,
    "another key puts them away": heldAgain.includes("zia-tab-numbers") && !otherKey.includes("zia-tab-numbers"),
  },
  ziaErrors: ziaErrors(),
});
