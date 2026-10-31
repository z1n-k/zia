// Hover cards: a tab hovered gets its card beside the sidebar after a beat (title, domain, its
// buttons), the next tab's card is there at once, and leaving closes it. A closed folder hovered
// gets a card listing its tabs and a New Tab row, and choosing a row selects that tab.
const [a, b, x, y] = await addTabs(["A", "B", "X", "Y"]);
const folder = gZenFolders.createFolder([x, y], { label: "F", renameFolder: false });
gBrowser.selectedTab = a;
await wait(800);
folder.collapsed = true;
await wait(1000);
const describe = (el) => {
  if (!el) {
    return null;
  }
  const box = el.getBoundingClientRect();
  return {
    hidden: el.hidden,
    marks: ["zia-open", "zia-snap", "zia-closing", "zia-anchor", "zia-side", "zia-folder-color"].filter((name) => el.hasAttribute(name)).map((name) => `${name}=${el.getAttribute(name)}`),
    left: el.style.left,
    top: el.style.top,
    origin: el.style.transformOrigin,
    size: [box.width, box.height].map(Math.round),
  };
};
const tabCard = () => {
  const el = document.getElementById("zia-tab-card");
  return el && {
    ...describe(el),
    title: el.querySelector(".zia-tab-card-title").textContent,
    sub: [el.querySelector(".zia-tab-card-sub").textContent, el.querySelector(".zia-tab-card-sub").hidden],
    thumb: el.querySelector(".zia-tab-card-thumb").hidden,
    actions: [...el.querySelectorAll(".zia-tab-card-action")].map((button) => `${button.getAttribute("zia-action")}${button.hidden ? " (hidden)" : ""}`),
  };
};
const folderCard = () => {
  const el = document.getElementById("zia-folder-card");
  return el && {
    ...describe(el),
    rows: [...el.querySelectorAll(".zia-folder-card-row")].map((row) => ({
      label: row.querySelector(".zia-folder-card-label")?.textContent,
      selected: row.hasAttribute("zia-selected"),
      newTab: row.hasAttribute("zia-new-tab"),
      acts: [...row.querySelectorAll("[zia-act]")].map((act) => `${act.getAttribute("zia-act")}:${act.getAttribute("title")}`),
      top: Math.round(row.getBoundingClientRect().top),
    })),
  };
};
const hover = (el) => EU.synthesizeMouseAtCenter(el, { type: "mousemove" }, window);
const away = () => EU.synthesizeMouse(document.documentElement, window.innerWidth - 4, window.innerHeight - 4, { type: "mousemove" }, window);

hover(b);
await wait(300);
const beforeBeat = tabCard();
await wait(700);
const tab = tabCard();
hover(a);
await wait(100);
const nextTab = tabCard();
away();
await wait(600);
const tabLeft = tabCard();

const label = folder.querySelector(".tab-group-label-container");
hover(label);
await wait(1000);
const folderOpen = folderCard();
const row = [...document.querySelectorAll("#zia-folder-card .zia-folder-card-row")].find((el) => el.querySelector(".zia-folder-card-label")?.textContent === "Y");
EU.synthesizeMouseAtCenter(row.querySelector(".zia-folder-card-label"), {}, window);
await wait(600);
const picked = nameOf(gBrowser.selectedTab);
const folderAfter = folderCard();

done({
  beforeBeat,
  tab,
  nextTab,
  tabLeft,
  folderOpen,
  picked,
  folderAfter,
  checks: {
    "a tab's card shows after a beat": !beforeBeat?.marks.includes("zia-open=true") && tab?.marks.includes("zia-open=true") && tab.title === "B",
    "the next tab's shows at once": nextTab?.title === "A" && nextTab.marks.includes("zia-snap=true"),
    "leaving closes it": tabLeft?.hidden === true,
    "a folder's card lists its tabs": folderOpen?.rows.map((one) => one.label).join() === "X,Y,New Tab",
    "choosing a row selects the tab": picked === "Y" && folderAfter?.hidden === true,
  },
  ziaErrors: ziaErrors(),
});
