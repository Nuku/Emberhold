// ============================================================
// EMBERHOLD — engine + UI
// ============================================================
'use strict';

const OFFLINE_CAP = 8 * 3600;   // seconds of offline simulation allowed
const OFFLINE_RATE = 0.5;       // offline runs at half speed

let state = null;
let activeTab = 'village';

// ---------- state ----------
function defaultState() {
  const res = {};
  for (const r of RESOURCES) res[r.id] = 0;
  const seen = {};
  const s = {
    v: 1,
    savedAt: Date.now(),
    day: 0,
    era: 1,
    pop: 4,
    growthT: 0,
    starveT: 0,
    res,
    seen,
    jobs: {},
    bld: {},
    techs: {},
    trialDone: {},
    trial: null,
    expeditions: {},
    echoes: 0,
    upgrades: {},
    landing: 'emberplain',
    landingsSeen: {},
    migrating: false,
    migrationSnapshot: null,
    pendingEchoes: 0,
    won: false,
    log: [],
  };
  s.res.food = 60;
  s.res.wood = 40;
  s.seen.food = true;
  s.seen.wood = true;
  return s;
}

// ---------- helpers ----------
function tech(id) { return !!state.techs[id]; }
function bld(id) { return state.bld[id] || 0; }
function era() { return state.era; }
function expDone(id) { return !!state.expeditions[id]; }
function trialCount(id) { return state.trialDone[id] || 0; }
function upg(id) { return state.upgrades[id] || 0; }
function trialMax(def) {
  return def.repeat > 0 ? def.repeat + (upg('oathkeepers') ? 1 : 0) : 0;
}
function echoesEarned() {
  return Math.max(0, Math.floor(Math.pow(Math.max(0, state.pop - 10), 2) / 100));
}
function canMigrate() {
  return bld('monument') > 0 && echoesEarned() >= 1 && !state.trial;
}
function expeditionCost(def) {
  if (!upg('oldMaps')) return def.cost;
  const out = {};
  for (const r in def.cost) out[r] = def.cost[r] * 0.75;
  return out;
}

// ---------- landings ----------
function landingDef() { return LANDINGS.find(l => l.id === state.landing) || LANDINGS[0]; }
function landingMod(res) {
  const m = landingDef().mods[res];
  return m === undefined ? 1 : m;
}
function modsHtml(def) {
  const parts = [];
  for (const res in def.mods) {
    const pct = Math.round((def.mods[res] - 1) * 100);
    const name = RESOURCES.find(r => r.id === res).name;
    parts.push(`<span class="${pct > 0 ? 'rate-pos' : 'rate-neg'}">${pct > 0 ? '+' : ''}${pct}% ${name}</span>`);
  }
  return parts.length ? parts.join(', ') : 'nothing more, nothing less';
}
function rollLanding(excludeId) {
  const options = LANDINGS.filter(l => l.id !== (excludeId || state.landing));
  const pick = options[Math.floor(Math.random() * options.length)];
  state.landing = pick.id;
  state.landingsSeen[pick.id] = true;
  return pick;
}
function perm(key) {
  switch (key) {
    case 'oralTradition': return trialCount('silence') > 0;
    case 'everwarm': return trialCount('longnight') > 0;
    case 'twinSouls': return trialCount('solitude') > 0;
    case 'blueprints': return trialCount('haste') > 0;
    case 'tinkerers': return trialCount('tinkering') > 0;
  }
  return false;
}
function trialActive(id) { return state.trial && state.trial.id === id; }

// ---------- storage ----------
function capacityOf(id) {
  const s = STORAGE[id];
  if (!s) return Infinity; // knowledge
  return Math.ceil((s.base + s.per * bld(s.bld)) *
    (1 + 0.2 * trialCount('overflow') + 0.15 * upg('deepCellars')));
}
function isFull(id) { return state.res[id] >= capacityOf(id) - 0.001; }

function popCap() {
  let cap = 6;
  cap += bld('hut') * (3 + upg('grandHut') + (perm('twinSouls') ? 2 : 0));
  cap += bld('aqueduct') * 4;
  if (trialActive('solitude')) cap = Math.min(cap, 10);
  return cap;
}
function assignedWorkers() {
  let n = 0;
  for (const j in state.jobs) n += state.jobs[j];
  return n;
}
function unassigned() { return state.pop - assignedWorkers(); }

function buildingCost(def) {
  const mult = Math.pow(def.scale, bld(def.id)) *
    (trialActive('frugality') ? 1.5 : 1) *
    Math.pow(0.9, trialCount('frugality')) *
    (perm('blueprints') ? 0.85 : 1);
  const out = {};
  for (const r in def.cost) out[r] = def.cost[r] * mult;
  return out;
}

function canAfford(cost) {
  for (const r in cost) if (state.res[r] < cost[r]) return false;
  return true;
}
function payCost(cost) {
  for (const r in cost) state.res[r] -= cost[r];
}

// ---------- production ----------
function seasonIndex() { return Math.floor((state.day % DAYS_PER_YEAR) / DAYS_PER_SEASON); }
function seasonMult() {
  const i = seasonIndex();
  if (SEASONS[i].name !== 'Winter') return SEASONS[i].mult;
  if (trialActive('longnight')) return 0.25;
  return perm('everwarm') ? 0.75 : 0.5;
}

