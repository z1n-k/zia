// A split made an essential from its tab's menu: one essential drawn as a tile of both sites,
// the split hidden behind it and tagged as its halves; selected, the tile shows the half you're
// in; closed, its split is an ordinary one again.
const [a, b] = await addTabs(["A", "B"]);
gBrowser.selectedTab = a;
await wait(300);
gZenViewSplitter.splitTabs([a, b], "vsep", 0);
await wait(1200);
const menu = document.getElementById("tabContextMenu");
TabContextMenu.contextTab = a;
menu.openPopup(a, "after_start", 0, 0, true, false, null);
await wait(600);
const item = document.getElementById("zia-context-split-essential");
const offered = { ours: !item.hidden, zens: !document.getElementById("context_zen-add-essential")?.hidden };
menu.hidePopup();
await wait(300);
TabContextMenu.contextTab = a;
item.doCommand();
await wait(1200);
const tile = () => {
  const essential = gBrowser.tabs.find((tab) => tab.hasAttribute("zia-split-tile"));
  return essential && {
    halves: [...essential.querySelectorAll(".zia-split-half")].map((half) => `${half.getAttribute("side")}: ${half.querySelector("label").getAttribute("value")}`),
    focus: essential.getAttribute("zia-split-focus"),
    selected: essential.hasAttribute("visuallyselected"),
    glow: !!essential.style.getPropertyValue("--zia-split-glow"),
  };
};
const tags = () => gBrowser.tabs.filter((tab) => tab.hasAttribute("zia-split-of")).map((tab) => `${nameOf(tab)}: ${tab.getAttribute("zia-split-side")}`);
const added = { tile: tile(), tags: tags(), essentials: essentials().length, list: listOrder() };
gBrowser.selectedTab = b;
await wait(600);
const onB = tile();
const essential = gBrowser.tabs.find((tab) => tab.hasAttribute("zia-split-tile"));
gBrowser.removeTab(essential);
await wait(1200);
const closed = { tile: tile() || null, tags: tags(), essentials: essentials().length, list: listOrder(), split: a.group?.hasAttribute("split-view-group") };
done({
  offered,
  added,
  onB,
  closed,
  checks: {
    "the menu offers it": offered.ours && !offered.zens,
    "it becomes a tile of both": added.tile?.halves.length === 2 && added.tags.length === 2,
    "the tile shows the half you're in": onB?.focus === "b" && onB.selected,
    "closed, the split is ordinary again": !closed.tile && closed.tags.length === 0,
  },
  ziaErrors: ziaErrors(),
});
