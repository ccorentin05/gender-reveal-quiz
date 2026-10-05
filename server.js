'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const CONFIG = require('./questions');

// ------------------------------------------------------------
// Paramètres
// ------------------------------------------------------------
const PORT = Number(process.env.PORT) || 3000;
const HOST_KEY = process.env.HOST_KEY || 'romain';          // clé de l'écran animateur (?key=...)
const DURATION = (CONFIG.durationSeconds || 20) * 1000;     // durée d'une question en ms
const GRACE_MS = 300;                                       // tolérance réseau en fin de chrono

// ------------------------------------------------------------
// Questions : normalisation + ordre (partie 1, partie 2, finale)
// ------------------------------------------------------------
const normalize = (q) => {
  if (q.part === 1) {
    if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 4) {
      throw new Error(`Q${q.id} : il faut 2 à 4 propositions`);
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) {
      throw new Error(`Q${q.id} : "answer" doit être l'index de la bonne réponse`);
    }
    return { ...q };
  }
  return { ...q, choices: [q.left || 'Manon', q.right || 'Benjamin'] };
};

const ORDER = [
  ...CONFIG.questions.filter((q) => q.part === 1),
  ...CONFIG.questions.filter((q) => q.part === 2),
  ...CONFIG.questions.filter((q) => q.part === 'final'),
].map(normalize);

const FIRST_P2 = ORDER.findIndex((q) => q.part === 2);
const FIRST_FINAL = ORDER.findIndex((q) => q.part === 'final');
const PART_COUNT = (part) => ORDER.filter((q) => q.part === part).length;
const numberInPart = (q) => ORDER.filter((x) => x.part === q.part).indexOf(q) + 1;

// ------------------------------------------------------------
// URL de connexion + QR code
// ------------------------------------------------------------
function lanIp() {
  const candidates = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if ((i.family === 'IPv4' || i.family === 4) && !i.internal) candidates.push(i.address);
    }
  }
  return (
    candidates.find((a) => a.startsWith('192.168.')) ||
    candidates.find((a) => a.startsWith('10.')) ||
    candidates[0] ||
    'localhost'
  );
}
// Sur Render, RENDER_EXTERNAL_URL est fourni automatiquement (https://xxx.onrender.com)
const BASE_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://${lanIp()}:${PORT}`).replace(/\/$/, '');
const JOIN_URL = `${BASE_URL}/`;
let QR = '';

// ------------------------------------------------------------
// État de la partie
// ------------------------------------------------------------
let S;
let lockTimer = null;

// Son de la TV (non remis à zéro par « Réinitialiser la partie »)
const AUDIO = { volume: 0.5, muted: false };
const tvAudioOn = new Set();   // sockets TV dont le son est activé

function resetState() {
  clearTimeout(lockTimer);
  S = {
    phase: 'lobby',        // lobby | intro | question | locked | answer | leaderboard | podium | winner | part2intro | recap
    index: -1,             // index dans ORDER
    startedAt: 0,
    endsAt: 0,
    players: new Map(),    // id -> joueur
    scored: new Set(),     // questions déjà comptabilisées
    lastGains: {},         // points gagnés à la dernière question
    prevRanks: {},         // rang avant la dernière question (flèches ▲▼)
  };
}
resetState();

const current = () => ORDER[S.index] || null;
// Manon et Benjamin (rôle attribué par l'animateur) jouent la partie 2 et la question finale
const ROLES = ['manon', 'benjamin'];
const isCouple = (p) => ROLES.includes(p.role);
const guests = () => [...S.players.values()].filter((p) => !isCouple(p));
const coupleMember = (role) => [...S.players.values()].find((p) => p.role === role) || null;
const COUPLE_PARTS = [2, 'final'];
const playsQuestion = (p, q) => (isCouple(p) ? COUPLE_PARTS.includes(q?.part) : true);
// arrivé avant le lancement de la question + concerné par la question
const eligible = (p) => p.joinedAt <= S.startedAt && playsQuestion(p, current());
const connectedPlayers = () => [...S.players.values()].filter((p) => p.connected);

function ranking() {
  return guests()
    .sort((a, b) => b.score - a.score || a.totalTime - b.totalTime || a.name.localeCompare(b.name))
    .map((p, i) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      totalTime: Math.round(p.totalTime),
      rank: i + 1,
      gain: S.lastGains[p.id] || 0,
      prevRank: S.prevRanks[p.id] || null,
      connected: p.connected,
    }));
}

function countsFor(q) {
  const counts = q.choices.map(() => 0);
  for (const p of guests()) {
    const a = p.answers[q.id];
    if (a) counts[a.choice] += 1;
  }
  const total = counts.reduce((s, n) => s + n, 0);
  return { counts, total };
}