function allMult() {
  let m = 1;
  m *= 1 + 0.05 * bld('shrine') + 0.10 * bld('factory');
  m *= 1 + 0.15 * bld('dynamo');
  m *= 1 + 0.002 * state.res.machinery;
  if (expDone('glacialPeaks')) m *= 1.10;
  if (perm('everwarm')) m *= 1.05;
  m *= 1 + 0.05 * upg('deepRoots');
  if (trialActive('haste')) m *= 0.70;
  return m;
}

function production() {
  const rates = {};
  for (const r of RESOURCES) rates[r.id] = 0;
  const global = allMult();

  // job output
  for (const j in JOBS) {
    const job = JOBS[j];
    const n = state.jobs[j] || 0;
    if (n > 0) {
      if (!job.inputs || (state.res.wood > 0 && state.res.stone > 0)) {
        rates[job.res] += n * job.base;
      }
      if (job.inputs) {
        for (const r in job.inputs) rates[r] -= n * job.inputs[r];
      }
    }
  }

  // expedition passives
  if (expDone('oldForest')) rates.wood += 1.5;
  if (expDone('foothills')) rates.stone += 1.0;
  if (expDone('sunkenRuins')) rates.knowledge += 0.3;
  if (expDone('emberVein')) rates.coal += 0.5;
  if (expDone('glacialPeaks')) rates.aether += 0.1;
  if (era() >= 2) rates.copper += 0.02; // trace deposits found throughout the Stone age

  // per-resource modifiers
  rates.food *= global * seasonMult() *
    (1 + 0.10 * bld('foragerLodge')) *
    (1 + 0.20 * bld('aqueduct')) *
    (1 + 0.10 * trialCount('scarcity')) *
    (trialActive('scarcity') ? 0.5 : 1);

  rates.wood *= global * (1 + 0.10 * bld('lumberYard')) * (expDone('oldForest') ? 1.15 : 1);
  rates.stone *= global * (1 + 0.10 * bld('stoneWorks')) * (expDone('foothills') ? 1.15 : 1);
  rates.knowledge *= global * (1 + 0.10 * bld('library')) *
    (tech('writing') ? 1.25 : 1) *
    (expDone('sunkenRuins') ? 1.15 : 1) *
    (perm('oralTradition') ? 1.5 : 1) *
    (trialActive('silence') ? 0 : 1);
  rates.iron *= global * (expDone('emberVein') ? 1.10 : 1);
  rates.copper *= global *
    (tech('copperProspecting') ? 1.75 : 1) *
    (tech('metallurgy') ? 2 : 1) *
    (tech('electricalEngineering') ? 1.5 : 1);
  rates.aether *= global * (expDone('glacialPeaks') ? 1.10 : 1);
  rates.coal *= global;
  rates.tools *= global;

  // the land itself
  for (const r in rates) rates[r] *= landingMod(r);

  // consumption
  rates.food -= state.pop * FOOD_PER_POP;
  return rates;
}

function popGrowthNeed() { return 20 + state.pop * 4; }

// ---------- log ----------
function addLog(text, cls) {
  state.log.unshift({ d: Math.floor(state.day), t: text, c: cls || '' });
  if (state.log.length > 200) state.log.length = 200;
}

// ---------- trials ----------
function startTrial(id) {
  if (state.trial) return;
  const def = TRIALS.find(t => t.id === id);
  if (!def) return;
  if (def.repeat > 0 && trialCount(id) >= trialMax(def)) return;
  if (def.req && !def.req()) return;
  state.trial = { id, startDay: state.day, daysActive: 0, buildings: 0 };
  addLog(`The village swears the ${def.name}. ${def.mod}`, 'log-important');
}

function endTrial(success) {
  if (!state.trial) return;
  const def = TRIALS.find(t => t.id === state.trial.id);
  if (success) {
    state.trialDone[def.id] = trialCount(def.id) + 1;
    addLog(`${def.name} complete! ${def.reward}`, 'log-good');
  } else {
    addLog(`${def.name} failed. The oath is broken, but oaths can be sworn again.`, 'log-bad');
  }
  state.trial = null;
}

function updateTrial(dt) {
  if (!state.trial) return;
  const tr = state.trial;
  tr.daysActive += dt * DAY_RATE;
  switch (tr.id) {
    case 'scarcity':
      if (state.res.food <= 0) { endTrial(false); return; }
      if (tr.daysActive >= 240) { endTrial(true); return; }
      break;
    case 'frugality':
      if (tr.buildings >= 12) { endTrial(true); return; }
      break;
    case 'silence':
      if (tech('metallurgy')) { endTrial(true); return; }
      break;
    case 'longnight':
      if (tr.daysActive >= DAYS_PER_YEAR) { endTrial(true); return; }
      break;
    case 'solitude':
      if (state.res.knowledge >= 800) { endTrial(true); return; }
      break;
    case 'overflow': {
      let all = true;
      for (const r of RESOURCES) {
        if (!state.seen[r.id]) continue;
        const cap = capacityOf(r.id);
        if (cap !== Infinity && state.res[r.id] < cap - 0.001) { all = false; break; }
      }
      if (all) { endTrial(true); return; }
      break;
    }
    case 'tinkering':
      if (tr.daysActive >= 240 && (state.jobs.tinkerer || 0) > 0) { endTrial(true); return; }
      break;
    case 'haste':
      if (state.era >= 5) { endTrial(true); return; }
      if (tr.daysActive > 1200) { endTrial(false); return; }
      break;
  }
}

