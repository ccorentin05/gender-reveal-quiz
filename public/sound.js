// ============================================================
//  Ambiance sonore de l'écran TV – 100 % synthétisée (Web Audio)
//  Aucun fichier audio, aucun droit d'auteur, fonctionne hors ligne.
//  Musique de fond douce + petits effets à chaque étape.
// ============================================================
window.Sound = (() => {
  let ctx = null, master, musicBus, sfxBus, noiseBuf;
  let enabled = false;
  let volume = 0.5;          // 0..1 (piloté par l'animateur)
  let muted = false;
  let loop = null;           // boucle musicale en cours
  let wantedLoop = null;     // boucle demandée (même si le son n'est pas encore activé)

  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const now = () => ctx.currentTime;

  // ---------- Initialisation ----------
  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    master = ctx.createGain();
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.6; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolume();
  }

  function unlock() {
    if (!ctx) init();
    enabled = true;
    return ctx.resume().then(() => { if (wantedLoop) startLoop(wantedLoop); });
  }

  function applyVolume() {
    if (!master) return;
    const v = muted ? 0 : volume * 1.6;
    master.gain.setTargetAtTime(Math.max(v, 0.0001), now(), 0.15);
  }
  function setVolume(v, isMuted) {
    volume = Math.min(1, Math.max(0, v));
    muted = !!isMuted;
    applyVolume();
  }
  const ready = () => enabled && ctx && ctx.state === 'running';

  // ---------- Instruments ----------
  function env(g, t, peak, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function osc(freq, t, dur, { type = 'sine', gain = 0.2, attack = 0.005, bus = sfxBus, cutoff = null, freqEnd = null, detune = 0 } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur * 0.9);
    o.detune.value = detune;
    const g = ctx.createGain();
    env(g, t, gain, attack, dur);
    let node = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cutoff;
      o.connect(f); node = f;
    }
    node.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(t, dur, { gain = 0.1, type = 'bandpass', freq = 1500, freqEnd = null, q = 1, attack = 0.005, bus = sfxBus } = {}) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    env(g, t, gain, attack, dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // Boîte à musique : fondamentale + harmoniques qui s'éteignent vite
  function musicBox(midi, t, gain = 0.1, bus = sfxBus, dur = 1.6) {
    const f = hz(midi);
    osc(f, t, dur, { gain, bus });
    osc(f * 2, t, dur * 0.5, { gain: gain * 0.25, bus });
    osc(f * 3.01, t, dur * 0.25, { gain: gain * 0.08, bus });
  }

  // Nappe douce (accord)
  function pad(midis, t, dur, gain = 0.035, bus = musicBus) {
    for (const m of midis) {
      osc(hz(m), t, dur, { type: 'sawtooth', gain, attack: dur * 0.35, bus, cutoff: 700, detune: -6 });
      osc(hz(m), t, dur, { type: 'sawtooth', gain, attack: dur * 0.35, bus, cutoff: 700, detune: 6 });
    }
  }

  function pluck(midi, t, gain = 0.07, bus = musicBus) {
    osc(hz(midi), t, 0.35, { type: 'triangle', gain, bus, cutoff: 2200 });
  }

  function brass(midi, t, dur, gain = 0.07) {
    for (const d of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = hz(midi); o.detune.value = d;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(500, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
      f.frequency.exponentialRampToValueAtTime(1200, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
      g.gain.setValueAtTime(gain, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  // ---------- Boucles musicales ----------
  const C = [60, 64, 67], Am = [57, 60, 64], F = [53, 57, 60], G = [55, 59, 62], Em = [52, 55, 59], Dm = [50, 53, 57];

  const LOOPS = {
    // Berceuse boîte à musique (accueil, gagnant)
    lobby: {
      step: 60 / 76 / 2,
      play(i, t, bus) {
        const prog = [C, Am, F, G, C, Em, F, G];
        const bar = Math.floor(i / 8) % prog.length, k = i % 8, ch = prog[bar];
        if (k === 0) { pad(ch, t, 60 / 76 * 4 + 0.6, 0.022, bus); osc(hz(ch[0] - 12), t, 2.4, { gain: 0.06, bus }); }
        const arp = [0, 1, 2, 3, 2, 1, 2, 3];
        const n = arp[k] === 3 ? ch[0] + 12 : ch[arp[k]];
        musicBox(n + 12, t, k % 2 ? 0.035 : 0.05, bus, 1.4);
        if (k === 4 && bar % 2 === 1) musicBox(ch[2] + 24, t + 0.02, 0.02, bus, 1.2);
      },
    },
    // Nappe calme (intro de question, classement, annonces)
    calm: {
      step: 60 / 66,
      play(i, t, bus) {
        const prog = [F, C, Dm, G];
        const ch = prog[Math.floor(i / 4) % prog.length];
        if (i % 4 === 0) pad([ch[0], ch[1], ch[2] + 12], t, 60 / 66 * 4 + 0.8, 0.02, bus);
        if (i % 2 === 1) musicBox(ch[(i >> 1) % 3] + 24, t, 0.025, bus, 1.8);
      },
    },
    // Musique de réflexion pendant le chrono
    think: {
      step: 60 / 116 / 2,
      play(i, t, bus) {
        const prog = [Am, F, C, G];
        const ch = prog[Math.floor(i / 8) % prog.length], k = i % 8;
        const pat = [0, 2, 1, 2, 0, 2, 1, 2];
        pluck(ch[pat[k]] + 12, t, k % 2 ? 0.04 : 0.06, bus);
        if (k === 0 || k === 4) osc(hz(ch[0] - 12), t, 0.4, { type: 'triangle', gain: 0.08, bus, cutoff: 600 });
        if (k % 2 === 1) noise(t, 0.04, { gain: 0.025, type: 'highpass', freq: 7000, bus });
      },
    },
  };

  function startLoop(name) {
    wantedLoop = name;
    if (!ready()) return;
    if (loop && loop.name === name) return;
    stopLoop(0.8);
    const L = LOOPS[name];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now());
    g.gain.exponentialRampToValueAtTime(1, now() + 1.2);
    g.connect(musicBus);
    let i = 0, next = now() + 0.1;
    const timer = setInterval(() => {
      while (next < now() + 0.25) { L.play(i, next, g); next += L.step; i += 1; }
    }, 50);
    loop = { name, timer, g };
  }

  function stopLoop(fade = 0.5) {
    if (!loop) return;
    clearInterval(loop.timer);
    const g = loop.g;
    g.gain.cancelScheduledValues(now());
    g.gain.setTargetAtTime(0.0001, now(), fade / 3);
    setTimeout(() => g.disconnect(), fade * 1000 + 3000);
    loop = null;
  }
  function silence() { wantedLoop = null; if (ready()) stopLoop(0.4); }

  // ---------- Effets ----------
  const fx = {
    whoosh(t = now()) { noise(t, 0.7, { gain: 0.06, freq: 400, freqEnd: 3000, q: 0.8, attack: 0.3 }); },
    start(t = now()) { musicBox(76, t, 0.09); musicBox(83, t + 0.12, 0.09); },
    tick(urgent, t = now()) {
      noise(t, 0.03, { gain: urgent ? 0.12 : 0.05, type: 'highpass', freq: 4000 });
      osc(urgent ? 1500 : 1100, t, 0.06, { gain: urgent ? 0.07 : 0.03 });
    },
    timeUp(t = now()) {
      osc(hz(67), t, 0.25, { type: 'triangle', gain: 0.08 });
      osc(hz(60), t + 0.18, 1.6, { type: 'triangle', gain: 0.09 });
      osc(hz(48), t + 0.18, 1.8, { gain: 0.1 });
    },
    reveal(t = now()) { [72, 76, 79, 84].forEach((m, i) => musicBox(m, t + i * 0.09, 0.09)); },
    jingle(t = now()) { [79, 84, 88].forEach((m, i) => musicBox(m, t + i * 0.12, 0.07)); },
    slide(t = now()) {
      noise(t, 2.1, { gain: 0.05, freq: 300, freqEnd: 2400, q: 1.2, attack: 0.6 });
      osc(220, t, 2.0, { gain: 0.03, freqEnd: 660, attack: 0.4 });
    },
    land(t = now()) { musicBox(79, t, 0.1); musicBox(91, t + 0.02, 0.04); },
    pop(t = now()) { osc(900, t, 0.14, { gain: 0.14, freqEnd: 320 }); musicBox(84, t + 0.05, 0.05); },
    agree(t = now()) { [72, 76, 79, 84, 88].forEach((m, i) => musicBox(m, t + i * 0.07, 0.08)); },
    disagree(t = now()) {
      // « wah wah » façon trombone, discret
      for (const [m, dt] of [[67, 0], [66, 0.32]]) {
        const s = t + dt;
        osc(hz(m), s, 0.36, { type: 'sawtooth', gain: 0.06, cutoff: 900, freqEnd: hz(m - 1), attack: 0.03 });
      }
    },
    drumroll(dur = 2.6, t = now()) {
      for (let x = 0; x < dur; x += 0.045) {
        const k = x / dur;
        noise(t + x, 0.05, { gain: 0.02 + 0.07 * k, freq: 2200, q: 0.7 });
      }
    },
    cymbal(t = now()) { noise(t, 2.2, { gain: 0.09, type: 'highpass', freq: 5000, attack: 0.002 }); },
    fanfare(t = now()) {
      fx.cymbal(t);
      brass(67, t, 0.18); brass(67, t + 0.2, 0.18); brass(67, t + 0.4, 0.18);
      brass(72, t + 0.6, 1.4, 0.08); brass(76, t + 0.6, 1.4, 0.06); brass(79, t + 0.6, 1.4, 0.05);
      [84, 88, 91, 96].forEach((m, i) => musicBox(m, t + 0.65 + i * 0.08, 0.06));
    },
    rise(n, t = now()) { musicBox([67, 72, 79][3 - n] || 72, t, 0.08); },
  };

  // ---------- Ambiance par étape ----------
  function scene(phase, q) {
    if (phase === 'lobby') return startLoop('lobby');
    if (phase === 'intro') { startLoop('calm'); return play('whoosh'); }
    if (phase === 'question') { startLoop('think'); return play('start'); }
    if (phase === 'locked') { silence(); return play('timeUp'); }
    if (phase === 'answer') { silence(); if (q && q.part === 1) play('reveal'); return; }
    if (phase === 'leaderboard') { startLoop('calm'); return play('jingle'); }
    if (phase === 'podium') { silence(); return play('drumroll', 3.0); }
    if (phase === 'winner') { silence(); play('fanfare'); setTimeout(() => startLoop('lobby'), 3500); return; }
    if (phase === 'part2intro' || phase === 'recap') { startLoop('calm'); return play('jingle'); }
  }

  function play(name, ...args) { if (ready() && fx[name]) fx[name](...args); }

  return { unlock, setVolume, scene, play, isOn: () => ready() };
})();
