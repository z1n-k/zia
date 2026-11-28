// Temporary: Zen's sidebar button before back with the top toolbar, and back in Zen's place
// in the single toolbar, switching live.
await atRest();
const box = (id) => { const el = document.getElementById(id); const r = el.getBoundingClientRect(); return { area: CustomizableUI.getPlacementOfWidget(id)?.area, pos: CustomizableUI.getPlacementOfWidget(id)?.position, x: [Math.round(r.left), Math.round(r.right)], parent: el.parentElement?.id }; };
const read = () => ({ single: Services.prefs.getBoolPref("zen.view.use-single-toolbar", true), toggle: box("zen-toggle-compact-mode"), back: box("back-button") });
await wait(500);
const first = read();
await capture("row-first", { x: 0, y: 0, width: 560, height: 60 });
Services.prefs.setBoolPref("zen.view.use-single-toolbar", !first.single);
await wait(2000);
await atRest();
const switched = read();
await capture("row-switched", { x: 0, y: 0, width: 560, height: 60 });
Services.prefs.setBoolPref("zen.view.use-single-toolbar", first.single);
await wait(2000);
await atRest();
const back = read();
await capture("row-back", { x: 0, y: 0, width: 560, height: 60 });
done({ first, switched, back, errors: ziaErrors(), checks: {} });
