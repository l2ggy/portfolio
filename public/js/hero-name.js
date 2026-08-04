export const splitHeroNameLetters = () => {
  const heroName = document.querySelector("#hero-name");
  if (!heroName || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const originalText = heroName.textContent || "";
  if (!originalText) {
    return;
  }

  const ligatureGroups = ["ffl", "ffi", "ff", "fi", "fl", "st"];
  const segmentText = (text) => {
    const graphemes = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), ({ segment }) => segment);
    const segments = [];
    for (let index = 0; index < graphemes.length; index += 1) {
      const lookahead = graphemes.slice(index, index + 3).join("").toLowerCase();
      const ligature = ligatureGroups.find((group) => lookahead.startsWith(group));
      if (ligature) {
        segments.push(graphemes.slice(index, index + ligature.length).join(""));
        index += ligature.length - 1;
        continue;
      }
      segments.push(graphemes[index]);
    }
    return segments;
  };

  const letterSpans = segmentText(originalText).map((segment, index) => {
    const span = document.createElement("span");
    span.className = "hero-letter";
    span.style.setProperty("--hero-letter-i", index);
    span.textContent = segment === " " ? "\u00A0" : segment;
    span.setAttribute("aria-hidden", "true");
    return span;
  });
  const plainResetDurationMs = 420 + letterSpans.length * 14;
  let plainResetTimeoutId = null;
  let isScatterActive = false;

  const randomizeHeroLetters = () => {
    letterSpans.forEach((span) => {
      span.style.setProperty("--hero-letter-seed", (Math.random() * 2 - 1).toFixed(3));
    });
  };

  const showPlainName = () => {
    isScatterActive = false;
    if (!heroName.classList.contains("hero-name-split")) {
      heroName.classList.remove("hero-name-animate");
      return;
    }
    heroName.classList.remove("hero-name-animate");
    if (plainResetTimeoutId) {
      window.clearTimeout(plainResetTimeoutId);
    }
    plainResetTimeoutId = window.setTimeout(() => {
      heroName.classList.remove("hero-name-split");
      heroName.removeAttribute("aria-label");
      heroName.textContent = originalText;
      plainResetTimeoutId = null;
    }, plainResetDurationMs);
  };

  const showAnimatedName = () => {
    if (isScatterActive) {
      return;
    }
    isScatterActive = true;
    if (plainResetTimeoutId) {
      window.clearTimeout(plainResetTimeoutId);
      plainResetTimeoutId = null;
    }
    randomizeHeroLetters();
    if (!heroName.classList.contains("hero-name-split")) {
      heroName.classList.add("hero-name-split");
      heroName.setAttribute("aria-label", originalText);
      heroName.textContent = "";
      letterSpans.forEach((span) => heroName.append(span));
    }
    void heroName.offsetWidth;
    heroName.classList.add("hero-name-animate");
  };

  const supportsHoverCursor = window.matchMedia("(any-hover: hover) and (any-pointer: fine)").matches;
  const activeInputs = new Set();
  const syncAnimatedName = (event) => {
    const isPointerEvent = event.type.startsWith("pointer");
    if (isPointerEvent && event.pointerType !== "mouse") {
      return;
    }
    const input = isPointerEvent ? "pointer" : "focus";
    const isActive = event.type === "pointerenter" || (event.type === "focusin" && heroName.matches(":focus-visible"));
    if (isActive) {
      activeInputs.add(input);
    } else {
      activeInputs.delete(input);
    }
    if (activeInputs.size) {
      showAnimatedName();
    } else {
      showPlainName();
    }
  };

  let lastPointerType = "";
  const toggleAnimatedName = () => {
    if (isScatterActive) {
      showPlainName();
    } else {
      showAnimatedName();
    }
  };

  heroName.addEventListener("pointerdown", (event) => {
    lastPointerType = event.pointerType;
  });

  heroName.addEventListener("click", () => {
    if (supportsHoverCursor && lastPointerType !== "touch" && lastPointerType !== "pen") {
      return;
    }
    if (activeInputs.size) {
      return;
    }
    toggleAnimatedName();
  });

  if (supportsHoverCursor) {
    showPlainName();
    heroName.addEventListener("pointerenter", syncAnimatedName);
    heroName.addEventListener("focusin", syncAnimatedName);
    heroName.addEventListener("pointerleave", syncAnimatedName);
    heroName.addEventListener("focusout", syncAnimatedName);
  }
};
