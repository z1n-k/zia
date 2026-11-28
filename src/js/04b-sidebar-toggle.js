  // ---------- Zen's sidebar button, at the start of the toolbar
  // With the toolbar along the top, Zen leaves its sidebar button in the sidebar's top row,
  // after the space's name; Dia has it at the toolbar's start, before back and forward (Olly,
  // 28 Nov). It's moved there while that layout's on, and back to Zen's place in the single
  // toolbar (where Zen keeps it out of the row). Only from Zen's own place: one moved by hand is
  // left where it was put.
  // Used elsewhere: placeSidebarToggle.
  const SIDEBAR_TOGGLE_ID = "zen-toggle-compact-mode";
  const SIDEBAR_TOGGLE_ZEN_AREA = "zen-sidebar-top-buttons";
  const SIDEBAR_TOGGLE_MOVED_PREF = "zia.toolbar.sidebar-toggle-moved";
  const SINGLE_TOOLBAR_PREF = "zen.view.use-single-toolbar";

  function moveSidebarToggle() {
    const placement = CustomizableUI.getPlacementOfWidget(SIDEBAR_TOGGLE_ID);
    if (!placement) {
      return;
    }
    const single = Services.prefs.getBoolPref(SINGLE_TOOLBAR_PREF, true);
    const moved = Services.prefs.getBoolPref(SIDEBAR_TOGGLE_MOVED_PREF, false);
    if (!single && placement.area === SIDEBAR_TOGGLE_ZEN_AREA) {
      const back = CustomizableUI.getPlacementOfWidget("back-button");
      const at = back?.area === CustomizableUI.AREA_NAVBAR ? back.position : 0;
      CustomizableUI.addWidgetToArea(SIDEBAR_TOGGLE_ID, CustomizableUI.AREA_NAVBAR, at);
      Services.prefs.setBoolPref(SIDEBAR_TOGGLE_MOVED_PREF, true);
    } else if (single && moved && placement.area === CustomizableUI.AREA_NAVBAR) {
      CustomizableUI.addWidgetToArea(SIDEBAR_TOGGLE_ID, SIDEBAR_TOGGLE_ZEN_AREA, 0);
      Services.prefs.setBoolPref(SIDEBAR_TOGGLE_MOVED_PREF, false);
    }
  }

  function placeSidebarToggle() {
    moveSidebarToggle();
    // (after Zen's own handling of a layout change, which puts its toolbars back together)
    const onLayout = () => setTimeout(() => safely("moveSidebarToggle", moveSidebarToggle), 300);
    Services.prefs.addObserver(SINGLE_TOOLBAR_PREF, onLayout);
    window.addEventListener("unload", () => Services.prefs.removeObserver(SINGLE_TOOLBAR_PREF, onLayout), { once: true });
  }
