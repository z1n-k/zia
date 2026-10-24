// Zia's settings page (index.html): built from ../preferences.json, the list Sine
// shows too, its sections down the side. Zia (zia.uc.js) sends the settings' values
// as a mark on the page, read whenever it changes, and takes changes and "close" as an
// event on this page, so the page itself never touches a setting.
(async () => {
  const list = document.getElementById("list");
  const nav = document.getElementById("nav");
  const search = document.getElementById("search");
  // (two ways, as the welcome tour tells Zia, so it gets through however Zen keeps the
  // page apart: an event on this page and a message to the window; each is harmless twice)
  const tell = (action, data = {}) => {
    const message = JSON.stringify({ action, ...data });
    document.dispatchEvent(new CustomEvent("ZiaSettings", { detail: message }));
    try {
      window.parent.postMessage({ ziaSettings: message }, "*");
    } catch (err) {}
  };

  const platform = /Mac/.test(navigator.platform) ? "macos" : /Win/.test(navigator.platform) ? "windows" : "linux";
  const entries = await (await fetch("../preferences.json")).json();
  let values = {};

  // Sine's rules for a row's conditions: "if" or "not", nested lists with their own
  // "operator", and a row's own list "OR" unless it says otherwise (as in Sine)
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

  const make = (tag, className, parent, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    parent?.append(el);
    return el;
  };

  // ---------- sections and rows
  const sections = [];
  const rows = [];
  let section = null;
  const newSection = (label) => {
    const el = make("section", "section", list);
    el.id = `section-${sections.length}`;
    make("h2", "section-title", el, label);
    const group = make("div", "group", el);
    const link = make("button", "nav-item", nav, label);
    link.type = "button";
    link.addEventListener("click", () => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    section = { el, group, link, rows: [] };
    sections.push(section);
  };

  for (const entry of entries) {
    if (entry.type === "separator") {
      newSection(entry.label);
      continue;
    }
    if (!section) newSection("General");
    if (entry.disabledOn?.includes(platform)) continue;

    const row = make("div", "row", section.group);
    if (entry.conditions) row.classList.add("sub");
    const text = make("div", "text", row);
    const label = make("div", "label", text, entry.label);
    label.id = `label-${rows.length}`;
    if (entry.description) make("div", "desc", text, entry.description);

    let control;
    if (entry.type === "checkbox") {
      control = make("button", "switch", row);
      control.type = "button";
      control.setAttribute("role", "switch");
      control.addEventListener("click", () => {
        const on = control.getAttribute("aria-checked") !== "true";
        control.setAttribute("aria-checked", String(on));
        tell("set", { property: entry.property, value: on });
      });
      row.addEventListener("click", (event) => {
        if (!control.contains(event.target)) control.click();
      });
    } else if (entry.type === "dropdown") {
      control = make("select", "select", row);
      for (const option of entry.options || []) {
        make("option", null, control, option.label).value = option.value;
      }
      control.addEventListener("change", () => tell("set", { property: entry.property, value: control.value }));
    } else if (entry.type === "string") {
      control = make("input", "field", row);
      // (an API key is a secret: not shown as it's typed or read off the screen)
      control.type = /api_key/i.test(entry.property) ? "password" : "text";
      control.placeholder = entry.placeholder || "";
      control.spellcheck = false;
      control.autocomplete = "off";
      control.addEventListener("change", () => tell("set", { property: entry.property, value: control.value }));
    } else {
      continue;
    }
    control.setAttribute("aria-labelledby", label.id);
    const words = `${entry.label} ${entry.description || ""} ${section.el.querySelector(".section-title").textContent}`.toLowerCase();
    const one = { entry, row, control, words, section };
    rows.push(one);
    section.rows.push(one);
  }

  // ---------- what shows: a row's conditions, then the search
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
    list.classList.toggle("empty", !any);
  };

  const fill = () => {
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

  // values from Zia
  const read = () => {
    try {
      values = JSON.parse(document.documentElement.getAttribute("data-zia-values") || "{}");
    } catch (err) {
      return;
    }
    fill();
  };
  // (the mark watched rather than an event from Zia: an event made for the page from the
  // window didn't arrive, and every switch showed off)
  new MutationObserver(read).observe(document.documentElement, { attributes: true, attributeFilter: ["data-zia-values"] });
  make("div", "none", list, "No settings match");

  // ---------- the section in view lit in the side list
  const lit = new IntersectionObserver(
    (seen) => {
      for (const item of seen) {
        if (item.isIntersecting) {
          for (const part of sections) part.link.classList.toggle("cur", part.el === item.target);
        }
      }
    },
    { root: list, rootMargin: "0px 0px -70% 0px" }
  );
  for (const part of sections) lit.observe(part.el);

  // ---------- search and closing
  search.addEventListener("input", () => {
    show();
    list.scrollTop = 0;
  });
  document.getElementById("close").addEventListener("click", () => tell("close"));
  document.querySelector(".scrim").addEventListener("mousedown", (event) => {
    if (event.target === event.currentTarget) tell("close");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (search.value) {
        search.value = "";
        show();
      } else {
        tell("close");
      }
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      search.focus();
    }
  });

  read();
  tell("get");
  search.focus();
})();
