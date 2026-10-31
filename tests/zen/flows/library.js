// Zen's Library opened: Zia adds Clear to its History and Downloads, slides a tile behind the
// chosen section, and measures its rows off the tabs
await addTabs(["A"]);
document.getElementById("cmd_zenToggleLibrary").doCommand();
await wait(2000);
const library = document.querySelector("zen-library");
const root = document.documentElement;
const look = () => {
  const rail = library.querySelector(".zia-library-rail");
  return {
    open: library.hasAttribute("open"),
    section: library.querySelector(".zen-library-tab[active]")?.dataset.section,
    clears: [...library.querySelectorAll(".zia-library-clear")].map((button) => `${button.getAttribute("aria-label")}: ${button.title}`),
    rail: rail ? { hidden: rail.hidden, height: rail.style.height, transform: rail.style.transform, placed: rail.hasAttribute("placed") } : null,
    cards: [...library.querySelectorAll(".zen-library-space[data-uuid]")].map((card) => card.getAttribute("zia-card-dark")),
  };
};
const opened = look();
const rows = [root.style.getPropertyValue("--zia-lib-row-pad"), root.style.getPropertyValue("--zia-lib-icon-gap")].map((v) => `${Math.round(parseFloat(v))}px`);
library.querySelector(".zen-library-tab[data-section='downloads']")?.click();
await wait(1200);
const downloads = look();
library.querySelector(".zen-library-tab[data-section='spaces']")?.click();
await wait(1200);
const spaces = look();
Services.prefs.setBoolPref("zia.library.zen-look", true);
await wait(500);
const zenLook = look();
Services.prefs.clearUserPref("zia.library.zen-look");
await wait(500);
const back = look();
done({
  opened,
  rows,
  downloads,
  spaces,
  zenLook,
  back,
  checks: {
    "it opened": opened.open,
    "History has Clear": opened.clears.length === 1,
    "Downloads has Clear": downloads.clears.some((clear) => clear.startsWith("Clear downloads")),
    "the tile moves with the section": !!downloads.rail && downloads.rail.transform !== opened.rail?.transform,
    "Zen's look takes them off": zenLook.clears.length === 0 && !zenLook.rail,
  },
  ziaErrors: ziaErrors(),
});
