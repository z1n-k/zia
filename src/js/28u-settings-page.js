  // ---------- Zia Settings: Zia's settings in a panel of their own, over a dimmed window as
  // the welcome tour is (29-settings-page.css), from the ⋯ menu. Built from
  // preferences.json, the list Sine shows too, and drawn in the window itself: as a page in
  // a frame, nothing passed between it and Zia got through inside Zen (every switch showed
  // off, and it couldn't be closed). Only settings in that list are written, each with a
  // value of the kind it takes.
  let settingsList = null;
  const loadSettingsList = async () =>
    (settingsList ??= await (await fetch("chrome://sine/content/zia/preferences.json")).json());

  // every setting the panel shows or decides a row by (its conditions), by name
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
    const open = document.getElementById("zia-settings");
    if (open && !open.hasAttribute("closing")) {
      return;
    }
    // (one still fading out goes at once: opened again then, nothing opened)
    open?.remove();
    const list = await loadSettingsList();
    const platform = { macosx: "macos", win: "windows" }[AppConstants.platform] || "linux";
    let values = settingValues(list);

    const make = (tag, className, parent, text) => {
      const el = document.createElementNS(XHTML_NS, tag);
      if (className) {
        el.className = className;
      }
      if (text != null) {
        el.textContent = text;
      }
      parent?.append(el);
      return el;
    };
    const icon = (parent, d) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.append(path);
      parent.append(svg);
    };

    // ---------- the frame of it: card, head (title, search, close), sections beside the list
    const overlay = make("div");
    overlay.id = "zia-settings";
    overlay.setAttribute("popover", "manual");
    const scrim = make("div", "zia-set-scrim", overlay);
    const card = make("div", "zia-set-card", scrim);
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Zia settings");
    const head = make("div", "zia-set-head", card);
    make("div", "zia-set-title", head, "Zia");
    const searchBox = make("label", "zia-set-search", head);
    icon(searchBox, "M10 4a6 6 0 1 0 0 12a6 6 0 0 0 0-12zM20 20l-5.5-5.5");
    const search = make("input", null, searchBox);
    search.type = "search";
    search.placeholder = "Search settings";
    search.setAttribute("autocomplete", "off");
    search.spellcheck = false;
    const closeButton = make("button", "zia-set-close", head);
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close");
    icon(closeButton, "M6 6l12 12M18 6L6 18");
    const body = make("div", "zia-set-body", card);
    const nav = make("div", "zia-set-nav", body);
    const listEl = make("div", "zia-set-list", body);

    // Sine's rules for a row's conditions: "if" or "not", nested lists with their own
    // "operator", and a row's own list "OR" unless it says otherwise
    const holds = (conditions, operator) => {
      const results = [conditions].flat().map((cond) => {
        if (cond.if || cond.not) {
          const test = cond.if || cond.not;
          return (values[test.property] === test.value) === !cond.not;
        }
        return cond.conditions ? holds(cond.conditions, cond.operator || "AND") : false;
      });
      return operator === "OR" ? results.some(Boolean) : results.every(Boolean);
    };

    // ---------- sections and rows
    const sections = [];
    const rows = [];
    let section = null;
    const newSection = (label) => {
      const el = make("div", "zia-set-section", listEl);
      make("div", "zia-set-section-title", el, label);
      const group = make("div", "zia-set-group", el);
      const link = make("button", "zia-set-nav-item", nav, label);
      link.type = "button";
      link.addEventListener("click", () => el.scrollIntoView({ behavior: "smooth", block: "start" }));
      section = { el, group, link, rows: [] };
      sections.push(section);
    };
    for (const entry of list) {
      if (entry.type === "separator") {
        newSection(entry.label);
        continue;
      }
      if (!section) {
        newSection("General");
      }
      if (entry.disabledOn?.includes(platform)) {
        continue;
      }
      const row = make("div", "zia-set-row", section.group);
      row.classList.toggle("sub", !!entry.conditions);
      const text = make("div", "zia-set-text", row);
      make("div", "zia-set-label", text, entry.label);
      if (entry.description) {
        make("div", "zia-set-desc", text, entry.description);
      }
      let control;
      if (entry.type === "checkbox") {
        control = make("button", "zia-set-switch", row);
        control.type = "button";
        control.setAttribute("role", "switch");
        control.addEventListener("click", (event) => {
          event.stopPropagation();
          writeSetting(list, entry.property, control.getAttribute("aria-checked") !== "true");
        });
        row.addEventListener("click", () => control.click());
      } else if (entry.type === "dropdown") {
        control = make("select", "zia-set-select", row);
        for (const option of entry.options || []) {
          make("option", null, control, option.label).value = option.value;
        }
        control.addEventListener("change", () => writeSetting(list, entry.property, control.value));
      } else if (entry.type === "string") {
        control = make("input", "zia-set-field", row);
        // (an API key is a secret: not shown as it's typed or read off the screen)
        control.type = /api_key/i.test(entry.property) ? "password" : "text";
        control.placeholder = entry.placeholder || "";
        control.spellcheck = false;
        control.setAttribute("autocomplete", "off");
        control.addEventListener("change", () => writeSetting(list, entry.property, control.value));
      } else {
        row.remove();
        continue;
      }
      control.setAttribute("aria-label", entry.label);
      const words = `${entry.label} ${entry.description || ""} ${section.el.firstChild.textContent}`.toLowerCase();
      const one = { entry, row, control, words };
      rows.push(one);
      section.rows.push(one);
    }
    make("div", "zia-set-none", listEl, "No settings match");

    // ---------- what shows: each row's value, its conditions, then the search
    const show = () => {
      const query = search.value.trim().toLowerCase();
      let any = false;
      for (const one of rows) {
        const allowed = !one.entry.conditions || holds(one.entry.conditions, one.entry.operator || "OR");
        // (searching, a matching row shows even if its condition hides it, so it can be found)
        one.row.hidden = query ? !query.split(/\s+/).every((word) => one.words.includes(word)) : !allowed;
        one.row.classList.toggle("off", !!query && !allowed);
      }
      for (const part of sections) {
        const visible = part.rows.some((one) => !one.row.hidden);
        part.el.hidden = !visible;
        part.link.hidden = !visible;
        any ||= visible;
      }
      listEl.classList.toggle("empty", !any);
    };
    const fill = () => {
      values = settingValues(list);
      for (const one of rows) {
        const value = values[one.entry.property];
        if (one.entry.type === "checkbox") {
          one.control.setAttribute("aria-checked", String(!!value));
        } else if (document.activeElement !== one.control) {
          one.control.value = value ?? "";
        }
      }
      show();
    };
    fill();
    search.addEventListener("input", () => {
      show();
      listEl.scrollTop = 0;
    });

    // the section in view lit in the side list
    const lit = new IntersectionObserver(
      (seen) => {
        for (const item of seen) {
          if (item.isIntersecting) {
            for (const part of sections) {
              part.link.classList.toggle("cur", part.el === item.target);
            }
          }
        }
      },
      { root: listEl, rootMargin: "0px 0px -70% 0px" }
    );
    for (const part of sections) {
      lit.observe(part.el);
    }

    // ---------- a change anywhere shows at once (this panel, Sine's list, another window, one
    // that turns itself back off), till it's closed
    let refresh = 0;
    const onPref = () => {
      refresh ||= requestAnimationFrame(() => {
        refresh = 0;
        fill();
      });
    };
    const watched = Object.keys(values);
    for (const property of watched) {
      Services.prefs.addObserver(property, onPref);
    }

    // ---------- closing: the ✕, Esc (which first clears a search) or a click outside the card
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (search.value) {
          search.value = "";
          show();
        } else {
          close();
        }
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        search.focus();
      }
    };
    const close = () => {
      if (overlay.hasAttribute("closing")) {
        return;
      }
      overlay.setAttribute("closing", "");
      window.removeEventListener("keydown", onKey, true);
      lit.disconnect();
      for (const property of watched) {
        Services.prefs.removeObserver(property, onPref);
      }
      setTimeout(() => {
        try {
          overlay.hidePopover?.();
        } catch (err) {}
        overlay.remove();
      }, 260);
      gBrowser.selectedBrowser?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    closeButton.addEventListener("click", close);
    scrim.addEventListener("mousedown", (event) => {
      if (event.target === scrim) {
        close();
      }
    });
    window.addEventListener("unload", close, { once: true });

    document.documentElement.appendChild(overlay);
    try {
      overlay.showPopover();
    } catch (err) {
      noteError("settings page: top layer", err);
    }
    requestAnimationFrame(() => {
      overlay.setAttribute("shown", "");
      search.focus();
    });
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

