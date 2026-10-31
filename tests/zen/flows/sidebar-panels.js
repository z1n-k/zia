// Firefox's Bookmarks panel opened: Zia moves it beside the page as a second sidebar (sliding in
// from the window's edge), styles its page to match the tabs, and draws the tree's row
// highlights itself; closing slides it out first. With "beside" off, it goes back where Zen had it.
await addTabs(["A"]);
const root = document.documentElement;
const box = document.getElementById("sidebar-box");
const card = document.getElementById("zen-appcontent-wrapper");
const splitter = document.getElementById("sidebar-splitter");
const order = () => [...card.parentNode.children].filter((el) => [box, card, splitter].includes(el)).map((el) => el.id);
const place = () => ({
  besideCard: box.parentNode === card.parentNode,
  order: order(),
  resize: [splitter.getAttribute("resizebefore"), splitter.getAttribute("resizeafter")],
  hidden: box.hidden,
  maxWidth: box.style.maxWidth,
  flags: ["zia-panels-beside", "zia-panels-plain", "zia-panel-sliding"].filter((name) => root.hasAttribute(name)),
});
// (lengths to whole pixels)
const whole = (value) => (/^-?[\d.]+px$/.test(value) ? `${Math.round(parseFloat(value))}px` : value);
const vars = (el) => Object.fromEntries([...el.style].filter((name) => name.startsWith("--zia")).sort().map((name) => [name, whole(el.style.getPropertyValue(name).trim())]));

const closed = place();
SidebarController.show("viewBookmarksSidebar");
// (its page loaded and styled, the tree's highlights in, and slid in, with the slide's mark gone)
const doc = await until(() => {
  const loaded = document.getElementById("sidebar").contentDocument;
  return loaded?.readyState === "complete" && loaded.getElementById("zia-row-pills") && loaded.documentElement.style.getPropertyValue("--zia-row-h") && loaded;
});
await until(() => !box.hidden && !root.hasAttribute("zia-panel-sliding"));
await atRest();
const open = await steady(place);
const page = await steady(() => ({
  url: doc.documentURI,
  rowVars: vars(doc.documentElement),
  windowVars: Object.fromEntries(Object.entries(vars(root)).filter(([name]) => name.startsWith("--zia-panel"))),
}));
const pills = () =>
  [...doc.querySelectorAll("#zia-row-pills > .zia-row-pill")].map((pill) => ({
    kind: pill.hasAttribute("hover") ? "hover" : "selected",
    hidden: pill.hidden,
    box: pill.hidden ? null : ["top", "left", "width", "height"].map((side) => Math.round(parseFloat(pill.style[side]))),
  }));
const tree = doc.querySelector(".sidebar-placesTree");
const body = tree.treeBody || tree.querySelector("treechildren");
const unhovered = pills();
EU.synthesizeMouse(body, 20, tree.rowHeight / 2, { type: "mousemove" }, doc.defaultView);
// (placed on the next frame)
await until(() => pills().some((pill) => pill.kind === "hover" && !pill.hidden));
const hovered = pills();
const boxNow = box.getBoundingClientRect();
const size = [boxNow.left, boxNow.width].map(Math.round);
SidebarController.hide();
// (as it starts sliding out: read at once, as the slide is only a tenth of a second)
const hiding = place();
await until(() => box.hidden && !root.hasAttribute("zia-panel-sliding"));
const shut = await steady(place);

Services.prefs.setBoolPref("zia.sidebar-panels.beside", false);
await until(() => box.parentNode !== card.parentNode);
const home = await steady(place);
Services.prefs.clearUserPref("zia.sidebar-panels.beside");
await until(() => box.parentNode === card.parentNode);
const back = await steady(place);

done({
  closed,
  open,
  page,
  unhovered,
  hovered,
  size,
  hiding,
  shut,
  home,
  back,
  checks: {
    "it opens beside the page": open.besideCard && !open.hidden && open.flags.includes("zia-panels-beside"),
    "its page is styled like the tabs": !!page.rowVars["--zia-row-h"] && unhovered.length === 2,
    "a hovered row gets its pill": hovered.some((pill) => pill.kind === "hover" && !pill.hidden),
    "closing hides it": shut.hidden,
    "beside off, it goes back": !home.besideCard && !home.flags.includes("zia-panels-beside"),
    "and on again, beside": back.besideCard,
  },
  ziaErrors: ziaErrors(),
});
