// The cards Zia shows in place of Firefox's tips: a space's icon at the foot of the sidebar
// hovered gets one after a beat, the next icon gets its own at once, and leaving them closes
// it. A pinned tab's minus says it only unloads, and goes back to Zen's word when unpinned.
const [p] = await addTabs(["P"]);
gBrowser.pinTab(p);
const two = await gZenWorkspaces.createAndSaveWorkspace("Two", undefined, true);
// (both spaces' icons in, with their tips stashed by Zia)
const icons = await until(() => {
  const all = [...gZenWorkspaces.workspaceIcons.querySelectorAll("toolbarbutton[zen-workspace-id]")];
  return all.length === 2 && all.every((icon) => icon.hasAttribute("zia-tip-text")) && all;
});
await atRest();
const home = icons.find((icon) => icon.getAttribute("zen-workspace-id") !== two.uuid);
const other = icons.find((icon) => icon.getAttribute("zen-workspace-id") === two.uuid);
const tipOf = (el) => ({ tooltiptext: el.getAttribute("tooltiptext"), stashed: el.getAttribute("zia-tip-text") });
const card = () => {
  const el = document.getElementById("zia-tip-card");
  if (!el) {
    return null;
  }
  const box = el.getBoundingClientRect();
  return {
    hidden: el.hidden,
    text: el.textContent,
    marks: ["zia-open", "zia-snap", "zia-closing"].filter((name) => el.hasAttribute(name)),
    left: el.style.left,
    top: el.style.top,
    origin: el.style.transformOrigin,
    size: [box.width, box.height].map(Math.round),
  };
};
const hover = (el) => EU.synthesizeMouseAtCenter(el, { type: "mousemove" }, window);

const tips = { home: tipOf(home), other: tipOf(other) };
// (a moment in, well before the beat: Zia's timer for it is due later, so always after this)
hover(home);
await wait(200);
const beforeBeat = card();
// (each card read once it's shown and has come to rest, and held)
await until(() => card()?.marks.includes("zia-open"));
await atRest();
const first = await steady(card);
hover(other);
await until(() => card()?.text === "Two");
await atRest();
const next = await steady(card);
// (and a moment after leaving, before its grace runs out, again on a timer of Zia's due later)
EU.synthesizeMouse(document.documentElement, 4, 4, { type: "mousemove" }, window);
await wait(150);
const leaving = card();
await until(() => card()?.hidden);
const left = await steady(card);

const reset = p.querySelector(".tab-reset-button");
const pinnedTip = { text: reset.getAttribute("tooltiptext"), marked: reset.hasAttribute("zia-tip") };
gBrowser.unpinTab(p);
// (Zen puts its own word back a moment later)
await until(() => !p.pinned && !reset.hasAttribute("zia-tip") && reset.getAttribute("tooltiptext") !== "Unload tab");
const unpinnedTip = { marked: reset.hasAttribute("zia-tip"), reworded: reset.getAttribute("tooltiptext") === "Unload tab" };

done({
  tips,
  beforeBeat,
  first,
  next,
  leaving,
  left,
  pinnedTip,
  unpinnedTip,
  checks: {
    "the icons' own tips are stashed": !!tips.home.stashed && tips.home.tooltiptext === null,
    "a card shows after a beat": !beforeBeat?.marks.includes("zia-open") && first?.marks.includes("zia-open") && first.text === tips.home.stashed,
    "the next shows at once": next?.text === "Two" && next.marks.includes("zia-snap"),
    "leaving closes it": left?.hidden === true,
    "a pinned tab's minus only unloads": pinnedTip.text === "Unload tab" && pinnedTip.marked,
    "unpinned, Zen's word is back": !unpinnedTip.marked && !unpinnedTip.reworded,
  },
  ziaErrors: ziaErrors(),
});
