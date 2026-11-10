/* Sound board for the table screen's control window.

   Built-in sounds are generated live with the browser's audio engine, so they need no files.
   Your own files (in Theatre's sounds folder) are played the same way: loops repeat, the rest play once.

   const board = TableSound();
   board.toggleLoop("rain");          // built-in or file loops, by id
   board.play("thunder");             // one-shots
   board.setVolume("loops", 0.8);   // or "shots"
   board.stopAll();
   board.onChange = function () {};   // called when the set of playing loops changes */
(function () {
  "use strict";

  const FADE_SECONDS = 1.5;

  window.TableSound = function () {
    let audio = null;
    let master = null;
    let loopBus = null;
    let shotBus = null;
    let noiseBuffer = null;
    let brownBuffer = null;
    const loops = {};
    const board = { onChange: null, files: [] };

    function engine() {

      if (!audio) {
        audio = new AudioContext();
        master = audio.createGain();
        master.gain.value = 1;
        master.connect(audio.destination);
        loopBus = audio.createGain();
        loopBus.gain.value = board.loopVolume === undefined ? 0.8 : board.loopVolume;
        loopBus.connect(master);
        shotBus = audio.createGain();
        shotBus.gain.value = board.shotVolume === undefined ? 0.8 : board.shotVolume;
        shotBus.connect(master);
        noiseBuffer = makeNoise(false);
        brownBuffer = makeNoise(true);
      }

      if (audio.state === "suspended") {
        audio.resume();
      }

      return audio;
    }

    function makeNoise(brown) {
      const length = audio.sampleRate * 3;
      const buffer = audio.createBuffer(1, length, audio.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;

      for (let index = 0; index < length; index += 1) {
        const white = Math.random() * 2 - 1;

        if (brown) {
          last = (last + 0.02 * white) / 1.02;
          data[index] = last * 3.5;
        } else {
          data[index] = white;
        }
      }

      return buffer;
    }

    function randomPitch(low, high) {
      return low + Math.random() * (high - low);
    }

    function noiseSource(brown) {
      const source = audio.createBufferSource();
      source.buffer = brown ? brownBuffer : noiseBuffer;
      source.loop = true;
      return source;
    }

    function filter(type, frequency, quality) {
      const node = audio.createBiquadFilter();
      node.type = type;
      node.frequency.value = frequency;

      if (quality) {
        node.Q.value = quality;
      }

      return node;
    }

    function gainNode(value) {
      const node = audio.createGain();
      node.gain.value = value;
      return node;
    }

    function wobble(target, rate, depth) {
      const oscillator = audio.createOscillator();
      oscillator.frequency.value = rate;
      const amount = gainNode(depth);
      oscillator.connect(amount);
      amount.connect(target);
      oscillator.start();
      return oscillator;
    }

    // A short burst of sound: a thump, a click, a tone.
    function burst(options) {
      const now = audio.currentTime + (options.delay || 0);
      const output = gainNode(0);
      output.connect(options.destination || shotBus);
      let source;

      if (options.tone) {
        source = audio.createOscillator();
        source.type = options.wave || "sine";
        source.frequency.setValueAtTime(options.tone, now);

        if (options.toneEnd) {
          source.frequency.exponentialRampToValueAtTime(options.toneEnd, now + options.length);
        }
      } else {
        source = noiseSource(options.brown);
      }

      let chainEnd = source;

      if (options.lowpass) {
        const low = filter("lowpass", options.lowpass);
        chainEnd.connect(low);
        chainEnd = low;
      }

      if (options.highpass) {
        const high = filter("highpass", options.highpass);
        chainEnd.connect(high);
        chainEnd = high;
      }

      chainEnd.connect(output);
      output.gain.setValueAtTime(0, now);
      output.gain.linearRampToValueAtTime(options.volume, now + (options.attack || 0.005));
      output.gain.exponentialRampToValueAtTime(0.0001, now + options.length);
      source.start(now);
      source.stop(now + options.length + 0.05);
    }

    // ---------- built-in loops: each returns the nodes to stop ----------

    const LOOP_BUILDERS = {
      rain: function (output) {
        const hiss = noiseSource(false);
        const high = filter("highpass", 500);
        const low = filter("lowpass", 7000);
        hiss.connect(high);
        high.connect(low);
        low.connect(gainNode(0.22)).connect(output);
        const patter = noiseSource(true);
        const patterLow = filter("lowpass", 900);
        patter.connect(patterLow);
        patterLow.connect(gainNode(0.25)).connect(output);
        hiss.start();
        patter.start();
        return { nodes: [hiss, patter] };
      },
      wind: function (output) {
        const air = noiseSource(false);
        const band = filter("bandpass", 450, 0.9);
        const level = gainNode(0.45);
        air.connect(band);
        band.connect(level);
        level.connect(output);
        const sweep = wobble(band.frequency, 0.09, 260);
        const gust = wobble(level.gain, 0.13, 0.25);
        air.start();
        return { nodes: [air, sweep, gust] };
      },
      fire: function (output) {
        const roar = noiseSource(true);
        const low = filter("lowpass", 700);
        roar.connect(low);
        low.connect(gainNode(0.35)).connect(output);
        roar.start();
        const state = { stopped: false };

        // random crackles and pops
        function crackle() {

          if (state.stopped) {
            return;
          }

          burst({ highpass: 1800, volume: Math.random() * 0.35 + 0.08, length: Math.random() * 0.04 + 0.01, destination: output });

          if (Math.random() < 0.15) {
            burst({ lowpass: 1200, volume: 0.3, length: 0.08, destination: output });
          }

          state.timer = setTimeout(crackle, Math.random() * 180 + 30);
        }

        crackle();
        return { nodes: [roar], state: state };
      },
      waves: function (output) {
        const sea = noiseSource(true);
        const low = filter("lowpass", 500);
        const level = gainNode(0.4);
        sea.connect(low);
        low.connect(level);
        level.connect(output);
        const swell = wobble(level.gain, 0.08, 0.35);
        const brightness = wobble(low.frequency, 0.08, 300);
        sea.start();
        return { nodes: [sea, swell, brightness] };
      },
      tavern: function (output) {
        // A muffled room of talkers: each has a speaking pitch and says short vowel syllables,
        // heard through a low-pass "room" so it reads as chatter across a crowded tavern.
        const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870], [660, 1700], [440, 1020]];
        const room = filter("lowpass", 1300, 0.7);
        const roomLevel = gainNode(0.9);
        room.connect(roomLevel);
        roomLevel.connect(output);
        const nodes = [];
        const state = { stopped: false, timers: [] };

        for (let talker = 0; talker < 9; talker += 1) {
          const basePitch = talker % 3 === 0 ? randomPitch(165, 235) : randomPitch(90, 140);
          const throat = audio.createOscillator();
          throat.type = "sawtooth";
          throat.frequency.value = basePitch;
          const firstFormant = filter("bandpass", 600, 2.2);
          const secondFormant = filter("bandpass", 1200, 2.8);
          const mouth = gainNode(0);
          throat.connect(firstFormant);
          throat.connect(secondFormant);
          firstFormant.connect(mouth);
          secondFormant.connect(gainNode(0.6)).connect(mouth);
          mouth.connect(room);
          throat.start();
          nodes.push(throat);
          const loudness = Math.random() * 0.05 + 0.03;

          // one syllable after another, with pauses between phrases
          const speak = function () {

            if (state.stopped) {
              return;
            }

            const now = audio.currentTime;
            const vowel = VOWELS[Math.floor(Math.random() * VOWELS.length)];
            const length = Math.random() * 0.14 + 0.09;
            firstFormant.frequency.setTargetAtTime(vowel[0], now, 0.02);
            secondFormant.frequency.setTargetAtTime(vowel[1], now, 0.02);
            throat.frequency.setTargetAtTime(basePitch * (0.85 + Math.random() * 0.35), now, 0.05);
            mouth.gain.cancelScheduledValues(now);
            mouth.gain.setTargetAtTime(loudness, now, 0.015);
            mouth.gain.setTargetAtTime(0, now + length, 0.03);
            const pause = Math.random() < 0.12 ? Math.random() * 2.5 + 0.8 : Math.random() * 0.08 + 0.03;
            state.timers[talker] = setTimeout(speak, (length + pause) * 1000);
          };

          state.timers[talker] = setTimeout(speak, Math.random() * 1500);
        }

        // the room itself: a low rumble, cups set down, a chair scraping now and then
        const hum = noiseSource(true);
        const humLow = filter("lowpass", 260);
        hum.connect(humLow);
        humLow.connect(gainNode(0.22)).connect(output);
        hum.start();
        nodes.push(hum);

        function roomSounds() {

          if (state.stopped) {
            return;
          }

          if (Math.random() < 0.65) {
            const pitch = Math.random() * 1500 + 2500;
            burst({ tone: pitch, volume: 0.06, length: 0.25, attack: 0.002, destination: output });
            burst({ tone: pitch * 1.48, volume: 0.03, length: 0.2, attack: 0.002, destination: output });
          } else {
            burst({ lowpass: 600, volume: 0.18, length: 0.07, destination: output });
          }

          state.timer = setTimeout(roomSounds, Math.random() * 2500 + 600);
        }

        roomSounds();
        state.clearAll = function () {
          state.timers.forEach(clearTimeout);
        };
        return { nodes: nodes, state: state };
      },
      forest: function (output) {
        const leaves = noiseSource(false);
        const band = filter("bandpass", 1800, 0.6);
        const level = gainNode(0.08);
        leaves.connect(band);
        band.connect(level);
        level.connect(output);
        const rustle = wobble(level.gain, 0.2, 0.05);
        leaves.start();
        const state = { stopped: false };

        // a few different birds, chirping now and then
        function bird() {

          if (state.stopped) {
            return;
          }

          const base = Math.random() * 2000 + 2200;
          const notes = Math.floor(Math.random() * 4) + 2;

          for (let note = 0; note < notes; note += 1) {
            const start = base * (1 + Math.random() * 0.25);
            burst({
              tone: start,
              toneEnd: start * (Math.random() < 0.5 ? 1.35 : 0.75),
              volume: 0.07,
              length: 0.09,
              delay: note * 0.12,
              attack: 0.01,
              destination: output,
            });
          }

          state.timer = setTimeout(bird, Math.random() * 3500 + 800);
        }

        bird();
        return { nodes: [leaves, rustle], state: state };
      },
      rail: function (output) {
        // the lightning rail: rumble, an electric hum, and wheels over the rail joints
        const rumble = noiseSource(true);
        const rumbleLow = filter("lowpass", 220);
        rumble.connect(rumbleLow);
        rumbleLow.connect(gainNode(0.5)).connect(output);
        const hum = audio.createOscillator();
        hum.type = "sawtooth";
        hum.frequency.value = 58;
        const humLow = filter("lowpass", 420);
        const humLevel = gainNode(0.07);
        hum.connect(humLow);
        humLow.connect(humLevel);
        humLevel.connect(output);
        const humSwell = wobble(humLevel.gain, 0.3, 0.03);
        rumble.start();
        hum.start();
        const state = { stopped: false };

        function joints() {

          if (state.stopped) {
            return;
          }

          // da-dum, da-dum: front and back wheels over each joint
          [0, 0.13, 0.55, 0.68].forEach(function (offset) {
            burst({ lowpass: 700, volume: 0.32, length: 0.06, delay: offset, destination: output });
            burst({ tone: 95, toneEnd: 60, volume: 0.25, length: 0.08, delay: offset, destination: output });
          });

          // the conductor stone crackles now and then
          if (Math.random() < 0.35) {
            const sparks = Math.floor(Math.random() * 4) + 2;

            for (let spark = 0; spark < sparks; spark += 1) {
              burst({ highpass: 3000, volume: 0.12, length: 0.03, delay: 0.2 + spark * 0.05, destination: output });
            }
          }

          state.timer = setTimeout(joints, 1150);
        }

        joints();
        return { nodes: [rumble, hum, humSwell], state: state };
      },
      airship: function (output) {
        const air = noiseSource(true);
        const airLow = filter("lowpass", 450);
        air.connect(airLow);
        airLow.connect(gainNode(0.45)).connect(output);
        const gust = noiseSource(false);
        const gustBand = filter("bandpass", 700, 0.8);
        const gustLevel = gainNode(0.12);
        gust.connect(gustBand);
        gustBand.connect(gustLevel);
        gustLevel.connect(output);
        const gusting = wobble(gustLevel.gain, 0.11, 0.08);
        // the bound elemental's ring: a deep, slowly pulsing drone
        const ring = audio.createOscillator();
        ring.frequency.value = 52;
        const ringOver = audio.createOscillator();
        ringOver.frequency.value = 104.6;
        const ringLevel = gainNode(0.14);
        ring.connect(ringLevel);
        ringOver.connect(gainNode(0.4)).connect(ringLevel);
        ringLevel.connect(output);
        const throb = wobble(ringLevel.gain, 0.5, 0.06);
        air.start();
        gust.start();
        ring.start();
        ringOver.start();
        return { nodes: [air, gust, gusting, ring, ringOver, throb] };
      },
      sharn: function (output) {
        // distant crowd under the towers
        const nodes = [];
        [[400, 2.9], [850, 4.1], [1600, 3.4]].forEach(function (band) {
          const voice = noiseSource(false);
          const shape = filter("bandpass", band[0], 4);
          const level = gainNode(0.09);
          voice.connect(shape);
          shape.connect(level);
          level.connect(output);
          nodes.push(voice, wobble(level.gain, band[1], 0.07));
          voice.start();
        });
        const city = noiseSource(true);
        const cityLow = filter("lowpass", 250);
        city.connect(cityLow);
        cityLow.connect(gainNode(0.3)).connect(output);
        city.start();
        nodes.push(city);
        const state = { stopped: false };

        // steam vents, machinery and the odd far bell
        function street() {

          if (state.stopped) {
            return;
          }

          const pick = Math.random();

          if (pick < 0.4) {
            burst({ highpass: 2500, lowpass: 9000, volume: 0.14, length: Math.random() * 1.2 + 0.5, attack: 0.15, destination: output });
          } else if (pick < 0.8) {
            const clank = Math.random() * 200 + 180;
            burst({ tone: clank, volume: 0.1, length: 0.35, attack: 0.002, destination: output });
            burst({ tone: clank * 2.7, volume: 0.05, length: 0.25, attack: 0.002, destination: output });
          } else {
            [1, 2.76, 5.4].forEach(function (ratio, index) {
              burst({ tone: 330 * ratio, volume: 0.05 / (index + 1), length: 3, attack: 0.003, destination: output });
            });
          }

          state.timer = setTimeout(street, Math.random() * 2200 + 700);
        }

        street();
        return { nodes: nodes, state: state };
      },
      drips: function (output) {
        const hum = noiseSource(true);
        const low = filter("lowpass", 160);
        hum.connect(low);
        low.connect(gainNode(0.25)).connect(output);
        hum.start();
        const echo = audio.createDelay(1);
        echo.delayTime.value = 0.32;
        const feedback = gainNode(0.35);
        echo.connect(feedback);
        feedback.connect(echo);
        echo.connect(output);
        const state = { stopped: false };

        function drip() {

          if (state.stopped) {
            return;
          }

          const pitch = Math.random() * 1400 + 900;
          burst({ tone: pitch, toneEnd: pitch * 1.8, volume: 0.22, length: 0.12, destination: output });
          burst({ tone: pitch, toneEnd: pitch * 1.8, volume: 0.12, length: 0.12, destination: echo });
          state.timer = setTimeout(drip, Math.random() * 2200 + 400);
        }

        drip();
        return { nodes: [hum], state: state };
      },
    };

    // ---------- built-in one-shots ----------

    const SHOTS = {
      thunder: function () {
        const now = audio.currentTime;
        const rumble = noiseSource(true);
        const low = filter("lowpass", 400);
        low.frequency.setValueAtTime(900, now);
        low.frequency.exponentialRampToValueAtTime(90, now + 3.5);
        const level = gainNode(0);
        rumble.connect(low);
        low.connect(level);
        level.connect(shotBus);
        level.gain.setValueAtTime(0, now);
        level.gain.linearRampToValueAtTime(1.1, now + 0.06);
        level.gain.exponentialRampToValueAtTime(0.35, now + 0.9);
        level.gain.linearRampToValueAtTime(0.6, now + 1.4);
        level.gain.exponentialRampToValueAtTime(0.0001, now + 5);
        rumble.start(now);
        rumble.stop(now + 5.1);
        burst({ highpass: 300, lowpass: 3000, volume: 0.5, length: 0.35 });
      },
      knock: function () {
        [0, 0.28, 0.56].forEach(function (delay) {
          burst({ tone: 110, toneEnd: 60, volume: 0.9, length: 0.16, delay: delay });
          burst({ lowpass: 900, volume: 0.45, length: 0.07, delay: delay });
        });
      },
      heartbeat: function () {
        [0, 0.9, 1.8].forEach(function (beat) {
          burst({ tone: 70, toneEnd: 40, volume: 1, length: 0.18, delay: beat });
          burst({ tone: 60, toneEnd: 35, volume: 0.7, length: 0.16, delay: beat + 0.22 });
        });
      },
      bell: function () {
        [1, 2.76, 5.4, 8.93].forEach(function (ratio, index) {
          burst({ tone: 220 * ratio, volume: 0.35 / (index + 1), length: 5 - index * 0.8, attack: 0.003 });
        });
      },
      whoosh: function () {
        const now = audio.currentTime;
        const air = noiseSource(false);
        const band = filter("bandpass", 300, 1.2);
        band.frequency.setValueAtTime(250, now);
        band.frequency.exponentialRampToValueAtTime(3200, now + 0.35);
        band.frequency.exponentialRampToValueAtTime(400, now + 0.8);
        const level = gainNode(0);
        air.connect(band);
        band.connect(level);
        level.connect(shotBus);
        level.gain.linearRampToValueAtTime(0.8, now + 0.3);
        level.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
        air.start(now);
        air.stop(now + 0.9);
      },
      sword: function () {
        // a bright metallic ring of clashing blades
        [1, 2.38, 3.95, 5.6].forEach(function (ratio, index) {
          burst({ tone: 620 * ratio, volume: 0.22 / (index + 1), length: 0.9 - index * 0.15, attack: 0.001 });
        });
        burst({ highpass: 2500, volume: 0.45, length: 0.12 });
        [1, 2.51].forEach(function (ratio) {
          burst({ tone: 780 * ratio, volume: 0.12, length: 0.6, delay: 0.09, attack: 0.001 });
        });
      },
      explosion: function () {
        const now = audio.currentTime;
        const blast = noiseSource(true);
        const low = filter("lowpass", 2500);
        low.frequency.setValueAtTime(2500, now);
        low.frequency.exponentialRampToValueAtTime(70, now + 2.5);
        const level = gainNode(0);
        blast.connect(low);
        low.connect(level);
        level.connect(shotBus);
        level.gain.setValueAtTime(0, now);
        level.gain.linearRampToValueAtTime(1.4, now + 0.02);
        level.gain.exponentialRampToValueAtTime(0.0001, now + 3);
        blast.start(now);
        blast.stop(now + 3.1);
        burst({ tone: 60, toneEnd: 30, volume: 1, length: 0.8 });
        burst({ highpass: 1500, volume: 0.35, length: 0.6, delay: 0.05 });
      },
      roar: function () {
        const now = audio.currentTime;
        const growl = audio.createOscillator();
        growl.type = "sawtooth";
        growl.frequency.setValueAtTime(95, now);
        growl.frequency.linearRampToValueAtTime(140, now + 0.6);
        growl.frequency.linearRampToValueAtTime(70, now + 2);
        const shake = audio.createOscillator();
        shake.frequency.value = 28;
        const shakeDepth = gainNode(25);
        shake.connect(shakeDepth);
        shakeDepth.connect(growl.frequency);
        const throat = filter("lowpass", 900, 4);
        const level = gainNode(0);
        growl.connect(throat);
        throat.connect(level);
        level.connect(shotBus);
        level.gain.setValueAtTime(0, now);
        level.gain.linearRampToValueAtTime(0.6, now + 0.25);
        level.gain.linearRampToValueAtTime(0.5, now + 1.4);
        level.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
        growl.start(now);
        shake.start(now);
        growl.stop(now + 2.3);
        shake.stop(now + 2.3);
        burst({ lowpass: 1200, volume: 0.35, length: 2, attack: 0.3, brown: true });
      },
      creak: function () {
        const now = audio.currentTime;
        const hinge = audio.createOscillator();
        hinge.type = "sawtooth";
        hinge.frequency.setValueAtTime(180, now);
        hinge.frequency.linearRampToValueAtTime(320, now + 0.7);
        hinge.frequency.linearRampToValueAtTime(240, now + 1.3);
        const stutter = audio.createOscillator();
        stutter.frequency.value = 22;
        const stutterDepth = gainNode(0.5);
        const level = gainNode(0);
        stutter.connect(stutterDepth);
        stutterDepth.connect(level.gain);
        const wood = filter("bandpass", 900, 3);
        hinge.connect(wood);
        wood.connect(level);
        level.connect(shotBus);
        level.gain.setValueAtTime(0, now);
        level.gain.linearRampToValueAtTime(0.35, now + 0.1);
        level.gain.linearRampToValueAtTime(0.0001, now + 1.4);
        hinge.start(now);
        stutter.start(now);
        hinge.stop(now + 1.5);
        stutter.stop(now + 1.5);
      },
      horn: function () {
        // the lightning rail's departure signal: a two-note brassy call
        [[311, 0], [392, 0], [311, 0.9], [392, 0.9]].forEach(function (pair) {
          const now = audio.currentTime + pair[1];
          const reed = audio.createOscillator();
          reed.type = "sawtooth";
          reed.frequency.setValueAtTime(pair[0] * 0.97, now);
          reed.frequency.linearRampToValueAtTime(pair[0], now + 0.12);
          const brass = filter("lowpass", 1400, 2);
          const level = gainNode(0);
          reed.connect(brass);
          brass.connect(level);
          level.connect(shotBus);
          level.gain.setValueAtTime(0, now);
          level.gain.linearRampToValueAtTime(0.16, now + 0.08);
          level.gain.setValueAtTime(0.16, now + 0.6);
          level.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
          reed.start(now);
          reed.stop(now + 0.9);
        });
      },
      steam: function () {
        burst({ highpass: 2000, lowpass: 10000, volume: 0.5, length: 1.6, attack: 0.05 });
        burst({ lowpass: 500, volume: 0.25, length: 0.4, brown: true });
      },
      zap: function () {
        for (let spark = 0; spark < 9; spark += 1) {
          burst({ highpass: 2500, volume: Math.random() * 0.4 + 0.15, length: 0.03, delay: spark * 0.035 + Math.random() * 0.02 });
        }

        burst({ tone: 1800, toneEnd: 120, volume: 0.25, length: 0.5, wave: "square", lowpass: 3000 });
      },
      magic: function () {
        [523, 659, 784, 1047, 1319, 1568].forEach(function (pitch, index) {
          burst({ tone: pitch, volume: 0.18, length: 1.6, delay: index * 0.07, attack: 0.01 });
          burst({ tone: pitch * 2.01, volume: 0.05, length: 1.2, delay: index * 0.07 + 0.02 });
        });
      },
    };

    board.builtInLoops = [
      ["rain", "Rain"],
      ["wind", "Wind"],
      ["fire", "Fire"],
      ["waves", "Waves"],
      ["drips", "Cave drips"],
      ["tavern", "Tavern crowd"],
      ["forest", "Forest"],
    ];
    board.eberronLoops = [
      ["rail", "Lightning rail"],
      ["airship", "Airship"],
      ["sharn", "Sharn streets"],
    ];
    board.eberronShots = [
      ["horn", "Rail horn"],
      ["steam", "Steam hiss"],
      ["zap", "Arcane zap"],
    ];
    board.builtInShots = [
      ["thunder", "Thunder"],
      ["sword", "Sword"],
      ["explosion", "Explosion"],
      ["roar", "Roar"],
      ["knock", "Knock"],
      ["creak", "Creak"],
      ["heartbeat", "Heartbeat"],
      ["bell", "Bell"],
      ["whoosh", "Whoosh"],
      ["magic", "Magic"],
    ];

    function changed() {

      if (board.onChange) {
        board.onChange();
      }
    }

    function fileById(id) {
      return board.files.find(function (file) {
        return file.id === id;
      });
    }

    function startLoop(id, reason) {
      engine();

      if (loops[id]) {
        loops[id].reasons.add(reason);
        return;
      }

      const output = gainNode(0);
      output.connect(loopBus);
      const now = audio.currentTime;
      output.gain.setValueAtTime(0, now);
      output.gain.linearRampToValueAtTime(1, now + FADE_SECONDS);
      let playing;

      if (LOOP_BUILDERS[id]) {
        playing = LOOP_BUILDERS[id](output);
      } else {
        const file = fileById(id);

        if (!file) {
          return;
        }

        const element = new Audio(file.url);
        element.loop = true;
        audio.createMediaElementSource(element).connect(output);
        element.play().catch(function () {});
        playing = { element: element };
      }

      loops[id] = { output: output, playing: playing, reasons: new Set([reason]) };
      changed();
    }

    function stopLoop(id, reason) {
      const loop = loops[id];

      if (!loop) {
        return;
      }

      if (reason) {
        loop.reasons.delete(reason);

        if (loop.reasons.size) {
          return;
        }
      }

      delete loops[id];
      const now = audio.currentTime;
      loop.output.gain.cancelScheduledValues(now);
      loop.output.gain.setValueAtTime(loop.output.gain.value, now);
      loop.output.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
      setTimeout(function () {
        const playing = loop.playing;

        if (playing.state) {
          playing.state.stopped = true;
          clearTimeout(playing.state.timer);

          if (playing.state.clearAll) {
            playing.state.clearAll();
          }
        }

        (playing.nodes || []).forEach(function (node) {
          try {
            node.stop();
          } catch (error) {
            /* already stopped */
          }
        });

        if (playing.element) {
          playing.element.pause();
        }

        loop.output.disconnect();
      }, FADE_SECONDS * 1000 + 100);
      changed();
    }

    board.playingIds = function () {
      return Object.keys(loops);
    };

    // Browsers only allow sound after a click on the page; call this from a click.
    board.unlock = function () {
      engine();
    };

    board.isPlaying = function (id) {
      return Boolean(loops[id]);
    };

    // Loops you switch by hand; "you" keeps them on even if effects change.
    board.toggleLoop = function (id) {

      if (loops[id] && loops[id].reasons.has("you")) {
        stopLoop(id, "you");
      } else {
        startLoop(id, "you");
      }
    };

    // Loops that follow the effects on the projector.
    board.matchEffects = function (wantedIds) {
      const wanted = new Set(wantedIds);
      Object.keys(loops).forEach(function (id) {

        if (loops[id].reasons.has("effects") && !wanted.has(id)) {
          stopLoop(id, "effects");
        }
      });
      wanted.forEach(function (id) {
        startLoop(id, "effects");
      });
    };

    board.play = function (id) {
      engine();

      if (SHOTS[id]) {
        SHOTS[id]();
        return;
      }

      const file = fileById(id);

      if (!file) {
        return;
      }

      const element = new Audio(file.url);
      audio.createMediaElementSource(element).connect(shotBus);
      element.play().catch(function () {});
    };

    // kind: "loops" or "shots"
    board.setVolume = function (kind, value) {

      if (kind === "loops") {
        board.loopVolume = value;
      } else {
        board.shotVolume = value;
      }

      const bus = kind === "loops" ? loopBus : shotBus;

      if (bus) {
        bus.gain.setTargetAtTime(value, audio.currentTime, 0.05);
      }
    };

    board.playingNames = function () {
      const names = {};
      board.builtInLoops.concat(board.eberronLoops).forEach(function (pair) {
        names[pair[0]] = pair[1];
      });
      board.files.forEach(function (file) {
        names[file.id] = file.name;
      });
      return Object.keys(loops).map(function (id) {
        return names[id] || id;
      });
    };

    board.stopAll = function () {
      Object.keys(loops).forEach(function (id) {
        stopLoop(id, null);
      });
    };

    return board;
  };
})();
