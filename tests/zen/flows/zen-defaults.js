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

Services.prefs.setBoolPref("zia.urlbar.full-url", true);
await wait(300);
const fullAddress = both("browser.urlbar.trimHttps");
Services.prefs.clearUserPref("zia.urlbar.full-url");
await wait(300);
const trimmedAgain = both("browser.urlbar.trimHttps");
const pipFrom = both("media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled");
Services.prefs.setBoolPref("zia.pip.auto-on-tab-switch", !Services.prefs.getBoolPref("zia.pip.auto-on-tab-switch"));
await wait(300);
const pipTo = both("media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled");

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
