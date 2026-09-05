import { splitHeroNameLetters } from "./hero-name.js";
import { setupInteractiveGlobe } from "./interactive-globe.js?v=20260904-2";
import { setupDetails } from "./easter-eggs/details.js?v=20260904";
import { setupStatsEggs } from "./easter-eggs/stats.js?v=20260904";
import { setupStats } from "./stats.js";
import { initEntryInteractions, initHeatmapAccent, setupTheme } from "./theme.js";

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
  setupDetails();
  setupStatsEggs();
  visitStatsPromise.then(updateVisitCount);
  visitStatsPromise.then((visitStats) => {
    setupInteractiveGlobe(visitStats?.locations || []);
  });
});
