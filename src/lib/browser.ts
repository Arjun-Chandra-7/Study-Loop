/**
 * In-app browsers (Instagram, WhatsApp, Facebook, LinkedIn, Snapchat, TikTok…) open links in an
 * embedded web view. Google refuses to sign anyone in there ("disallowed_useragent"), so the only
 * way through is the phone's real browser.
 */
export function inAppBrowser(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): string | null {
  const known: [RegExp, string][] = [
    [/Instagram/i, "Instagram"],
    [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
    [/WhatsApp/i, "WhatsApp"],
    [/LinkedInApp/i, "LinkedIn"],
    [/Snapchat/i, "Snapchat"],
    [/musical_ly|TikTok|BytedanceWebview/i, "TikTok"],
    [/Twitter|X-Twitter/i, "X"],
    [/Line\//i, "LINE"],
    [/MicroMessenger/i, "WeChat"],
    [/Telegram/i, "Telegram"],
  ];
  for (const [re, name] of known) if (re.test(ua)) return name;
  // Generic Android web view.
  if (/Android/i.test(ua) && /; wv\)/.test(ua)) return "this app";
  // iOS web view: WebKit without the Safari token (and not another real browser).
  if (/iPhone|iPad|iPod/i.test(ua) && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return "this app";
  return null;
}

export const isAndroid = (ua = typeof navigator === "undefined" ? "" : navigator.userAgent) => /Android/i.test(ua);

/** An intent link that opens the current page in Chrome on Android. */
export function chromeIntent(href: string): string {
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}
