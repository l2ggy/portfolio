const storedThemeKey = "portfolio-theme-override";

export const initEntryInteractions = (setColorScheme) => {
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

export const initHeatmapAccent = () => {
  const heatmap = document.querySelector("#github-heatmap");
  if (!heatmap) {
    return;
  }

  const root = document.documentElement;
  const heatmapWrap = heatmap.parentElement;
  const baseUrl = new URL(heatmap.src);
  const username = baseUrl.pathname.split("/").at(-1);
  // Reuse image layers so interrupted fades can reverse without duplicate downloads.
  const heatmaps = new Map([[heatmap.src.toLowerCase(), heatmap]]);
  let desiredSource = heatmap.src.toLowerCase();

  const activate = (nextHeatmap) => {
    heatmaps.forEach((image) => image.classList.toggle("is-active", image === nextHeatmap));
  };

  const syncAccent = () => {
    const accent = getComputedStyle(root).getPropertyValue("--heatmap-accent").trim().replace("#", "");
    const nextUrl = new URL(baseUrl);
    nextUrl.pathname = `/${accent}/${username}`;
    const source = nextUrl.href.toLowerCase();
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
        // Commit the transparent layer before starting its fade.
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

export const setupTheme = () => {
  const themeToggle = document.querySelector("#theme-toggle");
  const root = document.documentElement;
  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let overrideTheme = localStorage.getItem(storedThemeKey);

  const getSystemTheme = () => (systemThemeQuery.matches ? "dark" : "light");

  const applyTheme = (theme) => {
    root.dataset.theme = theme;
    if (!themeToggle) {
      return;
    }

    themeToggle.classList.toggle("is-dark", theme === "dark");
    const nextTheme = theme === "dark" ? "light" : "dark";
    themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    themeToggle.setAttribute("title", `Switch to ${nextTheme} mode`);
  };

  applyTheme(overrideTheme || getSystemTheme());
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => root.classList.add("is-theme-ready"));
  });

  if (themeToggle) {
    themeToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const currentTheme = root.dataset.theme || getSystemTheme();
      overrideTheme = currentTheme === "dark" ? "light" : "dark";
      localStorage.setItem(storedThemeKey, overrideTheme);
      applyTheme(overrideTheme);
    });
  }

  systemThemeQuery.addEventListener("change", () => {
    const systemTheme = getSystemTheme();
    if (overrideTheme && overrideTheme !== systemTheme) {
      overrideTheme = null;
      localStorage.removeItem(storedThemeKey);
    }

    if (!overrideTheme) {
      applyTheme(systemTheme);
    }
  });

  return (colorScheme) => {
    if (colorScheme) {
      root.dataset.colorScheme = colorScheme;
    } else {
      delete root.dataset.colorScheme;
    }
  };
};
