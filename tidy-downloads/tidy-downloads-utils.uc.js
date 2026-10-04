// ==UserScript==
// @include   main
// @loadOrder 99999999999997
// @ignorecache
// ==/UserScript==

// tidy-downloads-utils.uc.js
// Shared utilities for Zen Tidy Downloads - must load before tidy-downloads and zen-stuff
(function () {
  "use strict";

  if (location.href !== "chrome://browser/content/browser.xhtml") return;

  const { classes: Cc, interfaces: Ci } = Components;

  // ============================================================================
  // CONSTANTS
  // ============================================================================
  const AI_PROVIDER_PREF = "extensions.downloads.ai_provider";
  const MISTRAL_API_KEY_PREF = "extensions.downloads.mistral_api_key";
  const MISTRAL_MODEL_PREF = "extensions.downloads.mistral_model";
  const OPENAI_API_KEY_PREF = "extensions.downloads.openai_api_key";
  const OPENAI_MODEL_PREF = "extensions.downloads.openai_model";
  const ANTHROPIC_API_KEY_PREF = "extensions.downloads.anthropic_api_key";
  const ANTHROPIC_MODEL_PREF = "extensions.downloads.anthropic_model";
  const GOOGLE_API_KEY_PREF = "extensions.downloads.google_api_key";
  const GOOGLE_MODEL_PREF = "extensions.downloads.google_model";
  const OLLAMA_BASE_URL_PREF = "extensions.downloads.ollama_base_url";
  const OLLAMA_MODEL_PREF = "extensions.downloads.ollama_model";
  const OPENROUTER_API_KEY_PREF = "extensions.downloads.openrouter_api_key";
  const OPENROUTER_MODEL_PREF = "extensions.downloads.openrouter_model";
  const OPENAI_COMPAT_API_KEY_PREF = "extensions.downloads.openai_compat_api_key";
  const OPENAI_COMPAT_BASE_URL_PREF = "extensions.downloads.openai_compat_base_url";
  const OPENAI_COMPAT_MODEL_PREF = "extensions.downloads.openai_compat_model";
  const DISABLE_AUTOHIDE_PREF = "extensions.downloads.disable_autohide";
  const IMAGE_LOAD_ERROR_ICON = "🚫";
  const TEMP_LOADER_ICON = "⏳";
  const RENAMED_SUCCESS_ICON = "✓";
  const IMAGE_EXTENSIONS = new Set([
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".avif",
    ".ico", ".tif", ".tiff", ".jfif"
  ]);
  /** @type {Set<string>} */
  const TEXT_EXTENSIONS = new Set([
    ".txt", ".md", ".js", ".css", ".html", ".json", ".xml", ".log", ".ini", ".sh", ".py",
    ".java", ".c", ".cpp", ".h", ".ts", ".jsx", ".tsx"
  ]);
  /** @type {Set<string>} */
  const SYSTEM_ICON_EXTENSIONS = new Set([
    ".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv", ".m4v",
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".odt", ".ods", ".odp", ".odg", ".odf",
    ".exe", ".msi", ".bat", ".cmd", ".scr",
    ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".iso"
  ]);
  const PATH_SEPARATOR = navigator.platform.includes("Win") ? "\\" : "/";
  const DEFAULT_TEXT_PREVIEW_MAX_BYTES = 500;
  /** Match chrome.css `.details-tooltip`: transition delay 0.15s + duration 0.3s */
  const MASTER_TOOLTIP_FADEOUT_MS = 450;

  // ============================================================================
  // PREFERENCES
  // ============================================================================
  const _prefBranch = (() => {
    try {
      return Cc["@mozilla.org/preferences-service;1"]
        .getService(Ci.nsIPrefService)
        .getBranch("");
    } catch (_) {
      return null;
    }
  })();

  function getPref(prefName, defaultValue) {
    try {
      const branch = _prefBranch;
      if (!branch) return defaultValue;

      if (typeof defaultValue === "boolean") {
        return branch.getBoolPref(prefName, defaultValue);
      } else if (typeof defaultValue === "string") {
        return branch.getStringPref(prefName, defaultValue);
      } else if (typeof defaultValue === "number") {
        return branch.getIntPref(prefName, defaultValue);
      }
      return defaultValue;
    } catch (e) {
      console.error("Error getting preference:", e);
      return defaultValue;
    }
  }

  // ============================================================================
  // SECURITY UTILITIES
  // ============================================================================
  const SecurityUtils = (function () {
    "use strict";

    const WINDOWS_RESERVED_NAMES = Object.freeze([
      "CON", "PRN", "AUX", "NUL",
      "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
      "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
    ]);
    const WINDOWS_INVALID_CHARS = /[<>:"|?*\x00-\x1F]/;
    const CONTROL_CHARS = /[\x00-\x1F\x7F]/;
    const MAX_PATH_LENGTH = 32767;
    const MAX_FILENAME_LENGTH = 200;
    const isWindowsPlatform = navigator.platform.includes("Win");

    function parsePath(path) {
      const normalized = path.replace(/\\/g, "/");
      const parts = normalized.split("/").filter(Boolean);
      const filename = parts[parts.length - 1] || path;
      const isWindows = isWindowsPlatform || path.includes("\\");
      return { normalized, parts, filename, isWindows };
    }

    function validateFilePath(path, options = {}) {
      const { strict = true } = options;

      if (!path || typeof path !== "string") {
        return { valid: false, error: "Path must be a non-empty string", code: "INVALID_TYPE" };
      }
      if (path.length > MAX_PATH_LENGTH) {
        return { valid: false, error: "Path exceeds maximum length", code: "PATH_TOO_LONG" };
      }
      if (path.includes("\0")) {
        return { valid: false, error: "Path contains null bytes", code: "NULL_BYTES" };
      }

      const { normalized, parts, filename, isWindows } = parsePath(path);

      if (parts.some(part => part === ".." || part.startsWith("../"))) {
        return { valid: false, error: "Path contains directory traversal patterns", code: "TRAVERSAL" };
      }
      if (normalized.startsWith("../") || normalized.endsWith("/..")) {
        return { valid: false, error: "Path contains directory traversal patterns", code: "TRAVERSAL" };
      }
      if (path.includes("//") && !path.match(/^\\\\/)) {
        return { valid: false, error: "Path contains invalid path separators", code: "INVALID_SEPARATORS" };
      }
      if (CONTROL_CHARS.test(path.replace(/[\n\t]/g, ""))) {
        return { valid: false, error: "Path contains control characters", code: "CONTROL_CHARS" };
      }

      if (isWindows) {
        for (const part of parts) {
          const nameBase = part.toUpperCase().split(".")[0];
          if (WINDOWS_RESERVED_NAMES.includes(nameBase)) {
            return { valid: false, error: `Path contains Windows reserved name: ${nameBase}`, code: "RESERVED_NAME" };
          }
        }
        if (WINDOWS_INVALID_CHARS.test(filename)) {
          return { valid: false, error: "Filename contains invalid characters for Windows", code: "INVALID_CHARS" };
        }
      }

      return { valid: true, error: null, code: "VALID" };
    }

    function normalizeUnicode(str) {
      try {
        if (typeof str.normalize === "function") return str.normalize("NFC");
        return str;
      } catch (e) {
        return str;
      }
    }

    function sanitizeFilename(filename) {
      if (!filename || typeof filename !== "string") {
        throw new Error("Filename must be a non-empty string");
      }

      let sanitized = normalizeUnicode(filename);
      sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");

      if (isWindowsPlatform) {
        sanitized = sanitized.replace(/[<>:"|?*]/g, "");
      }

      sanitized = sanitized.trim().replace(/^\.+|\.+$/g, "");
      sanitized = sanitized.replace(/\.{2,}/g, ".");

      if (isWindowsPlatform && sanitized) {
        const nameBase = sanitized.split(".")[0].toUpperCase();
        if (WINDOWS_RESERVED_NAMES.includes(nameBase)) {
          sanitized = `FILE_${sanitized}`;
        }
      }

      sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, "");
      sanitized = sanitized.replace(/[\u200E-\u200F\u202A-\u202E]/g, "");

      if (!sanitized || sanitized.trim().length === 0) {
        throw new Error("Filename is empty after sanitization");
      }

      if (sanitized.length > MAX_FILENAME_LENGTH) {
        const lastDot = sanitized.lastIndexOf(".");
        if (lastDot > 0) {
          const ext = sanitized.substring(lastDot);
          const name = sanitized.substring(0, lastDot);
          sanitized = name.substring(0, MAX_FILENAME_LENGTH - ext.length) + ext;
        } else {
          sanitized = sanitized.substring(0, MAX_FILENAME_LENGTH);
        }
      }

      return sanitized;
    }

    return {
      validateFilePath,
      sanitizeFilename,
      WINDOWS_RESERVED_NAMES,
      MAX_PATH_LENGTH,
      MAX_FILENAME_LENGTH
    };
  })();

  /**
   * Validate file path - throws on invalid, returns path on valid (for zen-stuff compatibility)
   */
  function validateFilePathOrThrow(path) {
    const result = SecurityUtils.validateFilePath(path);
    if (!result.valid) {
      throw new Error(result.error);
    }
    return path;
  }

  // ============================================================================
  // RATE LIMITER
  // ============================================================================
  const RateLimiter = (function () {
    "use strict";
    const MAX_REQUESTS_PER_MINUTE = 10;
    const MAX_REQUESTS_PER_HOUR = 100;
    const REQUEST_HISTORY = [];

    function canMakeRequest() {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      const oneHourAgo = now - 3600000;

      while (REQUEST_HISTORY.length > 0 && REQUEST_HISTORY[0] < oneHourAgo) {
        REQUEST_HISTORY.shift();
      }

      let minuteCount = 0;
      let oldestInMinute = Infinity;
      for (let i = REQUEST_HISTORY.length - 1; i >= 0; i--) {
        if (REQUEST_HISTORY[i] > oneMinuteAgo) {
          minuteCount++;
          if (REQUEST_HISTORY[i] < oldestInMinute) oldestInMinute = REQUEST_HISTORY[i];
        } else {
          break;
        }
      }

      if (minuteCount >= MAX_REQUESTS_PER_MINUTE) {
        const waitTime = Math.ceil((oldestInMinute + 60000 - now) / 1000);
        return {
          allowed: false,
          waitTime,
          reason: `Rate limit exceeded: ${minuteCount} requests in the last minute (max: ${MAX_REQUESTS_PER_MINUTE})`
        };
      }
      if (REQUEST_HISTORY.length >= MAX_REQUESTS_PER_HOUR) {
        const oldestRequest = REQUEST_HISTORY[0];
        const waitTime = Math.ceil((oldestRequest + 3600000 - now) / 1000);
        return {
          allowed: false,
          waitTime,
          reason: `Rate limit exceeded: ${REQUEST_HISTORY.length} requests in the last hour (max: ${MAX_REQUESTS_PER_HOUR})`
        };
      }
      return { allowed: true };
    }

    function recordRequest() {
      REQUEST_HISTORY.push(Date.now());
    }

    function getStats() {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      const oneHourAgo = now - 3600000;
      return {
        lastMinute: REQUEST_HISTORY.filter(time => time > oneMinuteAgo).length,
        lastHour: REQUEST_HISTORY.filter(time => time > oneHourAgo).length,
        total: REQUEST_HISTORY.length,
        limits: { perMinute: MAX_REQUESTS_PER_MINUTE, perHour: MAX_REQUESTS_PER_HOUR }
      };
    }

    return { canMakeRequest, recordRequest, getStats };
  })();

  // ============================================================================
  // LOGGING
  // ============================================================================
  const SENSITIVE_KEY_PATTERN = /(api|key|authorization|token|secret|password|credential|user[_-]?id)/i;

  const _debugFlags = { enabled: false, aiOnly: true };
  try {
    _debugFlags.enabled = getPref("extensions.downloads.enable_debug", false);
    _debugFlags.aiOnly = getPref("extensions.downloads.debug_ai_only", true);
    if (typeof Services !== "undefined" && Services.prefs) {
      const _debugFlagObserver = {
        observe(_subject, topic, data) {
          if (topic !== "nsPref:changed") return;
          if (data === "extensions.downloads.enable_debug") {
            _debugFlags.enabled = getPref("extensions.downloads.enable_debug", false);
          } else if (data === "extensions.downloads.debug_ai_only") {
            _debugFlags.aiOnly = getPref("extensions.downloads.debug_ai_only", true);
          }
        }
      };
      Services.prefs.addObserver("extensions.downloads.enable_debug", _debugFlagObserver, false);
      Services.prefs.addObserver("extensions.downloads.debug_ai_only", _debugFlagObserver, false);
    }
  } catch (_) {}

  function redactSensitiveData(data) {
    if (typeof data === "string") {
      return data
        .replace(/Bearer\s+[A-Za-z0-9_-]+/gi, "Bearer [REDACTED]")
        .replace(/Authorization:\s*Bearer\s+[A-Za-z0-9_-]+/gi, "Authorization: Bearer [REDACTED]")
        .replace(/(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|user[_-]?id)\s*[:=]\s*[A-Za-z0-9_-]+/gi, "$1=[REDACTED]")
        .replace(/"user[_-]?id"\s*:\s*"[^"]+"/gi, '"user_id":"[REDACTED]"');
    }
    if (typeof data !== "object" || data === null) return data;
    if (Array.isArray(data)) return data.map(item => redactSensitiveData(item));

    const redacted = {};
    for (const key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
      const value = data[key];
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        redacted[key] = "[REDACTED]";
      } else if (typeof value === "string") {
        redacted[key] = redactSensitiveData(value);
      } else if (typeof value === "object" && value !== null) {
        redacted[key] = redactSensitiveData(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  function debugLog(message, data = null, category = "general") {
    if (!_debugFlags.enabled) return;
    if (_debugFlags.aiOnly && category !== "aiRename" && category !== "general") return;

    try {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] Download Preview [${category.toUpperCase()}]:`;
      const safeData = data ? redactSensitiveData(data) : null;
      const safeMessage = typeof message === "string" ? redactSensitiveData(message) : message;

      if (safeData) {
        console.log(`${prefix} ${safeMessage}`, safeData);
      } else {
        console.log(`${prefix} ${safeMessage}`);
      }
    } catch (e) {
      const safeData = data ? redactSensitiveData(data) : null;
      const safeMessage = typeof message === "string" ? redactSensitiveData(message) : message;
      console.log(`[Download Preview] ${safeMessage}`, safeData || "");
    }
  }

  // ============================================================================
  // POD VALIDATION (shared by zen-stuff)
  // ============================================================================
  function validatePodData(podData) {
    if (!podData || typeof podData !== "object") {
      throw new Error("Invalid pod data: must be an object");
    }
    if (!podData.key || typeof podData.key !== "string") {
      throw new Error("Invalid pod data: missing or invalid key");
    }
    if (!podData.filename || typeof podData.filename !== "string") {
      throw new Error("Invalid pod data: missing or invalid filename");
    }
    return podData;
  }

  // ============================================================================
  // FORMAT UTILITIES
  // ============================================================================
  function formatBytes(b, d = 2) {
    if (b === 0) return "0 B";
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${parseFloat((b / Math.pow(1024, i)).toFixed(d))} ${sizes[i]}`;
  }

  /**
   * OS file icon as a moz-icon URL. Built from a file: URI so the drive colon,
   * backslashes, and %, #, ? in a filename cannot swallow ?size=.
   * @param {string} path
   * @param {number} [size=32]
   * @returns {string}
   */
  function fileIconUrl(path, size = 32) {
    if (!path) return "";
    try {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(path);
      return `moz-icon://${Services.io.newFileURI(file).spec}?size=${size}`;
    } catch (_e) {
      return "";
    }
  }

  /**
   * Firefox file-type icon from an extension only (no path). Survives rename
   * because it does not point at a specific filename.
   * @param {string} filenameOrExt
   * @param {number} [size=32]
   * @returns {string}
   */
  function fileIconUrlByExtension(filenameOrExt, size = 32) {
    let ext = filenameOrExt || ".txt";
    if (!ext.startsWith(".")) {
      ext = ext.includes(".") ? ext.slice(ext.lastIndexOf(".")) : `.${ext}`;
    }
    if (!ext || ext === ".") ext = ".txt";
    return `moz-icon://${ext}?size=${size}`;
  }

  /**
   * True when src is a real file thumbnail, not a moz-icon snapshot.
   * Dismiss used to store moz-icon://… as type "image"; after a rename that
   * URL still points at the old path and dies on restart.
   * @param {string} [src]
   * @returns {boolean}
   */
  function isFileThumbnailSrc(src) {
    return (
      typeof src === "string" &&
      (src.startsWith("file:") || src.startsWith("data:")) &&
      !src.startsWith("moz-icon:")
    );
  }

  /**
   * @param {HTMLImageElement|null|undefined} img
   * @returns {{ type: string, src?: string }}
   */
  function capturePilePreviewData(img) {
    const src = img?.src;
    if (isFileThumbnailSrc(src)) return { type: "image", src };
    return { type: "icon" };
  }

  /**
   * Drop a persisted moz-icon snapshot so the pile rebuilds from targetPath.
   * @param {Object} [podData]
   */
  function forgetStaleIconPreview(podData) {
    const src = podData?.previewData?.src;
    if (src && String(src).startsWith("moz-icon:")) {
      podData.previewData = { type: "icon" };
    }
  }

  /**
   * @param {string} [filename]
   * @param {Set<string>} extSet - extensions with leading dot (e.g. ".png")
   * @returns {boolean}
   */
  function filenameEndsWithExtensionFromSet(filename, extSet) {
    if (!filename || !extSet || extSet.size === 0) return false;
    const lower = filename.toLowerCase();
    for (const ext of extSet) {
      if (lower.endsWith(ext)) return true;
    }
    return false;
  }

  /**
   * Read the start of a UTF-8 text file (IOUtils when available).
   * @param {string} path
   * @param {number} [maxBytes=500]
   * @returns {Promise<string|null>}
   */
  async function readTextFilePreview(path, maxBytes = DEFAULT_TEXT_PREVIEW_MAX_BYTES) {
    try {
      if (typeof path !== "string" || !path) return null;
      if (typeof IOUtils !== "undefined") {
        return await IOUtils.readUTF8(path, { maxBytes });
      }
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(path);
      if (!file.exists()) return null;
      const fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
      const cstream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
      fstream.init(file, -1, 0, 0);
      cstream.init(fstream, "UTF-8", 0, 0);
      const str = {};
      cstream.readString(maxBytes, str);
      cstream.close();
      fstream.close();
      return str.value;
    } catch (e) {
      return null;
    }
  }

  // ============================================================================
  // DOM UTILITIES
  // ============================================================================
  function waitForElement(elementId, timeout = 5000) {
    return new Promise(resolve => {
      const existing = document.getElementById(elementId);
      if (existing) {
        resolve(existing);
        return;
      }

      let resolved = false;
      const finish = (el) => {
        if (resolved) return;
        resolved = true;
        observer.disconnect();
        clearTimeout(timeoutId);
        resolve(el);
      };

      const observer = new MutationObserver(() => {
        const el = document.getElementById(elementId);
        if (el) finish(el);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });

      const timeoutId = setTimeout(() => {
        const el = document.getElementById(elementId);
        finish(el || null);
      }, timeout);
    });
  }

  function isUsableButton(element) {
    return !!(element && element.isConnected && element.getBoundingClientRect);
  }

  function getCurrentZenDownloadButton() {
    const libraryButton = document.getElementById("zen-library-button");
    if (isUsableButton(libraryButton)) {
      return { button: libraryButton, kind: "zen-library" };
    }

    const selectors = [
      "#downloads-button",
      "#downloads-indicator",
      '[data-l10n-id="downloads-button"]',
      '.toolbarbutton-1[command="Tools:Downloads"]'
    ];
    for (const selector of selectors) {
      try {
        const btn = document.querySelector(selector);
        if (isUsableButton(btn)) {
          return { button: btn, kind: "selector", detail: selector };
        }
      } catch (error) {
        console.warn(`[findZenDownloadButton] Selector error (${selector}):`, error);
      }
    }

    try {
      const fallbackElements = document.querySelectorAll('[id*="download"], [class*="download"]');
      for (const element of fallbackElements) {
        if (
          isUsableButton(element) &&
          (
            element.getAttribute("command")?.includes("Downloads") ||
            element.textContent?.toLowerCase().includes("download")
          )
        ) {
          return { button: element, kind: "fallback" };
        }
      }
    } catch (error) {
      console.warn("[findZenDownloadButton] Fallback scan error:", error);
    }

    return null;
  }

  /**
   * Locate the Zen / Firefox downloads toolbar control.
   * Prefer either Zen Library button shape, then fall back to Firefox's Downloads button.
   * @returns {Promise<{ button: Element, kind: 'zen-library'|'selector'|'fallback', detail?: string }|null>}
   */
  async function findZenDownloadButton(timeout = 5000) {
    try {
      const existing = getCurrentZenDownloadButton();
      if (existing?.kind === "zen-library") return existing;

      await waitForElement("zen-library-button", timeout);
      return getCurrentZenDownloadButton() || existing;
    } catch (error) {
      console.error("[findZenDownloadButton]", error);
      return null;
    }
  }

  function watchZenDownloadButton(callback, { debounceMs = 75 } = {}) {
    let lastButton = null;
    let timer = null;

    const notifyIfChanged = () => {
      timer = null;
      const found = getCurrentZenDownloadButton();
      const button = found?.button || null;
      if (button === lastButton) return;
      lastButton = button;
      callback(found);
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(notifyIfChanged, debounceMs);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id", "class", "style", "hidden", "collapsed"]
    });

    schedule();

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }

  /**
   * Normalise a path for case-insensitive comparison keys (forward slashes, lowercase).
   * @param {string} [p]
   * @returns {string}
   */
  function normalizePathKey(p) {
    return typeof p === "string" ? p.replace(/\\/g, "/").toLowerCase() : "";
  }

  /**
   * Invoke every listener in a Set/iterable; swallow errors so one bad callback cannot break others.
   * @param {Iterable<Function>|null|undefined} listeners
   * @param {*} payload
   * @param {string} [messageSuffix] — appended after `[ProgressPile] listener error`
   */
  function notifyListeners(listeners, payload, messageSuffix = "") {
    if (!listeners) return;
    for (const callback of listeners) {
      try {
        callback(payload);
      } catch (err) {
        debugLog(`[ProgressPile] listener error${messageSuffix}`, err);
      }
    }
  }

  /**
   * Clear lifecycle timer ids from a card-like object.
   * @param {any} cardData
   * @param {{ autohide?: boolean, deferredSticky?: boolean }} [opts]
   */
  function clearCardTimers(cardData, opts = {}) {
    if (!cardData) return;
    const { autohide = true, deferredSticky = true } = opts;
    if (deferredSticky && cardData.deferredStickyTimeoutId) {
      clearTimeout(cardData.deferredStickyTimeoutId);
      cardData.deferredStickyTimeoutId = null;
    }
    if (autohide && cardData.autohideTimeoutId) {
      clearTimeout(cardData.autohideTimeoutId);
      cardData.autohideTimeoutId = null;
    }
  }

  /**
   * Shared master tooltip fade sequence with jukebox-successor guard.
   * @param {{
   *   store: any,
   *   masterTooltipDOMElement?: HTMLElement|null,
   *   downloadCardsContainer?: HTMLElement|null,
   *   beginFade?: (container: HTMLElement|null|undefined) => void,
   *   collapseContainer?: (container: HTMLElement|null|undefined) => void,
   *   onAfterFade?: () => void
   * }} params
   */
  function runMasterTooltipFade(params) {
    const {
      store,
      masterTooltipDOMElement,
      downloadCardsContainer,
      beginFade,
      collapseContainer,
      onAfterFade
    } = params || {};
    if (!store) return;
    if (typeof beginFade === "function") beginFade(downloadCardsContainer);
    else store.masterTooltipFadeoutActive = true;
    if (masterTooltipDOMElement) {
      masterTooltipDOMElement.style.opacity = "0";
      masterTooltipDOMElement.style.transform = "scaleY(0.8) translateY(10px)";
      masterTooltipDOMElement.style.pointerEvents = "none";
    }
    setTimeout(() => {
      if (store.masterRenameTooltipSuppressed === false) {
        store.masterTooltipFadeoutActive = false;
        return;
      }
      if (masterTooltipDOMElement && masterTooltipDOMElement.style.opacity === "0") {
        masterTooltipDOMElement.style.display = "none";
      }
      if (typeof collapseContainer === "function") collapseContainer(downloadCardsContainer);
      if (typeof onAfterFade === "function") onAfterFade();
    }, MASTER_TOOLTIP_FADEOUT_MS);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  window.zenTidyDownloadsUtils = {
    // Constants
    AI_PROVIDER_PREF,
    MISTRAL_API_KEY_PREF,
    MISTRAL_MODEL_PREF,
    OPENAI_API_KEY_PREF,
    OPENAI_MODEL_PREF,
    ANTHROPIC_API_KEY_PREF,
    ANTHROPIC_MODEL_PREF,
    GOOGLE_API_KEY_PREF,
    GOOGLE_MODEL_PREF,
    OLLAMA_BASE_URL_PREF,
    OLLAMA_MODEL_PREF,
    OPENROUTER_API_KEY_PREF,
    OPENROUTER_MODEL_PREF,
    OPENAI_COMPAT_API_KEY_PREF,
    OPENAI_COMPAT_BASE_URL_PREF,
    OPENAI_COMPAT_MODEL_PREF,
    DISABLE_AUTOHIDE_PREF,
    IMAGE_LOAD_ERROR_ICON,
    TEMP_LOADER_ICON,
    RENAMED_SUCCESS_ICON,
    IMAGE_EXTENSIONS,
    TEXT_EXTENSIONS,
    SYSTEM_ICON_EXTENSIONS,
    PATH_SEPARATOR,
    DEFAULT_TEXT_PREVIEW_MAX_BYTES,
    MASTER_TOOLTIP_FADEOUT_MS,

    // Preferences
    getPref,

    // Security
    SecurityUtils,
    validateFilePathOrThrow,
    sanitizeFilename: SecurityUtils.sanitizeFilename,

    // Rate limiting
    RateLimiter,

    // Logging
    debugLog,
    redactSensitiveData,

    // Validation
    validatePodData,

    // Format
    formatBytes,

    // File / extension helpers (shared with preview + zen-stuff pile)
    readTextFilePreview,
    filenameEndsWithExtensionFromSet,
    fileIconUrl,
    fileIconUrlByExtension,
    isFileThumbnailSrc,
    capturePilePreviewData,
    forgetStaleIconPreview,

    normalizePathKey,
    notifyListeners,

    // DOM
    waitForElement,
    findZenDownloadButton,
    getCurrentZenDownloadButton,
    watchZenDownloadButton,
    clearCardTimers,
    runMasterTooltipFade
  };

  console.log("[Zen Tidy Downloads] Utils loaded");
})();
