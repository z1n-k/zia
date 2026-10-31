// The cards Zia shows in place of Firefox's tips: a space's icon at the foot of the sidebar
// hovered gets one after a beat, the next icon gets its own at once, and leaving them closes
// it. A pinned tab's minus says it only unloads, and goes back to Zen's word when unpinned.
const [p] = await addTabs(["P"]);
gBrowser.pinTab(p);
const two = await gZenWorkspaces.createAndSaveWorkspace("Two", undefined, true);
await wait(1000);
const icons = [...gZenWorkspaces.workspaceIcons.querySelectorAll("toolbarbutton[zen-workspace-id]")];
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
hover(home);
await wait(200);
const beforeBeat = card();
await wait(800);
const first = card();
hover(other);
await wait(100);
const next = card();
EU.synthesizeMouse(document.documentElement, 4, 4, { type: "mousemove" }, window);
await wait(150);
const leaving = card();
await wait(700);
const left = card();

const reset = p.querySelector(".tab-reset-button");
const pinnedTip = { text: reset.getAttribute("tooltiptext"), marked: reset.hasAttribute("zia-tip") };
gBrowser.unpinTab(p);
await wait(500);
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
