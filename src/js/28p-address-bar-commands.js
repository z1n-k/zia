  // ---------- Address bar commands: Zia's own actions in Zen's list, and answers
  // Zen lists its actions in the address bar's results (one shared list, matched
  // and learned from by Zen). Zia adds the ones people look for and can't reach
  // in one step (settings pages, this page's tools, moving a tab to a space),
  // drops the ones nobody types (next/previous tab or space, plain reload), and
  // renames a few to the words people use. Commands run with the window they
  // were picked in, never this script's own, since the list outlives windows.
  const ZEN_ICON = "chrome://browser/skin/zen-icons/";

  function ziaAction(label, icon, command, isAvailable = () => true) {
    return {
      label,
      icon: ZEN_ICON + icon + ".svg",
      command,
      commandId: "zia:" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      isAvailable,
      extraPayload: {},
      zia: true,
    };
  }

  const isPage = (win) => !win.gBrowser.selectedTab.hasAttribute("zen-empty-tab");
  const isWebPage = (win) => isPage(win) && /^https?$/.test(win.gBrowser.currentURI?.scheme || "");
  // a Firefox command that can be run now (it's there and not disabled)
  const commandReady = (id) => (win) => {
    const el = win.document.getElementById(id);
    return !!el && el.getAttribute("disabled") !== "true";
  };
  const openPane = (pane) => (win) => win.openPreferences(pane);
  const openPage = (url) => (win) => win.openTrustedLinkIn(url, "tab");
  const copyText = (text) => {
    Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(text);
  };

  function cleanLink(uri) {
    try {
      const stripper = Cc["@mozilla.org/url-query-string-stripper;1"].getService(Ci.nsIURLQueryStringStripper);
      return (stripper.stripForCopyOrShare(uri) || uri).spec;
    } catch (err) {
      return uri.spec;
    }
  }

  function clearSiteData(win) {
    const { SiteDataManager } = ChromeUtils.importESModule("resource:///modules/SiteDataManager.sys.mjs");
    const base = SiteDataManager.getBaseDomainFromHost(win.gBrowser.currentURI.host);
    // Firefox's own confirmation first, as from the site's padlock
    if (SiteDataManager.promptSiteDataRemoval(win, [base])) {
      SiteDataManager.remove(base);
    }
  }

  function toggleDevTools(win) {
    try {
      const { require } = ChromeUtils.importESModule("resource://devtools/shared/loader/Loader.sys.mjs");
      const { gDevToolsBrowser } = require("resource://devtools/client/framework/devtools-browser.js");
      gDevToolsBrowser.toggleToolboxCommand(win.gBrowser, Cu.now());
    } catch (err) {
      noteError("address bar commands: developer tools", err);
    }
  }

  function moveTabToSpace(win, uuid) {
    const spaces = win.gZenWorkspaces;
    const tab = win.gBrowser.selectedTab;
    spaces.moveTabsToWorkspace([tab], uuid);
    spaces.lastSelectedWorkspaceTabs[uuid] = tab;
    spaces.changeWorkspace(spaces.getWorkspaces().find((space) => space.uuid === uuid));
  }

  const ZIA_ACTIONS = [
    // Settings, straight to the page
    ziaAction("Zia Settings", "settings", openPane("paneSineMods")),
    ziaAction("Keyboard Shortcuts", "settings", openPane("paneZenCKS")),
    ziaAction("Look and Feel Settings", "palette", openPane("paneZenLooks")),
    ziaAction("Spaces and Tabs Settings", "tab", openPane("paneZenTabManagement")),
    ziaAction("Search Engine Settings", "search-glass", openPane("paneSearch")),
    ziaAction("Privacy and Security Settings", "security", openPane("panePrivacy")),
    ziaAction("Sync Settings", "send-to-device", openPane("paneSync")),
    ziaAction("Passwords", "passwords", openPage("about:logins")),
    ziaAction("Task Manager", "tool-profiler", openPage("about:processes")),
    // This page
    ziaAction("Copy Link as Markdown", "link", (win) => {
      const tab = win.gBrowser.selectedTab;
      copyText(`[${tab.label.replace(/[[\]]/g, "")}](${win.gBrowser.currentURI.spec})`);
    }, isWebPage),
    ziaAction("Copy Clean Link", "link", (win) => copyText(cleanLink(win.gBrowser.currentURI)), isWebPage),
    ziaAction("Mute Tab", "media-mute", (win) => win.gBrowser.selectedTab.toggleMuteAudio(), (win) => isPage(win) && !win.gBrowser.selectedTab.muted),
    ziaAction("Unmute Tab", "media-unmute", (win) => win.gBrowser.selectedTab.toggleMuteAudio(), (win) => isPage(win) && win.gBrowser.selectedTab.muted),
    ziaAction("Picture-in-Picture", "screen", "View:PictureInPicture", (win) => isWebPage(win) && commandReady("View:PictureInPicture")(win)),
    ziaAction("Reader View", "reader-mode", "View:ReaderView", (win) => isWebPage(win) && commandReady("View:ReaderView")(win)),
    ziaAction("Translate Page", "translations", "cmd_translate", (win) => isWebPage(win) && commandReady("cmd_translate")(win)),
    ziaAction("Bookmark Page", "bookmark", "Browser:AddBookmarkAs", isWebPage),
    ziaAction("Reset Zoom", "zoom-out", "cmd_fullZoomReset", (win) => isPage(win) && win.ZoomManager?.zoom !== 1),
    ziaAction("Site Settings", "permissions", (win) => win.BrowserCommands.pageInfo(null, "permTab"), isWebPage),
    ziaAction("Clear Cookies and Site Data", "cookies-fill", clearSiteData, isWebPage),
    ziaAction("Developer Tools", "developer", toggleDevTools, isPage),
    // Tabs
    ziaAction("Move Tab to New Window", "window", (win) => win.gBrowser.replaceTabWithWindow(win.gBrowser.selectedTab), (win) => isPage(win) && win.gBrowser.visibleTabs.length > 1),
    ziaAction("Close Other Tabs", "close", (win) => win.gBrowser.removeAllTabsBut(win.gBrowser.selectedTab), (win) => win.gBrowser.visibleTabs.some((tab) => !tab.pinned && !tab.selected)),
    ziaAction("Unload Other Tabs", "moon-stars", (win) => {
      for (const tab of win.gBrowser.visibleTabs) {
        if (!tab.selected && tab.linkedPanel) {
          win.gBrowser.discardBrowser(tab);
        }
      }
    }, (win) => win.gBrowser.visibleTabs.some((tab) => !tab.selected && tab.linkedPanel)),
    ziaAction("Add to Multiview", "split", (win) => win.ZiaCommands?.addToMultiview(), (win) => !!win.ZiaCommands?.canAddToMultiview()),
    // History and Zia
    ziaAction("Downloads", "downloads", "Tools:Downloads"),
    ziaAction("Clear Recent History", "history", "Tools:Sanitize"),
    ziaAction("What's New in Zia", "sparkles", () => Services.prefs.setBoolPref("zia.welcome.whats-new-again", true)),
    ziaAction("Toggle Edge to Edge Page", "fullscreen", () => {
      Services.prefs.setBoolPref("zia.page.edge-to-edge", !Services.prefs.getBoolPref("zia.page.edge-to-edge", false));
    }),
  ];

  // Zen's that nobody types (keyboard moves, plain reload) come out; a few are
  // renamed to the words people search with
  const ZEN_DROPPED = ["next-space", "previous-space", "next-tab", "previous-tab", "reload-tab", "new-blank-window"];
  const ZEN_RENAMED = {
    "unsplit-view": "Unsplit View",
    "reload-tab-without-cache": "Hard Refresh",
    "duplicate-tab": "Duplicate Tab",
    "copy-current-url": "Copy Link",
  };

  function addressBarActions() {
    try {
      return ChromeUtils.importESModule("resource:///modules/ZenUBGlobalActions.sys.mjs").globalActions;
    } catch (err) {
      return null;
    }
  }

  // "Move Tab to …", one per other space, kept in step with the spaces each
  // time the address bar is focused
  function refreshSpaceActions(actions, win) {
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i].ziaSpace) {
        actions.splice(i, 1);
      }
    }
    const spaces = win.gZenWorkspaces;
    if (!spaces || spaces.privateWindowOrDisabled) {
      return;
    }
    for (const space of spaces.getWorkspaces() || []) {
      const action = ziaAction(`Move Tab to ${space.name}`, "forward", (w) => moveTabToSpace(w, space.uuid), (w) => isPage(w) && w.gZenWorkspaces.activeWorkspace !== space.uuid);
      action.commandId = `zia:move-to-space-${space.uuid}`;
      action.ziaSpace = true;
      actions.push(action);
    }
  }

  // One window installs Zia's entries in the shared list (and the colour answer);
  // as it closes, another open window takes over, since functions made in a
  // closed window can't be run.
  let colourProvider = null;

  function installAddressBarCommands(actions) {
    for (let i = actions.length - 1; i >= 0; i--) {
      const key = String(actions[i].l10nId || "").replace("zen-action-", "");
      if (ZEN_DROPPED.includes(key)) {
        actions.splice(i, 1);
      } else if (ZEN_RENAMED[key]) {
        // a plain string, so nothing of this window stays behind in Zen's entry
        Object.defineProperty(actions[i], "label", { value: ZEN_RENAMED[key], configurable: true });
      }
    }
    actions.push(...ZIA_ACTIONS);
    actions.ziaOwner = window;
    colourProvider = registerColourAnswer();
  }

  function removeZiaEntries(actions, spacesOnly) {
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i].ziaSpace || (!spacesOnly && actions[i].zia)) {
        actions.splice(i, 1);
      }
    }
  }

  function setupAddressBarCommands() {
    const actions = addressBarActions();
    if (!actions) {
      return;
    }
    // what only this window can do, for commands picked in it
    window.ZiaCommands = {
      canAddToMultiview: () => Services.prefs.getBoolPref("zia.multiview", true) && !!tabMultiviewEntry(gBrowser.selectedTab),
      addToMultiview: () => {
        const entry = tabMultiviewEntry(gBrowser.selectedTab);
        if (entry) {
          addToMultiview(entry);
        }
      },
      takeOver: () => {
        installAddressBarCommands(actions);
        refreshSpaceActions(actions, window);
      },
    };
    if (!actions.some((action) => action.zia)) {
      installAddressBarCommands(actions);
    }
    refreshSpaceActions(actions, window);
    gURLBar.inputField?.addEventListener("focus", () => refreshSpaceActions(actions, window));
    window.addEventListener("unload", () => {
      if (actions.ziaOwner !== window) {
        // its "Move Tab to" entries may be this window's: made again on the next focus
        removeZiaEntries(actions, true);
        return;
      }
      removeZiaEntries(actions, false);
      actions.ziaOwner = null;
      try {
        colourProvider?.manager.unregisterProvider(colourProvider.provider);
      } catch (err) {}
      for (const other of Services.wm.getEnumerator("navigator:browser")) {
        if (other !== window && other.ZiaCommands) {
          other.ZiaCommands.takeOver();
          break;
        }
      }
    });
  }

  // ---------- Colour answers: a hex or rgb() colour, shown with its swatch and
  // its other forms; picking it copies the hex. (Maths, units and time zones are
  // Firefox's own, switched on in applyZenDefaults.)
  function colourOf(text) {
    const s = text.trim();
    let rgb = null;
    let m = s.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (m) {
      const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
      rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    } else if ((m = s.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/][^)]*)?\)$/i))) {
      rgb = [m[1], m[2], m[3]].map(Number);
      if (rgb.some((v) => v > 255)) {
        return null;
      }
    }
    if (!rgb) {
      return null;
    }
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    let sat = 0;
    if (d) {
      sat = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = Math.round(h * 60 + 360) % 360;
    }
    return {
      hex: "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase(),
      rgb: `rgb(${rgb.join(" ")})`,
      hsl: `hsl(${h} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%)`,
    };
  }

  function registerColourAnswer() {
    let manager;
    let UrlbarProvider;
    let UrlbarResult;
    let UrlbarShared;
    try {
      ({ ProvidersManager: manager } = ChromeUtils.importESModule("moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs"));
      manager = manager.getInstanceForSap("urlbar");
      ({ UrlbarProvider } = ChromeUtils.importESModule("moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs"));
      ({ UrlbarResult } = ChromeUtils.importESModule("chrome://browser/content/urlbar/UrlbarResult.mjs"));
      ({ UrlbarShared } = ChromeUtils.importESModule("chrome://browser/content/urlbar/UrlbarShared.mjs"));
    } catch (err) {
      noteError("address bar commands: colour answer", err);
      return null;
    }
    const existing = manager.getProvider("ProviderZiaColour");
    if (existing) {
      manager.unregisterProvider(existing);
    }
    class ProviderZiaColour extends UrlbarProvider {
      get type() {
        return UrlbarShared.PROVIDER_TYPE.PROFILE;
      }

      async isActive({ searchString }) {
        this.colour = colourOf(searchString || "");
        return !!this.colour;
      }

      getViewTemplate() {
        return {
          attributes: { selectable: true },
          children: [
            {
              name: "content",
              tag: "span",
              classList: ["urlbarView-no-wrap"],
              children: [
                { name: "swatch", tag: "span" },
                { name: "output", tag: "strong" },
                { name: "forms", tag: "span" },
              ],
            },
          ],
        };
      }

      getViewUpdate(result) {
        const { hex, rgb, hsl } = result.payload;
        return {
          swatch: { style: { "background-color": hex } },
          output: { textContent: hex },
          forms: { textContent: `${rgb} · ${hsl}` },
        };
      }

      startQuery(queryContext, addCallback) {
        addCallback(
          this,
          new UrlbarResult({
            type: UrlbarShared.RESULT_TYPE.DYNAMIC,
            source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
            suggestedIndex: 1,
            payload: { dynamicType: "ziaColour", ...this.colour },
          })
        );
      }

      onEngagement(queryContext, controller, details) {
        copyText(details.result.payload.hex);
      }
    }
    const provider = new ProviderZiaColour();
    manager.registerProvider(provider);
    return { manager, provider };
  }

