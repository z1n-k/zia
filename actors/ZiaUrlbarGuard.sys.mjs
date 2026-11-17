// Zia: the address bar's list never waits on another mod that's stuck.
// Firefox asks every address bar provider whether it has answers (isActive)
// and waits for all of them, with no time limit, before showing any. One mod's
// provider that never answers (Zen Command Palette's, after the Mac slept:
// #607) left Cmd+T and typing with no list at all, so the bar never opened.
// A provider added by a mod or script gets a second to answer; past that it
// counts as having none, and while that answer is still outstanding it isn't
// waited for again. Zen's and Firefox's own providers are left alone (some
// are slow for good reason, the search service as Zen starts). A module, so
// the guard lives once and outlasts the window that set it up.
// Used elsewhere: guardAddressBarProviders (28p-address-bar-commands.js).

import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const ANSWER_MS = 1000;
// where Zen's and Firefox's own providers come from
const BUILT_IN = /^(moz-src|resource):|^chrome:\/\/(browser|global)\//;

function addedByMod(provider) {
  try {
    return !BUILT_IN.test(Cu.getFunctionSourceLocation(provider.isActive).filename);
  } catch (err) {
    return false;
  }
}

function guard(provider) {
  if (!provider || provider.ziaGuarded || typeof provider.isActive !== "function" || !addedByMod(provider)) {
    return;
  }
  const isActive = provider.isActive;
  // the ask that went past its second, until it answers
  let late = null;
  provider.isActive = function (...args) {
    if (late) {
      return Promise.resolve(false);
    }
    let asked;
    try {
      asked = Promise.resolve(isActive.apply(this, args));
    } catch (err) {
      asked = Promise.reject(err);
    }
    let timer = 0;
    const gaveUp = new Promise((resolve) => {
      timer = setTimeout(() => {
        late = asked;
        resolve(false);
      }, ANSWER_MS);
    });
    asked
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        if (late === asked) {
          late = null;
        }
      });
    return Promise.race([asked, gaveUp]);
  };
  provider.ziaGuarded = true;
}

export function guardAddressBarProviders() {
  const { ProvidersManager } = ChromeUtils.importESModule("moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs");
  const manager = ProvidersManager.getInstanceForSap("urlbar");
  manager.providers.forEach(guard);
  if (manager.ziaGuarded) {
    return;
  }
  manager.ziaGuarded = true;
  const register = manager.registerProvider;
  manager.registerProvider = function (provider) {
    guard(provider);
    return register.call(this, provider);
  };
}
