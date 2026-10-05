// Tidy Downloads, by Bxthesda and Zylaah (github.com/Vertex-Mods/Zen-Tidy-Downloads),
// in Zia with their permission: as a download finishes, an AI service gives
// it a clearer name, and a card above the Library button shows it, with an
// undo. Zia loads this only with "Rename finished downloads with AI" on
// (src/js/28l-tidy-downloads.js); the settings are Tidy Downloads' own
// (extensions.downloads.*), so a move from the standalone mod keeps them.
(function () {
  "use strict";

  if (location.href !== "chrome://browser/content/browser.xhtml" || window.__ziaTidyDownloads) {
    return;
  }
  window.__ziaTidyDownloads = true;

  const lazy = {};
  ChromeUtils.defineESModuleGetters(lazy, {
    DownloadHistory: "resource://gre/modules/DownloadHistory.sys.mjs",
    Downloads: "resource://gre/modules/Downloads.sys.mjs",
    FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
    PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  });

  const PREF = "extensions.downloads.";
  const XHTML = "http://www.w3.org/1999/xhtml";
  const IS_WINDOWS = AppConstants.platform === "win";
  const SEP = IS_WINDOWS ? "\\" : "/";
  const CARD_ID = "zia-rename-card";

  // ---------- settings
  function pref(name, fallback) {
    const full = PREF + name;
    try {
      if (typeof fallback === "boolean") {
        return Services.prefs.getBoolPref(full, fallback);
      }
      if (typeof fallback === "number") {
        return Services.prefs.getIntPref(full, fallback);
      }
      return String(Services.prefs.getStringPref(full, fallback ?? "")).trim();
    } catch (err) {
      return fallback;
    }
  }

  // a key or token never reaches the console, even with logging on
  function redact(text) {
    return String(text)
      .replace(/Bearer\s+[\w.-]+/gi, "Bearer [hidden]")
      .replace(/((?:api[_-]?)?key|token|secret)(["']?\s*[:=]\s*["']?)[\w.-]+/gi, "$1$2[hidden]");
  }

  function log(...args) {
    if (pref("enable_debug", false)) {
      console.log("[Zia · Tidy Downloads]", ...args.map((arg) => (typeof arg === "string" ? redact(arg) : arg)));
    }
  }

  // ---------- the AI services
  function provider() {
    const id = pref("ai_provider", "mistral") || "mistral";
    const model = (name, fallback) => pref(name, fallback) || fallback;
    switch (id) {
      case "openai":
        return { id, label: "OpenAI", key: pref("openai_api_key"), url: "https://api.openai.com/v1/chat/completions", model: model("openai_model", "gpt-4.1-mini") };
      case "anthropic":
        return { id, label: "Anthropic", key: pref("anthropic_api_key"), url: "https://api.anthropic.com/v1/messages", model: model("anthropic_model", "claude-sonnet-4-0") };
      case "google":
        return { id, label: "Google Gemini", key: pref("google_api_key"), url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: model("google_model", "gemini-2.5-flash") };
      case "ollama": {
        const host = (pref("ollama_base_url", "http://localhost:11434") || "http://localhost:11434")
          .replace(/\/+$/, "")
          .replace(/\/(v1\/chat\/completions|api\/chat|v1|api)$/i, "");
        return { id, label: "Ollama", key: "", local: true, url: `${host}/v1/chat/completions`, model: model("ollama_model", "llama3.2") };
      }
      case "openrouter":
        return { id, label: "OpenRouter", key: pref("openrouter_api_key"), url: "https://openrouter.ai/api/v1/chat/completions", model: model("openrouter_model", "openai/gpt-4.1-mini") };
      case "openai_compat": {
        const base = (pref("openai_compat_base_url", "https://openrouter.ai/api/v1") || "https://openrouter.ai/api/v1")
          .replace(/\/+$/, "")
          .replace(/\/chat\/completions$/i, "");
        return { id, label: "the endpoint", key: pref("openai_compat_api_key"), url: `${base}/chat/completions`, model: model("openai_compat_model", "openai/gpt-4.1-mini") };
      }
      default: {
        // (the old "medium" and "large" choices stand for those models)
        const chosen = pref("mistral_model", "mistral-small-latest");
        const mistralModel = { medium: "mistral-medium-latest", large: "mistral-large-latest" }[chosen] || chosen || "mistral-small-latest";
        return { id: "mistral", label: "Mistral", key: pref("mistral_api_key"), url: "https://api.mistral.ai/v1/chat/completions", model: mistralModel };
      }
    }
  }

  // at most 10 requests a minute and 100 an hour
  const sent = [];
  function mayAsk() {
    const now = Date.now();
    while (sent.length && sent[0] < now - 3600000) {
      sent.shift();
    }
    return sent.filter((at) => at > now - 60000).length < 10 && sent.length < 100;
  }

  const SYSTEM_PROMPT = `I am downloading a file. Rewrite its filename to be helpful, concise and readable. 2-4 words.
- IMPORTANT: Return ONLY the new filename. Do not provide explanations, conversational text, or "based on the information provided".
- Keep informative names mostly the same. For non-informative names, add information from the tab title, the page's address or the website.
- A picture of the file may be attached: then name the file for what the picture shows, in a few words.
- A site's name, a person's username and a number (pexels-jane-doe-3408744.jpg, AdobeStock_184679416.jpg, unsplash-xyz.jpg) are not informative; name such a file for what it shows, or for the page's address or title.
- Remove machine-generated cruft, like IDs, (1), (copy), etc.
- Clean up messy text, especially dates. Make timestamps concise, human readable, and remove seconds.
- Clean up text casing and letter spacing to make it easier to read.

Some examples, in the form "original name, tab title, domain -> new name"
- 'Arc-1.6.0-41215.dmg', 'Arc from The Browser Company', 'arc.net' -> 'Arc 1.6.0 41215.dmg'
- 'swift-chat-main.zip', 'huggingface/swift-chat: Mac app to demonstrate swift-transformers', 'github.com' -> 'swift-chat main.zip'
- 'folio_option3_6691488.PDF', 'Your Guest Stay Folio from the LINE LA 08-14-23', 'mail.google.com' -> 'Line LA Folio, Aug 14.pdf'
- 'image.png', 'Feedback: Card border radius - nateparro2t@gmail.com - Gmail', 'mail.google.com' -> 'Card border radius feedback.png'
- 'Brooklyn_Bridge_September_2022_008.jpg', 'nyc bridges - Google Images', 'images.google.com' -> 'Brooklyn Bridge Sept 2022.jpg'
- 'AdobeStock_184679416.jpg', 'ladybug - Google Images', 'images.google.com' -> 'Ladybug.jpg'
- 'pexels-optical-chemist-3408744.jpg', 'Free Download Photos', 'pexels.com/photo/black-dog-on-road-3408744' -> 'Black dog on road.jpg'
- 'CleanShot 2023-08-17 at 19.51.05@2x.png', 'dogfooding - The Browser Company - Slack', 'app.slack.com' -> 'CleanShot Aug 17 from dogfooding.png'
- 'Screenshot 2023-09-26 at 11.12.18 PM', 'DM with Nate - Twitter', 'twitter.com' -> 'Sept 26 Screenshot from Nate.png'
- 'image0.png', 'Nate - Slack', 'files.slack.com' -> 'Slack Image from Nate.png'`;

  // A short reason, never the key, for a failed request
  function failureReason(status, body) {
    let message = "";
    try {
      const error = JSON.parse(body)?.error || {};
      message = String(error.metadata?.raw || error.message || "").trim();
    } catch (err) {
      // (not JSON)
    }
    if (status === 429) {
      return "the AI service is busy; try again shortly";
    }
    return message ? redact(message).slice(0, 160) : `the AI service answered ${status}`;
  }

  async function suggestName(context, signal) {
    const ai = provider();
    if (!ai.local && ai.key.length < 10) {
      throw new Error(`add a ${ai.label} API key in Zia's settings`);
    }
    if (!mayAsk()) {
      throw new Error("too many renames at once; try again in a minute");
    }
    sent.push(Date.now());

    const user = `Original filename: '${context.filename}'
Source domain: '${context.domain}'
Source tab title: '${context.title}'
Page address: '${context.page}'
Page Header: '${context.header}'

Instructions:
1. First, check if the "Original filename" is already descriptive (contains real words, e.g., "viper-gaming-valorant-hd..."). If so, prioritize cleaning it up (remove random strings, IDs, dates) rather than rewriting it completely from the context.
2. ONLY if the "Original filename" is meaningless gibberish (e.g., "wp13801370.jpg", "OIP.jpg", "image.png"), rename it based on the "Source tab title", "Page address" or "Page Header".
3. Return ONLY the new filename.`;
    const ask = (picture) => request(ai, picture ? withPicture(ai, user + PICTURE_NOTE, picture) : user, signal);
    log(`Asking ${ai.label} (${ai.model}) about`, context.filename, context.picture ? "(with its picture)" : "");
    let response = await ask(context.picture);
    // (a model that can't see pictures: asked again with the words alone)
    if (!response.ok && context.picture && response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 429) {
      log(`${ai.label} took no picture (${response.status}); asking without it`);
      response = await ask(null);
    }
    if (!response.ok) {
      throw new Error(failureReason(response.status, await response.text()));
    }
    const data = await response.json();
    const text = (ai.id === "anthropic" ? data.content?.[0]?.text : data.choices?.[0]?.message?.content) || "";
    const name = text.trim().replace(/^["']|["']$/g, "");
    // a chatty answer rather than a name
    if (/^(based on|here is|i have|the filename|new filename|renamed file|unknown|file name)/i.test(name)) {
      log("Ignored a chatty answer:", name);
      return "";
    }
    return name;
  }

  const PICTURE_NOTE = "\nThe file's picture is attached: name it for what it shows.";

  // The question with the file's picture, in each service's own form
  function withPicture(ai, text, picture) {
    if (ai.id === "anthropic") {
      return [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: picture.split(",")[1] } },
        { type: "text", text },
      ];
    }
    // (Mistral takes the picture's address on its own; the rest in an object)
    const image = ai.id === "mistral" ? picture : { url: picture };
    return [
      { type: "text", text },
      { type: "image_url", image_url: image },
    ];
  }

  // One request to the service: the question as text, or with a picture
  function request(ai, question, signal) {
    const headers = { "Content-Type": "application/json" };
    let body;
    if (ai.id === "anthropic") {
      headers["x-api-key"] = ai.key;
      headers["anthropic-version"] = "2023-06-01";
      body = { model: ai.model, max_tokens: 50, temperature: 0.1, system: SYSTEM_PROMPT, messages: [{ role: "user", content: question }] };
    } else {
      if (ai.key) {
        headers.Authorization = `Bearer ${ai.key}`;
      }
      if (ai.id === "openrouter") {
        headers["HTTP-Referer"] = "https://github.com/z1n-k/zia";
        headers["X-Title"] = "Zia";
      }
      body = {
        model: ai.model,
        temperature: 0.1,
        max_tokens: 50,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: question },
        ],
      };
    }

    return fetch(ai.url, { method: "POST", headers, body: JSON.stringify(body), signal });
  }

  // ---------- what the file came from
  function pageContext(download, filename) {
    const source = download.source?.url || "";
    const referrer = download.source?.referrer || "";
    let domain = "unknown";
    try {
      domain = new URL(source).hostname || "unknown";
    } catch (err) {
      // (a data: or blob: download)
    }
    // (the tab it came from, or the one in front, where it was just saved)
    const tab = gBrowser.tabs.find((t) => [source, referrer].includes(t.linkedBrowser?.currentURI?.spec)) || gBrowser.selectedTab;
    let title = tab?.label || "unknown";
    // The page's address, which on many sites says what's on it
    // (pexels.com/photo/black-dog-on-road-3408744): without its query
    let page = "unknown";
    try {
      const url = new URL(referrer || tab?.linkedBrowser?.currentURI?.spec || source);
      page = `${url.hostname}${url.pathname}`.replace(/\/+$/, "");
    } catch (err) {
      // (no address)
    }
    let header = "unknown";
    // from a search engine's images, the search is what names the file
    for (const spec of [referrer, source, gBrowser.selectedBrowser?.currentURI?.spec]) {
      try {
        const url = new URL(spec);
        if (!/google|duckduckgo|bing|yahoo|yandex/i.test(url.hostname)) {
          continue;
        }
        const query = url.searchParams.get("q") || url.searchParams.get("p") || url.searchParams.get("text");
        if (query) {
          header = `Search Query: ${query}`;
          if (title === "unknown" || /search|images/i.test(title)) {
            title = `${query} - Search`;
          }
          break;
        }
      } catch (err) {
        // (not a URL)
      }
    }
    return { filename, domain, title, page, header };
  }

  // A small JPEG of a picture download, for a service that can see it (at
  // most 512px a side), or null
  const PICTURES = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"]);
  async function pictureOf(path, extension) {
    if (!PICTURES.has(extension)) {
      return null;
    }
    try {
      const image = new Image();
      image.src = Services.io.newFileURI(new lazy.FileUtils.File(path)).spec;
      await image.decode();
      const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElementNS(XHTML, "canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.8);
    } catch (err) {
      log("Couldn't read the picture:", err);
      return null;
    }
  }

  // ---------- names and files
  const RESERVED = /^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i;

  // The AI's answer as a safe file name with the file's own extension: plain
  // letters, numbers and dashes, lower case (as Tidy Downloads names them)
  function cleanName(suggestion, extension) {
    const limit = pref("max_filename_length", 70) - extension.length;
    let base = suggestion
      .normalize("NFC")
      .replace(/[^a-zA-Z0-9\-_.\s]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
    if (extension && base.endsWith(extension.toLowerCase())) {
      base = base.slice(0, -extension.length);
    }
    base = base.replace(/^[-_.]+|[-_.]+$/g, "").slice(0, Math.max(0, limit));
    if (base.replace(/[-_.]/g, "").length < 2) {
      return "";
    }
    if (IS_WINDOWS && RESERVED.test(base)) {
      base = `file-${base}`;
    }
    return base + extension;
  }

  function splitPath(path) {
    const at = path.lastIndexOf(SEP);
    return { dir: path.slice(0, at), name: path.slice(at + 1) };
  }

  function extensionOf(name) {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot).toLowerCase() : "";
  }

  // the name, or with -1, -2… if the folder already has one
  function freeName(dir, name) {
    const ext = extensionOf(name);
    const base = ext ? name.slice(0, -ext.length) : name;
    for (let n = 0; n < 100; n++) {
      const candidate = n ? `${base}-${n}${ext}` : name;
      const file = new lazy.FileUtils.File(dir + SEP + candidate);
      if (!file.exists()) {
        return candidate;
      }
    }
    return null;
  }

  // Move the file, and tell Firefox's download record and history where it
  // went, so the Library and the downloads list find it after a restart
  async function moveDownload(download, newName) {
    const oldPath = download.target.path;
    const { dir } = splitPath(oldPath);
    const file = new lazy.FileUtils.File(oldPath);
    if (!file.exists()) {
      throw new Error("the file has gone");
    }
    file.moveTo(null, newName);
    const newPath = dir + SEP + newName;
    download.target.path = newPath;
    try {
      await download.refresh?.();
    } catch (err) {
      log("Couldn't refresh the download:", err);
    }
    // (refresh() doesn't tell the lists when only the path changed)
    try {
      download._notifyChange?.();
    } catch (err) {
      log("Couldn't tell the lists:", err);
    }
    const url = download.source?.url;
    if (url && !download.source.isPrivate) {
      try {
        if (lazy.PlacesUtils.history.canAddURI(lazy.PlacesUtils.toURI(url))) {
          const page = await lazy.PlacesUtils.history.fetch(url);
          if (page) {
            await lazy.PlacesUtils.history.update({
              guid: page.guid,
              url: page.url,
              annotations: new Map([["downloads/destinationFileURI", Services.io.newFileURI(new lazy.FileUtils.File(newPath)).spec]]),
            });
            await lazy.DownloadHistory.updateMetaData?.(download);
          }
        }
      } catch (err) {
        log("Couldn't update the download's history:", err);
      }
    }
    return newPath;
  }

  // ---------- the queue: one rename at a time
  const renamed = new WeakMap(); // download → { originalName, newName }
  const seen = new WeakSet();
  const queue = [];
  let working = false;

  // (a download is shared by every window, so the first to see it finish
  // claims it and the others leave it; one from a private window is never
  // sent to an AI service)
  function enqueue(download) {
    if (!download.succeeded || download.launchWhenSucceeded || !download.target?.path || download.source?.isPrivate || seen.has(download) || download.ziaTidyClaimed) {
      return;
    }
    seen.add(download);
    download.ziaTidyClaimed = true;
    queue.push(download);
    if (!working) {
      work();
    }
  }

  async function work() {
    working = true;
    while (queue.length) {
      const download = queue.shift();
      try {
        await rename(download);
      } catch (err) {
        log("Rename failed:", err);
        toast(`Couldn't rename the download: ${err.message || err}`);
      }
    }
    working = false;
  }

  async function rename(download) {
    const path = download.target.path;
    const { dir, name } = splitPath(path);
    const extension = extensionOf(name);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    // (only an outline on the Library button while it's asked: the card
    // comes once the file has its new name)
    const button = document.getElementById("zen-library-button");
    button?.setAttribute("zia-renaming", "true");
    let suggestion;
    try {
      const context = pageContext(download, name);
      context.picture = await pictureOf(path, extension);
      suggestion = await suggestName(context, controller.signal);
    } finally {
      clearTimeout(timeout);
      button?.removeAttribute("zia-renaming");
    }
    const wanted = cleanName(suggestion || "", extension);
    // (the AI thought the name was fine, or gave nothing usable)
    if (!wanted || wanted.toLowerCase() === name.toLowerCase() || download.target.path !== path) {
      log("Kept", name);
      return;
    }
    const newName = freeName(dir, wanted);
    if (!newName) {
      return;
    }
    await moveDownload(download, newName);
    renamed.set(download, { originalName: name, newName });
    log(`Renamed ${name} → ${newName}`);
    // (the file's renamed either way: a card that won't show is only logged)
    try {
      showCard(download);
    } catch (err) {
      console.error("[Zia · Tidy Downloads] Couldn't show the rename card:", err);
    }
  }

  async function undo(download) {
    const names = renamed.get(download);
    if (!names || splitPath(download.target.path).name !== names.newName) {
      return false;
    }
    const { dir } = splitPath(download.target.path);
    const original = freeName(dir, names.originalName);
    if (!original) {
      return false;
    }
    await moveDownload(download, original);
    renamed.delete(download);
    return true;
  }

  // ---------- the card above the Library button (26-tidy-downloads.css)
  let card = null;
  let cardDownload = null;
  let hideTimer = null;

  function makeCard() {
    card = document.createElementNS(XHTML, "div");
    card.id = CARD_ID;
    card.hidden = true;
    card.innerHTML = `
      <div class="zia-rc-head">
        <span class="zia-rc-mark"></span>
        <span class="zia-rc-status">Renamed from <s class="zia-rc-was"></s></span>
        <button class="zia-rc-button zia-rc-undo" title="Undo" aria-label="Undo the rename"></button>
        <button class="zia-rc-button zia-rc-close" title="Close" aria-label="Close"></button>
      </div>
      <div class="zia-rc-row">
        <img class="zia-rc-icon" alt="" />
        <span class="zia-rc-name"></span>
        <span class="zia-rc-size"></span>
      </div>`;
    card.querySelector(".zia-rc-close").addEventListener("click", hideCard);
    card.querySelector(".zia-rc-undo").addEventListener("click", async () => {
      const download = cardDownload;
      hideCard();
      try {
        if (!download || !(await undo(download))) {
          toast("Couldn't undo the rename");
        }
      } catch (err) {
        log("Undo failed:", err);
        toast("Couldn't undo the rename");
      }
    });
    // (stays while the pointer's on it)
    card.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    card.addEventListener("mouseleave", scheduleHide);
  }

  // floating just above the sidebar's foot, as Zen's own download list does,
  // so nothing in the sidebar moves for it
  function placeCard() {
    const foot = document.getElementById("zen-sidebar-foot-buttons");
    if (!foot) {
      return false;
    }
    if (card.parentNode !== foot) {
      foot.appendChild(card);
    }
    return true;
  }

  function sizeText(bytes) {
    if (!bytes) {
      return "";
    }
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${parseFloat((bytes / 1024 ** i).toFixed(i ? 1 : 0))} ${units[i]}`;
  }

  function showCard(download) {
    const names = renamed.get(download);
    if (!names) {
      return;
    }
    if (!card) {
      makeCard();
    }
    // (in compact mode the sidebar's out of sight: a toast says it)
    if (document.documentElement.getAttribute("zen-compact-mode") === "true" || !placeCard()) {
      toast(`Renamed to ${names.newName}`, () => undo(download));
      return;
    }
    cardDownload = download;
    const icon = card.querySelector(".zia-rc-icon");
    const file = new lazy.FileUtils.File(download.target.path);
    icon.src = /^image\//.test(download.contentType || "") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(names.newName)
      ? Services.io.newFileURI(file).spec
      : `moz-icon://${Services.io.newFileURI(file).spec}?size=16`;
    card.querySelector(".zia-rc-was").textContent = names.originalName;
    card.querySelector(".zia-rc-was").title = names.originalName;
    card.querySelector(".zia-rc-name").textContent = names.newName;
    card.querySelector(".zia-rc-name").title = names.newName;
    card.querySelector(".zia-rc-size").textContent = sizeText(download.currentBytes || download.totalBytes);
    card.hidden = false;
    card.removeAttribute("zia-shown");
    requestAnimationFrame(() => requestAnimationFrame(() => card.setAttribute("zia-shown", "true")));
    scheduleHide();
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    if (!pref("disable_autohide", false)) {
      hideTimer = setTimeout(hideCard, pref("autohide_delay_ms", 10000));
    }
  }

  function hideCard() {
    clearTimeout(hideTimer);
    if (!card || card.hidden) {
      return;
    }
    card.removeAttribute("zia-shown");
    cardDownload = null;
    setTimeout(() => {
      if (!card.hasAttribute("zia-shown")) {
        card.hidden = true;
      }
    }, 250);
  }

  // Zen's own toast, with an Undo when there's one to offer
  function toast(message, onUndo) {
    const container = document.getElementById("zen-toast-container");
    if (!container) {
      return;
    }
    const item = document.createXULElement("hbox");
    item.className = "zen-toast zia-rc-toast";
    const label = document.createXULElement("label");
    label.textContent = message;
    item.appendChild(label);
    if (onUndo) {
      const button = document.createElementNS(XHTML, "button");
      button.className = "zia-rc-toast-undo";
      button.textContent = "Undo";
      button.addEventListener("click", async () => {
        item.remove();
        if (!(await onUndo().catch(() => false))) {
          toast("Couldn't undo the rename");
        }
      });
      item.appendChild(button);
    }
    container.removeAttribute("hidden");
    container.appendChild(item);
    setTimeout(() => {
      item.remove();
      if (!container.children.length) {
        container.setAttribute("hidden", "true");
      }
    }, onUndo ? 6000 : 3500);
  }

  // ---------- watching downloads: only those that finish from now on
  async function start() {
    const list = await lazy.Downloads.getList(lazy.Downloads.ALL);
    let booting = true;
    const view = {
      onDownloadAdded(download) {
        // (ones already finished when Zen opened are left as they are)
        if (booting && (download.succeeded || download.canceled || download.error)) {
          seen.add(download);
        } else {
          enqueue(download);
        }
      },
      onDownloadChanged: enqueue,
      onDownloadRemoved(download) {
        if (download === cardDownload) {
          hideCard();
        }
      },
    };
    await list.addView(view);
    booting = false;
    window.addEventListener("unload", () => list.removeView(view), { once: true });
    log("Watching new downloads");
  }

  start().catch((err) => console.error("[Zia · Tidy Downloads] Couldn't start:", err));
})();