function sliderFor(q) {
  const { counts, total } = countsFor(q);
  const pctLeft = total ? Math.round((counts[0] / total) * 100) : 50;
  const majority = total && pctLeft !== 50 ? (pctLeft > 50 ? 0 : 1) : null;
  return { left: q.choices[0], right: q.choices[1], counts, total, pctLeft, pctRight: 100 - pctLeft, majority, couple: coupleAnswers(q) };
}

// Réponses de Manon et Benjamin à une question (null = pas de réponse / absent)
function coupleAnswers(q) {
  const out = {};
  for (const role of ROLES) {
    const p = coupleMember(role);
    out[role] = p ? { name: p.name, choice: p.answers[q.id] ? p.answers[q.id].choice : null } : null;
  }
  return out;
}

// Pendant le chrono : qui du couple a déjà répondu (sans dévoiler la réponse)
function coupleStatus(q) {
  if (!q || !COUPLE_PARTS.includes(q.part)) return null;
  const out = {};
  for (const role of ROLES) {
    const p = coupleMember(role);
    out[role] = p ? { name: p.name, answered: !!p.answers[q.id] } : null;
  }
  return out.manon || out.benjamin ? out : null;
}

function recap() {
  const rows = ORDER.filter((q) => q.part === 2)
    .map((q) => ({ id: q.id, text: q.text, ...sliderFor(q) }))
    .filter((r) => r.total > 0);
  const avgLeft = rows.length ? Math.round(rows.reduce((s, r) => s + r.pctLeft, 0) / rows.length) : 50;
  const tranchees = [...rows]
    .map((r) => ({ ...r, max: Math.max(r.pctLeft, r.pctRight) }))
    .sort((a, b) => b.max - a.max)
    .slice(0, 5);
  // Bilan du couple : d'accord entre eux ? d'accord avec les invités ?
  const both = rows.filter((r) => r.couple.manon?.choice != null && r.couple.benjamin?.choice != null);
  const withGuests = (role) => {
    const rs = rows.filter((r) => r.couple[role]?.choice != null && r.majority != null);
    return rs.length ? { same: rs.filter((r) => r.couple[role].choice === r.majority).length, total: rs.length } : null;
  };
  const couple = coupleMember('manon') || coupleMember('benjamin')
    ? {
        agree: both.filter((r) => r.couple.manon.choice === r.couple.benjamin.choice).length,
        both: both.length,
        manon: withGuests('manon'),
        benjamin: withGuests('benjamin'),
      }
    : null;
  return { avgLeft, avgRight: 100 - avgLeft, questions: rows.length, tranchees, couple };
}

// ------------------------------------------------------------
// Actions animateur : disponibilité selon la phase
// ------------------------------------------------------------
function actions() {
  const ph = S.phase;
  const cur = current();
  const next = ORDER[S.index + 1];
  const nextSamePart = !!(cur && next && next.part === cur.part);
  const endOfPart = !!cur && !nextSamePart;
  return {
    launch: ph === 'intro',
    stop: ph === 'question',
    reveal: ph === 'locked',
    leaderboard: ph === 'answer' && cur?.part === 1,
    next:
      (ph === 'lobby' && ORDER.length > 0) ||
      ph === 'part2intro' ||
      (['answer', 'leaderboard'].includes(ph) && nextSamePart),
    podium: cur?.part === 1 && endOfPart && ['answer', 'leaderboard'].includes(ph),
    winner: ph === 'podium',
    part2: FIRST_P2 >= 0 && (['podium', 'winner'].includes(ph) || (ph === 'lobby' && PART_COUNT(1) === 0)),
    recap: cur?.part === 2 && endOfPart && ph === 'answer',
    final: FIRST_FINAL >= 0 && ph === 'recap',
    reset: true,
  };
}

function lock() {
  if (S.phase !== 'question') return;
  clearTimeout(lockTimer);
  S.phase = 'locked';
  broadcast();
}

function scoreCurrent() {
  const q = current();
  if (!q || q.part !== 1 || S.scored.has(q.id)) return;
  // Flèches de progression seulement à partir de la 2e question
  S.prevRanks = S.scored.size ? Object.fromEntries(ranking().map((r) => [r.id, r.rank])) : {};
  S.scored.add(q.id);
  S.lastGains = {};
  for (const p of guests()) {
    const a = p.answers[q.id];
    if (a && a.correct) {
      p.score += a.points;
      S.lastGains[p.id] = a.points;
    }
    // Départage : temps cumulé (pas de réponse = durée max)
    p.totalTime += a ? a.time : DURATION;
  }
}

