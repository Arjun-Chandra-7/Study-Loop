/**
 * Runs in <head> before hydration. Chrome fires `beforeinstallprompt` during page load — often
 * before React mounts — so a listener added later never sees it, and Chrome falls back to its own
 * "add shortcut" popup. This captures the event the instant it fires, stashes it on `window`, and
 * re-broadcasts it so the install banner can use it whenever it mounts. Also suppresses Chrome's
 * default mini-infobar so our banner is the single, working install surface.
 */
export function installCaptureScript(): string {
  return `(function(){try{
    window.__slInstall=null;
    addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__slInstall=e;dispatchEvent(new Event('sl-install-ready'));});
    addEventListener('appinstalled',function(){window.__slInstall=null;dispatchEvent(new Event('sl-installed'));});
  }catch(e){}})();`;
}
