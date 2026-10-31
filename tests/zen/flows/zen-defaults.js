// The prefs Zia's defaults leave once it has started: every zia.* default, the Zen and Firefox
// prefs it gives defaults to or puts right once, and the two it keeps in step with its own
// settings ("Full address" and picture-in-picture on leaving a tab), each switched over
const defaults = Services.prefs.getDefaultBranch("");
const read = (branch, name) => {
  try {
    switch (branch.getPrefType(name)) {
      case branch.PREF_BOOL:
        return branch.getBoolPref(name);
      case branch.PREF_INT:
        return branch.getIntPref(name);
      case branch.PREF_STRING:
        return branch.getStringPref(name);
    }
  } catch (err) {}
  return null;
};
const both = (name) => ({ default: read(defaults, name), own: Services.prefs.prefHasUserValue(name) ? read(Services.prefs, name) : null });
const ZEN_AND_FIREFOX = [
  "zen.widget.mac.mono-window-controls",
  "zen.urlbar.replace-newtab",
  "zen.splitView.enable-tab-drop",
  "zen.theme.acrylic-elements",
  "browser.urlbar.trimHttps",
  "browser.urlbar.suggest.calculator",
  "browser.urlbar.unitConversion.enabled",
  "browser.urlbar.untrimOnUserInteraction.featureGate",
  "browser.urlbar.untrimOnUserInteraction",
  "media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled",
  "media.videocontrols.picture-in-picture.improved-video-controls.enabled",
];
const ONCE_MARKS = ["zia.trim-https-reset", "zia.tabs.dim-asleep-reset", "zia.acrylic-reset", "zia.urlbar.zen-look"];
const zia = Object.fromEntries(
  Services.prefs
    .getDefaultBranch("zia.")
    .getChildList("")
    .sort()
    .map((name) => [`zia.${name}`, read(defaults, `zia.${name}`)])
);
const zenAndFirefox = Object.fromEntries(ZEN_AND_FIREFOX.map((name) => [name, both(name)]));
const marks = Object.fromEntries(ONCE_MARKS.map((name) => [name, both(name)]));

// (each read once Zia has followed the switch)
const followed = async (name, from) => {
  await until(() => JSON.stringify(both(name)) !== JSON.stringify(from), { what: `${name} to follow` });
  return steady(() => both(name));
};
Services.prefs.setBoolPref("zia.urlbar.full-url", true);
const fullAddress = await followed("browser.urlbar.trimHttps", zenAndFirefox["browser.urlbar.trimHttps"]);
Services.prefs.clearUserPref("zia.urlbar.full-url");
const trimmedAgain = await followed("browser.urlbar.trimHttps", fullAddress);
const pipFrom = both("media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled");
Services.prefs.setBoolPref("zia.pip.auto-on-tab-switch", !Services.prefs.getBoolPref("zia.pip.auto-on-tab-switch"));
const pipTo = await followed("media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled", pipFrom);

done({
  zia,
  zenAndFirefox,
  marks,
  fullAddress,
  trimmedAgain,
  pipFrom,
  pipTo,
  checks: {
    "every feature defaults on": Object.entries(zia).filter(([name]) => name.startsWith("zia.features.") && name !== "zia.features.folder-icon-suggest").every(([, on]) => on === true),
    "the once-only fixes are marked done": marks["zia.trim-https-reset"].own === true && marks["zia.acrylic-reset"].own === true,
    "Full address stops trimming": fullAddress.default === false && trimmedAgain.default === true,
    "picture-in-picture follows Zia's setting": pipTo.own !== pipFrom.own,
  },
  ziaErrors: ziaErrors(),
});
