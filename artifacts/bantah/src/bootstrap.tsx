import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

const splash = document.getElementById("app-splash");
const shouldShowMobileSplash =
  window.matchMedia("(max-width: 767px)").matches &&
  (window.matchMedia("(hover: none)").matches || window.matchMedia("(pointer: coarse)").matches);

if (splash && !shouldShowMobileSplash) {
  splash.remove();
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(<App />);

if (splash && shouldShowMobileSplash) {
  const hideSplash = () => {
    splash.classList.add("is-hidden");
    window.setTimeout(() => splash.remove(), 240);
  };

  const isMobileSplash = window.matchMedia("(max-width: 767px)").matches;

  if (!isMobileSplash) {
    hideSplash();
  } else {
    const image = splash.querySelector("img");
    const elapsed = Math.max(0, performance.now());
    const minimumVisibleMs = Math.max(250, 850 - elapsed);

    const waitForImage = new Promise<void>((resolve) => {
      if (!(image instanceof HTMLImageElement)) {
        resolve();
        return;
      }

      if (image.complete && image.naturalWidth > 0) {
        resolve();
        return;
      }

      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      image.addEventListener("load", settle, { once: true });
      image.addEventListener("error", settle, { once: true });
      window.setTimeout(settle, 700);
    });

    const waitForMinimum = new Promise<void>((resolve) => {
      window.setTimeout(resolve, minimumVisibleMs);
    });

    void Promise.all([waitForImage, waitForMinimum]).then(() => {
      requestAnimationFrame(hideSplash);
    });
  }
}
