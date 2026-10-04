// ==UserScript==
// @include   main
// @loadOrder 99999999999999
// @ignorecache
// ==/UserScript==

// tidy-downloads-ai-models.uc.js
// Live provider model catalogs for Sine settings (same approach as urlbar-ai).
(function () {
  "use strict";

  // Settings pages ship a `default-src chrome:` CSP that blocks provider requests, so the
  // fetching has to happen from the browser window and reach into the settings document.
  if (location.href !== "chrome://browser/content/browser.xhtml") return;
  if (window.__zenTidyDownloadsAiModelsSetup) return;
  window.__zenTidyDownloadsAiModelsSetup = true;

  const { classes: Cc, interfaces: Ci } = Components;
  const prefsService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
  const PREF_STRING = Ci.nsIPrefBranch.PREF_STRING;
  const PREF_INT = Ci.nsIPrefBranch.PREF_INT;
  const PREF_BOOL = Ci.nsIPrefBranch.PREF_BOOL;

  const Utils = window.zenTidyDownloadsUtils;
  const AI_PROVIDER_PREF = Utils?.AI_PROVIDER_PREF || "extensions.downloads.ai_provider";
  const MISTRAL_API_KEY_PREF = Utils?.MISTRAL_API_KEY_PREF || "extensions.downloads.mistral_api_key";
  const MISTRAL_MODEL_PREF = Utils?.MISTRAL_MODEL_PREF || "extensions.downloads.mistral_model";
  const OPENAI_API_KEY_PREF = Utils?.OPENAI_API_KEY_PREF || "extensions.downloads.openai_api_key";
  const OPENAI_MODEL_PREF = Utils?.OPENAI_MODEL_PREF || "extensions.downloads.openai_model";
  const ANTHROPIC_API_KEY_PREF = Utils?.ANTHROPIC_API_KEY_PREF || "extensions.downloads.anthropic_api_key";
  const ANTHROPIC_MODEL_PREF = Utils?.ANTHROPIC_MODEL_PREF || "extensions.downloads.anthropic_model";
  const GOOGLE_API_KEY_PREF = Utils?.GOOGLE_API_KEY_PREF || "extensions.downloads.google_api_key";
  const GOOGLE_MODEL_PREF = Utils?.GOOGLE_MODEL_PREF || "extensions.downloads.google_model";
  const OLLAMA_BASE_URL_PREF = Utils?.OLLAMA_BASE_URL_PREF || "extensions.downloads.ollama_base_url";
  const OLLAMA_MODEL_PREF = Utils?.OLLAMA_MODEL_PREF || "extensions.downloads.ollama_model";
  const OPENROUTER_API_KEY_PREF = Utils?.OPENROUTER_API_KEY_PREF || "extensions.downloads.openrouter_api_key";
  const OPENROUTER_MODEL_PREF = Utils?.OPENROUTER_MODEL_PREF || "extensions.downloads.openrouter_model";
  const OPENAI_COMPAT_API_KEY_PREF = Utils?.OPENAI_COMPAT_API_KEY_PREF || "extensions.downloads.openai_compat_api_key";
  const OPENAI_COMPAT_BASE_URL_PREF = Utils?.OPENAI_COMPAT_BASE_URL_PREF || "extensions.downloads.openai_compat_base_url";
  const OPENAI_COMPAT_MODEL_PREF = Utils?.OPENAI_COMPAT_MODEL_PREF || "extensions.downloads.openai_compat_model";

  const CACHE_TTL_MS = 5 * 60 * 1000;
  const FAILURE_CACHE_TTL_MS = 60 * 1000;
  const FETCH_TIMEOUT_MS = 8000;
  const MAX_PAGES = 10;
  const ANTHROPIC_VERSION = "2023-06-01";

  const PROVIDER_MODEL_PREFS = {
    mistral: MISTRAL_MODEL_PREF,
    openai: OPENAI_MODEL_PREF,
    anthropic: ANTHROPIC_MODEL_PREF,
    google: GOOGLE_MODEL_PREF,
    ollama: OLLAMA_MODEL_PREF,
    openrouter: OPENROUTER_MODEL_PREF,
    openai_compat: OPENAI_COMPAT_MODEL_PREF
  };

  const PROVIDER_DEFAULT_MODELS = {
    mistral: "mistral-small-latest",
    openai: "gpt-4.1-mini",
    anthropic: "claude-sonnet-4-0",
    google: "gemini-2.5-flash",
    ollama: "llama3.2",
    openrouter: "openai/gpt-4.1-mini",
    openai_compat: "openai/gpt-4.1-mini"
  };

  /** @type {Map<string, { models: Array<{value: string, label: string}>, fetchedAt: number }>} */
  const providerModelCache = new Map();
  const watchedPreferencesDocuments = new WeakSet();

  const seenWarnings = new Set();

  function logWarn(...args) {
    console.warn("[Tidy Downloads][AI Models]", ...args);
  }

  // Model lists are refreshed whenever the settings DOM changes, so an unreachable provider
  // would otherwise repeat the same warning indefinitely.
  function logWarnOnce(key, ...args) {
    if (seenWarnings.has(key)) return;
    seenWarnings.add(key);
    logWarn(...args);
  }

  function getPref(name, defaultValue) {
    try {
      const type = prefsService.getPrefType(name);
      if (type === PREF_STRING) {
        try {
          return prefsService.getStringPref(name, defaultValue);
        } catch (_e) {
          return prefsService.getCharPref(name, String(defaultValue ?? ""));
        }
      }
      if (type === PREF_BOOL) {
        return prefsService.getBoolPref(name, !!defaultValue);
      }
      if (type === PREF_INT) {
        return prefsService.getIntPref(name, Number(defaultValue) || 0);
      }
    } catch (_e) {
      /* fall through */
    }
    return defaultValue;
  }

  function readApiKey(prefName) {
    return String(getPref(prefName, "") || "").trim();
  }

  function getWindowMediator() {
    return Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
  }

  function normalizeOllamaHost(rawUrl) {
    const fallback = "http://localhost:11434";
    const raw = String(rawUrl || fallback).trim() || fallback;
    return raw
      .replace(/\/+$/, "")
      .replace(/\/v1\/chat\/completions$/i, "")
      .replace(/\/api\/chat$/i, "")
      .replace(/\/v1$/i, "")
      .replace(/\/api$/i, "");
  }

  function normalizeCompatBase(rawUrl) {
    const fallback = "https://openrouter.ai/api/v1";
    const raw = String(rawUrl || fallback).trim() || fallback;
    return raw.replace(/\/+$/, "").replace(/\/chat\/completions$/i, "");
  }

  function getProviderAuth(providerKey) {
    if (providerKey === "ollama") {
      return { apiKey: "", host: normalizeOllamaHost(getPref(OLLAMA_BASE_URL_PREF, "http://localhost:11434")) };
    }
    if (providerKey === "mistral") return { apiKey: readApiKey(MISTRAL_API_KEY_PREF) };
    if (providerKey === "openai") return { apiKey: readApiKey(OPENAI_API_KEY_PREF) };
    if (providerKey === "anthropic") return { apiKey: readApiKey(ANTHROPIC_API_KEY_PREF) };
    if (providerKey === "google") return { apiKey: readApiKey(GOOGLE_API_KEY_PREF) };
    if (providerKey === "openrouter") return { apiKey: readApiKey(OPENROUTER_API_KEY_PREF) };
    return {
      apiKey: readApiKey(OPENAI_COMPAT_API_KEY_PREF),
      host: normalizeCompatBase(getPref(OPENAI_COMPAT_BASE_URL_PREF, "https://openrouter.ai/api/v1"))
    };
  }

  function getModelsListUrl(providerKey) {
    const auth = getProviderAuth(providerKey);
    if (providerKey === "ollama") return `${auth.host}/api/tags`;
    if (providerKey === "mistral") return "https://api.mistral.ai/v1/models";
    if (providerKey === "openai") return "https://api.openai.com/v1/models";
    if (providerKey === "anthropic") return "https://api.anthropic.com/v1/models";
    if (providerKey === "google") return "https://generativelanguage.googleapis.com/v1beta/openai/models";
    if (providerKey === "openrouter") return "https://openrouter.ai/api/v1/models";
    const base = String(auth.host || "").replace(/\/+$/, "");
    if (base.endsWith("/chat/completions")) {
      return base.slice(0, -"/chat/completions".length) + "/models";
    }
    return `${base}/models`;
  }

  function fetchJsonOnce(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = timeoutMs;
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText || "{}"));
          } catch (e) {
            reject(new Error(`Invalid JSON from model list: ${e.message}`));
          }
          return;
        }
        reject(
          new Error(
            `API error: ${xhr.status} ${xhr.statusText}${xhr.responseText ? " — " + String(xhr.responseText).slice(0, 200) : ""}`
          )
        );
      };
      xhr.onerror = () => reject(new Error(`Network error listing models: ${url}`));
      xhr.ontimeout = () => reject(new Error(`Timeout listing models: ${url}`));
      xhr.open(options.method || "GET", url, true);
      const headers = options.headers || {};
      for (const [name, value] of Object.entries(headers)) {
        xhr.setRequestHeader(name, value);
      }
      xhr.send(options.body || null);
    });
  }

  function normalizeModelId(id) {
    if (!id || typeof id !== "string") return "";
    return id.replace(/^models\//, "").replace(/^publishers\/[^/]+\/models\//, "");
  }

  function normalizeModelRows(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows || []) {
      const id = normalizeModelId(row.id || row.name || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const pretty = String(row.display_name || row.displayName || "").trim();
      out.push({ value: id, label: pretty && pretty !== id ? pretty : id });
    }
    out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    return out;
  }

  async function fetchOpenAIStyleModelRows(url, headers, timeoutMs) {
    const all = [];
    let nextUrl = url;
    for (let page = 0; page < MAX_PAGES && nextUrl; page++) {
      const data = await fetchJsonOnce(nextUrl, { headers }, timeoutMs);
      const batch = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
      all.push(...batch);
      if (data.has_more && data.last_id) {
        const u = new URL(url);
        u.searchParams.set("after", data.last_id);
        nextUrl = u.toString();
      } else {
        nextUrl = null;
      }
    }
    return all;
  }

  async function fetchGeminiNativeModelRows(apiKey, headers, timeoutMs) {
    const all = [];
    const base =
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=" +
      encodeURIComponent(apiKey);
    let pageUrl = base;
    for (let page = 0; page < MAX_PAGES && pageUrl; page++) {
      const data = await fetchJsonOnce(pageUrl, { headers }, timeoutMs);
      all.push(...(data.models || []));
      const token = data.nextPageToken;
      pageUrl = token ? `${base}&pageToken=${encodeURIComponent(token)}` : null;
    }
    return all.map((m) => ({ id: m.name, displayName: m.displayName }));
  }

  async function fetchProviderModels(providerKey) {
    const auth = getProviderAuth(providerKey);
    if (providerKey !== "ollama" && !auth.apiKey) {
      return [];
    }

    const timeoutMs = FETCH_TIMEOUT_MS;
    const headers = { Accept: "application/json" };
    if (providerKey === "anthropic") {
      headers["x-api-key"] = auth.apiKey;
      headers["anthropic-version"] = ANTHROPIC_VERSION;
    } else if (providerKey !== "ollama" && auth.apiKey) {
      headers.Authorization = `Bearer ${auth.apiKey}`;
    }
    if (providerKey === "openrouter") {
      headers["HTTP-Referer"] = "https://github.com/Vertex-Mods/Zen-Tidy-Downloads";
      headers["X-Title"] = "Tidy Downloads";
    }

    if (providerKey === "ollama") {
      const data = await fetchJsonOnce(getModelsListUrl(providerKey), { headers }, timeoutMs);
      return normalizeModelRows((data.models || []).map((m) => ({ id: m.name || m.model })));
    }

    let url = getModelsListUrl(providerKey);
    if (providerKey === "google" && auth.apiKey) {
      url += (url.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(auth.apiKey);
    }

    try {
      const rows = await fetchOpenAIStyleModelRows(url, headers, timeoutMs);
      const models = normalizeModelRows(rows);
      if (models.length || providerKey !== "google") {
        return models;
      }
    } catch (e) {
      if (providerKey !== "google") throw e;
      logWarn("Gemini OpenAI-compatible model list failed, trying native API:", e.message);
    }

    const rows = await fetchGeminiNativeModelRows(auth.apiKey, headers, timeoutMs);
    return normalizeModelRows(rows);
  }

  function isProviderConfigured(providerKey) {
    // Ollama needs no key, so only probe localhost when it is the provider actually in use.
    if (providerKey === "ollama") {
      return String(getPref(AI_PROVIDER_PREF, "mistral")).trim() === "ollama";
    }
    return !!getProviderAuth(providerKey).apiKey;
  }

  async function getProviderModels(providerKey) {
    if (!isProviderConfigured(providerKey)) return [];

    const cached = providerModelCache.get(providerKey);
    if (cached) {
      const ttl = cached.models.length ? CACHE_TTL_MS : FAILURE_CACHE_TTL_MS;
      if (Date.now() - cached.fetchedAt < ttl) return cached.models;
    }

    let models = [];
    try {
      models = await fetchProviderModels(providerKey);
      if (models.length) seenWarnings.delete(`list:${providerKey}`);
    } catch (e) {
      logWarnOnce(`list:${providerKey}`, `Could not list ${providerKey} models:`, e.message);
    }
    if (!models.length && cached?.models.length) {
      return cached.models;
    }
    providerModelCache.set(providerKey, { models, fetchedAt: Date.now() });
    return models;
  }

  function createXulMenuItem(doc, value, label) {
    let item;
    if (typeof doc.createXULElement === "function") {
      item = doc.createXULElement("menuitem");
    } else {
      item = doc.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
        "menuitem"
      );
    }
    item.setAttribute("value", value);
    item.setAttribute("label", label);
    return item;
  }

  function getMenuPopup(menulist) {
    if (!menulist) return null;
    return (
      menulist.menupopup ||
      menulist.getElementsByTagName("menupopup")[0] ||
      menulist.querySelector("menupopup") ||
      [...menulist.children].find((child) => child.localName === "menupopup") ||
      null
    );
  }

  function findModelMenulist(doc, providerKey) {
    const pref = PROVIDER_MODEL_PREFS[providerKey];
    if (!doc || !pref) return null;
    const dashed = pref.replaceAll(".", "-");

    const asMenulist = (el) => {
      if (!el) return null;
      if (el.localName === "menulist" || el.localName === "select") return el;
      return (
        el.getElementsByTagName("menulist")[0] ||
        el.querySelector("menulist") ||
        el.querySelector("select") ||
        null
      );
    };

    return (
      asMenulist(doc.getElementById(`${pref}-popup-menulist`)) ||
      asMenulist(doc.getElementById(`${dashed}-popup-menulist`)) ||
      asMenulist(doc.getElementById(dashed)) ||
      asMenulist(doc.getElementById(pref.replaceAll(".", "-").replaceAll("_", "-"))) ||
      asMenulist(doc.querySelector(`[tooltiptext="${pref}"]`))
    );
  }

  function populateModelMenulist(doc, providerKey, models) {
    if (!doc || !models.length) return false;
    const pref = PROVIDER_MODEL_PREFS[providerKey];
    const menulist = findModelMenulist(doc, providerKey);
    if (!menulist) return false;
    if (menulist.localName === "select") {
      const fallback = PROVIDER_DEFAULT_MODELS[providerKey] || "";
      const saved = getPref(pref, fallback);
      const items = models.slice();
      if (saved && saved !== "none" && !items.some((m) => m.value === saved)) {
        items.unshift({ value: saved, label: saved });
      }
      const stamp = items.map((m) => m.value).join("\n");
      if (menulist.getAttribute("data-tidy-models-stamp") === stamp && menulist.value === saved) {
        return true;
      }
      menulist.replaceChildren();
      for (const model of items) {
        const opt = (menulist.ownerDocument || doc).createElement("option");
        opt.value = model.value;
        opt.textContent = model.label;
        menulist.appendChild(opt);
      }
      const selected = items.find((m) => m.value === saved) || items[0];
      if (selected) menulist.value = selected.value;
      menulist.setAttribute("data-tidy-models-stamp", stamp);
      return true;
    }

    const popup = getMenuPopup(menulist);
    if (!popup) {
      logWarnOnce(`popup:${providerKey}`, `Found ${providerKey} model control but no menupopup to fill`);
      return false;
    }

    const fallback = PROVIDER_DEFAULT_MODELS[providerKey] || "";
    const saved = getPref(pref, fallback);
    const items = models.slice();
    if (saved && saved !== "none" && !items.some((m) => m.value === saved)) {
      items.unshift({ value: saved, label: saved });
    }

    const stamp = items.map((m) => m.value).join("\n");
    const currentValue = menulist.getAttribute("value") || menulist.value;
    if (menulist.getAttribute("data-tidy-models-stamp") === stamp && currentValue === saved) {
      return true;
    }

    for (const child of [...popup.children]) {
      const value = child.getAttribute("value");
      if (value !== "none" && value !== "") {
        child.remove();
      }
    }
    const ownerDoc = popup.ownerDocument || doc;
    for (const model of items) {
      popup.appendChild(createXulMenuItem(ownerDoc, model.value, model.label));
    }

    const selected = items.find((m) => m.value === saved) || items[0];
    if (selected) {
      menulist.setAttribute("value", selected.value);
      menulist.setAttribute("label", selected.label);
      try {
        menulist.value = selected.value;
      } catch (_e) {
        /* some XUL menulists only use attributes */
      }
    }
    menulist.setAttribute("data-tidy-models-stamp", stamp);
    return true;
  }

  async function fillModelDropdownsInDocument(doc) {
    if (!doc) return;
    await Promise.all(
      Object.keys(PROVIDER_MODEL_PREFS).map(async (providerKey) => {
        const models = await getProviderModels(providerKey);
        populateModelMenulist(doc, providerKey, models);
      })
    );
  }

  function isSettingsDocument(doc) {
    if (!doc) return false;
    try {
      const uri = doc.documentURI || doc.location?.href || "";
      if (uri.startsWith("about:preferences") || /preferences\.xhtml/i.test(uri)) {
        return true;
      }
    } catch (_e) {
      /* ignore */
    }
    try {
      return !!(
        doc.getElementById("sineModsList") ||
        doc.getElementById("zenThemeMarketplaceList") ||
        doc.getElementById("sineInstalledGroup") ||
        doc.querySelector("[data-category='paneSineMods']") ||
        doc.querySelector(".sineItemPreferenceDialogContent")
      );
    } catch (_e) {
      return false;
    }
  }

  function collectPreferencesDocumentsFromWindow(win) {
    const docs = [];
    const seen = new Set();
    const add = (doc) => {
      if (doc && !seen.has(doc)) {
        seen.add(doc);
        docs.push(doc);
      }
    };
    if (!win) return docs;
    try {
      add(win.document);
    } catch (_e) {
      /* ignore */
    }
    try {
      const browsers = win.gBrowser?.browsers || [];
      for (const browser of browsers) {
        try {
          const spec = browser.currentURI?.spec || "";
          if (spec.startsWith("about:preferences") || /preferences|settings/i.test(spec)) {
            add(browser.contentDocument);
            add(browser.contentWindow?.document);
          }
        } catch (_e) {
          /* ignore */
        }
      }
    } catch (_e) {
      /* ignore */
    }
    try {
      for (const el of win.document.querySelectorAll("browser, iframe")) {
        try {
          add(el.contentDocument);
        } catch (_e) {
          /* ignore */
        }
      }
    } catch (_e) {
      /* ignore */
    }
    return docs.filter(
      (doc) =>
        isSettingsDocument(doc) ||
        Object.keys(PROVIDER_MODEL_PREFS).some((key) => findModelMenulist(doc, key))
    );
  }

  function collectAllPreferencesDocuments() {
    const docs = [];
    const seen = new Set();
    const add = (doc) => {
      if (doc && !seen.has(doc)) {
        seen.add(doc);
        docs.push(doc);
      }
    };
    for (const doc of collectPreferencesDocumentsFromWindow(window)) add(doc);
    try {
      const enumerator = getWindowMediator().getEnumerator(null);
      while (enumerator.hasMoreElements()) {
        const win = enumerator.getNext();
        for (const doc of collectPreferencesDocumentsFromWindow(win)) add(doc);
      }
    } catch (_e) {
      /* ignore */
    }
    return docs;
  }

  function watchPreferencesDocument(doc) {
    if (!doc || watchedPreferencesDocuments.has(doc)) return;
    watchedPreferencesDocuments.add(doc);
    let fillTimer = null;
    const scheduleFill = () => {
      if (fillTimer) return;
      fillTimer = setTimeout(() => {
        fillTimer = null;
        fillModelDropdownsInDocument(doc).catch((e) => {
          logWarnOnce("fill", "Failed to fill model dropdowns:", e.message);
        });
      }, 150);
    };
    scheduleFill();
    setTimeout(scheduleFill, 500);
    setTimeout(scheduleFill, 1500);
    const root =
      doc.getElementById("sineModsList") ||
      doc.getElementById("sineInstalledGroup") ||
      doc.getElementById("zenThemeMarketplaceList") ||
      doc.getElementById("mainPrefPane") ||
      doc.documentElement;
    if (!root) return;
    const observer = new MutationObserver(scheduleFill);
    observer.observe(root, { childList: true, subtree: true });
  }

  function tryAttachPreferencesFromWindow(win) {
    if (!win) return;
    try {
      if (isSettingsDocument(win.document)) watchPreferencesDocument(win.document);
    } catch (_e) {
      /* ignore */
    }
    for (const doc of collectPreferencesDocumentsFromWindow(win)) {
      watchPreferencesDocument(doc);
    }
  }

  function scanOpenPreferencesDocuments() {
    for (const doc of collectAllPreferencesDocuments()) {
      watchPreferencesDocument(doc);
    }
  }

  async function refreshAndPopulateAllModelDropdowns(invalidateKeys = null) {
    const keys = invalidateKeys || Object.keys(PROVIDER_MODEL_PREFS);
    for (const key of keys) {
      providerModelCache.delete(key);
      seenWarnings.delete(`list:${key}`);
    }
    scanOpenPreferencesDocuments();
    const docs = collectAllPreferencesDocuments();
    if (!docs.length) {
      logWarnOnce("no-settings-doc", "No settings document found to fill model dropdowns");
    }
    await Promise.all(docs.map((doc) => fillModelDropdownsInDocument(doc)));
  }

  function providerKeyFromPrefName(name) {
    if (!name || typeof name !== "string") return null;
    const n = name;
    if (n.includes("openai_compat")) return "openai_compat";
    if (n.includes("mistral_")) return "mistral";
    if (n.includes("openai_")) return "openai";
    if (n.includes("anthropic_")) return "anthropic";
    if (n.includes("google_")) return "google";
    if (n.includes("openrouter_")) return "openrouter";
    if (n.includes("ollama_")) return "ollama";
    return null;
  }

  function setupModelListSync() {
    const modelPrefObserver = {
      observe(_subject, topic, data) {
        if (topic !== "nsPref:changed") return;
        const name = String(data || "");
        if (name === AI_PROVIDER_PREF) {
          refreshAndPopulateAllModelDropdowns().catch((e) => {
            logWarn("Failed to refresh model lists after provider change:", e.message);
          });
          return;
        }
        if (
          name.endsWith("_api_key") ||
          name.endsWith("_base_url") ||
          name === OPENAI_COMPAT_BASE_URL_PREF ||
          name === OLLAMA_BASE_URL_PREF
        ) {
          const key = providerKeyFromPrefName(name);
          refreshAndPopulateAllModelDropdowns(key ? [key] : null).catch((e) => {
            logWarn("Failed to refresh model lists after pref change:", e.message);
          });
        }
      }
    };
    try {
      prefsService.addObserver("extensions.downloads.", modelPrefObserver, false);
    } catch (e) {
      logWarn("Could not observe model-list prefs:", e.message);
    }

    if (window.gBrowser && typeof window.gBrowser.addTabsProgressListener === "function") {
      window.gBrowser.addTabsProgressListener({
        onLocationChange(browser, webProgress, _request, location) {
          if (webProgress && !webProgress.isTopLevel) return;
          const spec = location?.spec || browser?.currentURI?.spec || "";
          if (!spec.startsWith("about:preferences")) return;
          const attach = () => {
            try {
              const doc = browser.contentDocument || browser.contentWindow?.document;
              if (doc) watchPreferencesDocument(doc);
            } catch (_e) {
              /* ignore */
            }
          };
          setTimeout(attach, 200);
          setTimeout(attach, 800);
          try {
            browser.addEventListener("DOMContentLoaded", attach, true);
            browser.addEventListener("load", attach, true);
          } catch (_e) {
            /* ignore */
          }
        }
      });
    }

    try {
      const windowListener = {
        onOpenWindow(xulWindow) {
          let domWindow = null;
          try {
            domWindow = xulWindow.docShell.domWindow;
          } catch (_e) {
            try {
              domWindow = xulWindow
                .QueryInterface(Ci.nsIInterfaceRequestor)
                .getInterface(Ci.nsIDOMWindow);
            } catch (_e2) {
              return;
            }
          }
          const onLoad = () => tryAttachPreferencesFromWindow(domWindow);
          try {
            if (domWindow.document?.readyState === "complete") onLoad();
            else domWindow.addEventListener("load", onLoad, { once: true });
          } catch (_e) {
            /* ignore */
          }
          setTimeout(onLoad, 500);
        },
        onCloseWindow() {},
        onWindowTitleChange() {}
      };
      getWindowMediator().addListener(windowListener);
    } catch (e) {
      logWarn("Could not watch preferences windows:", e.message);
    }

    try {
      const observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
      observerService.addObserver(
        {
          observe(subject) {
            const win = subject?.defaultView || subject;
            const attach = () => tryAttachPreferencesFromWindow(win);
            try {
              win.addEventListener("load", attach, { once: true });
            } catch (_e) {
              /* ignore */
            }
            setTimeout(attach, 300);
            setTimeout(attach, 1200);
          }
        },
        "chrome-document-global-created",
        false
      );
    } catch (e) {
      logWarn("Could not observe chrome document creation:", e.message);
    }

    scanOpenPreferencesDocuments();
    Object.keys(PROVIDER_MODEL_PREFS).forEach((key) => {
      getProviderModels(key).catch((e) => {
        logWarnOnce(`prefetch:${key}`, `Could not prefetch ${key} models:`, e.message);
      });
    });
  }

  setupModelListSync();
})();
