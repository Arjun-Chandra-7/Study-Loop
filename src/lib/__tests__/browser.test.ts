import { describe, expect, it } from "vitest";
import { chromeIntent, inAppBrowser } from "../browser";

const UA = {
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0",
  whatsappAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 WhatsApp/2.24",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 13; SM-A515F Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36",
  iosWebView: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  chromeDesktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

describe("inAppBrowser", () => {
  it("names the app for embedded browsers Google refuses to sign in from", () => {
    expect(inAppBrowser(UA.instagramIos)).toBe("Instagram");
    expect(inAppBrowser(UA.whatsappAndroid)).toBe("WhatsApp");
    expect(inAppBrowser(UA.androidWebView)).toBe("this app");
    expect(inAppBrowser(UA.iosWebView)).toBe("this app");
  });

  it("leaves real browsers alone", () => {
    expect(inAppBrowser(UA.safariIos)).toBeNull();
    expect(inAppBrowser(UA.chromeIos)).toBeNull();
    expect(inAppBrowser(UA.chromeAndroid)).toBeNull();
    expect(inAppBrowser(UA.chromeDesktop)).toBeNull();
  });
});

describe("chromeIntent", () => {
  it("opens the same page in Chrome, falling back to the page itself", () => {
    const link = chromeIntent("https://study-loop-alpha.vercel.app/login?x=1");
    expect(link.startsWith("intent://study-loop-alpha.vercel.app/login?x=1#Intent;scheme=https;package=com.android.chrome;")).toBe(true);
    expect(link).toContain(`S.browser_fallback_url=${encodeURIComponent("https://study-loop-alpha.vercel.app/login?x=1")}`);
  });
});