function trialProgressText() {
  if (!state.trial) return '';
  const tr = state.trial;
  switch (tr.id) {
    case 'scarcity': case 'longnight':
      return `${Math.floor(tr.daysActive)} / ${tr.id === 'scarcity' ? 240 : DAYS_PER_YEAR} days endured`;
    case 'frugality': return `${tr.buildings} / 12 buildings raised`;
    case 'silence': return 'Metallurgy must be researched in silence';
    case 'solitude': return `knowledge stockpiled: ${fmt(state.res.knowledge)} / 800`;
    case 'overflow': {
      let worst = 1;
      for (const r of RESOURCES) {
        if (!state.seen[r.id]) continue;
        const cap = capacityOf(r.id);
        if (cap === Infinity) continue;
        worst = Math.min(worst, state.res[r.id] / cap);
      }
      return `emptiest store: ${Math.floor(worst * 100)}% full — every discovered store must hit its ceiling`;
    }
    case 'tinkering': return `${Math.floor(tr.daysActive)} / 240 days endured — ${state.jobs.tinkerer || 0} Tinkerer assigned (need at least 1)`;
    case 'haste': return `${Math.floor(tr.daysActive)} / 1200 days to reach the Age of Light`;
  }
  return '';
}

// ---------- migration (the loop) ----------
function beginMigration() {
  if (!canMigrate()) return;
  state.pendingEchoes = echoesEarned();
  state.echoes += state.pendingEchoes;
  state.migrationSnapshot = { upgrades: { ...state.upgrades }, echoes: state.echoes - state.pendingEchoes };
  state.migrating = true;
  addLog(`The Great Migration is declared. The deeds of ${state.pop} villagers will echo: ${state.pendingEchoes} Echo${state.pendingEchoes === 1 ? '' : 's'} gained. Spend them before setting out.`, 'log-important');
}

function cancelMigration() {
  if (!state.migrating || !state.migrationSnapshot) return;
  state.upgrades = state.migrationSnapshot.upgrades;
  state.echoes = state.migrationSnapshot.echoes;
  state.migrating = false;
  state.migrationSnapshot = null;
  state.pendingEchoes = 0;
  addLog('The migration is called off. The village stays, and its Echoes return to the stillness.', '');
}

function migrationBuy(id) {
  const def = UPGRADES.find(u => u.id === id);
  if (!def || !state.migrating) return;
  const lvl = upg(id);
  if (lvl >= def.max) return;
  const cost = def.costs[lvl];
  if (state.echoes < cost) return;
  state.echoes -= cost;
  state.upgrades[id] = lvl + 1;
}

function migrationRefund(id) {
  const def = UPGRADES.find(u => u.id === id);
  if (!def || !state.migrating) return;
  const lvl = upg(id);
  if (lvl <= 0) return;
  state.upgrades[id] = lvl - 1;
  if (state.upgrades[id] === 0) delete state.upgrades[id];
  state.echoes += def.costs[lvl - 1];
}

function setOut() {
  if (!state.migrating) return;
  const up = { ...state.upgrades };
  const fromLanding = state.landing;
  addLog('The village sets out. The old Emberhold is left to the wind; a new one rises where the ground is kinder.', 'log-important');

  const keep = {
    techs: state.techs, day: state.day, seen: state.seen,
    echoes: state.echoes, upgrades: state.upgrades,
    trialDone: state.trialDone, expeditions: state.expeditions,
    landingsSeen: state.landingsSeen,
    won: state.won, savedAt: state.savedAt, log: state.log,
  };
  state = defaultState();
  state.techs = keep.techs;
  state.day = keep.day;
  state.seen = keep.seen;
  state.echoes = keep.echoes;
  state.upgrades = keep.upgrades;
  state.trialDone = keep.trialDone;
  state.expeditions = keep.expeditions;
  state.landingsSeen = keep.landingsSeen;
  state.won = keep.won;
  state.savedAt = keep.savedAt;
  state.log = keep.log;
  for (const t in ERA_GATE) if (state.techs[t] && ERA_GATE[t] > state.era) state.era = ERA_GATE[t];

  state.pop = 4 + 2 * upg('wanderers');
  if (up.lorekeepers) {
    state.bld.library = 1;
    state.res.knowledge = 30;
    state.seen.knowledge = true;
  }
  if (up.caravans) {
    state.res.food = Math.min(capacityOf('food'), 300);
    state.res.wood = Math.min(capacityOf('wood'), 300);
    state.res.stone = Math.min(capacityOf('stone'), 150);
    state.res.tools = Math.min(capacityOf('tools'), 25);
    state.seen.stone = true;
    state.seen.tools = true;
  }
  const landing = rollLanding(fromLanding);
  addLog(`The road ends at ${landing.name}. ${landing.text} (${modsHtml(landing).replace(/<[^>]+>/g, '')})`, 'log-important');
  state.migrating = false;
  state.migrationSnapshot = null;
  state.pendingEchoes = 0;
}

