// ==UserScript==
// @include   main
// @loadOrder    99999999999999
// @ignorecache
// ==/UserScript==

// tidy-downloads-ai-rename.uc.js
// AI-powered download renaming module (chat completions API, queue, process)
(function () {
  "use strict";

  if (location.href !== "chrome://browser/content/browser.xhtml") return;

  /**
   * Initialize the AI rename module. Called by tidy-downloads.uc.js after main script setup.
   * @param {Object} ctx
   * @param {Object} ctx.store - zenTidyDownloadsStore.createStore() (uses activeDownloadCards, focusedKeyRef, renamedFiles)
   * @param {Object} ctx.deps - callbacks and utils from main (tidyDeps + rename + AI-specific fields)
   * @returns {{ addToAIRenameQueue, removeFromAIRenameQueue, cancelAIProcessForDownload, isInQueue, getQueuePosition, updateQueueStatusInUI, migrateAIRenameKeys }}
   */
  window.zenTidyDownloadsAIRename = {
    init(ctx) {
      const { store, deps } = ctx;
      const {
        renameDownloadFileAndUpdateRecord,
        scheduleCardRemoval,
        performAutohideSequence,
        getMasterTooltip,
        updateUIForFocusedDownload,
        debugLog,
        getPref,
        SecurityUtils,
        RateLimiter,
        redactSensitiveData,
        sanitizeFilename,
        formatBytes,
        getContentTypeFromFilename,
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
        IMAGE_EXTENSIONS,
        PATH_SEPARATOR,
        previewApi,
        showRenameToast,
        showSimpleToast,
        getDownloadKey,
        managePodVisibilityAndAnimations,
        flushDeferredStickyIfPileCollapsed,
        finishDeferredStickyAfterAISuccess,
        scheduleDeferredStickyAbsorbIfNeeded,
        Cc,
        Ci
      } = deps;

      const { activeDownloadCards, focusedKeyRef, renamedFiles } = store;

      /** Clears this download key from `pileHoverExpandBlockedUntilAIDoneKeys` (AI lifecycle / tooltip coordination). */
      function releasePileHoverExpandBlockForKey(k) {
        try {
          store.pileHoverExpandBlockedUntilAIDoneKeys?.delete(k);
        } catch (_e) {}
      }

      /**
       * Toolbar pods stay hidden while `suppressToolbarPodForAIRename` is set (enqueue → terminal outcome).
       * Clearing suppression resets opacity and layout “intended” state so the next jukebox pass runs the same
       * single-rAF branch + CSS transition as non-AI pods (see managePodVisibilityAndAnimations).
       * @param {string} preKey
       * @param {Object|null|undefined} download
       */
      function revealToolbarPodAfterAIRename(preKey, download) {
        const keysToTry = [];
        if (download?.target?.path) keysToTry.push(download.target.path);
        if (preKey) keysToTry.push(preKey);
        for (const k of keysToTry) {
          const cd = activeDownloadCards.get(k);
          if (cd) {
            cd.suppressToolbarPodForAIRename = false;
            break;
          }
        }
        // The suppress block keeps the pod at CSS opacity:0/scale(0.3) (no inline overrides),
        // so the "from" state has been painted every previous frame. A synchronous layout call
        // queues one rAF to set the final values — the CSS transition fires naturally.
        try {
          managePodVisibilityAndAnimations?.();
        } catch (_e) {}
        try {
          flushDeferredStickyIfPileCollapsed?.();
        } catch (_e2) {}
      }

      const normalizePathForAiDedupe = window.zenTidyDownloadsUtils.normalizePathKey;

      // AI Process Management
      const activeAIProcesses = new Map();
      const aiRenameQueue = [];
      let isProcessingAIQueue = false;
      let currentlyProcessingKey = null;

      /**
       * Map old Zen Mod dropdown values (`medium` / `large`, no punctuation per theme prefs rules)
       * or pass through full model ids saved in `about:config`.
       * @returns {string} Value for the Chat Completions `model` field
       */
      function resolveMistralChatModelId() {
        const raw = String(getPref(MISTRAL_MODEL_PREF, "medium")).trim();
        if (raw === "medium") return "mistral-medium-latest";
        if (raw === "large") return "mistral-large-latest";
        return raw || "mistral-small-latest";
      }

      function resolvePrefModel(prefName, fallback) {
        return String(getPref(prefName, fallback)).trim() || fallback;
      }

      function normalizeOpenAICompatBaseUrl(rawUrl) {
        const fallback = "https://openrouter.ai/api/v1/chat/completions";
        const raw = String(rawUrl || fallback).trim();
        if (!raw) return fallback;
        return raw.replace(/\/+$/, "").replace(/\/chat\/completions$/, "") + "/chat/completions";
      }

      function normalizeOllamaBaseHost(rawUrl) {
        const fallback = "http://localhost:11434";
        const raw = String(rawUrl || fallback).trim() || fallback;
        return raw
          .replace(/\/+$/, "")
          .replace(/\/v1\/chat\/completions$/i, "")
          .replace(/\/api\/chat$/i, "")
          .replace(/\/v1$/i, "")
          .replace(/\/api$/i, "");
      }

      function getAIProviderConfig() {
        const provider = String(getPref(AI_PROVIDER_PREF, "mistral")).trim() || "mistral";
        if (provider === "openai") {
          return {
            id: "openai",
            kind: "openai",
            label: "OpenAI",
            apiKey: getPref(OPENAI_API_KEY_PREF, ""),
            url: "https://api.openai.com/v1/chat/completions",
            model: resolvePrefModel(OPENAI_MODEL_PREF, "gpt-4.1-mini")
          };
        }
        if (provider === "anthropic") {
          return {
            id: "anthropic",
            kind: "anthropic",
            label: "Anthropic",
            apiKey: getPref(ANTHROPIC_API_KEY_PREF, ""),
            url: "https://api.anthropic.com/v1/messages",
            model: resolvePrefModel(ANTHROPIC_MODEL_PREF, "claude-sonnet-4-0")
          };
        }
        if (provider === "google") {
          const apiKey = String(getPref(GOOGLE_API_KEY_PREF, "") || "").trim();
          const chatUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
          return {
            id: "google",
            kind: "openai",
            label: "Google Gemini",
            apiKey,
            url: apiKey ? `${chatUrl}?key=${encodeURIComponent(apiKey)}` : chatUrl,
            model: resolvePrefModel(GOOGLE_MODEL_PREF, "gemini-2.5-flash")
          };
        }
        if (provider === "ollama") {
          const host = normalizeOllamaBaseHost(getPref(OLLAMA_BASE_URL_PREF, "http://localhost:11434"));
          return {
            id: "ollama",
            kind: "ollama",
            label: "Ollama",
            apiKey: "",
            url: `${host}/v1/chat/completions`,
            model: resolvePrefModel(OLLAMA_MODEL_PREF, "llama3.2")
          };
        }
        if (provider === "openrouter") {
          return {
            id: "openrouter",
            kind: "openai",
            label: "OpenRouter",
            apiKey: getPref(OPENROUTER_API_KEY_PREF, ""),
            url: "https://openrouter.ai/api/v1/chat/completions",
            model: resolvePrefModel(OPENROUTER_MODEL_PREF, "openai/gpt-4.1-mini")
          };
        }
        if (provider === "openai_compat") {
          return {
            id: "openai_compat",
            kind: "openai",
            label: "OpenAI-compatible endpoint",
            apiKey: getPref(OPENAI_COMPAT_API_KEY_PREF, ""),
            url: normalizeOpenAICompatBaseUrl(getPref(OPENAI_COMPAT_BASE_URL_PREF, "https://openrouter.ai/api/v1")),
            model: resolvePrefModel(OPENAI_COMPAT_MODEL_PREF, "openai/gpt-4.1-mini")
          };
        }
        return {
          id: "mistral",
          kind: "openai",
          label: "Mistral AI",
          apiKey: getPref(MISTRAL_API_KEY_PREF, ""),
          url: "https://api.mistral.ai/v1/chat/completions",
          model: resolveMistralChatModelId()
        };
      }

      function getProviderErrorMessage(status, bodyText) {
        let parsed = null;
        try {
          parsed = JSON.parse(bodyText);
        } catch (_e) {}

        const metadata = parsed?.error?.metadata || {};
        const rawMessage = String(metadata.raw || parsed?.error?.message || "").trim();
        const providerName = String(metadata.provider_name || "").trim();
        const remedyHint = String(metadata.remedy_hint || "").trim();

        if (status === 429) {
          if (providerName) {
            return `${providerName} is rate limited right now. Try another model or add a provider key in OpenRouter.`;
          }
          return "The selected AI route is rate limited right now. Try another model or retry shortly.";
        }

        if (rawMessage) {
          return rawMessage.length > 220 ? `${rawMessage.slice(0, 217)}...` : rawMessage;
        }
        if (remedyHint) {
          return remedyHint.length > 220 ? `${remedyHint.slice(0, 217)}...` : remedyHint;
        }
        return `AI request failed with HTTP ${status}.`;
      }

      /**
       * Call configured chat completions API with rate limiting and security measures
       * @param {Object} params - API call parameters
       * @param {string} params.systemPrompt - System prompt for the AI
       * @param {string} params.userPrompt - User prompt for the AI
       * @param {AbortSignal} params.abortSignal - Signal to abort the request
       * @returns {Promise<string|null>} AI-generated filename or null
       */
      async function callConfiguredAI({ systemPrompt, userPrompt, abortSignal }) {
        if (abortSignal?.aborted) return null;

        const rateLimitCheck = RateLimiter.canMakeRequest();
        if (!rateLimitCheck.allowed) {
          debugLog(`AI rate limit exceeded: ${rateLimitCheck.reason}`, {
            waitTime: rateLimitCheck.waitTime,
            stats: RateLimiter.getStats()
          });
          console.warn(`API rate limit exceeded. Please wait ${rateLimitCheck.waitTime} seconds.`);
          return null;
        }

        const provider = getAIProviderConfig();
        const apiKey = String(provider.apiKey || "").trim();
        if (provider.kind !== "ollama") {
          if (!apiKey) {
            console.warn(`${provider.label} API key not found in preferences`);
            return null;
          }
          if (apiKey.length < 10) {
            console.warn(`${provider.label} API key appears to be invalid (too short)`);
            return null;
          }
        }

        try {
          RateLimiter.recordRequest();
          debugLog(`Sending request to ${provider.label}`, {
            endpoint: provider.url,
            model: provider.model,
            rateLimitStats: RateLimiter.getStats()
          });

          const headers = { "Content-Type": "application/json" };
          let body;
          if (provider.kind === "anthropic") {
            headers["x-api-key"] = apiKey;
            headers["anthropic-version"] = "2023-06-01";
            body = {
              model: provider.model,
              max_tokens: 50,
              temperature: 0.1,
              system: systemPrompt,
              messages: [{ role: "user", content: userPrompt }]
            };
          } else {
            if (apiKey) {
              headers.Authorization = `Bearer ${apiKey}`;
            }
            if (provider.id === "openrouter") {
              headers["HTTP-Referer"] = "https://github.com/Vertex-Mods/Zen-Tidy-Downloads";
              headers["X-Title"] = "Tidy Downloads";
            }
            body = {
              model: provider.model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
              ],
              temperature: 0.1,
              max_tokens: 50
            };
          }

          const response = await fetch(provider.url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: abortSignal
          });

          if (!response.ok) {
            const errorText = await response.text();
            const safeErrorText = redactSensitiveData(errorText);
            const displayMessage = getProviderErrorMessage(response.status, errorText);
            if (response.status === 429) {
              showSimpleToast(displayMessage);
            }
            debugLog("AI provider error details:", safeErrorText);
            throw new Error(`HTTP ${response.status}: ${displayMessage}`);
          }

          const data = await response.json();
          let name =
            provider.kind === "anthropic"
              ? data.content?.[0]?.text?.trim()
              : data.choices?.[0]?.message?.content?.trim();

          if (name) {
            name = name.replace(/^["']|["']$/g, '');
            const chattyPrefixes = [
              "based on", "here is", "i have", "the filename", "new filename", "renamed file", "unknown", "file name"
            ];
            const lowerName = name.toLowerCase();
            if (chattyPrefixes.some(prefix => lowerName.startsWith(prefix))) {
              debugLog("AI returned conversational text or unknown, rejecting:", name);
              return null;
            }
          }

          debugLog("AI response:", name);
          return name || null;
        } catch (error) {
          const safeError = error.message ? redactSensitiveData(error.message) : 'Unknown error';
          console.error("AI rename error:", safeError);
          return null;
        }
      }

      function addToAIRenameQueue(downloadKey, download, originalFilename) {
        debugLog(`[AI Queue] addToAIRenameQueue called for ${downloadKey}`, {
          downloadKey,
          hasDownload: !!download,
          downloadPath: download?.target?.path,
          originalFilename,
          queueLength: aiRenameQueue.length,
          isProcessing: isProcessingAIQueue,
          currentlyProcessing: currentlyProcessingKey
        });

        if (!download || !download.target?.path) {
          debugLog(`[AI Queue] Download ${downloadKey} missing download object or path, skipping`);
          return false;
        }

        const targetPath = download.target.path;

        if (renamedFiles.has(targetPath)) {
          debugLog(`[AI Queue] Download ${downloadKey} already renamed (path: ${targetPath}), skipping`);
          return false;
        }

        const pathNorm = normalizePathForAiDedupe(targetPath);
        if (pathNorm) {
          if (aiRenameQueue.some(item => normalizePathForAiDedupe(item.download?.target?.path) === pathNorm)) {
            debugLog(`[AI Queue] Same file path already queued under another key, skipping`, {
              downloadKey,
              pathNorm
            });
            return false;
          }
          if (currentlyProcessingKey) {
            const curDl = activeDownloadCards.get(currentlyProcessingKey)?.download;
            if (normalizePathForAiDedupe(curDl?.target?.path) === pathNorm) {
              debugLog(`[AI Queue] Same file path currently being processed, skipping`, {
                downloadKey,
                pathNorm
              });
              return false;
            }
          }
          for (const procKey of activeAIProcesses.keys()) {
            const dl = activeDownloadCards.get(procKey)?.download;
            if (normalizePathForAiDedupe(dl?.target?.path) === pathNorm) {
              debugLog(`[AI Queue] Same file path already in active AI process, skipping`, {
                downloadKey,
                pathNorm,
                procKey
              });
              return false;
            }
          }
        }

        if (aiRenameQueue.some(item => item.downloadKey === downloadKey)) {
          debugLog(`[AI Queue] Download ${downloadKey} already in queue, skipping`);
          return false;
        }

        if (currentlyProcessingKey === downloadKey) {
          debugLog(`[AI Queue] Download ${downloadKey} is currently being processed, skipping`);
          return false;
        }

        const queueItem = { downloadKey, download, originalFilename, queuedAt: Date.now() };
        aiRenameQueue.push(queueItem);
        debugLog(`[AI Queue] ✅ Successfully added ${downloadKey} to queue. Queue length: ${aiRenameQueue.length}`, {
          position: aiRenameQueue.length,
          originalFilename,
          path: download.target.path
        });

        updateQueueStatusInUI(downloadKey);

        if (!isProcessingAIQueue) {
          debugLog(`[AI Queue] Starting queue processor (was not running)`);
          processAIRenameQueue();
        } else {
          debugLog(`[AI Queue] Queue processor already running, will process this item when ready`);
        }

        return true;
      }

      function removeFromAIRenameQueue(downloadKey) {
        const index = aiRenameQueue.findIndex(item => item.downloadKey === downloadKey);
        if (index !== -1) {
          aiRenameQueue.splice(index, 1);
          debugLog(`[AI Queue] Removed ${downloadKey} from queue. Queue length: ${aiRenameQueue.length}`);
          return true;
        }
        return false;
      }

      function getQueuePosition(downloadKey) {
        if (currentlyProcessingKey === downloadKey) return 0;
        const index = aiRenameQueue.findIndex(item => item.downloadKey === downloadKey);
        return index === -1 ? -1 : index + 1;
      }

      function isInQueue(downloadKey) {
        return getQueuePosition(downloadKey) !== -1;
      }

      function updateQueueStatusInUI(downloadKey) {
        if (downloadKey !== focusedKeyRef.current || !getMasterTooltip()) return;

        const masterTooltipDOMElement = getMasterTooltip();
        const statusEl = masterTooltipDOMElement.querySelector(".card-status");
        if (!statusEl) return;

        const position = getQueuePosition(downloadKey);
        const cardData = activeDownloadCards.get(downloadKey);

        if (position > 0) {
          statusEl.textContent = `Waiting for AI rename (${position} in queue)...`;
          statusEl.style.color = "#f39c12";
        } else if (currentlyProcessingKey === downloadKey) {
          // processDownloadForAIRenaming handles its own status updates
        } else if (cardData?.download?.aiName) {
          statusEl.textContent = "Download renamed to:";
          statusEl.style.color = "#a0a0a0";
        } else if (cardData?.download?.succeeded) {
          statusEl.textContent = "Download completed";
          statusEl.style.color = "#1dd1a1";
        }
      }

      /** @param {string} hostname */
      function hostnameHintsSearchEngine(hostname) {
        const h = String(hostname).toLowerCase();
        return (
          h.includes("google") ||
          h.includes("duckduckgo") ||
          h.includes("bing") ||
          h.includes("yahoo") ||
          h.includes("yandex")
        );
      }

      /** @param {string[]} urls */
      function anyCandidateUrlLooksLikeSearchContext(urls) {
        for (const s of urls) {
          try {
            if (hostnameHintsSearchEngine(new URL(s).hostname)) return true;
          } catch (_e) {}
        }
        return false;
      }

      async function processDownloadForAIRenaming(download, originalNameForUICard, keyOverride) {
        const key = keyOverride || getDownloadKey(download);
        const cardData = activeDownloadCards.get(key);

        const abortController = new AbortController();
        const processState = { phase: 'initializing', startTime: Date.now() };

        activeAIProcesses.set(key, { abortController, processState, startTime: Date.now() });
        debugLog(`[AI Process] Started AI renaming process for ${key}`, processState);

        let statusElToUpdate;
        let titleElToUpdate;
        let originalFilenameElToUpdate;
        let progressElToHide;
        let podElementToStyle;

        const masterTooltipDOMElement = getMasterTooltip();
        const focusedKey = focusedKeyRef.current;

        if (focusedKey === key && masterTooltipDOMElement) {
          statusElToUpdate = masterTooltipDOMElement.querySelector(".card-status");
          titleElToUpdate = masterTooltipDOMElement.querySelector(".card-title");
          originalFilenameElToUpdate = masterTooltipDOMElement.querySelector(".card-original-filename");
          progressElToHide = masterTooltipDOMElement.querySelector(".card-progress");
        } else if (cardData && cardData.podElement) {
          debugLog(`[AI Rename] processDownloadForAIRenaming called for non-focused item ${key}. UI updates will be minimal.`);
        }

        if (cardData && cardData.podElement) {
          podElementToStyle = cardData.podElement;
        }

        if (!cardData) {
          debugLog("AI Rename: Card data not found for download key (continuing with queue snapshot):", key);
        }

        const previewContainerOnPod = cardData?.podElement
          ? cardData.podElement.querySelector(".card-preview-container")
          : null;
        let originalPreviewTitle = "";
        if (previewContainerOnPod) originalPreviewTitle = previewContainerOnPod.title;

        const downloadPath = download.target.path;
        if (!downloadPath) {
          activeAIProcesses.delete(key);
          releasePileHoverExpandBlockForKey(key);
          revealToolbarPodAfterAIRename(key, download);
          return false;
        }

        const trueOriginalFilename = cardData?.originalFilename ?? originalNameForUICard;

        if (renamedFiles.has(downloadPath)) {
          debugLog(`Skipping rename - already processed: ${downloadPath}`);
          activeAIProcesses.delete(key);
          releasePileHoverExpandBlockForKey(key);
          revealToolbarPodAfterAIRename(key, download);
          return false;
        }

        if (abortController.signal.aborted) {
          debugLog(`[AI Process] Process aborted before file size check: ${key}`);
          activeAIProcesses.delete(key);
          releasePileHoverExpandBlockForKey(key);
          revealToolbarPodAfterAIRename(key, download);
          throw new DOMException('AI process was aborted', 'AbortError');
        }

        try {
          const validation = SecurityUtils.validateFilePath(downloadPath, { strict: false });
          if (!validation.valid) {
            debugLog(`Path validation warning (continuing anyway): ${validation.error}`, { path: downloadPath, code: validation.code });
          }

          const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
          file.initWithPath(downloadPath);

          if (!file.exists()) {
            debugLog(`File does not exist for AI rename: ${downloadPath}`);
            activeAIProcesses.delete(key);
            releasePileHoverExpandBlockForKey(key);
            revealToolbarPodAfterAIRename(key, download);
            return false;
          }
        } catch (e) {
          const errorMessage = e.message || e.toString() || 'Unknown error';
          debugLog(`Error checking file size: ${errorMessage}`, { path: downloadPath, error: errorMessage });
          activeAIProcesses.delete(key);
          releasePileHoverExpandBlockForKey(key);
          revealToolbarPodAfterAIRename(key, download);
          return false;
        }

        if (cardData) {
          cardData.trueOriginalPathBeforeAIRename = downloadPath;
          cardData.trueOriginalSimpleNameBeforeAIRename = downloadPath.split(PATH_SEPARATOR).pop();
          debugLog("[AI Rename Prep] Stored for undo:", {
            path: cardData.trueOriginalPathBeforeAIRename,
            name: cardData.trueOriginalSimpleNameBeforeAIRename
          });
        }

        try {
          processState.phase = 'analyzing';
          if (abortController.signal.aborted) {
            debugLog(`[AI Process] Process aborted during setup: ${key}`);
            activeAIProcesses.delete(key);
            throw new DOMException('AI process was aborted', 'AbortError');
          }

          if (podElementToStyle) podElementToStyle.classList.add("renaming-active");
          if (statusElToUpdate) statusElToUpdate.textContent = "Analyzing file...";
          if (previewContainerOnPod) {
            previewContainerOnPod.style.pointerEvents = "none";
            previewContainerOnPod.title = "Renaming in progress...";
          }

          const currentFilename = downloadPath.split(PATH_SEPARATOR).pop();
          const fileExtension = currentFilename.includes(".")
            ? currentFilename.substring(currentFilename.lastIndexOf(".")).toLowerCase()
            : "";
          const isImage = IMAGE_EXTENSIONS.has(fileExtension);
          debugLog(`Processing file for AI rename: ${currentFilename} (${isImage ? "Image" : "Non-image"})`);

          if (abortController.signal.aborted) {
            debugLog(`[AI Process] Process aborted before analysis: ${key}`);
            renamedFiles.delete(downloadPath);
            activeAIProcesses.delete(key);
            throw new DOMException('AI process was aborted', 'AbortError');
          }

          processState.phase = 'metadata-analysis';
          if (statusElToUpdate) statusElToUpdate.textContent = "Generating better name...";

          const sourceURL = download.source?.url || "unknown";
          let tabTitle = "unknown";
          let pageHeader = "unknown";
          let pageDescription = "unknown";

          try {
            if (typeof gBrowser !== "undefined" && gBrowser.tabs) {
              let foundTab = null;
              for (const tab of gBrowser.tabs) {
                if (tab.linkedBrowser?.currentURI?.spec === sourceURL) {
                  foundTab = tab;
                  break;
                }
              }
              if (!foundTab && download.source?.referrer) {
                const referrerSpec = download.source.referrer;
                for (const tab of gBrowser.tabs) {
                  if (tab.linkedBrowser?.currentURI?.spec === referrerSpec) {
                    foundTab = tab;
                    break;
                  }
                }
              }
              if (foundTab) {
                tabTitle = foundTab.label || foundTab.title || "unknown";
                try {
                  const doc = foundTab.linkedBrowser.contentDocument;
                  if (doc) {
                    const h1 = doc.querySelector('h1');
                    if (h1) {
                      const h1Text = h1.textContent.trim();
                      if (h1Text) pageHeader = h1Text;
                    }
                    const metaDesc = doc.querySelector('meta[name="description"]');
                    if (metaDesc) {
                      const descContent = metaDesc.content.trim();
                      if (descContent) pageDescription = descContent;
                    }
                  }
                } catch (e) {
                  console.error("Error extracting tab context:", e);
                }
              }
            }
          } catch (e) {
            console.error("Error finding tab title:", e);
          }

          const systemPrompt = `I am downloading a file. Rewrite its filename to be helpful, concise and readable. 2-4 words.
- IMPORTANT: Return ONLY the new filename. Do not provide explanations, conversational text, or "based on the information provided".
- Keep informative names mostly the same. For non-informative names, add information from the tab title or website.
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
- 'CleanShot 2023-08-17 at 19.51.05@2x.png', 'dogfooding - The Browser Company - Slack', 'app.slack.com' -> 'CleanShot Aug 17 from dogfooding.png'
- 'Screenshot 2023-09-26 at 11.12.18 PM', 'DM with Nate - Twitter', 'twitter.com' -> 'Sept 26 Screenshot from Nate.png'
- 'image0.png', 'Nate - Slack', 'files.slack.com' -> 'Slack Image from Nate.png'`;

          let domain = "unknown";
          try {
            domain = new URL(sourceURL).hostname;
          } catch (e) { }

          const candidateUrlsForSearchQuery = [
            download.source?.referrer,
            sourceURL,
            (typeof gBrowser !== "undefined" && gBrowser.selectedBrowser?.currentURI?.spec)
          ].filter(Boolean);
          /* Gate on referrer/tab/host of request, not only file URL — Google Images loads from *.gstatic.com etc. */
          if (anyCandidateUrlLooksLikeSearchContext(candidateUrlsForSearchQuery)) {
            try {
              debugLog("Checking URLs for search query:", candidateUrlsForSearchQuery);
              for (const urlStr of candidateUrlsForSearchQuery) {
                try {
                  const urlObj = new URL(urlStr);
                  const q = urlObj.searchParams.get('q') || urlObj.searchParams.get('p') || urlObj.searchParams.get('text');
                  if (q) {
                    pageHeader = `Search Query: ${q}`;
                    if (tabTitle.toLowerCase().includes('search') || tabTitle.toLowerCase().includes('images') || tabTitle === 'unknown') {
                      tabTitle = `${q} - Search`;
                    }
                    debugLog("Extracted search query for context", { fromUrl: urlStr, query: q, newTabTitle: tabTitle });
                    break;
                  }
                } catch (e) { }
              }
            } catch (e) {
              debugLog("Failed to extract search query:", e);
            }
          }

          const userContent = `Original filename: '${currentFilename}'
Source domain: '${domain}'
Source tab title: '${tabTitle}'
Page Header: '${pageHeader}'
Page Description: '${pageDescription}'

Instructions:
1. First, check if the "Original filename" is already descriptive (contains real words, e.g., "viper-gaming-valorant-hd..."). If so, prioritize cleaning it up (remove random strings, IDs, dates) rather than rewriting it completely from the context.
2. ONLY if the "Original filename" is meaningless gibberish (e.g., "wp13801370.jpg", "OIP.jpg", "image.png"), rename it based on the "Source tab title" or "Page Header".
3. Return ONLY the new filename.`;

          const suggestedName = await callConfiguredAI({
            systemPrompt,
            userPrompt: userContent,
            abortSignal: abortController.signal
          });

          if (!suggestedName) {
            debugLog("No valid name suggestion received from AI");
            showSimpleToast("Could not generate a better name");
            renamedFiles.delete(downloadPath);
            if (podElementToStyle) {
              podElementToStyle.classList.remove("renaming-active");
              podElementToStyle.classList.remove('renaming-initiated');
            }
            activeAIProcesses.delete(key);
            updateUIForFocusedDownload(focusedKeyRef.current || key, true);
            return false;
          }

          if (abortController.signal.aborted) {
            debugLog(`[AI Process] Process aborted before file rename: ${key}`);
            renamedFiles.delete(downloadPath);
            activeAIProcesses.delete(key);
            throw new DOMException('AI process was aborted', 'AbortError');
          }

          processState.phase = 'renaming';
          let cleanName = suggestedName
            .replace(/[^a-zA-Z0-9\-_\.\s]/g, "")
            .trim()
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .toLowerCase();

          if (/^[\-_.]+$/.test(cleanName) || cleanName.replace(/[\-_.]/g, "").length < 2) {
            debugLog("AI suggested invalid name (separators only):", cleanName);
            cleanName = "";
          }

          if (cleanName.length > getPref("extensions.downloads.max_filename_length", 70) - fileExtension.length) {
            cleanName = cleanName.substring(0, getPref("extensions.downloads.max_filename_length", 70) - fileExtension.length);
          }
          if (fileExtension && !cleanName.toLowerCase().endsWith(fileExtension.toLowerCase())) {
            cleanName = cleanName + fileExtension;
          }

          if (cleanName.length <= 2 || cleanName.toLowerCase() === currentFilename.toLowerCase()) {
            debugLog("Skipping AI rename - name too short or same as original");
            showSimpleToast("Original name is suitable");
            renamedFiles.delete(downloadPath);
            if (podElementToStyle) {
              podElementToStyle.classList.remove("renaming-active");
              podElementToStyle.classList.remove('renaming-initiated');
            }
            activeAIProcesses.delete(key);
            updateUIForFocusedDownload(focusedKeyRef.current || key, true);
            return false;
          }

          debugLog(`AI suggested renaming to: ${cleanName}`);
          if (statusElToUpdate) statusElToUpdate.textContent = `Renaming to: ${cleanName}`;

          const success = await renameDownloadFileAndUpdateRecord(download, cleanName, key);

          if (success) {
            const newPath = download.target.path;
            const pathSeparator = newPath.includes('\\') ? '\\' : '/';
            const actualFilename = newPath.split(pathSeparator).pop() || cleanName;

            download.aiName = actualFilename;
            renamedFiles.add(downloadPath);
            renamedFiles.add(newPath);
            debugLog(`[AI Rename] Added paths to renamedFiles: ${downloadPath} and ${newPath}`);

            if (titleElToUpdate) {
              titleElToUpdate.textContent = actualFilename;
              titleElToUpdate.title = actualFilename;
            }

            if (statusElToUpdate) {
              let finalSize = download.currentBytes;
              if (!(typeof finalSize === 'number' && finalSize > 0)) finalSize = download.totalBytes;
              const fileSizeText = formatBytes(finalSize || 0);
              const fileSizeEl = masterTooltipDOMElement?.querySelector(".card-filesize");
              statusElToUpdate.textContent = "Download renamed to:";
              if (fileSizeEl) {
                fileSizeEl.textContent = fileSizeText;
                fileSizeEl.style.display = "block";
              }
              statusElToUpdate.style.color = "#a0a0a0";
            }

            if (originalFilenameElToUpdate) {
              originalFilenameElToUpdate.textContent = trueOriginalFilename;
              originalFilenameElToUpdate.title = trueOriginalFilename;
              originalFilenameElToUpdate.style.textDecoration = "line-through";
              originalFilenameElToUpdate.style.display = "block";
            }

            if (progressElToHide) progressElToHide.style.display = "none";
            if (podElementToStyle) {
              podElementToStyle.classList.remove("renaming-active");
              podElementToStyle.classList.add("renamed-by-ai");
            }

            releasePileHoverExpandBlockForKey(key);
            releasePileHoverExpandBlockForKey(newPath);

            const renamedCardData = activeDownloadCards.get(newPath);
            const isDeferredSticky = renamedCardData?.phase === "deferred-sticky";

            let deferredChromeSurfaced = false;
            if (isDeferredSticky) {
              deferredChromeSurfaced =
                (await finishDeferredStickyAfterAISuccess?.(newPath)) === true;
              if (!deferredChromeSurfaced) {
                debugLog(
                  `[AI Rename] ${newPath} deferred-sticky: pile expanded + autohide still pending — toolbar chrome waits for pile-hidden (same as terminal entry).`
                );
              }
            }

            if (!(isDeferredSticky && !deferredChromeSurfaced)) {
              revealToolbarPodAfterAIRename(newPath, download);
            }

            if (!isDeferredSticky) {
              const priorFocus = focusedKeyRef.current;
              focusedKeyRef.current = newPath;
              if (priorFocus !== newPath) {
                debugLog(
                  `[AI Rename] Stole focus for renamed pod: ${priorFocus ?? "null"} → ${newPath} (jukebox: each fresh AI-rename success surfaces its own tooltip).`
                );
              }
              updateUIForFocusedDownload(newPath, true);
              scheduleCardRemoval(newPath);
            }
            debugLog(`Successfully AI-renamed to: ${actualFilename}`);

            activeAIProcesses.delete(key);
            return true;
          } else {
            renamedFiles.delete(downloadPath);
            showSimpleToast("Rename failed");
            if (podElementToStyle) {
              podElementToStyle.classList.remove("renaming-active");
              podElementToStyle.classList.remove('renaming-initiated');
            }
            activeAIProcesses.delete(key);
            updateUIForFocusedDownload(focusedKeyRef.current || key, true);
            return false;
          }
        } catch (e) {
          if (e.name === 'AbortError') {
            debugLog(`[AI Process] AI rename process was aborted for ${key}`);
          } else {
            console.error("AI Rename process error:", e);
            showSimpleToast("Rename error");
          }
          renamedFiles.delete(downloadPath);
          if (podElementToStyle) {
            podElementToStyle.classList.remove("renaming-active");
            podElementToStyle.classList.remove('renaming-initiated');
          }
          activeAIProcesses.delete(key);
          if (e.name !== "AbortError") {
            updateUIForFocusedDownload(focusedKeyRef.current || key, true);
          }
          throw e;
        } finally {
          if (previewContainerOnPod) {
            previewContainerOnPod.style.pointerEvents = "auto";
            previewContainerOnPod.title = originalPreviewTitle;
          }
          if (podElementToStyle) podElementToStyle.classList.remove("renaming-active");
          releasePileHoverExpandBlockForKey(key);
          const targetPathNow = download?.target?.path;
          if (targetPathNow && targetPathNow !== key) {
            releasePileHoverExpandBlockForKey(targetPathNow);
          }
          revealToolbarPodAfterAIRename(key, download);
          scheduleDeferredStickyAbsorbIfNeeded?.(key);
          if (targetPathNow && targetPathNow !== key) {
            scheduleDeferredStickyAbsorbIfNeeded?.(targetPathNow);
          }
        }
      }

      async function processAIRenameQueue() {
        debugLog(`[AI Queue] processAIRenameQueue called`, {
          isProcessingAIQueue,
          queueLength: aiRenameQueue.length,
          currentlyProcessing: currentlyProcessingKey
        });

        if (isProcessingAIQueue) {
          debugLog("[AI Queue] Queue processing already in progress, returning");
          return;
        }
        if (aiRenameQueue.length === 0) {
          debugLog("[AI Queue] Queue is empty, nothing to process");
          return;
        }

        isProcessingAIQueue = true;
        debugLog(`[AI Queue] ✅ Starting queue processing. Queue length: ${aiRenameQueue.length}`, {
          queueItems: aiRenameQueue.map(item => ({ key: item.downloadKey, path: item.download?.target?.path }))
        });

        try {
          while (aiRenameQueue.length > 0) {
            const queueItem = aiRenameQueue.shift();
            const { downloadKey, download, originalFilename } = queueItem;

            currentlyProcessingKey = downloadKey;
            debugLog(`[AI Queue] Processing ${downloadKey}. Remaining in queue: ${aiRenameQueue.length}`);

            const cardData = activeDownloadCards.get(downloadKey);
            const dl = cardData?.download || download;
            if (!dl) {
              debugLog(`[AI Queue] Skipping ${downloadKey} - no download object`);
              releasePileHoverExpandBlockForKey(downloadKey);
              revealToolbarPodAfterAIRename(downloadKey, null);
              scheduleDeferredStickyAbsorbIfNeeded?.(downloadKey);
              currentlyProcessingKey = null;
              continue;
            }

            const currentPath = dl.target?.path;
            if (renamedFiles.has(currentPath)) {
              debugLog(`[AI Queue] Skipping ${downloadKey} - already renamed`);
              releasePileHoverExpandBlockForKey(downloadKey);
              revealToolbarPodAfterAIRename(downloadKey, dl);
              scheduleDeferredStickyAbsorbIfNeeded?.(downloadKey);
              scheduleDeferredStickyAbsorbIfNeeded?.(currentPath);
              currentlyProcessingKey = null;
              continue;
            }

            if (!dl.succeeded) {
              debugLog(`[AI Queue] Skipping ${downloadKey} - no longer in succeeded state`);
              releasePileHoverExpandBlockForKey(downloadKey);
              revealToolbarPodAfterAIRename(downloadKey, dl);
              scheduleDeferredStickyAbsorbIfNeeded?.(downloadKey);
              scheduleDeferredStickyAbsorbIfNeeded?.(currentPath);
              currentlyProcessingKey = null;
              continue;
            }

            const masterTooltipDOMElement = getMasterTooltip();
            if (focusedKeyRef.current === downloadKey && masterTooltipDOMElement) {
              const statusEl = masterTooltipDOMElement.querySelector(".card-status");
              if (statusEl) {
                statusEl.textContent = "Analyzing for rename...";
                statusEl.style.color = "#54a0ff";
              }
            }

            aiRenameQueue.forEach(item => updateQueueStatusInUI(item.downloadKey));

            try {
              const podElement = cardData?.podElement;
              if (podElement) podElement.classList.add('renaming-initiated');

              await processDownloadForAIRenaming(dl, originalFilename, downloadKey);
              debugLog(`[AI Queue] Successfully processed ${downloadKey}`);
            } catch (error) {
              if (error.name === 'AbortError') {
                debugLog(`[AI Queue] Processing of ${downloadKey} was aborted`);
              } else {
                debugLog(`[AI Queue] Error processing ${downloadKey}:`, error);
              }
              const cardDataErr = activeDownloadCards.get(downloadKey);
              if (cardDataErr?.podElement) {
                cardDataErr.podElement.classList.remove('renaming-initiated', 'renaming-active');
              }
            }

            currentlyProcessingKey = null;

            if (aiRenameQueue.length > 0) {
              debugLog(`[AI Queue] Waiting before next item. Remaining: ${aiRenameQueue.length}`);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        } catch (error) {
          console.error("[AI Queue] Error in queue processor:", error);
          debugLog(`[AI Queue] Queue processor error:`, error);
        } finally {
          isProcessingAIQueue = false;
          currentlyProcessingKey = null;
          debugLog("[AI Queue] Queue processing complete (flag reset)");
        }
      }

      /**
       * When a card's map key changes (temp→path, id→path, disk rename), keep queue and in-flight AI maps aligned.
       * @param {string} oldKey
       * @param {string} newKey
       */
      function migrateAIRenameKeys(oldKey, newKey) {
        if (!oldKey || !newKey || oldKey === newKey) return;

        let touched = false;
        for (const item of aiRenameQueue) {
          if (item.downloadKey === oldKey) {
            item.downloadKey = newKey;
            touched = true;
          }
        }
        if (currentlyProcessingKey === oldKey) {
          currentlyProcessingKey = newKey;
          touched = true;
        }
        if (activeAIProcesses.has(oldKey)) {
          const proc = activeAIProcesses.get(oldKey);
          activeAIProcesses.delete(oldKey);
          activeAIProcesses.set(newKey, proc);
          touched = true;
        }
        const pileBlock = store.pileHoverExpandBlockedUntilAIDoneKeys;
        if (pileBlock?.has(oldKey)) {
          pileBlock.delete(oldKey);
          pileBlock.add(newKey);
          touched = true;
        }
        if (touched) {
          debugLog(`[AI] Migrated rename keys: ${oldKey} → ${newKey}`);
        }
      }

      async function cancelAIProcessForDownload(downloadKey) {
        let result = false;
        try {
          const wasInQueue = removeFromAIRenameQueue(downloadKey);
          if (wasInQueue) {
            debugLog(`[AI Cancel] Removed ${downloadKey} from AI rename queue`);
          }

          const aiProcess = activeAIProcesses.get(downloadKey);
          if (!aiProcess) {
            debugLog(`[AI Cancel] No active AI process found for ${downloadKey}`);
            result = wasInQueue;
            return result;
          }

          debugLog(`[AI Cancel] Canceling AI process for ${downloadKey}`, {
            phase: aiProcess.processState.phase,
            duration: Date.now() - aiProcess.startTime
          });

          try {
            aiProcess.abortController.abort();
            activeAIProcesses.delete(downloadKey);

            const cardData = activeDownloadCards.get(downloadKey);
            if (cardData?.podElement) {
              cardData.podElement.classList.remove("renaming-active");
              cardData.podElement.classList.remove("renaming-initiated");
            }

            const masterTooltipDOMElement = getMasterTooltip();
            if (downloadKey === focusedKeyRef.current && masterTooltipDOMElement) {
              const statusEl = masterTooltipDOMElement.querySelector(".card-status");
              if (statusEl && (statusEl.textContent.includes("Analyzing") || statusEl.textContent.includes("Generating"))) {
                const download = cardData?.download;
                if (download?.succeeded) {
                  statusEl.textContent = "Download completed";
                  statusEl.style.color = "#1dd1a1";
                } else if (download?.error) {
                  statusEl.textContent = `Error: ${download.error.message || "Download failed"}`;
                  statusEl.style.color = "#ff6b6b";
                }
              }
            }

            debugLog(`[AI Cancel] Successfully canceled AI process for ${downloadKey}`);
            result = true;
          } catch (error) {
            debugLog(`[AI Cancel] Error canceling AI process for ${downloadKey}:`, error);
            activeAIProcesses.delete(downloadKey);
            result = false;
          }
        } finally {
          releasePileHoverExpandBlockForKey(downloadKey);
          const cd = activeDownloadCards.get(downloadKey);
          const dlPath = cd?.download?.target?.path;
          revealToolbarPodAfterAIRename(downloadKey, cd?.download);
          scheduleDeferredStickyAbsorbIfNeeded?.(downloadKey);
          if (dlPath && dlPath !== downloadKey) {
            scheduleDeferredStickyAbsorbIfNeeded?.(dlPath);
          }
        }
        return result;
      }

      return {
        addToAIRenameQueue,
        removeFromAIRenameQueue,
        cancelAIProcessForDownload,
        isInQueue,
        getQueuePosition,
        updateQueueStatusInUI,
        migrateAIRenameKeys
      };
    }
  };

  console.log("[Zen Tidy Downloads] AI Rename module loaded");
})();
