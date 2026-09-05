const TAU = Math.PI * 2;
const BASE_FRAME_MS = 1000 / 60;
const MAX_FRAME_STEPS = 3;
const LAND_MASK_URL = "/data/land-mask.png";
const HOME_MARKER = { lat: 43.65, lon: -79.38 };
const VISITOR_MARKER_COLOR = "#B5744A";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const fitGlobeScale = (preferred, frameSize, availableHeight, availableWidth) => Math.min(
  preferred,
  Math.max(1, availableHeight / frameSize),
  Math.max(1, availableWidth / frameSize),
);

let landMaskPromise;
const loadLandMask = () => {
  if (landMaskPromise) {
    return landMaskPromise;
  }

  landMaskPromise = new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        resolve(null);
        return;
      }

      context.drawImage(image, 0, 0);
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const data = new Uint8Array(canvas.width * canvas.height);
      for (let source = 0, target = 0; target < data.length; source += 4, target += 1) {
        data[target] = rgba[source];
      }
      resolve({ data, width: canvas.width, height: canvas.height });
    };
    image.onerror = () => resolve(null);
    image.src = LAND_MASK_URL;
  });

  return landMaskPromise;
};

const geoToVector = (lat, lon) => {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  return [cosLat * Math.cos(lonRad), Math.sin(latRad), -cosLat * Math.sin(lonRad)];
};

export const rotateGlobeVector = ([x, y, z], yaw, pitch) => {
  const depth = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return [x * Math.cos(yaw) + z * Math.sin(yaw), y * Math.cos(pitch) - depth * Math.sin(pitch), y * Math.sin(pitch) + depth * Math.cos(pitch)];
};

