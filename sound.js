/* Sound board for the table screen's control window.

   Built-in sounds are recordings shipped in Theatre's audio folder.
   Your own files (in Theatre's sounds folder) are played the same way: loops repeat, the rest play once.

   const board = TableSound();
   board.toggleLoop("rainLight");     // built-in or file loops, by id
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
        // the one-shots are small: have them ready for the first click
        ["thunder", "sword", "explosion", "underwaterExplosion", "roar", "knock", "heavyKnock", "creak", "heartbeat", "bell", "whoosh", "magicHealing", "magicDark", "magicElemental", "horn", "steam", "zap"].forEach(function (id) {
          loadRecording(id).catch(function () {});
        });
      }

      if (audio.state === "suspended") {
        audio.resume();
      }

      return audio;
    }

    function gainNode(value) {
      const node = audio.createGain();
      node.gain.value = value;
      return node;
    }

    // ---------- built-in recordings (Theatre's audio folder) ----------

    const RECORDINGS = {
      fire: "/audio/fire.mp3",
      waves: "/audio/waves.mp3",
      drips: "/audio/drips.mp3",
      tavern: "/audio/tavern-crowd.mp3",
      tavernEmpty: "/audio/tavern-empty.mp3",
      sword: "/audio/sword.wav",
      knock: "/audio/knock.mp3",
      heavyKnock: "/audio/heavy-knock.mp3",
      creak: "/audio/creak.mp3",
      heartbeat: "/audio/heartbeat.mp3",
      bell: "/audio/bell.mp3",
      thunder: "/audio/thunder.mp3",
      explosion: "/audio/explosion.wav",
      underwaterExplosion: "/audio/underwater-explosion.mp3",
      roar: "/audio/roar.mp3",
      forest: "/audio/forest-night.mp3",
      forestDay: "/audio/forest-day.mp3",
      rainHard: "/audio/rain-hard.mp3",
      rainLight: "/audio/rain-light.mp3",
      windHard: "/audio/wind-hard.mp3",
      windSoft: "/audio/wind-soft.mp3",
      whoosh: "/audio/whoosh.mp3",
      magicHealing: "/audio/magic-healing.mp3",
      magicDark: "/audio/magic-dark.mp3",
      magicElemental: "/audio/magic-elemental.mp3",
      airship: "/audio/airship.mp3",
      rail: "/audio/lightning-rail.mp3",
      sharn: "/audio/sharn-streets.mp3",
      windmill: "/audio/windmill.mp3",
      clock: "/audio/clock.mp3",
      clockOminous: "/audio/clock-ominous.mp3",
      horn: "/audio/rail-horn.mp3",
      steam: "/audio/steam.mp3",
      zap: "/audio/zap.mp3",
    };
    const recordingBuffers = {};
    const soundSpans = {};

    // Where the sound really starts and ends, in seconds. Exported files often have a silent tail, and MP3s a few
    // milliseconds of encoder silence at the start; a loop would play either as a dropout at every repeat.
    function findSoundSpan(buffer) {
      let first = buffer.length - 1;
      let last = 0;

      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const data = buffer.getChannelData(channel);
        let index = 0;

        while (index < first && Math.abs(data[index]) < 0.0001) {
          index += 1;
        }

        first = Math.min(first, index);
        index = data.length - 1;

        while (index > last && Math.abs(data[index]) < 0.0001) {
          index -= 1;
        }

        last = Math.max(last, index);
      }

      if (last <= first) {
        return { start: 0, end: buffer.duration };
      }

      return { start: first / buffer.sampleRate, end: (last + 1) / buffer.sampleRate };
    }

    // Decoded once and kept, so loops repeat without a gap and one-shots start at once.
    function loadRecording(id) {

      if (!recordingBuffers[id]) {
        recordingBuffers[id] = fetch(RECORDINGS[id])
          .then(function (response) {

            if (!response.ok) {
              throw new Error("Missing sound " + RECORDINGS[id]);
            }

            return response.arrayBuffer();
          })
          .then(function (data) {
            return audio.decodeAudioData(data);
          })
          .then(function (buffer) {
            soundSpans[id] = findSoundSpan(buffer);
            return buffer;
          });
        recordingBuffers[id].catch(function () {
          delete recordingBuffers[id];
        });
      }

      return recordingBuffers[id];
    }

    function playRecording(id, destination, loop) {

      const playing = { nodes: [], state: { stopped: false } };
      loadRecording(id).then(function (buffer) {

        if (playing.state.stopped) {
          return;
        }

        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;
        source.connect(destination);

        if (loop) {
          source.loopStart = soundSpans[id].start;
          source.loopEnd = soundSpans[id].end;
          source.start(0, soundSpans[id].start);
        } else {
          source.start();
        }

        playing.nodes.push(source);
      }).catch(function () {});
      return playing;
    }

    board.builtInLoops = [
      ["rainLight", "Rain light"],
      ["rainHard", "Rain hard"],
      ["windSoft", "Wind soft"],
      ["windHard", "Wind hard"],
      ["fire", "Fire"],
      ["waves", "Waves"],
      ["drips", "Cave drips"],
      ["tavern", "Tavern crowd"],
      ["tavernEmpty", "Tavern empty"],
      ["forestDay", "Forest day"],
      ["forest", "Forest night"],
    ];
    board.eberronLoops = [
      ["rail", "Lightning rail"],
      ["airship", "Airship"],
      ["sharn", "Sharn streets"],
      ["clock", "Clock"],
      ["clockOminous", "Clock ominous"],
    ];
    board.sothmereLoops = [
      ["windmill", "Windmill"],
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
      ["underwaterExplosion", "Underwater explosion"],
      ["roar", "Roar"],
      ["knock", "Knock"],
      ["heavyKnock", "Heavy knock"],
      ["creak", "Creak"],
      ["heartbeat", "Heartbeat"],
      ["bell", "Bell"],
      ["whoosh", "Whoosh"],
      ["magicHealing", "Healing magic"],
      ["magicDark", "Dark magic"],
      ["magicElemental", "Elemental magic"],
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

      if (RECORDINGS[id]) {
        playing = playRecording(id, output, true);
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

      if (RECORDINGS[id]) {
        playRecording(id, shotBus, false);
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
      board.builtInLoops.concat(board.eberronLoops, board.sothmereLoops).forEach(function (pair) {
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
