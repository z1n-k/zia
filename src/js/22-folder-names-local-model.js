  const ICON_SYNONYMS = {
    flight: "plane", flights: "plane", fly: "plane", airline: "plane",
    travel: "plane", trip: "luggage", holiday: "luggage", vacation: "luggage",
    hike: "mountain", hikes: "mountain", hiking: "mountain", trail: "mountain",
    walk: "mountain", climb: "mountain", outdoors: "tree", camping: "tent",
    shop: "shopping-cart", shopping: "shopping-cart", buy: "shopping-cart",
    order: "package", orders: "package", delivery: "truck",
    money: "wallet", bank: "building-bank", budget: "wallet", invoice: "file-invoice",
    pay: "credit-card", payment: "credit-card", finance: "chart-line",
    code: "code", coding: "code", github: "brand-github", git: "git-branch",
    dev: "terminal", api: "braces", server: "server",
    docs: "file-text", doc: "file-text", notes: "note", note: "note",
    read: "book", reading: "book", book: "book", books: "books",
    music: "music", song: "music", playlist: "playlist",
    video: "video", videos: "video", film: "movie", movie: "movie",
    movies: "movie", watch: "device-tv", stream: "broadcast",
    game: "device-gamepad-2", games: "device-gamepad-2", gaming: "device-gamepad-2",
    health: "heartbeat", medical: "first-aid-kit", doctor: "stethoscope",
    fitness: "barbell", gym: "barbell", run: "run",
    food: "tools-kitchen-2", recipe: "chef-hat", recipes: "chef-hat",
    cook: "chef-hat", coffee: "coffee", drink: "beer",
    work: "briefcase", job: "briefcase", jobs: "briefcase", career: "briefcase",
    meeting: "users-group", team: "users-group", email: "mail",
    mail: "mail", inbox: "inbox", calendar: "calendar", schedule: "calendar",
    home: "home", house: "home", rent: "home", property: "building",
    car: "car", cars: "car", drive: "car", train: "train", transport: "bus",
    photo: "photo", photos: "brand-cohost", picture: "photo", design: "palette",
    art: "palette", draw: "pencil", ai: "sparkles", chat: "message-circle",
    news: "news", weather: "cloud", forecast: "cloud",
    learn: "school", course: "school", study: "school",
    school: "school", plan: "list-check", todo: "list-check",
    tasks: "list-check", project: "layout-kanban", idea: "bulb",
    settings: "settings", tools: "tool", security: "shield-check",
    password: "key", login: "login", account: "user-circle",
    pet: "paw", dog: "dog", cat: "cat", garden: "plant",
    gift: "gift", wedding: "heart", baby: "baby-bottle", kids: "baby-bottle",
  };

  const ICON_STOPWORDS = new Set([
    "the", "and", "for", "with", "from", "your", "you", "that", "this", "new",
    "how", "what", "when", "why", "are", "was", "will", "can", "all", "our",
    "www", "com", "net", "org", "html", "php", "index", "home", "page", "site",
    "search", "google", "best", "top", "free", "online", "official", "site",
    "folder", "group", "tab", "tabs", "untitled",
  ]);

  function iconWords(text) {
    return String(text || "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 2 && !ICON_STOPWORDS.has(word));
  }

  function folderWordWeights(folder) {
    const weights = new Map();
    const add = (text, weight) => {
      for (const word of iconWords(text)) {
        weights.set(word, (weights.get(word) || 0) + weight);
      }
    };
    add(folder.label || folder.getAttribute("label"), 3);
    for (const tab of folder.tabs || []) {
      add(tab.label, 1);
      try {
        add(tab.linkedBrowser?.currentURI?.host?.replace(/^www\./, ""), 0.5);
      } catch (err) {
        noteError("folder names local model: add", err);
      }
    }
    return weights;
  }

  // The icon names the suggestions choose from: Tabler's outline icons
  // (icon picker)
  const suggestableIcons = () => tablerIcons().filter((icon) => icon.outline);
  const iconURL = (name) => `${ICON_DIR}/outline/${name}.svg`;

  function suggestFolderIcon(folder) {
    const weights = folderWordWeights(folder);
    if (!weights.size) {
      return null;
    }
    const names = suggestableIcons().map((icon) => icon.name);
    if (!names.length) {
      return null;
    }

    let best = null;
    let bestScore = 0;
    for (const name of names) {
      const parts = name.split("-");
      let score = 0;
      for (const [word, weight] of weights) {
        if (name === word) {
          score += weight * 4;
          continue;
        }

        if (parts.includes(word)) {
          score += weight * 2;
          continue;
        }

        if (ICON_SYNONYMS[word] === name) {
          score += weight * 3;
        }
      }
      if (!score) {
        continue;
      }

      score -= (parts.length - 1) * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = name;
      }
    }

    return bestScore >= 2 ? iconURL(best) : null;
  }

  const DEFAULT_FOLDER_NAMES = /^(new folder|folder|untitled|new group)$/i;

  function titleCase(text) {
    return text
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => (word.length > 3 ? word[0].toUpperCase() + word.slice(1) : word.toUpperCase()))
      .join(" ");
  }

  function folderTabHosts(folder) {
    const hosts = [];
    for (const tab of folder.tabs || []) {
      try {
        const host = tab.linkedBrowser?.currentURI?.host?.replace(/^www\./, "");
        if (host) {
          hosts.push(host);
        }
      } catch (err) {
        noteError("folder names local model: folderTabHosts", err);
      }
    }
    return hosts;
  }

  function suggestFolderName(folder) {
    const tabs = folder.tabs || [];
    if (tabs.length < 2) {
      return null;
    }

    const hosts = folderTabHosts(folder);
    if (hosts.length === tabs.length && new Set(hosts).size === 1) {
      const parts = hosts[0].split(".");
      const brand = parts.length > 2 ? parts[parts.length - 2] : parts[0];
      if (brand && brand.length > 2) {
        return titleCase(brand);
      }
    }

    const pieces = new Map();
    for (const tab of tabs) {
      const seen = new Set();
      for (const piece of String(tab.label || "").split(/\s[-|—·]\s/)) {
        const trimmed = piece.trim();
        if (trimmed.length > 2 && trimmed.length < 30 && !seen.has(trimmed)) {
          seen.add(trimmed);
          pieces.set(trimmed, (pieces.get(trimmed) || 0) + 1);
        }
      }
    }
    for (const [piece, count] of pieces) {
      if (count === tabs.length) {
        return piece;
      }
    }

    const inside = new Map();
    for (const tab of tabs) {
      for (const word of iconWords(tab.label)) {
        inside.set(word, (inside.get(word) || 0) + 1);
      }
    }
    const outside = new Map();
    for (const tab of gBrowser.tabs) {
      if (tabs.includes(tab)) {
        continue;
      }
      for (const word of new Set(iconWords(tab.label))) {
        outside.set(word, (outside.get(word) || 0) + 1);
      }
    }
    const top = [...inside.entries()]
      .filter(([, count]) => count > 1)
      .map(([word, count]) => [word, count / (1 + (outside.get(word) || 0))])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([word]) => word);
    return top.length ? titleCase(top.join(" ")) : null;
  }

  const EMBED_CACHE = "zia-icon-vectors-tabler.json";
  const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
  let embedEngine = null;
  let iconVectors = null;

  async function textEmbedder() {
    if (embedEngine) {
      return embedEngine;
    }
    const { createEngine } = ChromeUtils.importESModule(
      "chrome://global/content/ml/EngineProcess.sys.mjs"
    );
    embedEngine = await createEngine({
      taskName: "feature-extraction",
      featureId: "simple-text-embedder",
      modelId: EMBED_MODEL,
      dtype: "q8",
    });
    return embedEngine;
  }

  function readVectors(result, count) {
    if (!result) {
      return null;
    }
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return result;
    }
    const flat = result.data || result.output || result;
    if (!flat || typeof flat.length !== "number") {
      return null;
    }
    const dims = Math.floor(flat.length / count);
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(Array.from(flat.slice(i * dims, (i + 1) * dims)));
    }
    return out;
  }

  function normalise(vector) {
    let sum = 0;
    for (const value of vector) {
      sum += value * value;
    }
    const length = Math.sqrt(sum) || 1;
    return vector.map((value) => value / length);
  }

  async function embedTexts(texts) {
    const engine = await textEmbedder();
    const result = await engine.run({
      args: [texts],
      options: { pooling: "mean", normalize: true },
    });
    const vectors = readVectors(result, texts.length);
    return vectors ? vectors.map(normalise) : null;
  }

  function cachePath() {
    return PathUtils.join(PathUtils.profileDir, EMBED_CACHE);
  }

  async function loadIconVectors() {
    if (iconVectors) {
      return iconVectors;
    }
    try {
      const raw = JSON.parse(await IOUtils.readUTF8(cachePath()));
      if (raw.model === EMBED_MODEL && raw.names?.length === suggestableIcons().length && raw.data) {
        const bytes = Uint8Array.from(atob(raw.data), (c) => c.charCodeAt(0));
        iconVectors = { names: raw.names, dims: raw.dims, data: new Int8Array(bytes.buffer) };
        return iconVectors;
      }
    } catch (err) {
      noteError("folder names local model: loadIconVectors", err);
    }
    return null;
  }

  // An icon's name and its first few search tags, which say more about what
  // it means than the name alone
  function iconPhrase(icon) {
    const tags = icon.words.split(" ").filter(Boolean).slice(0, 4);
    return `${icon.name.split("-").join(" ")} icon${tags.length ? `: ${tags.join(", ")}` : ""}`;
  }

  async function buildIconVectors() {
    const icons = suggestableIcons();
    const names = icons.map((icon) => icon.name);
    if (!names.length) {
      return null;
    }
    const all = [];
    let dims = 0;
    for (let i = 0; i < icons.length; i += 64) {
      const batch = icons.slice(i, i + 64);
      const vectors = await embedTexts(batch.map(iconPhrase));
      if (!vectors) {
        return null;
      }
      dims = vectors[0].length;
      for (const vector of vectors) {
        all.push(vector);
      }
    }

    const data = new Int8Array(all.length * dims);
    all.forEach((vector, row) => {
      vector.forEach((value, col) => {
        data[row * dims + col] = Math.max(-127, Math.min(127, Math.round(value * 127)));
      });
    });
    iconVectors = { names, dims, data };
    try {
      await IOUtils.writeUTF8(
        cachePath(),
        JSON.stringify({
          model: EMBED_MODEL,
          dims,
          names,
          data: base64(new Uint8Array(data.buffer)),
        })
      );
    } catch (err) {
      console.warn("[Zia] Couldn't save the icon vectors; they'll be built again next time.", err);
    }
    return iconVectors;
  }

  // In chunks: all the bytes at once are too many arguments for one call
  function base64(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(text);
  }

  function nearestIcon(vector, vectors) {
    const { names, dims, data } = vectors;
    let best = null;
    let bestScore = -1;
    for (let row = 0; row < names.length; row++) {
      let score = 0;
      for (let col = 0; col < dims; col++) {
        score += vector[col] * (data[row * dims + col] / 127);
      }
      if (score > bestScore) {
        bestScore = score;
        best = names[row];
      }
    }
    return { name: best, score: bestScore };
  }

  function folderText(folder) {
    const parts = [];
    const label = (folder.name || folder.label || "").trim();
    if (label && !DEFAULT_FOLDER_NAMES.test(label)) {
      parts.push(label);
    }
    for (const tab of (folder.tabs || []).slice(0, 8)) {
      const title = String(tab.label || "").trim();
      if (title) {
        parts.push(title);
      }
    }
    return parts.join(". ");
  }

  async function suggestIconByMeaning(folder) {
    const text = folderText(folder);
    if (!text) {
      return null;
    }
    const vectors = (await loadIconVectors()) || (await buildIconVectors());
    if (!vectors) {
      return null;
    }
    const embedded = await embedTexts([text]);
    if (!embedded) {
      return null;
    }
    const { name, score } = nearestIcon(embedded[0], vectors);

    return score >= 0.28 ? iconURL(name) : null;
  }

  let nameEngine = null;
  let nameEngineTried = false;

  async function namingEngine() {
    if (nameEngineTried) {
      return nameEngine;
    }
    nameEngineTried = true;
    const { createEngine } = ChromeUtils.importESModule(
      "chrome://global/content/ml/EngineProcess.sys.mjs"
    );
    for (const options of [
      { taskName: "text2text-generation", featureId: "smart-tab-topic" },
      { taskName: "text2text-generation" },
    ]) {
      try {
        nameEngine = await createEngine(options);
        return nameEngine;
      } catch (err) {
        console.warn("[Zia] Naming engine not available:", options, err.message);
      }
    }
    return null;
  }

  function readGeneratedText(result) {
    if (!result) {
      return "";
    }
    if (typeof result === "string") {
      return result;
    }
    if (Array.isArray(result)) {
      return readGeneratedText(result[0]);
    }
    return result.generated_text || result.text || result.output || "";
  }

  function tidyName(raw, tabs) {
    let name = String(raw || "")
      .replace(/["'`]/g, "")
      .replace(/^(a|an|the)\s+/i, "")
      .split(/[\n.:;]/)[0]
      .trim();
    if (!name) {
      return null;
    }
    const words = name.split(/\s+/).slice(0, 3);
    name = words.join(" ");

    const echoed = tabs.some((tab) => String(tab.label || "").toLowerCase().startsWith(name.toLowerCase()));
    if (name.length < 3 || name.length > 28 || echoed) {
      return null;
    }
    return titleCase(name);
  }

  async function suggestNameByModel(folder) {
    const tabs = (folder.tabs || []).slice(0, 8);
    if (tabs.length < 2) {
      return null;
    }
    const engine = await namingEngine();
    if (!engine) {
      return null;
    }
    const titles = tabs.map((tab) => `- ${String(tab.label || "").slice(0, 80)}`).join("\n");
    const prompt = `Give a short two word label for this group of browser tabs:\n${titles}\nLabel:`;
    const result = await engine.run({ args: [prompt], options: { max_new_tokens: 8 } });
    const name = tidyName(readGeneratedText(result), tabs);
    return name;
  }

  function findNameEditor(folder) {
    const roots = [folder.labelElement, folder.labelElement?.shadowRoot, folder, folder.shadowRoot];
    for (const root of roots) {
      const editor = root?.querySelector?.("input, textarea, [contenteditable='true']");
      if (editor) {
        return editor;
      }
    }
    const active = folder.ownerDocument.activeElement;
    return folder.contains(active) || folder.labelElement?.contains?.(active) ? active : null;
  }

  function renameFolder(folder, name) {
    const label = folder.labelElement;

    const editor = findNameEditor(folder);
    if (editor) {
      if ("value" in editor) {
        editor.value = name;
      } else {
        editor.textContent = name;
      }
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      for (const type of ["keydown", "keypress", "keyup"]) {
        editor.dispatchEvent(
          new KeyboardEvent(type, { key: "Enter", keyCode: 13, bubbles: true })
        );
      }
      editor.blur?.();
    }

    if (typeof label?.onRenameFinished === "function") {
      label.onRenameFinished(name);
    } else {
      folder.name = name;
      folder.dispatchEvent(new CustomEvent("ZenFolderRenamed", { bubbles: true }));
    }

    for (const method of ["finishRename", "stopRename", "stopEditing", "blur"]) {
      try {
        label?.[method]?.();
      } catch (err) {
        noteError("folder names local model: renameFolder", err);
      }
    }
    label?.removeAttribute?.("editing");
    folder.removeAttribute("editing");
    folder.ownerDocument.activeElement?.blur?.();
  }

  function showFolderSkeleton(folder) {
    try {
      const container = folder.querySelector(".tab-group-label-container") || folder;
      if (container.querySelector(".zia-skeleton-overlay")) {
        return;
      }
      const doc = folder.ownerDocument;
      const containerRect = container.getBoundingClientRect();
      const iconEl = folder.querySelector(".tab-group-folder-icon");
      const iconRect = iconEl?.getBoundingClientRect();

      const label = folder.labelElement;
      const fontSize = parseFloat(getComputedStyle(label || container).fontSize) || 13;
      const size = Math.max(9, Math.round(fontSize * 0.85));

      const iconCentre = iconRect?.width
        ? iconRect.left - containerRect.left + iconRect.width / 2
        : 16;
      const iconLeft = Math.round(iconCentre - size / 2);

      const labelRect = label?.getBoundingClientRect();
      const textLeft = Math.round(
        labelRect?.width
          ? labelRect.left - containerRect.left
          : (iconRect?.right || 0) - containerRect.left + 8
      );

      const overlay = doc.createElement("div");
      overlay.className = "zia-skeleton-overlay";
      overlay.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:5;`;

      const block = (left, width, height, radius) => {
        const el = doc.createElement("div");
        el.className = "zia-skeleton-block";
        el.style.cssText =
          `position:absolute;left:${left}px;top:50%;transform:translateY(-50%);` +
          `width:${width}px;height:${height}px;border-radius:${radius}px;`;
        return el;
      };

      overlay.appendChild(block(iconLeft, size, size, Math.round(size / 3.5)));
      overlay.appendChild(block(textLeft, 88, size, Math.round(size / 3.5)));

      if (getComputedStyle(container).position === "static") {
        container.style.position = "relative";
      }
      container.setAttribute("zia-skeleton-on", "true");
      container.appendChild(overlay);
    } catch (err) {
      console.warn("[Zia] Couldn't show the folder placeholder:", err);
    }
  }

  function hideFolderSkeleton(folder) {
    const container = folder.querySelector(".tab-group-label-container") || folder;
    container.querySelector(".zia-skeleton-overlay")?.remove();
    container.removeAttribute("zia-skeleton-on");
    container.style.removeProperty("position");
  }
  const isDefaultName = (name) => !name || DEFAULT_FOLDER_NAMES.test(name);

  function currentFolderName(folder) {
    const editor = findNameEditor(folder);
    const name = editor ? ("value" in editor ? editor.value : editor.textContent) : folder.name;
    return (name || "").trim();
  }

  function folderIconURL(folder) {
    if (folder.localName === "zen-folder") {
      return folder.iconURL;
    }
    const icon = folder.querySelector(":scope > .tab-group-label-container .tab-group-icon > :is(.group-icon, label)");
    if (icon) {
      return icon.localName === "label" ? icon.textContent : icon.getAttribute("src");
    }
    return window.advancedTabGroups?.savedIcons?.[folder.id] || "";
  }

  function setFolderIcon(folder, icon) {
    if (folder.localName === "zen-folder") {
      window.gZenFolders?.setFolderUserIcon(folder, icon);
    } else {
      window.advancedTabGroups?.applyGroupIcon(folder, icon);
    }
  }

  // A folder mostly of one site gets that site's own icon when Tabler has
  // it (a folder of YouTube videos gets YouTube's, not one guessed from the
  // videos' titles). The site is its name without subdomains or the ending
  // (music.youtube.com and youtu.be are both YouTube).
  const BRAND_ALIASES = { youtu: "youtube", twitter: "x", fb: "facebook", ycombinator: "ycombinator", googleusercontent: "google" };
  const BRAND_MAJORITY = 0.5;

  function siteBrand(host) {
    const parts = String(host || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    // co.uk, com.au and the like: the name is one further in
    const secondLevel = parts.length > 2 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length === 2;
    const name = parts[parts.length - (secondLevel ? 3 : 2)];
    return BRAND_ALIASES[name] || name;
  }

  function brandIconForFolder(folder) {
    const tabs = folder.tabs || [];
    if (!tabs.length) {
      return null;
    }
    const counts = new Map();
    for (const tab of tabs) {
      let brand = null;
      try {
        brand = siteBrand(tab.linkedBrowser?.currentURI?.host);
      } catch (err) {
        brand = null;
      }
      if (brand) {
        counts.set(brand, (counts.get(brand) || 0) + 1);
      }
    }
    const [brand, count] = [...counts].sort((a, b) => b[1] - a[1])[0] || [];
    if (!brand || count / tabs.length < BRAND_MAJORITY) {
      return null;
    }
    const name = `brand-${brand}`;
    return suggestableIcons().some((icon) => icon.name === name) ? iconURL(name) : null;
  }

  function applySuggestedFolderIcon(folder) {
    if (!featureOn("folder-icon-suggest")) {
      return;
    }
    if (!isFolder(folder) || folderIconURL(folder)) {
      return;
    }

    folder.setAttribute("zia-suggesting", "true");
    showFolderSkeleton(folder);
    setTimeout(async () => {
      try {
        if (!folder.isConnected) {
          return;
        }
        if (!folderIconURL(folder)) {
          let icon = brandIconForFolder(folder);
          if (!icon) {
            try {
              icon = await suggestIconByMeaning(folder);
            } catch (err) {
              console.warn("[Zia] The embedding model wasn't available:", err);
            }
          }
          icon = icon || suggestFolderIcon(folder);
          if (icon && !folderIconURL(folder)) {
            setFolderIcon(folder, icon);
            folder.dispatchEvent(new CustomEvent("TabGroupUpdate", { bubbles: true }));
          }
        }
        if (isDefaultName(currentFolderName(folder))) {
          let name = null;
          try {
            name = await suggestNameByModel(folder);
          } catch (err) {
            console.warn("[Zia] Couldn't name the folder with the model:", err);
          }
          name = name || suggestFolderName(folder);
          if (name && isDefaultName(currentFolderName(folder))) {
            renameFolder(folder, name);
          }
        }
      } catch (err) {
        console.error("[Zia] Could not suggest a folder icon or name:", err);
      } finally {
        folder.removeAttribute("zia-suggesting");
        hideFolderSkeleton(folder);
      }
    }, 600);
  }

  function watchNewFolders() {
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => {
      requestAnimationFrame(() => requestAnimationFrame(() => applySuggestedFolderIcon(event.target)));
    });
  }

