  // ---------- Zia's settings: rows shown only with the setting they belong to
  // Sine's first check of a row's conditions (preferences.json) runs before the row
  // is on the page, so every row showed; Zia applies them as its rows arrive.
  function fixSettingsConditions() {
    let rows = null;
    const loadRows = async () => {
      if (!rows) {
        const prefs = await (await fetch("chrome://sine/content/zia/preferences.json")).json();
        rows = new Map(prefs.filter((pref) => pref.conditions).map((pref) => [(pref.id ?? pref.property).replaceAll(".", "-"), pref]));
      }
      return rows;
    };

    const prefValue = ({ property, value }) => {
      if (typeof value === "boolean") {
        return Services.prefs.getBoolPref(property, false);
      }
      if (typeof value === "number") {
        return Services.prefs.getIntPref(property, 0);
      }
      return Services.prefs.getStringPref(property, "");
    };
    // (Sine's rules: "if" or "not", nested lists with their own "operator",
    // and a row's own list "OR" unless it says otherwise)
    const holds = (conditions, operator) => {
      const list = Array.isArray(conditions) ? conditions : [conditions];
      const results = list.map((cond) => {
        if (cond.if || cond.not) {
          const test = cond.if || cond.not;
          return (prefValue(test) === test.value) === !cond.not;
        }
        return cond.conditions ? holds(cond.conditions, cond.operator || "AND") : false;
      });
      return operator === "OR" ? results.some(Boolean) : results.every(Boolean);
    };

    const apply = async (doc) => {
      const known = await loadRows();
      for (const [id, pref] of known) {
        const row = doc.getElementById(id);
        if (row) {
          row.style.display = holds(pref.conditions, pref.operator || "OR") ? "flex" : "none";
        }
      }
    };

    const watch = (doc) => {
      let frame = 0;
      const soon = () => {
        if (!frame) {
          frame = doc.defaultView?.requestAnimationFrame(() => {
            frame = 0;
            apply(doc).catch((err) => noteError("settings: conditions", err));
          });
        }
      };
      new MutationObserver(soon).observe(doc, { childList: true, subtree: true });
      soon();
    };

    const onDocument = (doc) => {
      if (!/^about:(preferences|settings)/.test(doc?.documentURI || "") || doc.defaultView?.browsingContext?.topChromeWindow !== window) {
        return;
      }
      doc.defaultView.addEventListener("DOMContentLoaded", () => watch(doc), { once: true });
    };
    Services.obs.addObserver(onDocument, "document-element-inserted");
    window.addEventListener("unload", () => Services.obs.removeObserver(onDocument, "document-element-inserted"), { once: true });
  }

