  // ---------- Zia's settings page (settings/index.html), over a dimmed window as the
  // welcome tour is (19-welcome.css), from the ⋯ menu. It's built from preferences.json,
  // the list Sine shows too. The page asks; Zia reads and writes the settings, only those
  // in that list and only with a value of the kind it takes.
  const SETTINGS_PAGE_URL = "chrome://sine/content/zia/settings/index.html";
  let settingsList = null;
  const loadSettingsList = async () =>
    (settingsList ??= await (await fetch("chrome://sine/content/zia/preferences.json")).json());

  // every setting the page shows or decides a row by (its conditions), by name
  function settingValues(list) {
    const kinds = new Map();
    for (const entry of list) {
      if (entry.property && entry.type !== "separator") {
        kinds.set(entry.property, entry.type === "checkbox" ? "boolean" : "string");
      }
      const walk = (conditions) => {
        for (const cond of [conditions || []].flat()) {
          const test = cond.if || cond.not;
          if (test?.property && !kinds.has(test.property)) {
            kinds.set(test.property, typeof test.value);
          }
          walk(cond.conditions);
        }
      };
      walk(entry.conditions);
    }
    const values = {};
    for (const [property, kind] of kinds) {
      const entry = list.find((one) => one.property === property);
      try {
        values[property] =
          kind === "boolean"
            ? Services.prefs.getBoolPref(property, entry?.defaultValue ?? false)
            : kind === "number"
              ? Services.prefs.getIntPref(property, 0)
              : Services.prefs.getStringPref(property, entry?.defaultValue ?? "");
      } catch (err) {
        values[property] = entry?.defaultValue ?? null;
      }
    }
    return values;
  }

  function writeSetting(list, property, value) {
    const entry = list.find((one) => one.property === property && one.type !== "separator");
    if (!entry) {
      return;
    }
    if (entry.type === "checkbox" && typeof value === "boolean") {
      Services.prefs.setBoolPref(property, value);
    } else if (entry.type === "dropdown" && entry.options?.some((option) => option.value === value)) {
      Services.prefs.setStringPref(property, value);
    } else if (entry.type === "string" && typeof value === "string" && value.length <= 4096) {
      Services.prefs.setStringPref(property, value);
    }
  }

  async function showZiaSettings() {
    if (document.getElementById("zia-settings")) {
      return;
    }
    const list = await loadSettingsList();
    const overlay = document.createElementNS(XHTML_NS, "div");
    overlay.id = "zia-settings";
    overlay.setAttribute("popover", "manual");
    const frame = document.createElementNS(XHTML_NS, "iframe");
    frame.setAttribute("src", SETTINGS_PAGE_URL);
    frame.setAttribute("title", "Zia settings");
    overlay.append(frame);

    // (values go to the page as a mark on it and an event to read it by: a plain
    // string crosses to it where an object handed over doesn't)
    const sendValues = () => {
      const doc = frame.contentDocument;
      if (doc?.documentElement) {
        doc.documentElement.setAttribute("data-zia-values", JSON.stringify(settingValues(list)));
        doc.dispatchEvent(new frame.contentWindow.Event("ZiaSettingsValues"));
      }
    };
    const close = () => {
      if (!overlay.isConnected || overlay.hasAttribute("closing")) {
        return;
      }
      overlay.setAttribute("closing", "");
      setTimeout(() => {
        try {
          overlay.hidePopover?.();
        } catch (err) {}
        overlay.remove();
      }, 260);
      gBrowser.selectedBrowser?.focus();
    };
    const act = (text) => {
      let message = {};
      try {
        message = JSON.parse(String(text));
      } catch (err) {
        return;
      }
      if (message.action === "close") {
        close();
      } else if (message.action === "set") {
        try {
          writeSetting(list, message.property, message.value);
        } catch (err) {
          noteError("settings page: set", err);
        }
        sendValues();
      } else if (message.action === "get") {
        sendValues();
      }
    };
    frame.addEventListener("load", () => {
      try {
        frame.contentDocument?.addEventListener("ZiaSettings", (event) => act(event.detail));
        // (sent now as well: the page may have asked before this was listening)
        sendValues();
        frame.contentWindow?.focus();
      } catch (err) {
        noteError("settings page: hook", err);
      }
    });
    document.documentElement.appendChild(overlay);
    try {
      overlay.showPopover();
    } catch (err) {
      noteError("settings page: top layer", err);
    }
    requestAnimationFrame(() => overlay.setAttribute("shown", ""));
  }

  // "Zia Settings" in the ⋯ menu, under Firefox's own Settings (the menu is built the
  // first time it opens)
  function addSettingsMenuItem() {
    const popup = document.getElementById("appMenu-popup");
    popup?.addEventListener("popupshowing", () => {
      const settings = document.getElementById("appMenu-settings-button");
      if (!settings || document.getElementById("zia-settings-menu-button")) {
        return;
      }
      const item = document.createXULElement("toolbarbutton");
      item.id = "zia-settings-menu-button";
      item.className = "subviewbutton";
      item.setAttribute("label", "Zia Settings");
      item.addEventListener("command", () => {
        PanelUI.hide();
        showZiaSettings().catch((err) => noteError("settings page: open", err));
      });
      settings.after(item);
    });
  }

