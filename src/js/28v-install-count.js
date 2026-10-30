  // How many use Zia (on unless switched off, zia.install-count): once a day a tiny file is
  // downloaded from the repository's "install-count" release, and GitHub counts its downloads.
  // Nothing is sent, no ID and no settings; all that's kept is the day it last counted, here.
  // A daily Action (install-count.yml) writes the total down, so a day's rise is about how many
  // installs were in use that day.
  const INSTALL_COUNT_URL = "https://github.com/z1n-k/zia/releases/download/install-count/ping.txt";
  const INSTALL_COUNT_DAY = "zia.install-count.day";

  function countInstallToday() {
    if (!Services.prefs.getBoolPref("zia.install-count", true) || window.PrivateBrowsingUtils?.isWindowPrivate(window)) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const last = Services.prefs.getStringPref(INSTALL_COUNT_DAY, "");
    if (last === today) {
      return;
    }
    // (marked before it's sent: every window checks, and only the first may count; put back
    // if it didn't get through, so a later check tries again)
    Services.prefs.setStringPref(INSTALL_COUNT_DAY, today);
    fetch(INSTALL_COUNT_URL, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      })
      .catch(() => Services.prefs.setStringPref(INSTALL_COUNT_DAY, last));
  }

  // a minute after the window opens, and every few hours for a window left open for days
  function watchInstallCount() {
    setTimeout(countInstallToday, 60 * 1000);
    setInterval(countInstallToday, 4 * 60 * 60 * 1000);
  }