// ---------- core tick ----------
function tick(dt) {
  state.day += dt * DAY_RATE;

  const rates = production();
  for (const r in rates) {
    if (rates[r] > 0) {
      const cap = capacityOf(r);
      if (state.res[r] >= cap) continue; // a full store wastes the flow
      state.res[r] = Math.min(cap, state.res[r] + rates[r] * dt);
      state.seen[r] = true;
    } else if (rates[r] < 0) {
      state.res[r] = Math.max(0, state.res[r] + rates[r] * dt);
      state.seen[r] = true;
    }
  }

  // starvation
  if (state.res.food <= 0.0001) {
    state.res.food = 0;
    state.starveT += dt;
    if (state.starveT >= 20 && state.pop > 1) {
      state.pop--;
      state.starveT = 0;
      for (const j in state.jobs) state.jobs[j] = Math.min(state.jobs[j], state.pop);
      addLog('A villager has starved.', 'log-bad');
    }
  } else {
    state.starveT = 0;
  }

  // growth
  if (state.res.food > 0 && state.pop < popCap()) {
    state.growthT += dt;
    if (state.growthT >= popGrowthNeed()) {
      state.growthT = 0;
      state.pop++;
      if (state.pop % 5 === 0) addLog(`The village has grown to ${state.pop} souls.`, 'log-good');
    }
  }

  updateTrial(dt);

  // seasons
  const doy = Math.floor(state.day % DAYS_PER_YEAR);
  const sIdx = Math.floor(doy / DAYS_PER_SEASON);
  const prevDoy = Math.floor((state.day - dt * DAY_RATE) % DAYS_PER_YEAR);
  const pIdx = Math.floor(prevDoy / DAYS_PER_SEASON);
  if (sIdx !== pIdx) {
    const flavor = {
      Spring: 'Spring returns. The fields wake.',
      Summer: 'High summer. Provisions come easy.',
      Autumn: 'Autumn. The harvest slows.',
      Winter: 'Winter has come. Food grows scarce — plan for it.',
    };
    addLog(flavor[SEASONS[sIdx].name], SEASONS[sIdx].name === 'Winter' ? 'log-bad' : '');
  }
}

// ---------- actions ----------
function doBuild(id) {
  const def = BUILDINGS.find(b => b.id === id);
  if (!def) return;
  if (bld(id) >= def.max) return;
  if (def.req && !def.req()) return;
  if (trialActive('overflow') && Object.values(STORAGE).some(s => s.bld === id)) {
    addLog('The oath of the Overflow forbids new storage.', 'log-bad');
    return;
  }
  const cost = buildingCost(def);
  if (!canAfford(cost)) return;
  payCost(cost);
  state.bld[id] = bld(id) + 1;
  if (state.trial && state.trial.id === 'frugality') state.trial.buildings++;
  addLog(`${def.name} completed (${bld(id)}).`);

  if (id === 'beacon') {
    state.won = true;
    addLog('THE BEACON BURNS. A light on the horizon that no darkness in the chronicle can name. The story of Emberhold is told — and it is not over.', 'log-important');
    document.getElementById('banner').textContent =
      '✦ THE BEACON BURNS — Emberhold endures. You may keep playing. ✦';
    document.getElementById('banner').classList.remove('hidden');
  }
}

function doCraft(id) {
  const def = CRAFTS.find(c => c.id === id);
  if (!def || !def.req()) return;
  if (id === 'tools' && trialActive('tinkering')) return;
  if (!canAfford(def.cost)) return;
  for (const r in def.give) if (isFull(r)) return; // no room in the store
  payCost(def.cost);
  for (const r in def.give) {
    state.res[r] += def.give[r];
    state.seen[r] = true;
  }
}

function doResearch(id) {
  const def = TECHS.find(t => t.id === id);
  if (!def || tech(id)) return;
  if (def.req && !def.req()) return;
  if (state.res.knowledge < def.cost) return;
  state.res.knowledge -= def.cost;
  state.techs[id] = true;
  addLog(`Research complete: ${def.name}. ${def.desc}`, 'log-good');
  if (ERA_GATE[id] && ERA_GATE[id] > state.era) {
    state.era = ERA_GATE[id];
    addLog(`The village enters the ${ERAS[state.era - 1].name}.`, 'log-important');
  }
}

function doExpedition(id) {
  const def = EXPEDITIONS.find(e => e.id === id);
  if (!def || expDone(id)) return;
  if (state.pop < def.reqPop) return;
  const cost = expeditionCost(def);
  if (!canAfford(cost)) return;
  payCost(cost);
  state.expeditions[id] = true;
  addLog(`Expedition returned: ${def.name} is now part of Emberhold's world. ${def.effect}`, 'log-good');
}

function doAssign(job, delta) {
  const j = JOBS[job];
  if (!j || !j.unlock()) return;
  state.jobs[job] = state.jobs[job] || 0;
  if (delta > 0 && unassigned() <= 0) return;
  if (delta < 0 && state.jobs[job] <= 0) return;
  state.jobs[job] += delta;
}

