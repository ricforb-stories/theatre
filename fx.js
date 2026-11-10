/* Weather, atmosphere and "look" effects for the table screen.
   Used by the projector (full screen) and by the control window's monitors (small previews).

   const effects = TableFx(canvasElement);
   effects.set(["rain", "night"], "medium", sceneElement);
     - moving things are drawn on the canvas (laid over the picture);
     - look effects also change the picture itself through a CSS filter on sceneElement
       (the element holding the picture and the people, not the canvas). The filter is
       blended frame by frame, so it fades in and out together with the overlays;
     - level is "light" | "medium" | "heavy".
   effects.shake(sceneElement) jolts the scene once.
   TableFx(canvas, { onLightning: function (nearness) {} }) hears each lightning flash.

   Sizes and counts scale with the canvas, so a small preview looks like a small projector. */
(function () {
  "use strict";

  const REFERENCE_AREA = 1920 * 1080;
  const LEVELS = { light: 0.5, medium: 1, heavy: 1.8 };
  const OVERLAY_LEVELS = { light: 0.6, medium: 1, heavy: 1.4 };
  const FADE_SECONDS = 1.2;

  // Moving things per full-HD screen at medium. Underwater's moving things are its bubbles.
  const COUNTS = {
    rain: 300,
    storm: 460,
    snow: 170,
    embers: 120,
    ash: 170,
    dust: 130,
    mist: 1,
    fireflies: 45,
    leaves: 55,
    crows: 7,
    bats: 12,
    underwater: 70,
    rail: 60,
    airship: 40,
  };

  // What each look effect does to the picture underneath, blended by how far it has faded in.
  const PICTURE_CHANGES = {
    underwater: { saturate: 0.45, brightness: 0.85 },
    recording: { sepia: 0.6, grayscale: 0.35, contrast: 1.15, brightness: 0.95 },
    night: { brightness: 0.55, saturate: 0.55 },
    gray: { grayscale: 0.9, brightness: 0.85, contrast: 1.05 },
    blood: { sepia: 0.35, saturate: 1.5, hue: -15, brightness: 0.9 },
    dream: { saturate: 1.25, brightness: 1.08, blur: 1.4 },
  };

  const OVERLAY_ONLY = { darkness: true };
  const MOODS = ["night", "gray", "blood", "dream"];

  // The underwater sway: cheap for the browser, unlike redrawing a ripple every frame.
  (function addSwayStyle() {
    const style = document.createElement("style");
    style.textContent = "@keyframes tablefx-sway {"
      + " 0% { transform: scale(1.04) translate(0, 0); }"
      + " 50% { transform: scale(1.045) translate(-0.7%, 0.5%); }"
      + " 100% { transform: scale(1.04) translate(0, 0); } }"
      + " .tablefx-sway { animation: tablefx-sway 9s ease-in-out infinite; will-change: transform; }";
    document.head.appendChild(style);
  })();

  function randomBetween(low, high) {
    return low + Math.random() * (high - low);
  }

  function makeGlow(colour, size, core) {
    const sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
    const context = sprite.getContext("2d");
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);

    // An optional hot centre keeps a spark readable on warm, bright pictures.
    if (core) {
      gradient.addColorStop(0, core);
      gradient.addColorStop(0.22, colour);
    } else {
      gradient.addColorStop(0, colour);
    }

    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return sprite;
  }

  function makeNoise(size) {
    const tile = document.createElement("canvas");
    tile.width = size;
    tile.height = size;
    const context = tile.getContext("2d");
    const pixels = context.createImageData(size, size);

    for (let index = 0; index < pixels.data.length; index += 4) {
      const value = Math.random() * 255;
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }

    context.putImageData(pixels, 0, 0);
    return tile;
  }

  // Smooth cloudy noise that repeats seamlessly left to right (for fog and water light).
  function cloudNoise(width, height, cellsAcross, octaves, wrapDown) {
    const values = new Float32Array(width * height);
    let amplitude = 1;
    let total = 0;

    for (let octave = 0; octave < octaves; octave += 1) {
      const cellsX = cellsAcross * Math.pow(2, octave);
      const cellsY = Math.max(2, Math.round(cellsX * height / width));
      const grid = [];

      // With wrapDown the last row repeats the first, so the pattern also tiles top to bottom.
      for (let gridY = 0; gridY <= cellsY; gridY += 1) {

        if (wrapDown && gridY === cellsY) {
          grid.push(grid[0]);
          continue;
        }

        const row = [];

        for (let gridX = 0; gridX < cellsX; gridX += 1) {
          row.push(Math.random());
        }

        grid.push(row);
      }

      for (let pixelY = 0; pixelY < height; pixelY += 1) {
        const cellY = pixelY / height * cellsY;
        const rowIndex = Math.floor(cellY);
        const blendY = cellY - rowIndex;
        const smoothY = blendY * blendY * (3 - 2 * blendY);

        for (let pixelX = 0; pixelX < width; pixelX += 1) {
          const cellX = pixelX / width * cellsX;
          const columnIndex = Math.floor(cellX);
          const blendX = cellX - columnIndex;
          const smoothX = blendX * blendX * (3 - 2 * blendX);
          const nextColumn = (columnIndex + 1) % cellsX;
          const top = grid[rowIndex][columnIndex] * (1 - smoothX) + grid[rowIndex][nextColumn] * smoothX;
          const bottom = grid[rowIndex + 1][columnIndex] * (1 - smoothX) + grid[rowIndex + 1][nextColumn] * smoothX;
          values[pixelY * width + pixelX] += (top * (1 - smoothY) + bottom * smoothY) * amplitude;
        }
      }

      total += amplitude;
      amplitude *= 0.5;
    }

    for (let index = 0; index < values.length; index += 1) {
      values[index] /= total;
    }

    return values;
  }

  function makeFogTexture() {
    const width = 512;
    const height = 256;
    const values = cloudNoise(width, height, 4, 5);
    const texture = document.createElement("canvas");
    texture.width = width;
    texture.height = height;
    const context = texture.getContext("2d");
    const pixels = context.createImageData(width, height);

    for (let pixelY = 0; pixelY < height; pixelY += 1) {
      // thicker low down, thinning out towards the top
      const fromTop = pixelY / height;
      const heightFade = Math.min(1, Math.max(0, (fromTop - 0.05) / 0.6));

      for (let pixelX = 0; pixelX < width; pixelX += 1) {
        const index = (pixelY * width + pixelX) * 4;
        const cloud = Math.max(0, values[pixelY * width + pixelX] - 0.32) / 0.68;
        pixels.data[index] = 215;
        pixels.data[index + 1] = 210;
        pixels.data[index + 2] = 215;
        pixels.data[index + 3] = Math.round(255 * Math.pow(cloud, 1.3) * heightFade);
      }
    }

    context.putImageData(pixels, 0, 0);
    return texture;
  }

  function makeCausticTexture() {
    const size = 256;
    const values = cloudNoise(size, size, 4, 3, true);
    const texture = document.createElement("canvas");
    texture.width = size;
    texture.height = size;
    const context = texture.getContext("2d");
    const pixels = context.createImageData(size, size);

    for (let index = 0; index < values.length; index += 1) {
      // bright thin ridges where the noise crosses the middle: the look of light through waves
      const ridge = Math.pow(1 - Math.abs(values[index] * 2 - 1), 28);
      pixels.data[index * 4] = 170;
      pixels.data[index * 4 + 1] = 235;
      pixels.data[index * 4 + 2] = 240;
      pixels.data[index * 4 + 3] = Math.round(255 * ridge);
    }

    context.putImageData(pixels, 0, 0);
    return texture;
  }

  const SPRITES = {
    ember: makeGlow("rgba(255, 140, 40, 0.85)", 64, "rgba(255, 245, 210, 1)"),
    snow: makeGlow("rgba(250, 250, 255, 0.55)", 64, "rgba(255, 255, 255, 1)"),
    dust: makeGlow("rgba(255, 220, 160, 0.45)", 32, "rgba(255, 248, 225, 1)"),
    firefly: makeGlow("rgba(190, 255, 120, 0.6)", 64, "rgba(245, 255, 210, 1)"),
    noise: makeNoise(160),
    fog: makeFogTexture(),
    caustics: makeCausticTexture(),
  };

  function spawnFlyer(kind, width, height, scale, anywhere) {
    const fromLeft = Math.random() < 0.6;
    const size = (kind === "bats" ? randomBetween(18, 34) : randomBetween(32, 58)) * scale;
    return {
      x: anywhere ? Math.random() * width : (fromLeft ? -size * 3 : width + size * 3),
      y: randomBetween(height * 0.05, height * 0.6),
      direction: fromLeft ? 1 : -1,
      speed: (kind === "bats" ? randomBetween(160, 280) : randomBetween(110, 200)) * scale,
      size: size,
      flap: Math.random() * Math.PI * 2,
      flapSpeed: kind === "bats" ? randomBetween(16, 22) : randomBetween(7, 10),
      wobble: Math.random() * Math.PI * 2,
    };
  }

  function spawn(kind, width, height, scale, anywhere) {
    const startY = anywhere ? Math.random() * height : -20 * scale;

    if (kind === "rain" || kind === "storm") {
      // depth: 0.3 far away (thin, slow, faint) to 1 close (thick, fast, bright)
      const depth = Math.pow(Math.random(), 0.7) * 0.7 + 0.3;
      return {
        x: Math.random() * width * 1.2 - width * 0.1,
        y: anywhere ? Math.random() * height : -randomBetween(0, height * 0.3),
        depth: depth,
        speed: randomBetween(1100, 1500) * scale * (0.55 + depth * 0.6),
        length: randomBetween(18, 30) * scale * (0.5 + depth * 0.9),
        alpha: randomBetween(0.25, 0.45) * (0.45 + depth * 0.75),
        ground: randomBetween(height * 0.7, height * 1.02),
      };
    }

    if (kind === "snow") {
      const depth = Math.pow(Math.random(), 1.4) * 0.8 + 0.2;
      return {
        x: Math.random() * width,
        y: startY,
        depth: depth,
        speed: randomBetween(35, 70) * scale * (0.4 + depth),
        radius: randomBetween(1.6, 3.2) * scale * (0.5 + depth * 1.8),
        sway: randomBetween(0.4, 1.4),
        phase: Math.random() * Math.PI * 2,
        alpha: randomBetween(0.6, 0.95) * (0.5 + depth * 0.5),
      };
    }

    if (kind === "ash") {
      return {
        x: Math.random() * width,
        y: startY,
        speed: randomBetween(35, 90) * scale,
        radius: randomBetween(4, 10) * scale,
        sway: randomBetween(0.3, 1),
        phase: Math.random() * Math.PI * 2,
        spin: Math.random() * Math.PI,
        tumble: randomBetween(0.8, 2.4),
        shade: randomBetween(100, 175),
        glowing: Math.random() < 0.18,
        alpha: randomBetween(0.6, 0.95),
      };
    }

    if (kind === "leaves") {
      const palette = [[150, 70, 25], [175, 105, 35], [120, 45, 20], [190, 140, 60], [95, 70, 30]];
      return {
        x: Math.random() * width,
        y: startY,
        speed: randomBetween(45, 100) * scale,
        size: randomBetween(12, 24) * scale,
        sway: randomBetween(0.6, 1.4),
        phase: Math.random() * Math.PI * 2,
        spin: Math.random() * Math.PI * 2,
        spinSpeed: randomBetween(-2.5, 2.5),
        colour: palette[Math.floor(Math.random() * palette.length)],
      };
    }

    if (kind === "embers") {
      return {
        x: Math.random() * width,
        y: anywhere ? Math.random() * height : height + 10 * scale,
        speed: randomBetween(50, 140) * scale,
        size: randomBetween(10, 24) * scale,
        sway: randomBetween(0.6, 1.8),
        phase: Math.random() * Math.PI * 2,
        life: randomBetween(0.5, 1),
        driftX: 0,
      };
    }

    if (kind === "underwater") {
      return {
        x: Math.random() * width,
        y: anywhere ? Math.random() * height : height + 10 * scale,
        speed: randomBetween(50, 140) * scale,
        radius: randomBetween(2, 9) * scale,
        sway: randomBetween(1, 2.5),
        phase: Math.random() * Math.PI * 2,
      };
    }

    if (kind === "dust" || kind === "fireflies") {
      const drift = kind === "fireflies" ? 30 : 12;
      return {
        x: Math.random() * width,
        y: kind === "fireflies" ? randomBetween(height * 0.25, height) : Math.random() * height,
        driftX: randomBetween(-drift, drift) * scale,
        driftY: randomBetween(-drift * 0.7, drift * 0.7) * scale,
        size: (kind === "fireflies" ? randomBetween(10, 20) : randomBetween(7, 16)) * scale,
        phase: Math.random() * Math.PI * 2,
        blink: randomBetween(0.6, 1.6),
        turn: Math.random() * Math.PI * 2,
      };
    }

    if (kind === "crows" || kind === "bats") {
      return spawnFlyer(kind, width, height, scale, anywhere);
    }

    if (kind === "rail" || kind === "airship") {
      // streaks rushing past, as if seen from a fast-moving rail car or deck
      return {
        x: anywhere ? Math.random() * width : width + randomBetween(0, width * 0.3),
        y: Math.random() * height,
        speed: randomBetween(1400, 2600) * scale,
        length: randomBetween(60, 220) * scale,
        alpha: kind === "airship" ? randomBetween(0.22, 0.45) : randomBetween(0.18, 0.42),
      };
    }

    // mist: one entry that only keeps the drift offsets of its two fog sheets
    return { near: Math.random() * width, far: Math.random() * width };
  }

  window.TableFx = function (canvas, options) {
    const settings = options || {};
    const context = canvas.getContext("2d");
    const layers = {};
    let level = "medium";
    let running = false;
    let lastTime = 0;
    let flash = 0;
    let bolt = null;
    let nextFlash = randomBetween(4, 9);
    let scene = null;
    let clock = 0;
    let flicker = 0;
    let rollBar = -1;
    let splashes = [];

    function size() {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      return { width: width, height: height, scale: height / 1080 };
    }

    function overlayStrength() {
      return OVERLAY_LEVELS[level] || 1;
    }

    function targetCount(kind, area) {
      const base = COUNTS[kind] || 0;

      if (kind === "mist") {
        return 1;
      }

      return Math.round(base * (LEVELS[level] || 1) * Math.max(area / REFERENCE_AREA, 0.04));
    }

    // ---------- moving things ----------

    function addSplash(particle, box) {

      if (particle.depth < 0.6 || splashes.length > 120) {
        return;
      }

      splashes.push({
        x: particle.x,
        y: particle.ground,
        age: 0,
        size: randomBetween(4, 9) * box.scale * particle.depth,
      });
    }

    function update(kind, layer, seconds, box) {
      const wanted = layer.on ? targetCount(kind, box.width * box.height) : layer.particles.length;

      // A new effect starts spread over the whole screen; later top-ups come in from the edge.
      while (layer.particles.length < wanted) {
        layer.particles.push(spawn(kind, box.width, box.height, box.scale, layer.fresh));
      }

      layer.fresh = false;

      if (layer.particles.length > wanted) {
        layer.particles.length = wanted;
      }

      const wind = kind === "storm" ? 0.32 : 0.16;
      layer.particles.forEach(function (particle, index) {
        let gone = false;

        if (kind === "rain" || kind === "storm") {
          particle.y += particle.speed * seconds;
          particle.x += particle.speed * wind * seconds;

          if (particle.y >= particle.ground) {
            addSplash(particle, box);
            gone = true;
          }
        } else if (kind === "snow" || kind === "ash") {
          particle.phase += seconds * particle.sway;
          particle.y += particle.speed * seconds;
          particle.x += Math.sin(particle.phase) * 18 * box.scale * seconds;
          gone = particle.y > box.height + 20;
        } else if (kind === "leaves") {
          particle.phase += seconds * particle.sway;
          particle.spin += particle.spinSpeed * seconds;
          particle.y += particle.speed * seconds;
          particle.x += (Math.sin(particle.phase) * 60 + 25) * box.scale * seconds;
          gone = particle.y > box.height + 20 || particle.x > box.width + 40;
        } else if (kind === "embers") {
          particle.phase += seconds * particle.sway * 2;
          particle.driftX = Math.sin(particle.phase) * 25 * box.scale;
          particle.y -= particle.speed * seconds;
          particle.x += particle.driftX * seconds;
          particle.life -= seconds * 0.12;
          gone = particle.y < -20 || particle.life <= 0;
        } else if (kind === "underwater") {
          particle.phase += seconds * particle.sway;
          particle.y -= particle.speed * seconds;
          particle.x += Math.sin(particle.phase) * 20 * box.scale * seconds;
          gone = particle.y < -20;
        } else if (kind === "dust" || kind === "fireflies") {
          particle.phase += seconds * (kind === "fireflies" ? particle.blink * 2 : 0.7);

          if (kind === "fireflies") {
            particle.turn += randomBetween(-1.5, 1.5) * seconds;
            particle.x += Math.cos(particle.turn) * 30 * box.scale * seconds;
            particle.y += Math.sin(particle.turn) * 20 * box.scale * seconds;
          } else {
            particle.x += particle.driftX * seconds;
            particle.y += particle.driftY * seconds;
          }

          gone = particle.x < -20 || particle.x > box.width + 20 || particle.y < -20 || particle.y > box.height + 20;
        } else if (kind === "crows" || kind === "bats") {
          particle.flap += seconds * particle.flapSpeed;
          particle.wobble += seconds * (kind === "bats" ? 5 : 1.2);
          particle.x += particle.direction * particle.speed * seconds;
          particle.y += Math.sin(particle.wobble) * (kind === "bats" ? 60 : 15) * box.scale * seconds;
          gone = particle.x < -particle.size * 4 || particle.x > box.width + particle.size * 4;
        } else if (kind === "rail" || kind === "airship") {
          particle.x -= particle.speed * seconds;
          gone = particle.x + particle.length < 0;
        } else if (kind === "mist") {
          particle.near += 28 * box.scale * seconds;
          particle.far += 12 * box.scale * seconds;
        }

        if (gone) {
          layer.particles[index] = spawn(kind, box.width, box.height, box.scale, false);
        }
      });
    }

    function drawFlyer(kind, particle) {
      const wingLift = Math.sin(particle.flap) * particle.size * (kind === "bats" ? 0.7 : 0.55);
      const span = particle.size;
      context.save();
      context.translate(particle.x, particle.y);
      context.scale(particle.direction, 1);
      context.fillStyle = "rgba(14, 9, 9, 0.9)";
      context.beginPath();

      if (kind === "bats") {
        // jagged leathery wings
        context.moveTo(0, 0);
        context.lineTo(-span * 0.5, -wingLift * 0.6 - span * 0.1);
        context.lineTo(-span, -wingLift);
        context.lineTo(-span * 0.75, -wingLift * 0.3 + span * 0.12);
        context.lineTo(-span * 0.45, span * 0.12);
        context.lineTo(-span * 0.2, span * 0.05);
        context.lineTo(0, span * 0.2);
        context.lineTo(span * 0.2, span * 0.05);
        context.lineTo(span * 0.45, span * 0.12);
        context.lineTo(span * 0.75, -wingLift * 0.3 + span * 0.12);
        context.lineTo(span, -wingLift);
        context.lineTo(span * 0.5, -wingLift * 0.6 - span * 0.1);
        context.closePath();
      } else {
        // a crow: curved wings and a small body with a head
        context.moveTo(-span, -wingLift);
        context.quadraticCurveTo(-span * 0.45, -wingLift * 0.2 - span * 0.12, 0, 0);
        context.quadraticCurveTo(span * 0.45, -wingLift * 0.2 - span * 0.12, span, -wingLift);
        context.quadraticCurveTo(span * 0.4, span * 0.05, 0, span * 0.14);
        context.quadraticCurveTo(-span * 0.4, span * 0.05, -span, -wingLift);
        context.closePath();
        context.fill();
        context.beginPath();
        context.ellipse(span * 0.05, span * 0.05, span * 0.32, span * 0.1, 0, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.arc(span * 0.36, 0, span * 0.08, 0, Math.PI * 2);
      }

      context.fill();
      context.restore();
    }

    function drawFogSheet(offset, box, alpha, heightShare) {
      const sheetWidth = box.width * 1.6;
      const sheetHeight = box.height * heightShare;
      const top = box.height - sheetHeight;
      const start = -((offset % sheetWidth) + sheetWidth) % sheetWidth;
      context.globalAlpha = alpha;

      for (let left = start; left < box.width; left += sheetWidth) {
        context.drawImage(SPRITES.fog, left, top, sheetWidth, sheetHeight);
      }

      context.globalAlpha = 1;
    }

    function draw(kind, layer, box) {
      const strength = layer.alpha;

      if (kind === "rain" || kind === "storm") {
        const wind = kind === "storm" ? 0.32 : 0.16;
        // a faint cold wash, as rain dims everything
        context.fillStyle = "rgba(30, 40, 60, " + (0.12 * strength * Math.min(LEVELS[level] || 1, 1.4)) + ")";
        context.fillRect(0, 0, box.width, box.height);
        context.lineCap = "round";
        layer.particles.forEach(function (particle) {
          context.lineWidth = Math.max(0.8, (0.7 + particle.depth * 1.6) * box.scale);
          context.strokeStyle = "rgba(210, 220, 240, " + (particle.alpha * strength) + ")";
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(particle.x - particle.length * wind, particle.y - particle.length);
          context.stroke();
        });
        return;
      }

      if (kind === "snow") {
        layer.particles.forEach(function (particle) {
          context.globalAlpha = particle.alpha * strength;

          // close flakes are soft and out of focus; far ones are small sharp dots
          if (particle.depth > 0.65) {
            const glow = particle.radius * 2.4;
            context.drawImage(SPRITES.snow, particle.x - glow, particle.y - glow, glow * 2, glow * 2);
          } else {
            context.fillStyle = "rgb(245, 245, 250)";
            context.beginPath();
            context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            context.fill();
          }
        });
        context.globalAlpha = 1;
        return;
      }

      if (kind === "ash") {
        // a dull grey veil, as if the air itself were thick with it
        context.fillStyle = "rgba(70, 64, 60, " + (0.16 * (LEVELS[level] || 1) * strength) + ")";
        context.fillRect(0, 0, box.width, box.height);
        layer.particles.forEach(function (particle) {
          // A flake tumbling in the air: flattens and widens as it turns.
          const turn = Math.abs(Math.cos(particle.phase * particle.tumble));
          const shade = Math.round(particle.shade);
          context.save();
          context.translate(particle.x, particle.y);
          context.rotate(particle.spin + particle.phase * 0.6);
          context.globalAlpha = particle.alpha * strength;

          if (particle.glowing) {
            context.drawImage(SPRITES.ember, -particle.radius * 1.6, -particle.radius * 1.6, particle.radius * 3.2, particle.radius * 3.2);
          }

          context.fillStyle = "rgb(" + shade + ", " + (shade - 8) + ", " + (shade - 14) + ")";
          context.beginPath();
          context.ellipse(0, 0, particle.radius, particle.radius * (0.25 + 0.55 * turn), 0, 0, Math.PI * 2);
          context.fill();
          context.restore();
        });
        context.globalAlpha = 1;
        return;
      }

      if (kind === "leaves") {
        layer.particles.forEach(function (particle) {
          const turn = Math.abs(Math.cos(particle.spin));
          const colour = particle.colour;
          context.save();
          context.translate(particle.x, particle.y);
          context.rotate(particle.spin * 0.5);
          context.globalAlpha = 0.92 * strength;
          context.fillStyle = "rgb(" + colour[0] + ", " + colour[1] + ", " + colour[2] + ")";
          context.beginPath();
          context.ellipse(0, 0, particle.size, particle.size * (0.2 + 0.4 * turn), 0, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = "rgba(60, 30, 10, 0.7)";
          context.lineWidth = Math.max(0.6, particle.size * 0.08);
          context.beginPath();
          context.moveTo(-particle.size, 0);
          context.lineTo(particle.size * 1.2, 0);
          context.stroke();
          context.restore();
        });
        context.globalAlpha = 1;
        return;
      }

      if (kind === "embers") {
        // a warm glow rising from below, as if a fire burns out of sight
        const heat = context.createLinearGradient(0, box.height, 0, box.height * 0.55);
        heat.addColorStop(0, "rgba(255, 110, 30, " + (0.18 * strength) + ")");
        heat.addColorStop(1, "rgba(255, 110, 30, 0)");
        context.fillStyle = heat;
        context.fillRect(0, box.height * 0.55, box.width, box.height * 0.45);
        context.globalCompositeOperation = "lighter";
        context.lineCap = "round";
        layer.particles.forEach(function (particle) {
          const flickerAmount = 0.7 + 0.3 * Math.sin(particle.phase * 3);
          const brightness = Math.max(0, Math.min(1, (0.45 + particle.life) * flickerAmount * strength));
          context.globalAlpha = brightness;
          context.drawImage(SPRITES.ember, particle.x - particle.size, particle.y - particle.size, particle.size * 2, particle.size * 2);
          // a short glowing streak behind it
          context.strokeStyle = "rgba(255, 170, 70, 0.55)";
          context.lineWidth = Math.max(1, particle.size * 0.14);
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(particle.x - particle.driftX * 0.12, particle.y + particle.speed * 0.07);
          context.stroke();
          context.fillStyle = "rgb(255, 236, 190)";
          context.beginPath();
          context.arc(particle.x, particle.y, Math.max(1.4, particle.size * 0.16), 0, Math.PI * 2);
          context.fill();
        });
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        return;
      }

      if (kind === "dust" || kind === "fireflies") {
        const sprite = kind === "fireflies" ? SPRITES.firefly : SPRITES.dust;
        const coreColour = kind === "fireflies" ? "rgb(245, 255, 200)" : "rgb(255, 244, 220)";
        context.globalCompositeOperation = "lighter";
        layer.particles.forEach(function (particle) {
          const pulse = kind === "fireflies"
            ? Math.max(0, Math.sin(particle.phase)) * 0.95
            : 0.55 + 0.4 * Math.sin(particle.phase);
          context.globalAlpha = pulse * strength;
          context.drawImage(sprite, particle.x - particle.size, particle.y - particle.size, particle.size * 2, particle.size * 2);
          context.fillStyle = coreColour;
          context.beginPath();
          context.arc(particle.x, particle.y, Math.max(1, particle.size * 0.12), 0, Math.PI * 2);
          context.fill();
        });
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        return;
      }

      if (kind === "crows" || kind === "bats") {
        context.globalAlpha = strength;
        layer.particles.forEach(function (particle) {
          drawFlyer(kind, particle);
        });
        context.globalAlpha = 1;
        return;
      }

      if (kind === "underwater") {
        const tint = context.createLinearGradient(0, 0, 0, box.height);
        tint.addColorStop(0, "rgba(30, 140, 150, " + Math.min(0.6, 0.36 * overlayStrength() * strength) + ")");
        tint.addColorStop(1, "rgba(4, 40, 62, " + Math.min(0.8, 0.58 * overlayStrength() * strength) + ")");
        context.fillStyle = tint;
        context.fillRect(0, 0, box.width, box.height);
        context.globalCompositeOperation = "lighter";
        // light through waves, drifting across in two sheets
        const tile = box.height * 0.55;
        context.globalAlpha = 0.13 * strength;

        for (let sheet = 0; sheet < 2; sheet += 1) {
          const shiftX = ((clock * (sheet ? -14 : 9) * box.scale) % tile + tile) % tile;
          const shiftY = ((clock * (sheet ? 6 : -4) * box.scale) % tile + tile) % tile;

          for (let left = -shiftX - tile; left < box.width; left += tile) {

            for (let top = -shiftY - tile; top < box.height * 0.85; top += tile) {
              context.drawImage(SPRITES.caustics, left, top, tile, tile);
            }
          }
        }

        context.globalAlpha = 1;

        // shafts of light from above
        for (let shaft = 0; shaft < 4; shaft += 1) {
          const centre = box.width * (0.2 + shaft * 0.22) + Math.sin(clock * 0.3 + shaft) * box.width * 0.04;
          const beam = context.createLinearGradient(0, 0, 0, box.height * 0.8);
          beam.addColorStop(0, "rgba(150, 220, 230, " + (0.09 * strength) + ")");
          beam.addColorStop(1, "rgba(150, 220, 230, 0)");
          context.fillStyle = beam;
          context.beginPath();
          context.moveTo(centre - box.width * 0.03, 0);
          context.lineTo(centre + box.width * 0.03, 0);
          context.lineTo(centre + box.width * 0.09, box.height * 0.8);
          context.lineTo(centre - box.width * 0.02, box.height * 0.8);
          context.closePath();
          context.fill();
        }

        context.globalCompositeOperation = "source-over";
        context.lineWidth = Math.max(1, 1.4 * box.scale);
        layer.particles.forEach(function (particle) {
          context.strokeStyle = "rgba(200, 245, 255, " + (0.7 * strength) + ")";
          context.fillStyle = "rgba(200, 245, 255, " + (0.12 * strength) + ")";
          context.beginPath();
          context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
          context.fill();
          context.stroke();
          context.fillStyle = "rgba(255, 255, 255, " + (0.8 * strength) + ")";
          context.beginPath();
          context.arc(particle.x - particle.radius * 0.35, particle.y - particle.radius * 0.35, particle.radius * 0.22, 0, Math.PI * 2);
          context.fill();
        });
        return;
      }

      if (kind === "rail" || kind === "airship") {
        drawJourney(kind, layer, box, strength);
        return;
      }

      if (kind === "mist") {
        const thickness = Math.min(1, 0.55 * (LEVELS[level] || 1) + 0.25);
        const sheets = layer.particles[0];
        drawFogSheet(sheets.far, box, 0.55 * thickness * strength, 0.85);
        drawFogSheet(sheets.near + box.width * 0.7, box, 0.75 * thickness * strength, 0.65);
      }
    }

    // Lightning rail: rushing streaks and blue arcs along the bottom.
    // Airship: clouds streaming past, wind streaks and a fiery glow from the elemental ring above.
    function drawJourney(kind, layer, box, strength) {

      if (kind === "airship") {
        // cloud banks rushing past below the deck and a thinner veil above
        const sheetWidth = box.width * 1.6;
        const nearOffset = (clock * 300 * box.scale) % sheetWidth;
        const farOffset = (clock * 150 * box.scale + sheetWidth * 0.4) % sheetWidth;
        context.globalAlpha = 0.85 * strength;

        for (let left = -nearOffset; left < box.width; left += sheetWidth) {
          context.drawImage(SPRITES.fog, left, box.height * 0.35, sheetWidth, box.height * 0.75);
        }

        context.globalAlpha = 0.45 * strength;

        for (let left = -farOffset; left < box.width; left += sheetWidth) {
          context.save();
          context.translate(left, box.height * 0.45);
          context.scale(1, -1);
          context.drawImage(SPRITES.fog, 0, 0, sheetWidth, box.height * 0.5);
          context.restore();
        }

        context.globalAlpha = 1;
        const ring = context.createLinearGradient(0, 0, 0, box.height * 0.35);
        const pulse = 0.2 + 0.07 * Math.sin(clock * 3.1);
        ring.addColorStop(0, "rgba(255, 120, 40, " + (pulse * strength) + ")");
        ring.addColorStop(1, "rgba(255, 120, 40, 0)");
        context.fillStyle = ring;
        context.fillRect(0, 0, box.width, box.height * 0.35);
      }

      context.lineCap = "round";
      context.lineWidth = Math.max(1, 2.2 * box.scale);
      layer.particles.forEach(function (particle) {
        context.strokeStyle = kind === "rail"
          ? "rgba(200, 220, 255, " + (particle.alpha * strength) + ")"
          : "rgba(235, 240, 250, " + (particle.alpha * strength) + ")";
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(particle.x + particle.length, particle.y);
        context.stroke();
      });

      if (kind !== "rail") {
        return;
      }

      // the conductor stones: blue lightning arcing along the bottom edge
      const glow = context.createLinearGradient(0, box.height, 0, box.height * 0.75);
      glow.addColorStop(0, "rgba(90, 150, 255, " + ((0.28 + 0.08 * Math.sin(clock * 9)) * strength) + ")");
      glow.addColorStop(1, "rgba(90, 150, 255, 0)");
      context.fillStyle = glow;
      context.fillRect(0, box.height * 0.75, box.width, box.height * 0.25);

      if (Math.random() < 0.35) {
        context.save();
        context.globalCompositeOperation = "lighter";
        context.lineJoin = "round";
        const arcs = Math.random() < 0.5 ? 1 : 2;

        for (let arc = 0; arc < arcs; arc += 1) {
          let x = Math.random() * box.width;
          let y = box.height - randomBetween(2, 30) * box.scale;
          const points = [[x, y]];

          for (let step = 0; step < 7; step += 1) {
            x += randomBetween(15, 45) * box.scale;
            y = box.height - randomBetween(2, 55) * box.scale;
            points.push([x, y]);
          }

          context.strokeStyle = "rgba(120, 170, 255, " + (0.4 * strength) + ")";
          context.lineWidth = 6 * box.scale;
          strokePath(points);
          context.strokeStyle = "rgba(230, 240, 255, " + (0.9 * strength) + ")";
          context.lineWidth = 1.6 * box.scale;
          strokePath(points);
        }

        context.restore();
      }
    }

    function drawSplashes(seconds, box) {
      context.lineWidth = Math.max(0.8, 1.1 * box.scale);
      splashes = splashes.filter(function (splash) {
        splash.age += seconds * 3.2;

        if (splash.age >= 1) {
          return false;
        }

        context.strokeStyle = "rgba(215, 225, 245, " + (0.45 * (1 - splash.age)) + ")";
        context.beginPath();
        context.ellipse(splash.x, splash.y, splash.size * (0.4 + splash.age), splash.size * 0.3 * (0.4 + splash.age), 0, Math.PI, Math.PI * 2);
        context.stroke();
        return true;
      });
    }

    // ---------- looks drawn over everything ----------

    function vignette(box, inner, outer, colour) {
      const gradient = context.createRadialGradient(
        box.width / 2,
        box.height / 2,
        Math.min(box.width, box.height) * inner,
        box.width / 2,
        box.height / 2,
        Math.max(box.width, box.height) * outer
      );
      gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      gradient.addColorStop(1, colour);
      context.fillStyle = gradient;
      context.fillRect(0, 0, box.width, box.height);
    }

    function drawLook(kind, layer, box, seconds) {
      const strength = layer.alpha * overlayStrength();

      if (kind === "night") {
        context.fillStyle = "rgba(15, 30, 85, " + (0.3 * strength) + ")";
        context.fillRect(0, 0, box.width, box.height);
        vignette(box, 0.3, 0.75, "rgba(0, 0, 15, " + Math.min(0.85, 0.55 * strength) + ")");
        return;
      }

      if (kind === "gray") {
        context.fillStyle = "rgba(110, 115, 120, " + (0.12 * strength) + ")";
        context.fillRect(0, 0, box.width, box.height);
        vignette(box, 0.35, 0.8, "rgba(20, 20, 22, " + Math.min(0.8, 0.45 * strength) + ")");
        return;
      }

      if (kind === "blood") {
        context.fillStyle = "rgba(150, 0, 15, " + (0.22 * strength) + ")";
        context.fillRect(0, 0, box.width, box.height);
        vignette(box, 0.3, 0.75, "rgba(60, 0, 0, " + Math.min(0.85, 0.55 * strength) + ")");
        return;
      }

      if (kind === "dream") {
        context.fillStyle = "rgba(205, 175, 255, " + (0.12 * strength) + ")";
        context.fillRect(0, 0, box.width, box.height);
        const glow = context.createRadialGradient(
          box.width / 2,
          box.height / 2,
          Math.min(box.width, box.height) * 0.35,
          box.width / 2,
          box.height / 2,
          Math.max(box.width, box.height) * 0.7
        );
        glow.addColorStop(0, "rgba(255, 245, 255, 0)");
        glow.addColorStop(1, "rgba(255, 240, 255, " + Math.min(0.6, 0.35 * strength) + ")");
        context.fillStyle = glow;
        context.fillRect(0, 0, box.width, box.height);
        return;
      }

      if (kind === "darkness") {
        // torchlight: a warm lit middle that breathes, darkness all round
        const breathe = 0.04 * Math.sin(clock * 2.3) + 0.025 * Math.sin(clock * 7.1);
        const reach = 0.42 - 0.1 * (overlayStrength() - 1) + breathe;
        const gradient = context.createRadialGradient(
          box.width / 2,
          box.height * 0.55,
          Math.min(box.width, box.height) * reach * 0.35,
          box.width / 2,
          box.height * 0.55,
          Math.max(box.width, box.height) * reach
        );
        gradient.addColorStop(0, "rgba(40, 18, 0, 0)");
        gradient.addColorStop(0.55, "rgba(5, 2, 0, " + (0.55 * layer.alpha) + ")");
        gradient.addColorStop(1, "rgba(0, 0, 0, " + (0.95 * layer.alpha) + ")");
        context.fillStyle = gradient;
        context.fillRect(0, 0, box.width, box.height);
        return;
      }

      if (kind === "recording") {
        // film grain
        const pattern = context.createPattern(SPRITES.noise, "repeat");
        context.save();
        context.translate(Math.random() * 160, Math.random() * 160);
        context.globalAlpha = 0.13 * layer.alpha;
        context.fillStyle = pattern;
        context.fillRect(-160, -160, box.width + 320, box.height + 320);
        context.restore();
        // scan lines
        const spacing = Math.max(2, Math.round(4 * box.scale));
        context.fillStyle = "rgba(0, 0, 0, " + (0.22 * layer.alpha) + ")";

        for (let line = 0; line < box.height; line += spacing) {
          context.fillRect(0, line, box.width, Math.max(1, spacing / 2));
        }

        // a slow bright bar rolling down now and then
        if (rollBar < 0 && Math.random() < seconds * 0.12) {
          rollBar = 0;
        }

        if (rollBar >= 0) {
          rollBar += seconds * 0.35;
          context.fillStyle = "rgba(255, 245, 225, " + (0.06 * layer.alpha) + ")";
          context.fillRect(0, rollBar * box.height, box.width, box.height * 0.08);

          if (rollBar > 1.1) {
            rollBar = -1;
          }
        }

        // flicker and fisheye-dark edges
        flicker += (randomBetween(0, 0.09) - flicker) * 0.3;
        context.fillStyle = "rgba(0, 0, 0, " + (flicker * layer.alpha) + ")";
        context.fillRect(0, 0, box.width, box.height);
        vignette(box, 0.35, 0.72, "rgba(0, 0, 0, " + (0.7 * layer.alpha) + ")");
      }
    }

    function makeBolt(box) {
      const points = [];
      let x = randomBetween(box.width * 0.15, box.width * 0.85);
      let y = 0;
      const bottom = randomBetween(box.height * 0.45, box.height * 0.8);
      const branches = [];

      while (y < bottom) {
        points.push([x, y]);
        y += randomBetween(20, 55) * box.scale;
        x += randomBetween(-35, 35) * box.scale;

        if (Math.random() < 0.18) {
          const branch = [[x, y]];
          let branchX = x;
          let branchY = y;
          const lean = Math.random() < 0.5 ? -1 : 1;

          for (let step = 0; step < 5; step += 1) {
            branchY += randomBetween(15, 40) * box.scale;
            branchX += lean * randomBetween(10, 35) * box.scale;
            branch.push([branchX, branchY]);
          }

          branches.push(branch);
        }
      }

      points.push([x, y]);
      return { main: points, branches: branches };
    }

    function strokePath(points) {
      context.beginPath();
      context.moveTo(points[0][0], points[0][1]);

      for (let index = 1; index < points.length; index += 1) {
        context.lineTo(points[index][0], points[index][1]);
      }

      context.stroke();
    }

    function drawLightning(seconds, box, stormStrength) {
      nextFlash -= seconds;

      if (nextFlash <= 0) {
        flash = 1;
        bolt = Math.random() < 0.7 ? makeBolt(box) : null;
        nextFlash = randomBetween(5, 13);

        // lets the control window follow the flash with thunder
        if (settings.onLightning) {
          settings.onLightning(bolt ? 1 : 0.6);
        }
      }

      if (flash > 0) {
        // two quick pulses, then fade
        const pulse = flash > 0.7 ? 0.75 : (flash > 0.55 ? 0.15 : flash * 0.9);
        context.fillStyle = "rgba(225, 230, 255, " + (pulse * stormStrength * 0.8) + ")";
        context.fillRect(0, 0, box.width, box.height);

        if (bolt && flash > 0.45) {
          context.save();
          context.globalCompositeOperation = "lighter";
          context.lineJoin = "round";
          context.strokeStyle = "rgba(170, 190, 255, " + (0.35 * stormStrength) + ")";
          context.lineWidth = 10 * box.scale;
          strokePath(bolt.main);
          context.strokeStyle = "rgba(245, 248, 255, " + stormStrength + ")";
          context.lineWidth = 2.6 * box.scale;
          strokePath(bolt.main);
          context.lineWidth = 1.4 * box.scale;
          bolt.branches.forEach(strokePath);
          context.restore();
        }

        flash -= seconds * 1.6;
      }
    }

    // ---------- the picture filter, blended by fade ----------

    function applySceneFilter(box) {

      if (!scene) {
        return;
      }

      const values = { brightness: 1, saturate: 1, contrast: 1, sepia: 0, grayscale: 0, hue: 0, blur: 0 };
      let changed = false;

      Object.keys(layers).forEach(function (kind) {
        const change = PICTURE_CHANGES[kind];

        if (!change) {
          return;
        }

        const amount = layers[kind].alpha;

        if (amount <= 0) {
          return;
        }

        changed = true;
        ["brightness", "saturate", "contrast"].forEach(function (key) {

          if (change[key] !== undefined) {
            values[key] *= 1 + (change[key] - 1) * amount;
          }
        });
        ["sepia", "grayscale"].forEach(function (key) {

          if (change[key] !== undefined) {
            values[key] = Math.min(1, values[key] + change[key] * amount);
          }
        });

        if (change.hue) {
          values.hue += change.hue * amount;
        }

        if (change.blur) {
          values.blur += change.blur * amount * box.scale;
        }
      });

      const filterText = changed
        ? "brightness(" + values.brightness.toFixed(3) + ") saturate(" + values.saturate.toFixed(3) + ")"
          + " contrast(" + values.contrast.toFixed(3) + ") sepia(" + values.sepia.toFixed(3) + ")"
          + " grayscale(" + values.grayscale.toFixed(3) + ") hue-rotate(" + values.hue.toFixed(1) + "deg)"
          + " blur(" + values.blur.toFixed(2) + "px)"
        : "";

      if (scene.style.filter !== filterText) {
        scene.style.filter = filterText;
      }

      scene.classList.toggle("tablefx-sway", Boolean(layers.underwater && layers.underwater.on));
    }

    // ---------- loop ----------

    function rank(kind) {
      // moods first, then things in the air, then torchlight and film on top
      if (kind === "recording" || kind === "darkness") {
        return 2;
      }

      return MOODS.includes(kind) ? 0 : 1;
    }

    function frame(time) {
      const seconds = Math.min(0.05, (time - lastTime) / 1000 || 0);
      lastTime = time;
      clock += seconds;
      const box = size();
      context.clearRect(0, 0, box.width, box.height);
      let alive = false;
      const order = Object.keys(layers).sort(function (first, second) {
        return rank(first) - rank(second);
      });

      order.forEach(function (kind) {
        const layer = layers[kind];
        const step = seconds / FADE_SECONDS;
        layer.alpha = layer.on ? Math.min(1, layer.alpha + step) : Math.max(0, layer.alpha - step);

        if (!layer.on && layer.alpha <= 0) {
          delete layers[kind];
          return;
        }

        alive = true;

        if (COUNTS[kind]) {
          update(kind, layer, seconds, box);
          draw(kind, layer, box);
        }

        if (MOODS.includes(kind) || OVERLAY_ONLY[kind] || kind === "recording") {
          drawLook(kind, layer, box, seconds);
        }

        if (kind === "storm") {
          drawLightning(seconds, box, layer.alpha);
        }
      });

      if (splashes.length) {
        alive = true;
        drawSplashes(seconds, box);
      }

      applySceneFilter(box);

      if (alive) {
        requestAnimationFrame(frame);
      } else {
        running = false;
        context.clearRect(0, 0, box.width, box.height);
      }
    }

    function set(kinds, nextLevel, sceneElement) {
      level = LEVELS[nextLevel] ? nextLevel : "medium";

      if (sceneElement && sceneElement !== scene) {

        if (scene) {
          scene.style.filter = "";
          scene.classList.remove("tablefx-sway");
        }

        scene = sceneElement;
      }

      const wanted = new Set(kinds || []);

      Object.keys(layers).forEach(function (kind) {
        layers[kind].on = wanted.has(kind);
      });

      wanted.forEach(function (kind) {
        const known = COUNTS[kind] || PICTURE_CHANGES[kind] || OVERLAY_ONLY[kind];

        if (!known) {
          return;
        }

        if (!layers[kind]) {
          layers[kind] = { on: true, alpha: 0, particles: [], fresh: true };
        }

        layers[kind].on = true;
      });

      if (scene) {
        applySceneFilter(size());
      }

      if (!running && Object.keys(layers).length) {
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(frame);
      }
    }

    function shake(sceneElement) {
      const target = sceneElement || scene;

      if (!target || !target.animate) {
        return;
      }

      const scale = Math.max(canvas.clientHeight, 200) / 1080;
      const steps = [];

      for (let step = 0; step < 12; step += 1) {
        const fade = 1 - step / 12;
        const offsetX = randomBetween(-22, 22) * fade * scale;
        const offsetY = randomBetween(-16, 16) * fade * scale;
        steps.push({ transform: "translate(" + offsetX + "px, " + offsetY + "px)" });
      }

      steps.push({ transform: "translate(0, 0)" });
      target.animate(steps, { duration: 650, easing: "ease-out" });
    }

    return { set: set, shake: shake };
  };

  // [id, label, group]. Moods: only one at a time.
  window.TableFx.KINDS = [
    ["rain", "Rain", "Weather"],
    ["storm", "Storm", "Weather"],
    ["snow", "Snow", "Weather"],
    ["mist", "Mist", "Weather"],
    ["ash", "Ash", "Weather"],
    ["leaves", "Leaves", "Weather"],
    ["embers", "Embers", "Air"],
    ["dust", "Dust", "Air"],
    ["fireflies", "Fireflies", "Air"],
    ["crows", "Crows", "Air"],
    ["bats", "Bats", "Air"],
    ["underwater", "Underwater", "Look"],
    ["recording", "Recording", "Look"],
    ["darkness", "Torchlight", "Look"],
    ["rail", "Lightning rail", "Eberron"],
    ["airship", "Airship", "Eberron"],
    ["night", "Night", "Mood"],
    ["gray", "Gray", "Mood"],
    ["blood", "Blood", "Mood"],
    ["dream", "Dream", "Mood"],
  ];
  window.TableFx.MOODS = MOODS;
})();
