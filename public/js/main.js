import { splitHeroNameLetters } from "./hero-name.js";
import { setupInteractiveGlobe } from "./interactive-globe.js";
import { setupStats } from "./stats.js";
import { setupTheme } from "./theme.js";

const initEntryInteractions = (setColorScheme) => {
  const tapIndentationQuery = window.matchMedia("(hover: none)");
  const toggleEntry = (entry) => {
    const activeEntry = document.querySelector(".subsection-item.is-active");
    const nextEntry = entry === activeEntry ? null : entry;

    activeEntry?.classList.remove("is-active");
    activeEntry?.querySelector(".entry-theme-toggle")?.setAttribute("aria-pressed", "false");
    if (nextEntry) {
      nextEntry.classList.add("is-active");
      nextEntry.querySelector(".entry-theme-toggle")?.setAttribute("aria-pressed", "true");
    }

    setColorScheme(nextEntry?.dataset.colorScheme || null);
  };

  document.addEventListener("click", (event) => {
    const entry = event.target.closest(".subsection-item");
    toggleEntry(entry && (tapIndentationQuery.matches || entry.dataset.colorScheme) ? entry : null);
  });
};

const initHeatmapAccent = () => {
  const heatmap = document.querySelector("#github-heatmap");
  if (!heatmap) {
    return;
  }

  const root = document.documentElement;
  const heatmapWrap = heatmap.parentElement;
  const baseUrl = new URL(heatmap.src);
  const username = baseUrl.pathname.split("/").at(-1);
  const heatmaps = new Map([[heatmap.src.toLowerCase(), heatmap]]);
  let desiredSource = heatmap.src.toLowerCase();

  const activate = (nextHeatmap) => {
    heatmaps.forEach((image) => image.classList.toggle("is-active", image === nextHeatmap));
  };

  const syncAccent = () => {
    const accent = getComputedStyle(root).getPropertyValue("--accent").trim().replace("#", "");
    const nextUrl = new URL(baseUrl);
    nextUrl.pathname = `/${accent}/${username}`;
    const source = nextUrl.href.toLowerCase();
    if (source === desiredSource) {
      return;
    }
    desiredSource = source;

    const cachedHeatmap = heatmaps.get(source);
    if (cachedHeatmap) {
      if (cachedHeatmap.isConnected) {
        activate(cachedHeatmap);
      }
      return;
    }
    const nextHeatmap = heatmap.cloneNode();
    nextHeatmap.classList.remove("is-active");
    nextHeatmap.removeAttribute("id");
    heatmaps.set(source, nextHeatmap);
    nextHeatmap.onload = () => {
      heatmapWrap.append(nextHeatmap);
      if (desiredSource === source) {
        nextHeatmap.getBoundingClientRect();
        activate(nextHeatmap);
      }
    };
    nextHeatmap.onerror = () => heatmaps.delete(source);
    nextHeatmap.src = source;
  };

  new MutationObserver(syncAccent).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme", "data-color-scheme"],
  });
  syncAccent();
};

const initMobileGlobePlacement = () => {
  const media = window.matchMedia("(max-width: 700px)");
  const lowerMain = document.querySelector(".lower-main");
  const globeColumn = document.querySelector(".globe-column");
  const contactSection = document.querySelector("#contact");
  const lowerLayout = document.querySelector(".lower-layout");
  if (!lowerMain || !globeColumn || !contactSection || !lowerLayout) {
    return;
  }

  const placeGlobe = () => {
    if (media.matches) {
      lowerMain.insertBefore(globeColumn, contactSection);
      return;
    }
    lowerLayout.appendChild(globeColumn);
  };

  placeGlobe();
  media.addEventListener("change", placeGlobe);
};

const initVisitStats = async () => {
  try {
    await fetch("/api/visit", { method: "POST", keepalive: true });
  } catch {
    // no-op
  }

  try {
    const response = await fetch("/api/visit-stats");
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
};

const updateVisitCount = (visitStats) => {
  const visitCount = document.querySelector("#visitor-count");
  if (visitCount && typeof visitStats?.totalVisits === "number") {
    visitCount.textContent = String(visitStats.totalVisits);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const visitStatsPromise = initVisitStats();
  const setColorScheme = setupTheme();

  splitHeroNameLetters();
  initEntryInteractions(setColorScheme);
  initHeatmapAccent();
  setupStats();
  initMobileGlobePlacement();
  visitStatsPromise.then(updateVisitCount);
  visitStatsPromise.then((visitStats) => {
    setupInteractiveGlobe(visitStats?.locations || []);
  });
});