const OPS = {
  launch() {
    S.phase = 'question';
    S.startedAt = Date.now();
    S.endsAt = S.startedAt + DURATION;
    clearTimeout(lockTimer);
    lockTimer = setTimeout(lock, DURATION + GRACE_MS);
  },
  stop: lock,
  reveal() {
    scoreCurrent();
    S.phase = 'answer';
  },
  leaderboard() { S.phase = 'leaderboard'; },
  next() {
    if (S.phase === 'part2intro') S.index = FIRST_P2;
    else S.index += 1;
    S.phase = 'intro';
  },
  podium() { S.phase = 'podium'; },
  winner() { S.phase = 'winner'; },
  part2() { S.phase = 'part2intro'; },
  recap() { S.phase = 'recap'; },
  final() {
    S.index = FIRST_FINAL;
    S.phase = 'intro';
  },
  reset() {
    resetState();
    io.to('players').emit('player:kicked');
    io.in('players').socketsLeave('players');
  },
};

function checkAllAnswered() {
  if (S.phase !== 'question') return;
  const q = current();
  const expected = connectedPlayers().filter(eligible);
  if (expected.length && expected.every((p) => p.answers[q.id])) lock();
}

// ------------------------------------------------------------
// Vues envoyées aux clients
// ------------------------------------------------------------
const QUESTION_PHASES = ['intro', 'question', 'locked', 'answer', 'leaderboard'];

function questionView(q, withAnswer) {
  return {
    id: q.id,
    part: q.part,
    number: numberInPart(q),
    total: PART_COUNT(q.part),
    text: q.text,
    choices: q.choices,
    correct: withAnswer && q.part === 1 ? q.answer : null,
  };
}

function publicState(forHost = false) {
  const ph = S.phase;
  const q = current();
  const revealed = ['answer', 'leaderboard'].includes(ph);
  const showQ = q && QUESTION_PHASES.includes(ph);
  const expected = showQ ? connectedPlayers().filter(eligible).length : 0;
  const answered = showQ ? [...S.players.values()].filter((p) => p.answers[q.id]).length : 0;

  return {
    phase: ph,
    serverNow: Date.now(),
    duration: DURATION,
    endsAt: S.endsAt,
    joinUrl: JOIN_URL,
    qr: QR,
    prize: CONFIG.prize || '',
    audio: AUDIO,
    question: showQ ? questionView(q, revealed || forHost) : null,
    answered,
    expected,
    results: showQ && (revealed || forHost) ? (q.part === 1 ? countsFor(q) : sliderFor(q)) : null,
    players: connectedPlayers().map((p) => p.name),
    leaderboard: ['leaderboard', 'podium', 'winner'].includes(ph) || forHost ? ranking().slice(0, 10) : null,
    recap: ph === 'recap' ? recap() : null,
    couple: showQ && ['question', 'locked'].includes(ph) ? coupleStatus(q) : null,
  };
}

function hostState() {
  const couple = [...S.players.values()].filter(isCouple)
    .map((p) => ({ id: p.id, name: p.name, role: p.role, score: null, totalTime: 0, rank: null, connected: p.connected }));
  return { ...publicState(true), actions: actions(), allPlayers: [...couple, ...ranking()], tvAudio: tvAudioOn.size > 0 };
}

function playerState(p) {
  const ph = S.phase;
  const q = current();
  const a = q ? p.answers[q.id] : null;
  const rk = ranking();
  const showQ = q && QUESTION_PHASES.includes(ph);
  return {
    phase: ph,
    serverNow: Date.now(),
    endsAt: S.endsAt,
    me: { name: p.name, role: p.role || null, score: p.score, rank: rk.findIndex((r) => r.id === p.id) + 1, total: rk.length },
    spectator: !!q && isCouple(p) && !playsQuestion(p, q),
    question: showQ ? { id: q.id, part: q.part, number: numberInPart(q), total: PART_COUNT(q.part), choices: q.choices } : null,
    canAnswer: ph === 'question' && !a && eligible(p),
    late: showQ && ['question', 'locked'].includes(ph) && playsQuestion(p, q) && !eligible(p),
    myAnswer: a ? a.choice : null,
    result:
      showQ && ['answer', 'leaderboard'].includes(ph) && q.part === 1
        ? { answered: !!a, correct: !!a?.correct, points: a?.correct ? a.points : 0, correctLabel: q.choices[q.answer] }
        : null,
  };
}

function broadcast() {
  io.to('tv').emit('state', publicState(false));
  io.to('host').emit('state', hostState());
  for (const p of S.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('state', playerState(p));
  }
}

// ------------------------------------------------------------
// Serveur HTTP + Socket.IO
// ------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const pub = path.join(__dirname, 'public');
app.get('/health', (_req, res) => res.send('ok'));
app.get('/', (_req, res) => res.sendFile(path.join(pub, 'play.html')));
app.get('/tv', (_req, res) => res.sendFile(path.join(pub, 'tv.html')));
app.get('/host', (_req, res) => res.sendFile(path.join(pub, 'host.html')));
app.use(express.static(pub));