// ---------- save / load ----------
function saveGame(silent) {
  state.savedAt = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    if (!silent) addLog('Chronicle saved.');
  } catch (e) { /* storage unavailable */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return null;
    const d = defaultState();
    // merge so new fields exist
    for (const k in d) if (s[k] === undefined) s[k] = d[k];
    for (const r of RESOURCES) if (s.res[r.id] === undefined) s.res[r.id] = 0;
    return s;
  } catch (e) { return null; }
}

function offlineProgress() {
  const elapsed = (Date.now() - state.savedAt) / 1000;
  if (elapsed < 60) return;
  const simSeconds = Math.min(elapsed, OFFLINE_CAP) * OFFLINE_RATE;
  const step = 2;
  for (let t = 0; t < simSeconds; t += step) tick(step);
  const hrs = (elapsed / 3600).toFixed(1);
  const got = Math.min(elapsed, OFFLINE_CAP);
  addLog(`While you were away (~${hrs} h, half-speed, capped at 8 h), the village carried on for ${Math.floor(got * OFFLINE_RATE)} seconds.`, 'log-important');
}

function exportSave() {
  saveGame(true);
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  window.prompt('Copy your save string:', data);
}
function importSave() {
  const data = window.prompt('Paste your save string:');
  if (!data) return;
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(data.trim()))));
    if (!s || s.v !== 1) throw new Error('bad');
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    location.reload();
  } catch (e) {
    addLog('That save string could not be read.', 'log-bad');
  }
}
function resetGame() {
  if (!window.confirm('Erase the chronicle of Emberhold and start anew?')) return;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

// ---------- formatting ----------
function fmt(n) {
  if (!isFinite(n)) return '?';
  const neg = n < 0;
  n = Math.abs(n);
  let s;
  if (n >= 1e12) s = (n / 1e12).toFixed(2) + 'T';
  else if (n >= 1e9) s = (n / 1e9).toFixed(2) + 'B';
  else if (n >= 1e6) s = (n / 1e6).toFixed(2) + 'M';
  else if (n >= 1e4) s = (n / 1e3).toFixed(1) + 'k';
  else if (n >= 100) s = Math.floor(n).toString();
  else if (n >= 10) s = (Math.round(n * 10) / 10).toString();
  else s = (Math.round(n * 100) / 100).toString();
  return neg ? '-' + s : s;
}
function fmtRate(n) {
  if (!n) return '';
  return ` ${n > 0 ? '+' : ''}${fmt(n)}/s`;
}
function costHtml(cost) {
  const parts = [];
  for (const r in cost) {
    const have = state.res[r] || 0;
    parts.push(`<span class="${have >= cost[r] ? 'ok' : 'lack'}">${fmt(cost[r])} ${RESOURCES.find(x => x.id === r).name}</span>`);
  }
  return parts.join(', ');
}

// ---------- UI ----------
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

function resVisible(id) {
  if (state.seen[id]) return true;
  // resources whose job exists are shown dimmed as teasers? No — hidden until seen.
  return false;
}

function renderHeader() {
  const doy = Math.floor(state.day % DAYS_PER_YEAR);
  const season = SEASONS[Math.floor(doy / DAYS_PER_SEASON)].name;
  const year = Math.floor(state.day / DAYS_PER_YEAR) + 1;
  document.getElementById('era-line').textContent =
    `Year ${year} of the ${ERAS[state.era - 1].name} — ${landingDef().name}`;
  document.getElementById('time-line').textContent =
    `Day ${doy % DAYS_PER_SEASON + 1} of ${season} — chronicle day ${Math.floor(state.day)}`;
  document.getElementById('pop-line').textContent =
    `${state.pop} villagers${unassigned() ? ` (${unassigned()} unassigned)` : ''} — housing for ${popCap()}`;
  const echoEl = document.getElementById('echo-line');
  if (bld('monument') > 0 || state.echoes > 0 || state.migrating) {
    echoEl.classList.remove('hidden');
    echoEl.textContent = state.migrating
      ? `Migration prepared — ${state.echoes} Echoes in the pouch`
      : `${state.echoes} Echo${state.echoes === 1 ? '' : 'es'} in the pouch — next migration at this size: ${echoesEarned()}`;
  } else {
    echoEl.classList.add('hidden');
  }
}

function renderVillage() {
  const rates = production();
  const L = landingDef();
  let h = `<h2 class="section">Where you stand — ${L.name}</h2>` +
    `<div class="res-note">${L.text}</div>` +
    `<div class="res-note" style="margin:2px 0 6px">The land gives: ${modsHtml(L)}</div>` +
    '<h2 class="section">Stores</h2>';
  for (const r of RESOURCES) {
    if (!resVisible(r.id)) continue;
    const rate = rates[r.id];
    const cls = rate > 0.0001 ? 'rate-pos' : (rate < -0.0001 ? 'rate-neg' : '');
    const cap = capacityOf(r.id);
    const amount = cap === Infinity
      ? fmt(state.res[r.id])
      : `${fmt(state.res[r.id])} / ${fmt(cap)}${isFull(r.id) ? ' FULL' : ''}`;
    h += `<div class="res-row">` +
      `<span class="res-name">${r.name}</span>` +
      `<span class="res-amount ${isFull(r.id) ? 'res-full' : ''}">${amount}</span>` +
      `<span class="res-rate ${cls}">${fmtRate(rate)}</span>` +
      `<span class="res-note">${r.note}</span>` +
      `</div>`;
  }

  h += '<h2 class="section">Crafting</h2>';
  for (const c of CRAFTS) {
    if (!c.req()) continue;
    const forbidden = c.id === 'tools' && trialActive('tinkering');
    const ok = !forbidden && canAfford(c.cost) && !Object.keys(c.give).some(r => isFull(r));
    const fullNote = forbidden ? ' — forbidden by the Trial of Tinkering' :
      (Object.keys(c.give).some(r => isFull(r)) ? ' — store full' : '');
    h += `<div class="card"><div class="card-head">` +
      `<span class="card-title">${c.name}</span>` +
      `<span class="card-effect">${c.desc}${fullNote}</span></div>` +
      `<div class="card-cost">cost: ${costHtml(c.cost)}</div>` +
      `<div class="card-actions"><button data-action="craft" data-id="${c.id}" ${ok ? '' : 'disabled'}>Craft ${c.give[Object.keys(c.give)[0]]}</button></div>` +
      `</div>`;
  }

  h += '<h2 class="section">Work — assign villagers</h2>';
  h += `<div class="res-row"><span class="res-name">Unassigned</span>` +
    `<span class="res-amount">${unassigned()}</span>` +
    `<span class="res-rate">of ${state.pop} villagers</span></div>`;
  for (const j in JOBS) {
    const job = JOBS[j];
    if (!job.unlock()) continue;
    const n = state.jobs[j] || 0;
    h += `<div class="job-row">` +
      `<span class="job-name">${job.name}</span>` +
      `<span class="job-assign">${n}</span>` +
      `<span class="job-rate">${fmt(job.base)} ${RESOURCES.find(r => r.id === job.res).name}/s each` +
      (job.inputs ? ` (uses ${Object.entries(job.inputs).map(([r, v]) => `${fmt(v)} ${RESOURCES.find(x => x.id === r).name.toLowerCase()}/s`).join(' + ')})` : '') +
      ` — ${job.desc}</span>` +
      `<span class="job-btns">` +
      `<button data-action="job-dec" data-job="${j}" ${n > 0 ? '' : 'disabled'}>−</button>` +
      `<button data-action="job-inc" data-job="${j}" ${unassigned() > 0 ? '' : 'disabled'}>+</button>` +
      `</span></div>`;
  }
  h += `<div class="res-note" style="margin-top:6px">Every villager eats ${fmt(FOOD_PER_POP)} food/s, working or not. Winters halve the fields; keep a store. Every store but Knowledge has a ceiling — what flows in past a full store is wasted. Storehouses raise the ceilings.</div>`;

  return h;
}

function renderBuild() {
  let h = '<h2 class="section">Construction</h2>';
  let any = false;
  for (const b of BUILDINGS) {
    const known = bld(b.id) > 0 || !b.req || b.req();
    if (!known) continue;
    any = true;
    const count = bld(b.id);
    const maxed = count >= b.max;
    const cost = buildingCost(b);
    const ok = !maxed && canAfford(cost);
    h += `<div class="card"><div class="card-head">` +
      `<span class="card-title">${b.name}</span>` +
      (b.max > 1 ? `<span class="card-count">${count} / ${b.max}</span>` : (count ? `<span class="card-count">built</span>` : '')) +
      `<span class="card-effect">${b.effect()}</span></div>` +
      `<div class="card-desc">${b.desc}</div>` +
      `<div class="card-cost">cost: ${costHtml(cost)}</div>` +
      `<div class="card-actions"><button data-action="build" data-id="${b.id}" ${ok ? '' : 'disabled'}>${maxed ? 'Complete' : 'Build'}</button></div>` +
      `</div>`;
  }
  if (!any) h += '<div class="res-note">Nothing to build yet. Learn from the world first.</div>';
  return h;
}

function renderResearch() {
  let h = '<h2 class="section">Research</h2>';
  let any = false;
  for (const t of TECHS) {
    if (t.req && !t.req()) continue;
    if (tech(t.id)) continue;
    any = true;
    const ok = state.res.knowledge >= t.cost;
    h += `<div class="card"><div class="card-head">` +
      `<span class="card-title">${t.name}</span>` +
      `<span class="card-count">${fmt(t.cost)} Knowledge</span></div>` +
      `<div class="card-desc">${t.desc}</div>` +
      `<div class="card-actions"><button data-action="research" data-id="${t.id}" ${ok ? '' : 'disabled'}>Research</button></div>` +
      `</div>`;
  }
  if (!any) h += '<div class="res-note">The wise have nothing left to learn here.</div>';
  h += `<div class="res-note" style="margin-top:6px">Knowledge is produced by Thinkers (build a Library first) and never returns once spent.</div>`;
  return h;
}

function renderTrials() {
  if (bld('monument') < 1) {
    return '<h2 class="section">Trials</h2>' +
      '<div class="card"><div class="card-desc">A stone monument, and oaths sworn upon it, would test this village against itself. ' +
      'The Monument becomes possible in the Age of Iron.</div></div>';
  }
  let h = '<h2 class="section">Trials — oaths sworn upon the Monument</h2>';
  h += `<div class="res-note">One trial may be sworn at a time. Completing a trial grants its reward forever; failing one costs nothing but time.${upg('oathkeepers') ? ' The Oathkeepers remember: repeatable trials may be sworn once more.' : ''}</div>`;
  for (const t of TRIALS) {
    const active = trialActive(t.id);
    const done = trialCount(t.id);
    const max = trialMax(t);
    const maxed = t.repeat > 0 ? done >= max : done > 0;
    const reqOk = !t.req || t.req();
    h += `<div class="card ${active ? 'trial-active' : ''} ${maxed ? 'done' : ''}">` +
      `<div class="card-head"><span class="card-title">${t.name}</span>` +
      `<span class="trial-count">${t.repeat > 0 ? `completed ${done} / ${max}` : (done ? 'completed' : 'sworn once only')}</span></div>` +
      `<div class="trial-mod">While sworn: ${t.mod}</div>` +
      `<div class="trial-goal">Goal: ${t.goal}</div>` +
      `<div class="trial-reward">Reward: ${t.reward}</div>`;
    if (active) {
      h += `<div class="trial-progress">${trialProgressText()}</div>` +
        `<div class="card-actions"><button data-action="trial-abandon">Break the oath (fail)</button></div>`;
    } else if (!maxed) {
      h += `<div class="card-actions"><button data-action="trial-start" data-id="${t.id}" ${reqOk && !state.trial ? '' : 'disabled'}>` +
        `${state.trial ? 'Another trial is sworn' : (reqOk ? 'Swear the oath' : 'Not yet possible')}</button></div>`;
    } else {
      h += `<div class="trial-progress">Its lesson has been learned.</div>`;
    }
    h += '</div>';
  }
  return h;
}

function renderExpeditions() {
  let h = '<h2 class="section">Expeditions — widen the world</h2>';
  h += '<div class="res-note">Each expedition is sent once. What it finds stays with Emberhold forever.</div>';
  let any = false;
  for (const e of EXPEDITIONS) {
    if (expDone(e.id)) {
      any = true;
      h += `<div class="card done"><div class="card-head"><span class="card-title">${e.name}</span>` +
        `<span class="card-effect">Established — ${e.effect}</span></div></div>`;
      continue;
    }
    if (state.era < 2 && e.id !== 'oldForest') { /* show all from era 2 onward */ }
    any = true;
    const popOk = state.pop >= e.reqPop;
    const ok = popOk && canAfford(e.cost);
    h += `<div class="card"><div class="card-head"><span class="card-title">${e.name}</span></div>` +
      `<div class="card-desc">${e.text}</div>` +
      `<div class="card-effect">Grants: ${e.effect}</div>` +
      `<div class="card-cost">cost: ${costHtml(e.cost)} — needs ${e.reqPop} villagers</div>` +
      `<div class="card-actions"><button data-action="exp" data-id="${e.id}" ${ok ? '' : 'disabled'}>Send the expedition</button></div>` +
      `</div>`;
  }
  return h;
}

function renderMigration() {
  if (bld('monument') < 1) {
    return '<h2 class="section">The Great Migration</h2>' +
      '<div class="card"><div class="card-desc">When the Monument stands, the village may weigh its own worth — ' +
      'and, if the generations have been generous, leave everything behind to found a new Emberhold, ' +
      'carrying only what echoes.</div></div>';
  }

  let h = '<h2 class="section">The Great Migration</h2>';
  h += `<div class="res-note">Declaring a migration abandons the village — villagers, stores, and every building are left behind. ` +
    `Research, trials learned, expeditions made, Echoes and everything bought with them endure. ` +
    `Echoes gained grow with the population you leave: floor((villagers − 10)² ÷ 100). ` +
    `The road, not the village, chooses the destination — each founding lands in different country, with its own gifts and shortages.</div>`;

  if (!state.migrating) {
    const earned = echoesEarned();
    h += `<div class="card"><div class="card-head">` +
      `<span class="card-title">Weigh the village</span>` +
      `<span class="card-count">${state.pop} villagers — ${earned} Echo${earned === 1 ? '' : 's'} on departure</span></div>` +
      `<div class="card-desc">A migration needs at least 20 villagers, a quiet Monument, and no oath currently sworn.</div>` +
      `<div class="card-actions"><button data-action="migration-begin" ${canMigrate() ? '' : 'disabled'}>` +
      `${state.trial ? 'An oath is sworn' : (canMigrate() ? 'Declare the Great Migration' : 'Not yet possible')}</button></div>` +
      `</div>`;
    h += renderShop();
    return h;
  }

  h += `<div class="card trial-active"><div class="card-head">` +
    `<span class="card-title">The migration is prepared</span>` +
    `<span class="card-count">+${state.pendingEchoes} Echoes earned — ${state.echoes} in the pouch</span></div>` +
    `<div class="card-desc">Buy and unbuy freely below — nothing is fixed until you set out. When you set out, ` +
    `the village is left behind and a new Emberhold rises with everything purchased here. ` +
    `Where it rises, no scout can say — the land you reach is the land you get.</div>` +
    `<div class="card-actions">` +
    `<button data-action="migration-out">Set out — found the new Emberhold</button> ` +
    `<button data-action="migration-cancel">Call it off</button></div>` +
    `</div>`;
  h += renderShop();
  return h;
}

function renderShop() {
  let h = '<h2 class="section">Ancestral Shop — what echoes endure</h2>';
  if (!state.migrating) {
    h += '<div class="res-note">Points can be added and removed only while a migration is being prepared — a fresh respec before every founding, handy for swearing trials.</div>';
  }
  for (const u of UPGRADES) {
    const lvl = upg(u.id);
    const maxed = lvl >= u.max;
    const nextCost = maxed ? null : u.costs[lvl];
    h += `<div class="card ${maxed ? 'done' : ''}"><div class="card-head">` +
      `<span class="card-title">${u.name}</span>` +
      `<span class="card-count">${lvl} / ${u.max}</span>` +
      `<span class="card-effect">${u.effect}</span></div>` +
      `<div class="card-desc">${u.desc}</div>` +
      `<div class="card-cost">${maxed ? 'fully learned' : `next level: ${nextCost} Echo${nextCost === 1 ? '' : 'es'}`}</div>` +
      `<div class="card-actions">` +
      `<button data-action="migration-buy" data-id="${u.id}" ${state.migrating && !maxed && state.echoes >= nextCost ? '' : 'disabled'}>Buy</button> ` +
      `<button data-action="migration-refund" data-id="${u.id}" ${state.migrating && lvl > 0 ? '' : 'disabled'}>Refund</button>` +
      `</div></div>`;
  }
  return h;
}

function renderLog() {
  const el = document.getElementById('log');
  let h = '';
  for (const e of state.log.slice(0, 80)) {
    h += `<div class="log-entry ${e.c}"><span class="log-day">d${e.d}</span>${esc(e.t)}</div>`;
  }
  el.innerHTML = h;
}

function render() {
  renderHeader();
  const panels = {
    village: renderVillage,
    build: renderBuild,
    research: renderResearch,
    trials: renderTrials,
    expeditions: renderExpeditions,
    migration: renderMigration,
  };
  document.getElementById('panel-' + activeTab).innerHTML = panels[activeTab]();
  renderLog();
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#tabs .tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('panel-' + tab).classList.remove('hidden');
  render();
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  const a = btn.dataset.action;
  switch (a) {
    case 'tab': switchTab(btn.dataset.tab); break;
    case 'job-inc': doAssign(btn.dataset.job, +1); render(); break;
    case 'job-dec': doAssign(btn.dataset.job, -1); render(); break;
    case 'build': doBuild(btn.dataset.id); render(); break;
    case 'craft': doCraft(btn.dataset.id); render(); break;
    case 'research': doResearch(btn.dataset.id); render(); break;
    case 'trial-start': startTrial(btn.dataset.id); render(); break;
    case 'trial-abandon': endTrial(false); render(); break;
    case 'exp': doExpedition(btn.dataset.id); render(); break;
    case 'migration-begin': beginMigration(); render(); break;
    case 'migration-cancel': cancelMigration(); render(); break;
    case 'migration-out': setOut(); render(); break;
    case 'migration-buy': migrationBuy(btn.dataset.id); render(); break;
    case 'migration-refund': migrationRefund(btn.dataset.id); render(); break;
    case 'save': saveGame(); render(); break;
    case 'export': exportSave(); break;
    case 'import': importSave(); break;
    case 'reset': resetGame(); break;
  }
});

