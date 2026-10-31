// Zen's Library opened: Zia adds Clear to its History and Downloads, slides a tile behind the
// chosen section, and measures its rows off the tabs
await addTabs(["A"]);
document.getElementById("cmd_zenToggleLibrary").doCommand();
const library = await until(() => document.querySelector("zen-library[open]"));
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
// (each read with its section shown, its tile placed and everything at rest, held a while:
// Zia measures the rows again a moment after it opens)
const shown = async (section, test = (seen) => seen.rail?.placed) => {
  await until(() => look().section === section && test(look()));
  await atRest();
  return steady(look, { quiet: 800 });
};
const opened = await shown("history");
const rows = [root.style.getPropertyValue("--zia-lib-row-pad"), root.style.getPropertyValue("--zia-lib-icon-gap")].map((v) => `${Math.round(parseFloat(v))}px`);
library.querySelector(".zen-library-tab[data-section='downloads']")?.click();
const downloads = await shown("downloads");
library.querySelector(".zen-library-tab[data-section='spaces']")?.click();
const spaces = await shown("spaces");
Services.prefs.setBoolPref("zia.library.zen-look", true);
const zenLook = await shown("spaces", (seen) => !seen.rail);
Services.prefs.clearUserPref("zia.library.zen-look");
const back = await shown("spaces");
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