function cleanName(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 20);
}
function uniqueName(name) {
  const taken = new Set([...S.players.values()].map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  let i = 2;
  while (taken.has(`${name} ${i}`.toLowerCase())) i += 1;
  return `${name} ${i}`;
}
function attach(p, socket) {
  if (p.socketId && p.socketId !== socket.id) {
    io.sockets.sockets.get(p.socketId)?.leave('players');
  }
  p.socketId = socket.id;
  p.connected = true;
  socket.data.playerId = p.id;
  socket.join('players');
}

io.on('connection', (socket) => {
  socket.on('tv:join', () => {
    socket.join('tv');
    socket.data.tv = true;
    socket.emit('state', publicState(false));
  });

  socket.on('tv:audio', ({ on } = {}) => {
    if (!socket.data.tv) return;
    if (on) tvAudioOn.add(socket.id); else tvAudioOn.delete(socket.id);
    broadcast();
  });

  // Réglage du son de la TV depuis l'écran animateur
  socket.on('host:audio', ({ volume, muted } = {}) => {
    if (!socket.data.host) return;
    if (typeof volume === 'number') AUDIO.volume = Math.min(1, Math.max(0, Math.round(volume * 10) / 10));
    if (typeof muted === 'boolean') AUDIO.muted = muted;
    broadcast();
  });

  socket.on('host:join', ({ key } = {}, cb) => {
    if (key !== HOST_KEY) return cb?.({ ok: false });
    socket.data.host = true;
    socket.join('host');
    cb?.({ ok: true });
    socket.emit('state', hostState());
  });

  socket.on('host:action', ({ action } = {}) => {
    if (!socket.data.host) return;
    if (!OPS[action] || !actions()[action]) return;
    OPS[action]();
    broadcast();
  });

  // L'animateur désigne Manon / Benjamin parmi les joueurs (un seul par rôle)
  socket.on('host:setRole', ({ playerId, role } = {}) => {
    if (!socket.data.host) return;
    const p = S.players.get(playerId);
    if (!p || (role && !ROLES.includes(role))) return;
    if (role) for (const o of S.players.values()) if (o.role === role) o.role = null;
    p.role = role || null;
    broadcast();
    checkAllAnswered();
  });

  socket.on('player:resume', ({ playerId } = {}, cb) => {
    const p = S.players.get(playerId);
    if (!p) return cb?.({ ok: false });
    attach(p, socket);
    cb?.({ ok: true, playerId: p.id, name: p.name });
    broadcast();
  });

  socket.on('player:join', ({ name } = {}, cb) => {
    const clean = cleanName(name);
    if (!clean) return cb?.({ ok: false, error: 'Entre ton prénom pour jouer.' });
    const p = {
      id: crypto.randomUUID(),
      name: uniqueName(clean),
      score: 0,
      totalTime: 0,
      answers: {},
      socketId: null,
      connected: false,
      role: null,
      joinedAt: Date.now(),
    };
    S.players.set(p.id, p);
    attach(p, socket);
    cb?.({ ok: true, playerId: p.id, name: p.name });
    broadcast();
  });

  socket.on('player:answer', ({ choice } = {}, cb) => {
    const p = S.players.get(socket.data.playerId);
    const q = current();
    if (!p || !q || S.phase !== 'question') return cb?.({ ok: false });
    if (p.answers[q.id] || !eligible(p)) return cb?.({ ok: false });
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return cb?.({ ok: false });

    const time = Math.min(Date.now() - S.startedAt, DURATION);
    const a = { choice, time };
    if (q.part === 1) {
      a.correct = choice === q.answer;
      a.points = a.correct ? Math.round(500 + 500 * ((DURATION - time) / DURATION)) : 0;
    }
    p.answers[q.id] = a;
    cb?.({ ok: true });
    broadcast();
    checkAllAnswered();
  });

  socket.on('disconnect', () => {
    if (tvAudioOn.delete(socket.id)) broadcast();
    const p = S.players.get(socket.data.playerId);
    if (p && p.socketId === socket.id) {
      p.connected = false;
      p.socketId = null;
      broadcast();
      checkAllAnswered();
    }
  });
});

QRCode.toDataURL(JOIN_URL, { margin: 1, width: 600, color: { dark: '#6B3F1D', light: '#FFFFFF' } })
  .then((url) => { QR = url; })
  .catch((e) => console.error('QR code :', e))
  .finally(() => {
    server.listen(PORT, () => {
      console.log('\n🎉  Quiz gender reveal prêt !\n');
      console.log(`  📺  Écran TV        : ${BASE_URL}/tv`);
      console.log(`  🎤  Écran animateur : ${BASE_URL}/host?key=${HOST_KEY}`);
      console.log(`  📱  Joueurs (QR)    : ${JOIN_URL}\n`);
      console.log(`  ${ORDER.length} question(s) chargée(s).\n`);
    });
  });
