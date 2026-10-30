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
    } else if (
      entry.type === "dropdown" &&
      typeof value === "string" &&
      (entry.options?.some((option) => option.value === value) ||
        // (an AI service's model: its list is fetched live, beyond the few in preferences.json)
        (window.ziaTidyModels?.handles(property) && /^[\w.:/@+-]{1,200}$/.test(value)))
    ) {
      Services.prefs.setStringPref(property, value);
    } else if (entry.type === "string" && typeof value === "string" && value.length <= 4096) {
      Services.prefs.setStringPref(property, value);
    }
  }

  // Short names for the panel, each with its detail in grey under it (Sine's list keeps the
  // full labels). A setting not named here splits its own label: what's in brackets goes
  // grey.
  const SETTING_NAMES = {
    "zia.toolbar.site-color": ["Site-coloured toolbar", "Off: the theme's colour."],
    "zia.loading-bar.accent-color": ["Accent-coloured loading bar", "Uses Zen's accent colour. Off: Zia blue."],
    "zia.tabs.no-glow": ["Hide selected-tab glow", ""],
    "zia.tabs.favicon-glow": ["Site-tinted glow", "The selected tab's glow and sound bars take the site's colours."],
    "zia.tabs.dim-asleep": ["Dim asleep tabs", "Also essentials and folders."],
    "zia.tabs.no-pin-slash": ["Hide pinned-tab slash", "In a pinned tab that's moved off its page. Its icon still takes it back."],
    "zia.glass": ["Glass edges", "Essentials, cards and Library buttons edged like macOS Tahoe's glass, lighting up where pressed. Off: Zia's fine shine."],
    "zia.page.rounding": ["Zia page corners", "Off: Zen's."],
    "zia.page.edge-to-edge": ["Edge-to-edge page", "No gap or shadow around the page."],
    "zia.sidebar.see-through": ["Sidebar see-through", "How much the desktop shows through the sidebar, where the window can be see-through."],
    "zia.ultra": ["Ultra effects", "A loading orb, the open essential's colour drifting, the music player glowing in its artwork's colours, a springy Library and a metal welcome logo."],
    "zia.features.tab-hover-cards": ["Hover cards", "For tabs and folders."],
    "zia.cards.blur": ["See-through hover cards", "What's behind is blurred."],
    "zia.folders.tint-card": ["Folder-coloured cards", "A coloured folder's hover card takes its colour."],
    "zia.tabs.sound-bars": ["Sound bars", "On playing tabs. Off: Zen's speaker."],
    "zia.sound-bars.always-move": ["Always animate sound bars", "Even when your system asks for less motion."],
    "zia.features.tab-numbers": ["Tab numbers", "Hold Cmd/Ctrl to number your tabs, then type one to go to it."],
    "zia.tab-numbers.always": ["Always show tab numbers", ""],
    "zia.tab-numbers.color": ["Typed number colour", ""],
    "zia.features.undo-close": ["Cmd/Ctrl+Z reopens tabs", "Brings back the last closed tab."],
    "zia.glance.thumbnail": ["Glance thumbnails", "A glance shows on its tab as a small picture of the page."],
    "zia.essentials.zia-width": ["Narrower essentials", "Off: Zen's widths."],
    "zia.essentials.two-per-row": ["Two essentials per row", "For a narrower sidebar."],
    "zia.essentials.fill-row": ["Stretch the last essential", "It fills the rest of its row."],
    "zia.essentials.split": ["Split essentials", "Drag a two-site split onto the essentials. Experimental."],
    "zia.sidebar.text-size": ["Sidebar text size", ""],
    "zia.spaces.collapse-icons": ["Collapsed space icons", "The spaces at the foot of the sidebar as dots, the open one shown, each icon showing as you point at it."],
    "zia.folders.bounce": ["Springy folders", "Folders open and close with a spring."],
    "zia.folders.tint-when-open": ["Folder colour on hover only", "Coloured folders show their colour when hovered or open."],
    "zia.features.icon-picker": ["Icon picker", "For folders and spaces, with 5,166 icons."],
    "zia.features.folder-icon-suggest": ["Smart folder names", "Names new folders and picks their icons with a local model. A one-time ~25 MB download."],
    "zia.sidebar.space-name-in-list": ["Space name above tabs", "Where Zen shows it."],
    "zia.sidebar.hide-space-name": ["Hide space name", "Keeps the space's icon at the top of the sidebar."],
    "zia.sidebar-panels.style": ["Zia-style panels", "Bookmarks, History and Synced Tabs."],
    "zia.sidebar-panels.beside": ["Panels beside the page", "Full height, as a second sidebar."],
    "zia.library.zen-look": ["Zen's Library look", "Off: Zia's."],
    "zia.compact.sidebar-blur": ["See-through compact sidebar", "The page is blurred behind it."],
    "zia.compact.hide-toolbar": ["Hide toolbar with sidebar out", "In compact mode, while the sidebar is showing."],
    "zia.compact.toolbar-over-page": ["Toolbar over the page", "The hidden toolbar fades in over the page. Off: it opens in the gap above, as Zen's does."],
    "zia.urlbar.zia-look": ["Zia address bar", "Off: Zen's own."],
    "zia.urlbar.dia-style": ["Zia address pop-up", "Off: Zen's."],
    "zia.urlbar.pop-up-blur": ["See-through pop-up", "The page is blurred behind it."],
    "zia.urlbar.site-color": ["Site-coloured pop-up", "Takes the toolbar's colour as it opens."],
    "zia.urlbar.title-only": ["Title only", "Shows the page's title in the domain's colour until clicked."],
    "zia.urlbar.full-url": ["Full address", "Rather than the domain and title."],
    "zia.urlbar.center-text": ["Centred address", ""],
    "zia.urlbar.center-bar": ["Centred address bar", "As much room before it as after: the buttons either side balanced."],
    "zia.urlbar.center-text.pop-up-left": ["Pop-up text from the left", "When the address bar is opened."],
    "zia.urlbar.position": ["Address bar position", ""],
    "zia.features.find-bar": ["Zia find bar", "For finding in the page."],
    "zia.newtab.real-tab": ["Real new tabs", "Cmd/Ctrl+T and + New Tab open a tab. Off: Zen's floating address bar."],
    "zia.newtab.search-engine": ["Search page in new tabs", "Your search engine's page. Off: Zen's new tab page."],
    "zia.newtab.focus-address-bar": ["New tabs start in the address bar", "Ready to type."],
    "zia.swipe.dia-arrow": ["Swipe arrow", "Dia's round arrow when swiping back or forward. Hold it to list the pages."],
    "zia.split.drop-cards": ["Split drop cards", "When dragging a tab onto the page to split it. Off: Zen's."],
    "zia.pdf.dia-style": ["Zia PDF viewer", "Reopen a PDF to see it."],
    "zia.status-bar": ["Link previews", "Shows where a link goes, at the foot of the page, as you hover it."],
    "zia.window-buttons.hide": ["Hide window buttons", "For keyboard users."],
    "zia.window-buttons.dim": ["Dimmed window buttons", "They just dim on hover. Off: Windows' own."],
    "zia.toolbar.menu-button": ["⋯ menu", "At the end of the toolbar."],
    "zia.features.media-player": ["Music player card", ""],
    "zia.media.keep-with-pip": ["Keep player with picture-in-picture", "The music player stays when its video pops out."],
    "zia.media.youtube-channel-art": ["YouTube channel art", "The player shows the channel's picture, not the video's."],
    "zia.pip.dia-style": ["Zia picture-in-picture controls", "Off: Firefox's."],
    "zia.pip.tuck": ["Tuck picture-in-picture", "Push it against a screen edge, or right-click it."],
    "zia.pip.tuck-spot": ["Tuck into", ""],
    "zia.pip.tuck-peek": ["Full peek", "Pointing at tucked picture-in-picture shows all of it until the pointer leaves. Off: it nudges out."],
    "zia.pip.auto-on-tab-switch": ["Auto picture-in-picture", "A playing video pops out as you leave its tab. Firefox's own."],
    "zia.multiview": ["Multiview", "\"Add to Multiview\" on videos and tabs: one tab that grids up videos and streams."],
    "zia.multiview.icon-color": ["Multiview icon colour", ""],
    "zia.features.tidy-downloads": ["Rename downloads with AI", "Finished downloads get clear names, with an undo. Restart after turning on."],
    "extensions.downloads.ai_provider": ["AI service", ""],
    "extensions.downloads.mistral_api_key": ["Mistral API key", ""],
    "extensions.downloads.mistral_model": ["Mistral model", ""],
    "extensions.downloads.openai_api_key": ["OpenAI API key", ""],
    "extensions.downloads.openai_model": ["OpenAI model", ""],
    "extensions.downloads.anthropic_api_key": ["Anthropic API key", ""],
    "extensions.downloads.anthropic_model": ["Anthropic model", ""],
    "extensions.downloads.google_api_key": ["Google AI API key", ""],
    "extensions.downloads.google_model": ["Gemini model", ""],
    "extensions.downloads.ollama_base_url": ["Ollama address", ""],
    "extensions.downloads.ollama_model": ["Ollama model", ""],
    "extensions.downloads.openrouter_api_key": ["OpenRouter API key", ""],
    "extensions.downloads.openrouter_model": ["OpenRouter model", ""],
    "extensions.downloads.openai_compat_api_key": ["Endpoint API key", ""],
    "extensions.downloads.openai_compat_base_url": ["Endpoint address", ""],
    "extensions.downloads.openai_compat_model": ["Endpoint model", ""],
    "extensions.downloads.enable_debug": ["Renaming log", ""],
    "zia.install-count": ["Count this install", "Once a day, with nothing about you or your browsing. Helps show how many use Zia."],
    "zia.welcome.show": ["Tour after updates", "Shows the welcome tour when an update brings something new."],
    "zia.welcome.again": ["Show the welcome tour", "Turns itself back off."],
    "zia.welcome.whats-new-again": ["Show what's new", "For this version. Turns itself back off."],
  };
  function settingName(entry) {
    const [name, detail] = SETTING_NAMES[entry.property] || [];
    if (name) {
      return [name, detail || entry.description || ""];
    }
    const bracket = entry.label.match(/^(.*?)\s*\((.*)\)\s*$/);
    const rest = bracket ? bracket[2].charAt(0).toUpperCase() + bracket[2].slice(1) : "";
    return [bracket ? bracket[1] : entry.label, [rest, entry.description].filter(Boolean).join(". ")];
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
    const setOptions = (select, options) => {
      select.replaceChildren();
      for (const option of options) {
        make("option", null, select, option.label).value = option.value;
      }
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
      const [name, detail] = settingName(entry);
      make("div", "zia-set-label", text, name);
      if (detail) {
        make("div", "zia-set-desc", text, detail);
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
        setOptions(control, entry.options || []);
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
      control.setAttribute("aria-label", name);
      // (found by its short name and detail, and by its full label too)
      const words = `${name} ${detail} ${entry.label} ${entry.description || ""} ${section.el.firstChild.textContent}`.toLowerCase();
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
          continue;
        }
        // (a saved choice that isn't in the list, a model fetched in Sine's page say, is added
        // to it: the dropdown showed empty)
        if (one.entry.type === "dropdown" && value && ![...one.control.options].some((option) => option.value === value)) {
          make("option", null, one.control, value).value = value;
        }
        if (document.activeElement !== one.control) {
          one.control.value = value ?? "";
        }
      }
      show();
      fillModels();
    };
    // The AI services' model dropdowns with the models each service actually offers, as
    // Sine's page has them (tidy-downloads-models.js, read live, cached a few minutes):
    // the list in preferences.json is only a fallback
    const fillModels = () => {
      const lists = window.ziaTidyModels;
      for (const one of rows) {
        if (one.entry.type !== "dropdown" || one.row.hidden || !lists?.handles(one.entry.property)) {
          continue;
        }
        lists
          .modelsFor(one.entry.property)
          .then((models) => {
            if (!models?.length || !one.control.isConnected || document.activeElement === one.control) {
              return;
            }
            const value = values[one.entry.property];
            setOptions(one.control, models);
            if (value && !models.some((model) => model.value === value)) {
              make("option", null, one.control, value).value = value;
            }
            one.control.value = value ?? "";
          })
          .catch((err) => noteError("settings page: models", err));
      }
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

