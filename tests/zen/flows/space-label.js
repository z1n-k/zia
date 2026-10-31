// The space's name beside the window buttons: renamed with Zen's own "Rename space", then
// given an emoji and one of Zen's own icons from Zen's picker, and the label Zia draws each time
const label = () => {
  const el = document.getElementById("zia-space-label");
  if (!el) {
    return null;
  }
  return {
    in: el.parentElement?.closest("[id]")?.id || null,
    text: el.textContent,
    attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])),
    children: [...el.children].map((child) => ({
      tag: child.localName,
      class: child.className,
      src: child.dataset?.src || null,
      svg: child.querySelector("svg") ? [...child.querySelector("svg").attributes].map((a) => a.name).sort() : null,
    })),
  };
};
const space = gZenWorkspaces.getActiveWorkspace();
const original = { name: space.name, icon: space.icon || "" };
const before = label();

document.getElementById("context_zenEditWorkspace").doCommand();
await wait(400);
const editing = document.getElementById("tab-label-input");
EU.sendString("Work", window);
EU.synthesizeKey("KEY_Enter", {}, window);
await wait(1000);
const renamed = label();

document.getElementById("context_zenEditWorkspaceIcon").doCommand();
await wait(1000);
const panel = document.getElementById("PanelUI-zen-emojis-picker");
const emoji = panel.querySelector('.zen-emojis-picker-emoji[label="🚀"]');
emoji?.doCommand();
await wait(1000);
const withEmoji = label();

const icon = panel.querySelector('.zen-emojis-picker-svg[icon="heart.svg"]') || panel.querySelector(".zen-emojis-picker-svg");
const iconName = icon?.getAttribute("icon") || null;
icon?.doCommand();
await wait(1500);
const withIcon = label();
EU.synthesizeKey("KEY_Escape", {}, window);
await wait(600);

done({
  original,
  before,
  editorOpened: !!editing,
  renamed,
  withEmoji,
  iconName,
  withIcon,
  checks: {
    "it shows the space's name": before?.text === original.name.trim(),
    "it follows a rename": renamed?.text === "Work",
    "it shows the emoji": withEmoji?.attrs["zia-icon"] === "🚀" && withEmoji?.attrs["zia-has-icon"] === "true",
    "it draws Zen's icon": withIcon?.attrs["zia-has-svg"] === "true" && !!withIcon?.children.some((child) => child.svg),
  },
  ziaErrors: ziaErrors(),
});