const orbitPoint = (angle, index) => {
  const tilt = (index - 1.5) * 0.63;
  return rotateGlobeVector([Math.cos(angle), Math.sin(angle), 0], index * 0.71, tilt);
};
const createMathGeometry = () => ({
  wireframe: [
    ...Array.from({ length: 5 }, (_, i) => Array.from({ length: 121 }, (_, j) => geoToVector(i * 30 - 60, j * 3))),
    ...Array.from({ length: 12 }, (_, i) => Array.from({ length: 61 }, (_, j) => geoToVector(j * 3 - 90, i * 30))),
  ],
  points: Array.from({ length: 1100 }, (_, i) => {
    const y = 1 - 2 * (i + 0.5) / 1100;
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const radius = Math.sqrt(1 - y * y);
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  }),
  orbits: Array.from({ length: 5 }, (_, i) => Array.from({ length: 181 }, (_, j) => orbitPoint(j * TAU / 180, i))),
});
const renderMathematicalGlobe = (ctx, sphere, yaw, pitch, mode, geometry, color, phase, dpr) => {
  const { center, radius } = sphere;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const project = ([x, y, z]) => {
    const depth = -x * sinYaw + z * cosYaw;
    return [x * cosYaw + z * sinYaw, y * cosPitch - depth * sinPitch, y * sinPitch + depth * cosPitch];
  };
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(0.7, dpr * 0.65);
  if (mode === "points") {
    for (const vector of geometry.points) {
      const [x, y, z] = project(vector);
      ctx.globalAlpha = z < 0 ? 0.09 : 0.28 + 0.65 * z;
      ctx.beginPath();
      ctx.arc(center + x * radius, center - y * radius, dpr * (z < 0 ? 0.65 : 0.8 + z * 0.65), 0, TAU);
      ctx.fill();
    }
  } else {
    for (const line of geometry[mode]) {
      for (let i = 1; i < line.length; i += 1) {
        const a = project(line[i - 1]);
        const b = project(line[i]);
        ctx.globalAlpha = b[2] < 0 ? 0.10 : 0.35 + 0.5 * b[2];
        ctx.beginPath();
        ctx.moveTo(center + a[0] * radius, center - a[1] * radius);
        ctx.lineTo(center + b[0] * radius, center - b[1] * radius);
        ctx.stroke();
      }
    }
    if (mode === "orbits") {
      for (let i = 0; i < 5; i += 1) {
        const [x, y, z] = project(orbitPoint(phase * (0.2 + i * 0.03) + i * 1.7, i));
        ctx.globalAlpha = z < 0 ? 0.2 : 1;
        ctx.beginPath();
        ctx.arc(center + x * radius, center - y * radius, dpr * 2.4, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
};

const buildSphereSamples = (size) => {
  const center = size * 0.5;
  const radius = size * 0.44;
  let count = 0;

  for (let y = 0; y < size; y += 1) {
    const yN = (y + 0.5 - center) / radius;
    for (let x = 0; x < size; x += 1) {
      const xN = (x + 0.5 - center) / radius;
      if ((xN * xN) + (yN * yN) <= 1) {
        count += 1;
      }
    }
  }

  const pixelIndices = new Uint32Array(count);
  const sampleVX = new Float32Array(count);
  const sampleVY = new Float32Array(count);
  const sampleVZ = new Float32Array(count);
  let index = 0;

  for (let y = 0; y < size; y += 1) {
    const yN = (y + 0.5 - center) / radius;
    for (let x = 0; x < size; x += 1) {
      const xN = (x + 0.5 - center) / radius;
      const radialSq = (xN * xN) + (yN * yN);
      if (radialSq > 1) {
        continue;
      }
      pixelIndices[index] = (y * size) + x;
      sampleVX[index] = xN;
      sampleVY[index] = -yN;
      sampleVZ[index] = Math.sqrt(1 - radialSq);
      index += 1;
    }
  }

  return {
    size,
    center,
    radius,
    count,
    pixelIndices,
    sampleVX,
    sampleVY,
    sampleVZ,
    maskU: new Float32Array(count),
    maskRows: new Uint32Array(count),
    projectionPitch: null,
  };
};

const updateSphereProjection = (sphere, pitch, landMask) => {
  const cosPitch = Math.cos(-pitch);
  const sinPitch = Math.sin(-pitch);
  const widthScale = landMask.width - 1;
  const heightScale = landMask.height - 1;

  for (let index = 0; index < sphere.count; index += 1) {
    const y = (sphere.sampleVY[index] * cosPitch) - (sphere.sampleVZ[index] * sinPitch);
    const z = (sphere.sampleVY[index] * sinPitch) + (sphere.sampleVZ[index] * cosPitch);
    const lon = Math.atan2(-z, sphere.sampleVX[index]);
    const lat = Math.asin(clamp(y, -1, 1));
    sphere.maskU[index] = ((lon + Math.PI) / TAU) * widthScale;
    sphere.maskRows[index] = Math.floor(((Math.PI / 2 - lat) / Math.PI) * heightScale) * landMask.width;
  }

  sphere.projectionPitch = pitch;
};

const renderMarkers = (ctx, center, radius, yaw, pitch, dpr, markers, homeMarkerColor) => {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  markers.forEach((marker) => {
    const [vectorX, vectorY, vectorZ] = marker.vector;
    const rotatedX = (vectorX * cosYaw) + (vectorZ * sinYaw);
    const rotatedY = (vectorY * cosPitch) - ((-vectorX * sinYaw + vectorZ * cosYaw) * sinPitch);
    const rotatedZ = (vectorY * sinPitch) + ((-vectorX * sinYaw + vectorZ * cosYaw) * cosPitch);
    if (rotatedZ <= 0) {
      return;
    }

    const x = center + rotatedX * radius;
    const y = center - rotatedY * radius;
    const weight = Number.isFinite(marker.count) ? marker.count : 1;
    const dot = marker.isHome
      ? Math.max(2.8, radius * 0.022)
      : Math.max(1.4, radius * (0.012 + Math.min(weight, 12) * 0.0016));
    const outline = Math.max(0.75, dpr * 0.55);

    if (marker.isHome) {
      ctx.beginPath();
      ctx.arc(x, y, dot * 1.8, 0, TAU);
      ctx.globalAlpha = 184 / 255;
      ctx.strokeStyle = homeMarkerColor;
      ctx.lineWidth = Math.max(1, dpr * 0.9);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.arc(x, y, dot, 0, TAU);
    ctx.fillStyle = marker.isHome ? homeMarkerColor : VISITOR_MARKER_COLOR;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, dot, 0, TAU);
    ctx.strokeStyle = marker.isHome ? "rgba(255, 255, 255, 0.78)" : "rgba(8, 12, 22, 0.38)";
    ctx.lineWidth = outline;
    ctx.stroke();
  });
};

export const setupInteractiveGlobe = (markers = []) => {
  const globe = document.querySelector("#hero-globe");
  if (!globe) {
    return;
  }
  const globeFrame = globe.closest(".hero-globe-frame");
  const globeWrap = globe.closest(".hero-globe-wrap");
  const lowerLayout = globe.closest(".lower-layout");
  const lowerMain = lowerLayout?.querySelector(".lower-main");
  if (!globeFrame || !globeWrap || !lowerLayout || !lowerMain) {
    return;
  }

  const safeMarkers = markers.filter(
    (marker) => Number.isFinite(marker?.lat) && Number.isFinite(marker?.lon),
  );
  const renderableMarkers = [...safeMarkers, { ...HOME_MARKER, isHome: true }].map((marker) => ({
    ...marker,
    vector: geoToVector(marker.lat, marker.lon),
  }));
  const ctx = globe.getContext("2d", { alpha: true });
  if (!ctx) {
    return;
  }

  const mobileLayoutQuery = window.matchMedia("(max-width: 700px)");
  const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let isAnimating = !reducedMotionQuery.matches;
  const colorTransitionProperties = ["border-top-color", "outline-color", "color"];
  let yaw = -0.4;
  let pitch = 0.05;
  let velocity = 0.005;
  let pointerId = null;
  let previousX = 0;
  let previousY = 0;
  let dpr = 1;
  let sphere = null;
  let landMask = null;
  let frameBuffer = null;
  let lineColor = "#d9dce1";
  let textColor = "#15191f";
  let accentColor = "#1E3765";
  let isZoomed = !mobileLayoutQuery.matches;
  let isInteracting = false;
  let isVisible = false;
  let settleTimer = null;
  let frameId = null;
  let resizeFrameId = null;
  let lastFrameTime = 0;
  let activeColorTransitions = 0;
  let isBootstrappingColors = true;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerMoved = false;
  const modes = ["earth", "wireframe", "points", "orbits"];
  let mode = "earth";
  let mathGeometry = null;
  let currentPhase = 0;

  const getZoomScale = () => {
    const raw = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--globe-zoom-scale"));
    const preferred = Number.isFinite(raw) && raw > 1 ? raw : 1.85;
    const frameRect = globeFrame.getBoundingClientRect();
    const layoutRect = lowerLayout.getBoundingClientRect();
    const frameSize = frameRect.width || 1;
    const reservedHeight = mobileLayoutQuery.matches
      ? Number.parseFloat(getComputedStyle(globeFrame).marginBottom) || 0
      : 0;
    const availableHeight = layoutRect.bottom - frameRect.top - reservedHeight;
    const mainRect = lowerMain.getBoundingClientRect();
    const sideRoom = Math.max(0, Math.min(
      frameRect.left - mainRect.right,
      window.innerWidth - frameRect.right,
    ));
    const availableWidth = mobileLayoutQuery.matches
      ? layoutRect.width
      : frameSize + sideRoom * 2;
    return fitGlobeScale(
      preferred,
      frameSize,
      availableHeight,
      availableWidth,
    );
  };

  const applyGlobeScale = (scale) => {
    const frameSize = globeWrap.clientWidth || globeFrame.clientWidth || 248;
    const offset = mobileLayoutQuery.matches && isZoomed
      ? Math.max(0, scale - 1) * frameSize
      : 0;
    globeWrap.style.setProperty("--globe-zoom-offset", `${offset}px`);
    globeWrap.classList.toggle("is-zoomed", isZoomed);
    globe.style.setProperty("--globe-scale", `${scale}`);
  };

  const getRenderDpr = () => {
    const nativeDpr = Math.max(1, window.devicePixelRatio || 1);
    const idleCap = isZoomed
      ? (coarsePointerQuery.matches ? 2.4 : 3.2)
      : (coarsePointerQuery.matches ? 1.6 : 2.2);
    const activeCap = isZoomed
      ? (coarsePointerQuery.matches ? 1.6 : 2.2)
      : (coarsePointerQuery.matches ? 1.35 : 1.7);
    return Math.min(nativeDpr, isAnimating || isInteracting ? activeCap : idleCap);
  };

  const updateSize = (scale = 1) => {
    dpr = getRenderDpr();
    const baseSize = globeFrame.clientWidth || 248;
    const cssSize = Math.max(140, Math.round(baseSize * scale));
    const pixelSize = Math.round(cssSize * dpr);
    if (sphere?.size === pixelSize && frameBuffer) {
      return;
    }

    globe.width = pixelSize;
    globe.height = pixelSize;
    sphere = buildSphereSamples(pixelSize);
    frameBuffer = ctx.createImageData(pixelSize, pixelSize);
    if (landMask) {
      updateSphereProjection(sphere, pitch, landMask);
    }
  };

  const updateColors = () => {
    // Read interpolated CSS colors so the canvas follows interrupted theme transitions.
    const styles = getComputedStyle(globe);
    lineColor = styles.borderTopColor;
    textColor = styles.outlineColor;
    accentColor = styles.color;
  };

  const draw = () => {
    if (!sphere) {
      return;
    }

    yaw = ((yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    const { size, center, radius, count, pixelIndices, maskU, maskRows } = sphere;
    ctx.clearRect(0, 0, size, size);

    if (mode !== "earth") {
      renderMathematicalGlobe(ctx, sphere, yaw, pitch, mode, mathGeometry, textColor, currentPhase, dpr);
      return;
    }

    if (landMask && frameBuffer) {
      if (sphere.projectionPitch !== pitch) {
        updateSphereProjection(sphere, pitch, landMask);
      }

      const pixels = frameBuffer.data;
      const widthScale = landMask.width - 1;
      const yawOffset = (-yaw / TAU) * widthScale;
      for (let index = 0; index < count; index += 1) {
        let u = maskU[index] + yawOffset;
        if (u < 0) {
          u += widthScale;
        } else if (u > widthScale) {
          u -= widthScale;
        }

        const isLand = landMask.data[maskRows[index] + Math.floor(u)] > 120;
        const pixelIndex = pixelIndices[index] * 4;
        pixels[pixelIndex] = isLand ? 220 : 25;
        pixels[pixelIndex + 1] = isLand ? 220 : 25;
        pixels[pixelIndex + 2] = isLand ? 220 : 25;
        pixels[pixelIndex + 3] = isLand ? 214 : 170;
      }

      ctx.putImageData(frameBuffer, 0, 0);
      renderMarkers(ctx, center, radius, yaw, pitch, dpr, renderableMarkers, accentColor);
    } else {
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, TAU);
      ctx.globalAlpha = 0.47;
      ctx.fillStyle = lineColor;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.arc(center, center, radius * 0.99, 0, TAU);
    ctx.globalAlpha = 0.33;
    ctx.strokeStyle = textColor;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const refreshRenderScale = (scale) => {
    updateSize(scale);
    draw();
  };

  const scheduleIdleQuality = (scale, delay = 140) => {
    if (settleTimer) {
      window.clearTimeout(settleTimer);
    }
    settleTimer = window.setTimeout(() => {
      isInteracting = false;
      refreshRenderScale(scale);
      settleTimer = null;
    }, delay);
  };

  const stopAnimation = () => {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
    lastFrameTime = 0;
  };

  const scheduleFrame = () => {
    if (!isAnimating || !isVisible || document.hidden || frameId !== null) {
      return;
    }
    frameId = window.requestAnimationFrame(onFrame);
  };

  const onFrame = (timestamp) => {
    frameId = null;
    if (!isAnimating || !isVisible || document.hidden) {
      lastFrameTime = 0;
      return;
    }

    const elapsed = lastFrameTime ? timestamp - lastFrameTime : 0;
    const steps = Math.min(elapsed / BASE_FRAME_MS, MAX_FRAME_STEPS);
    lastFrameTime = timestamp;
    currentPhase += steps * BASE_FRAME_MS / 1000;
    if (pointerId === null) {
      yaw += velocity * steps;
      velocity *= 0.986 ** steps;
      const minimumVelocity = mode === "earth" ? 0.00035 : 0.0008;
      if (Math.abs(velocity) < minimumVelocity) velocity = minimumVelocity;
    }
    if (isBootstrappingColors || activeColorTransitions) {
      updateColors();
    }
    draw();
    scheduleFrame();
  };

  const onPointerDown = (event) => {
    if (event.button !== 0 || pointerId !== null) return;
    // Clear keyboard focus before the browser applies pointer focus without a ring.
    globe.blur();
    pointerId = event.pointerId;
    previousX = event.clientX;
    previousY = event.clientY;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pointerMoved = false;
    velocity = 0;
    isInteracting = true;
    if (settleTimer) {
      window.clearTimeout(settleTimer);
      settleTimer = null;
    }
    scheduleFrame();
    refreshRenderScale(isZoomed ? getZoomScale() : 1);
    document.body.classList.add("is-globe-dragging");
    globe.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (event.pointerId !== pointerId) {
      return;
    }
    event.preventDefault();

    const deltaX = event.clientX - previousX;
    const deltaY = event.clientY - previousY;
    if (!pointerMoved) {
      const movedX = event.clientX - pointerStartX;
      const movedY = event.clientY - pointerStartY;
      pointerMoved = (movedX * movedX) + (movedY * movedY) > 49;
    }
    previousX = event.clientX;
    previousY = event.clientY;
    const dragScale = event.pointerType === "touch" ? 1.45 : 1;
    yaw += deltaX * 0.012 * dragScale;
    pitch = clamp(pitch + deltaY * 0.008 * dragScale, -1.3, 1.3);
    velocity = deltaX * 0.00075 * dragScale;
    if (!isAnimating) draw();
  };

  const onPointerUp = (event) => {
    if (event.pointerId !== pointerId) {
      return;
    }
    pointerId = null;
    document.body.classList.remove("is-globe-dragging");
    if (globe.hasPointerCapture(event.pointerId)) globe.releasePointerCapture(event.pointerId);
    if (event.type === "pointerup" && !pointerMoved && mobileLayoutQuery.matches) {
      isZoomed = !isZoomed;
      const nextScale = isZoomed ? getZoomScale() : 1;
      applyGlobeScale(nextScale);
      refreshRenderScale(nextScale);
      scheduleIdleQuality(nextScale, 360);
      return;
    }
    scheduleIdleQuality(isZoomed ? getZoomScale() : 1);
  };

  const selectMode = (nextMode) => {
    mode = nextMode;
    if (mode !== "earth") mathGeometry ??= createMathGeometry();
    globe.setAttribute("aria-label", `${mode} globe. Double-click or press M to change form; arrow keys rotate; Escape returns to Earth.`);
    draw();
    scheduleFrame();
  };
  globe.tabIndex = 0;
  selectMode("earth");

  const start = () => {
    const initialScale = isZoomed ? getZoomScale() : 1;
    applyGlobeScale(initialScale);
    updateColors();
    updateSize(initialScale);
    draw();

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => {
        isVisible = Boolean(entry?.isIntersecting);
        if (isVisible) {
          scheduleFrame();
        } else {
          stopAnimation();
        }
      }).observe(globe);
    } else {
      isVisible = true;
      scheduleFrame();
    }
  };

  loadLandMask().then((mask) => {
    landMask = mask;
    start();
  });

  window.addEventListener("resize", () => {
    if (resizeFrameId !== null) {
      return;
    }
    resizeFrameId = window.requestAnimationFrame(() => {
      resizeFrameId = null;
      if (!mobileLayoutQuery.matches) {
        isZoomed = true;
      }
      const nextScale = isZoomed ? getZoomScale() : 1;
      applyGlobeScale(nextScale);
      // Responsive layout changes must fit immediately; only tap-to-zoom should animate size.
      for (const animation of globe.getAnimations()) {
        if (["width", "height"].includes(animation.transitionProperty)) animation.finish();
      }
      refreshRenderScale(nextScale);
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAnimation();
    } else {
      scheduleFrame();
    }
  });
  reducedMotionQuery.addEventListener("change", () => {
    isAnimating = !reducedMotionQuery.matches;
    if (isAnimating) scheduleFrame();
    else stopAnimation();
    refreshRenderScale(isZoomed ? getZoomScale() : 1);
  });
  new MutationObserver(() => {
    updateColors();
    if (!isAnimating) {
      draw();
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-color-scheme"],
  });
  globe.addEventListener("transitionrun", (event) => {
    if (colorTransitionProperties.includes(event.propertyName)) {
      activeColorTransitions += 1;
      scheduleFrame();
    }
  });
  const finishColorTransition = (event) => {
    if (!colorTransitionProperties.includes(event.propertyName)) {
      return;
    }
    activeColorTransitions = Math.max(0, activeColorTransitions - 1);
    updateColors();
    if (!isAnimating) {
      draw();
    }
  };
  globe.addEventListener("transitionend", finishColorTransition);
  globe.addEventListener("transitioncancel", finishColorTransition);
  window.setTimeout(() => {
    isBootstrappingColors = false;
    updateColors();
    if (!isAnimating) {
      draw();
    }
  }, Number.parseFloat(getComputedStyle(globe).getPropertyValue("--theme-duration")));
  globe.addEventListener("pointerdown", onPointerDown);
  globe.addEventListener("pointermove", onPointerMove);
  globe.addEventListener("pointerup", onPointerUp);
  globe.addEventListener("pointercancel", onPointerUp);
  globe.addEventListener("lostpointercapture", onPointerUp);
  globe.addEventListener("dragstart", (event) => event.preventDefault());
  globe.addEventListener("dblclick", (event) => {
    event.preventDefault();
    selectMode(modes[(modes.indexOf(mode) + 1) % modes.length]);
  });
  globe.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === "m" || event.key === "Escape") {
      event.preventDefault();
      if (!event.repeat) selectMode(event.key === "Escape" ? "earth" : modes[(modes.indexOf(mode) + 1) % modes.length]);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    velocity = 0;
    if (event.key === "ArrowLeft") yaw -= 0.15;
    if (event.key === "ArrowRight") yaw += 0.15;
    if (event.key === "ArrowUp") pitch -= 0.12;
    if (event.key === "ArrowDown") pitch += 0.12;
    pitch = clamp(pitch, -1.3, 1.3);
    draw();
  });
};
