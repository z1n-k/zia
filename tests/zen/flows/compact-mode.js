// Compact mode turned on with Zen's own toggle, its sidebar shown over the page and hidden, then
// compact mode off: where Zia puts the sidebar's top row and the window buttons, the top bar cut
// away under the sidebar, and the marks Zia sets, at each step
const root = document.documentElement;
const describe = (el) => (!el ? null : el.id ? `#${el.id}` : el.localName + [...el.classList].map((name) => `.${name}`).join(""));
const box = (el) => {
  const rect = el?.getBoundingClientRect();
  return rect ? [round(rect.left), round(rect.top), round(rect.width), round(rect.height)] : null;
};
const state = () => {
  const top = document.getElementById("zen-sidebar-top-buttons");
  const buttons = window.gZenVerticalTabsManager?.actualWindowButtons;
  return {
    compact: root.getAttribute("zen-compact-mode"),
    marks: [...root.attributes].map((a) => a.name).filter((name) => name.startsWith("zia")).sort(),
    topRowIn: describe(top?.parentElement),
    topRow: [...(top?.children || [])].map(describe),
    topRowBox: box(top),
    windowButtonsIn: describe(buttons?.parentElement),
    titlebar: [...(document.getElementById("titlebar")?.children || [])].map(describe),
    clips: Object.fromEntries(["zen-appcontent-navbar-container", "urlbar"].map((id) => [id, document.getElementById(id)?.style.clipPath ?? null])),
  };
};
// (each step read once it has happened, everything has come to rest and it has held a while)
const after = async (test) => {
  await until(test);
  await atRest();
  return steady(state);
};
const before = state();
gZenCompactModeManager.toggle();
const on = await after(() => root.getAttribute("zen-compact-mode") === "true");
gZenCompactModeManager.toggleSidebar();
const shown = await after(() => root.hasAttribute("zia-panel-open"));
gZenCompactModeManager.toggleSidebar();
const hidden = await after(() => !root.hasAttribute("zia-panel-open"));
gZenCompactModeManager.toggle();
const off = await after(() => root.getAttribute("zen-compact-mode") === "false");
done({
  before,
  on,
  shown,
  hidden,
  off,
  checks: {
    "compact mode turns on and off": on.compact === "true" && off.compact === "false",
    "the top row moves into the title bar": on.topRowIn === "#titlebar",
    "the panel's marked open while shown": shown.marks.includes("zia-panel-open") && !hidden.marks.includes("zia-panel-open"),
  },
  ziaErrors: ziaErrors(),
});
