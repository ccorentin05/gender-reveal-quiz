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

  // ---------- Batterie & basse ----------
  function kick(t, bus, gain = 0.5) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain(); env(g, t, gain, 0.002, 0.32);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.36);
  }
  function clap(t, bus, gain = 0.16) {
    for (const d of [0, 0.011, 0.022]) noise(t + d, 0.09 + d, { gain: gain * (d ? 0.6 : 1), freq: 1300, q: 0.9, bus });
    osc(190, t, 0.08, { type: 'triangle', gain: gain * 0.4, bus });
  }
  function hat(t, bus, gain = 0.05, open = false) { noise(t, open ? 0.18 : 0.035, { gain, type: 'highpass', freq: 8000, bus }); }
  function bass(midi, t, dur, bus, gain = 0.16, cutoff = 520) {
    osc(hz(midi), t, dur, { type: 'sawtooth', gain, bus, cutoff, attack: 0.004 });
    osc(hz(midi - 12), t, dur, { type: 'sine', gain: gain * 0.9, bus, attack: 0.004 });
  }
  function lead(midi, t, dur, bus, gain = 0.05) {
    osc(hz(midi), t, dur, { type: 'square', gain, bus, cutoff: 2600, attack: 0.004 });
    osc(hz(midi), t, dur, { type: 'triangle', gain: gain * 0.8, bus, attack: 0.004, detune: 8 });
  }
  function chordStab(midis, t, bus, gain = 0.035, dur = 0.16) {
    for (const m of midis) osc(hz(m), t, dur, { type: 'sawtooth', gain, bus, cutoff: 1800, attack: 0.003 });
  }

  // ---------- Boucles musicales (pas = double-croche) ----------
  const C = [60, 64, 67], G = [55, 59, 62], Am = [57, 60, 64], F = [53, 57, 60], Em = [52, 55, 59], Dm = [50, 53, 57];
  const Bb = [58, 62, 65], Gm = [55, 58, 62], A7 = [57, 61, 64];
  const sixteenth = (bpm) => 60 / bpm / 4;
  let urgent = false;

  const LOOPS = {
    // Accueil / gagnant : pop festive et entraînante
    party: {
      step: sixteenth(118),
      play(i, t, bus) {
        const prog = [C, G, Am, F], bar = Math.floor(i / 16) % 4, k = i % 16, ch = prog[bar];
        if (k % 4 === 0) kick(t, bus, 0.42);
        if (k === 4 || k === 12) clap(t, bus);
        if (k % 4 === 2) hat(t, bus, 0.05, true); else if (k % 2 === 0) hat(t, bus, 0.025);
        if (k % 2 === 0) bass(ch[0] - 12 + (k % 4 === 2 ? 12 : 0), t, 0.16, bus, 0.11);
        if (k === 2 || k === 7 || k === 10) chordStab([ch[0] + 12, ch[1] + 12, ch[2] + 12], t, bus, 0.022);
        const hook = [[0, 76], [3, 79], [6, 81], [8, 79], [11, 76], [14, 74]];
        const shift = [0, -1, 0, -3][bar];
        for (const [kk, m] of hook) if (k === kk) musicBox(m + 12 + shift, t, 0.045, bus, 0.9);
      },
    },
    // Question affichée (partie 1) : petite pulsation qui fait monter l'attente
    pulse: {
      step: sixteenth(118),
      play(i, t, bus) {
        const prog = [Am, F, C, G], k = i % 16, ch = prog[Math.floor(i / 16) % 4];
        if (k === 0 || k === 8) kick(t, bus, 0.3);
        if (k % 2 === 1) hat(t, bus, 0.02);
        if (k % 4 === 2) bass(ch[0] - 12, t, 0.12, bus, 0.08, 380);
        if (k === 0) pad([ch[0] + 12, ch[1] + 12, ch[2] + 12], t, sixteenth(118) * 16, 0.012, bus);
      },
    },
    // Chrono partie 1 : rythmé, s'emballe sur les 5 dernières secondes
    think: {
      step: sixteenth(128),
      play(i, t, bus) {
        const prog = [Am, F, C, G], k = i % 16, ch = prog[Math.floor(i / 16) % 4];
        if (k % 4 === 0) kick(t, bus, 0.42);
        if (k === 4 || k === 12) clap(t, bus, 0.12);
        hat(t, bus, k % 2 ? 0.02 : 0.035);
        bass(ch[0] - 12 + (k % 8 === 6 ? 7 : 0), t, 0.1, bus, 0.09, 600);
        const arp = [0, 1, 2, 1];
        if (k % 2 === 0) pluck(ch[arp[(k / 2) % 4]] + 12, t, 0.035, bus);
        if (urgent) {
          clap(t, bus, k % 2 ? 0.05 : 0.08);
          if (k % 2 === 0) lead(ch[2] + 24, t, 0.07, bus, 0.03);
        }
      },
    },
    // Chrono partie 2 : « duel » funky, Manon contre Benjamin
    duel: {
      step: sixteenth(112),
      play(i, t, bus) {
        const prog = [Dm, Bb, F, A7], k = i % 16, ch = prog[Math.floor(i / 16) % 4];
        if (k === 0 || k === 6 || k === 10) kick(t, bus, 0.42);
        if (k === 4 || k === 12) clap(t, bus, 0.15);
        if (k % 2 === 0) hat(t, bus, k % 4 === 2 ? 0.045 : 0.025);
        const bl = { 0: 0, 3: 0, 6: 12, 8: 7, 10: 0, 13: 10, 14: 12 };
        if (k in bl) bass(ch[0] - 12 + bl[k], t, 0.13, bus, 0.12, 700);
        if (k === 2 || k === 9 || k === 14) chordStab([ch[0] + 12, ch[1] + 12, ch[2] + 12], t, bus, 0.025, 0.1);
        if (urgent && k % 2 === 1) hat(t, bus, 0.06, true);
      },
    },
    // Chrono question finale : suspense, battements de cœur
    heart: {
      step: sixteenth(92),
      play(i, t, bus) {
        const prog = [Am, F, Dm, Em], k = i % 16, ch = prog[Math.floor(i / 16) % 4];
        if (k === 0 || k === 3) kick(t, bus, k ? 0.3 : 0.45);
        if (k === 8 || k === 11) kick(t, bus, k === 8 ? 0.45 : 0.3);
        if (k === 0) pad([ch[0], ch[1] + 12, ch[2] + 12], t, sixteenth(92) * 16 + 0.3, 0.02, bus);
        if (k % 4 === 2) musicBox(ch[(i >> 2) % 3] + 24, t, 0.03, bus, 1.4);
        if (urgent) { hat(t, bus, 0.04); if (k % 2 === 0) clap(t, bus, 0.05); }
      },
    },
    // Classement : groove de victoire
    victory: {
      step: sixteenth(122),
      play(i, t, bus) {
        const prog = [F, G, Em, Am], k = i % 16, ch = prog[Math.floor(i / 16) % 4];
        if (k % 4 === 0) kick(t, bus, 0.4);
        if (k === 4 || k === 12) clap(t, bus, 0.15);
        if (k % 4 === 2) hat(t, bus, 0.05, true);
        if (k % 4 === 0 || k % 4 === 3) bass(ch[0] - 12, t, 0.14, bus, 0.11);
        if (k === 0 || k === 6 || k === 12) chordStab([ch[0] + 12, ch[1] + 12, ch[2] + 12], t, bus, 0.028, 0.22);
        if (k === 14) lead(ch[2] + 24, t, 0.1, bus, 0.03);
      },
    },
    // Annonces / récap : house douce
    groove: {
      step: sixteenth(110),
      play(i, t, bus) {
        const prog = [C, Am, F, G], k = i % 16, ch = prog[Math.floor(i / 16) % 4];
        if (k % 4 === 0) kick(t, bus, 0.32);
        if (k === 4 || k === 12) clap(t, bus, 0.09);
        if (k % 4 === 2) hat(t, bus, 0.04, true);
        if (k % 4 === 2) bass(ch[0] - 12, t, 0.18, bus, 0.09);
        if (k === 0) pad([ch[0] + 12, ch[1] + 12, ch[2] + 12], t, sixteenth(110) * 16, 0.014, bus);
        if (k % 4 === 3) musicBox(ch[(k >> 2) % 3] + 24, t, 0.025, bus, 1);
      },
    },
  };
  LOOPS.lobby = LOOPS.party;

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

  // ---------- Ambiance par étape (variantes selon l'écran) ----------
  function scene(phase, q) {
    urgent = false;
    const part = q && q.part;
    if (phase === 'lobby') return startLoop('party');
    if (phase === 'intro') { startLoop(part === 'final' ? 'heart' : part === 2 ? 'groove' : 'pulse'); return play('whoosh'); }
    if (phase === 'question') { startLoop(part === 'final' ? 'heart' : part === 2 ? 'duel' : 'think'); return play('start'); }
    if (phase === 'locked') { silence(); return play('timeUp'); }
    if (phase === 'answer') { silence(); if (part === 1) play('reveal'); return; }
    if (phase === 'leaderboard') { startLoop('victory'); return play('jingle'); }
    if (phase === 'podium') { silence(); return play('drumroll', 3.0); }
    if (phase === 'winner') { silence(); play('fanfare'); setTimeout(() => startLoop('party'), 3000); return; }
    if (phase === 'part2intro') { startLoop('duel'); return play('jingle'); }
    if (phase === 'recap') { startLoop('groove'); return play('jingle'); }
  }

  // Les 5 dernières secondes du chrono : la musique s'emballe
  function setUrgent(on) { urgent = !!on; }

  function play(name, ...args) { if (ready() && fx[name]) fx[name](...args); }

  return { unlock, setVolume, scene, play, setUrgent, isOn: () => ready() };
})();