// ---------- boot ----------
function boot() {
  state = loadGame();
  if (state) {
    // drop assignments that no longer qualify (e.g. saves from before a job gate changed)
    for (const j in state.jobs) if (!JOBS[j] || !JOBS[j].unlock()) delete state.jobs[j];
    offlineProgress();
    addLog('The chronicle resumes.', '');
  } else {
    state = defaultState();
    addLog('A handful of survivors halts in the shelter of a burnt palisade. They name the place Emberhold.', 'log-important');
    addLog('Assign Foragers and Woodcutters below, keep food in the store, and raise Huts as children arrive. Knowledge is written in Libraries, and every store has a ceiling the Storehouse raises.', '');
  }
  if (state.won) {
    document.getElementById('banner').textContent =
      '✦ THE BEACON BURNS — Emberhold endures. You may keep playing. ✦';
    document.getElementById('banner').classList.remove('hidden');
  }
  document.getElementById('btn-save').addEventListener('click', () => { saveGame(); render(); });
  document.getElementById('btn-export').addEventListener('click', exportSave);
  document.getElementById('btn-import').addEventListener('click', importSave);
  document.getElementById('btn-reset').addEventListener('click', resetGame);
  document.querySelectorAll('#tabs .tab').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 5); // clamp long tab sleeps
    last = now;
    tick(dt);
  }, 250);
  setInterval(render, 500);
  setInterval(() => saveGame(true), 15000);
  window.addEventListener('beforeunload', () => saveGame(true));
  render();
}

boot();
