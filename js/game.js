// ============================================================
// EMBERHOLD — engine + UI
// ============================================================
'use strict';

const OFFLINE_CAP = 24 * 3600;  // seconds of offline simulation allowed
const OFFLINE_RATE = 1;         // offline runs at real time

let state = null;
let activeTab = 'village';
let buildFilter = 'incomplete';
let tooltipHover = false;
let pointerDown = false;

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
    morale: 70,
    moraleBand: 2,
    growthT: 0,
    starveT: 0,
    res,
    seen,
    jobs: {},
    bld: {},
    queues: { build: [], research: [], expedition: [] },
    factoryRecipe: 'goods',
    techs: {},
    trialDone: {},
    trial: null,
    expeditions: {},
    echoes: 0,
    upgrades: {},
    landing: 'emberplain',
    landingsSeen: {},
    species: 'human',
    lineagesUnlocked: { human: true },
    tradePartner: 'human',
    tribesSeen: { human: true },
    diplomacy: {},
    diplomats: {},
    diplomacyEventT: 0,
    randomEventT: 0,
    randomEventNext: 60,
    surveyPoints: 0,
    pendingLandings: [],
    pendingLanding: null,
    policy: 'commons',
    governor: null,
    council: [],
    guardInjuries: 0,
    guardRecruitment: 0,
    armor: 0,
    migrating: false,
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
function civicDef(id) { return CIVICS.find(c => c.id === id) || CIVICS[0]; }
function governorDef(id) { return GOVERNORS.find(g => g.id === id); }
function councilorDef(id) { return COUNCILORS.find(c => c.id === id); }
function governanceMod(res) {
  if (!tech('civics')) return 1;
  let m = civicDef(state.policy).mods?.[res] || 1;
  const g = governorDef(state.governor);
  if (g) m *= g.mods?.[res] || 1;
  for (const id of (state.council || [])) { const c = councilorDef(id); if (c) m *= c.mods?.[res] || 1; }
  return m;
}
function governanceStorageMod() {
  if (!tech('civics')) return 1;
  let m = civicDef(state.policy).storage || 1;
  if (governorDef(state.governor)?.storage) m *= governorDef(state.governor).storage;
  return m;
}
function governanceCostMod() {
  if (!tech('civics')) return 1;
  let m = civicDef(state.policy).cost || 1;
  if (governorDef(state.governor)?.cost) m *= governorDef(state.governor).cost;
  for (const id of (state.council || [])) m *= councilorDef(id)?.cost || 1;
  return m;
}
function governanceDefenseMod() {
  if (!tech('civics')) return 1;
  let m = civicDef(state.policy).defense || 1;
  if (governorDef(state.governor)?.defense) m *= governorDef(state.governor).defense;
  for (const id of (state.council || [])) m *= councilorDef(id)?.defense || 1;
  return m;
}
function tribeDef(id) { return TRIBES.find(t => t.id === id) || TRIBES[0]; }
function lineageDef(id) { return LINEAGES.find(l => l.id === id) || LINEAGES[0]; }
function lineageUnlocked(id) { return !!(state.lineagesUnlocked && state.lineagesUnlocked[id]); }
function habitatAllows(def, landingId) {
  const landing = LANDINGS.find(l => l.id === landingId);
  return !!def && (!def.habitats || !!landing && def.habitats.some(h => (landing.habitats || []).includes(h)));
}
function lineageSelectable(id, landingId = state.pendingLanding) {
  return lineageUnlocked(id) && habitatAllows(LINEAGES.find(l => l.id === id), landingId);
}
function localTribe(id) { return id === state.tradePartner && habitatAllows(tribeDef(id), state.landing); }
function habitatText(def) {
  return def.habitats ? `Habitat: ${LANDINGS.filter(l => habitatAllows(def, l.id)).map(l => l.name).join(', ')}.` : 'Habitat: any landing.';
}
function isMephit() { return state.species === 'mephit'; }
function armorLevel() { return Math.max(0, Number(state.armor) || 0); }
function tradeAvailable() { return tech('currency') && localTribe(state.tradePartner); }
function guardCap() { return bld('barracks') * 2; }
// Future buildings and research can multiply this rate (guards per second).
function guardRecruitmentRate() { return 1 / 120; }
function updateGuardRecruitment(dt) {
  const total = state.jobs.guard || 0;
  const cap = guardCap();
  if (!JOBS.guard.unlock() || total >= cap) {
    state.guardRecruitment = 0;
    return;
  }
  state.guardRecruitment += dt * guardRecruitmentRate();
  const recruits = Math.min(cap - total, Math.floor(state.guardRecruitment));
  state.jobs.guard = total + recruits;
  state.guardRecruitment = total + recruits >= cap ? 0 : state.guardRecruitment - recruits;
}
function randomDiplomacyRequest(id) {
  const available = RESOURCES.filter(r => r.id !== 'knowledge' && r.id !== 'currency' && r.id !== 'machinery' && r.id !== 'aether' && state.seen[r.id]);
  const preferred = available.filter(r => (tribeDef(id).requests || []).includes(r.id));
  const pool = preferred.length ? preferred : available;
  const res = (pool.length ? pool : [RESOURCES.find(r => r.id === 'wood')])[Math.floor(Math.random() * (pool.length || 1))];
  const ageScale = [1, 1.5, 2.5, 4, 6][Math.min(era() - 1, 4)];
  const baseByResource = { food: 120, wood: 100, stone: 80, tools: 12, copper: 15, iron: 20, coal: 25, steel: 15 };
  const target = (baseByResource[res.id] || 20) * ageScale * (0.9 + Math.random() * 0.2);
  const cap = capacityOf(res.id);
  const amount = Math.max(10, Math.round(Math.min(target, cap * 0.8) / 5) * 5);
  return { res: res.id, amount, age: era() };
}
function ensureDiplomacyEntry(id) {
  state.diplomacy = state.diplomacy || {};
  if (!state.diplomacy[id]) {
    state.diplomacy[id] = {
      disposition: Math.floor(Math.random() * 101) - 50,
      request: randomDiplomacyRequest(id),
    };
  } else if (!state.diplomacy[id].request || state.diplomacy[id].request.age === undefined) {
    state.diplomacy[id].request = randomDiplomacyRequest(id);
  }
  return state.diplomacy[id];
}
function diplomacyTone(disposition) {
  if (disposition >= 35) return 'request';
  if (disposition >= 0) return 'hope';
  if (disposition >= -35) return 'plea';
  if (disposition >= -70) return 'demand';
  return 'insist';
}
function diplomacyRequestText(tribe, entry) {
  const res = RESOURCES.find(r => r.id === entry.request.res).name;
  return `The ${tribe.name} ${diplomacyTone(entry.disposition)} ${fmt(entry.request.amount)} ${res}.`;
}
function diplomatCount(id) { return (state.diplomats && state.diplomats[id]) || 0; }
function totalDiplomats() { return Object.values(state.diplomats || {}).reduce((sum, n) => sum + n, 0); }
function performerCount() { return state.jobs?.performer || 0; }
function explorerCount() { return state.jobs?.explorer || 0; }
function alliedTribes() {
  const entry = state.diplomacy && state.diplomacy[state.tradePartner];
  return localTribe(state.tradePartner) && entry?.disposition >= 80 ? 1 : 0;
}
function ableGuards() { return Math.max(0, (state.jobs.guard || 0) - (state.guardInjuries || 0)); }
function trialMax(def) {
  return def.repeat > 0 ? def.repeat + (upg('oathkeepers') ? 1 : 0) : 0;
}
function trialDifficulty(id) {
  const completed = trialCount(id);
  switch (id) {
    case 'scarcity': return 0.5 / Math.pow(1.25, completed);
    case 'frugality': return 1.5 * Math.pow(1.5, completed);
    case 'overflow': return Math.pow(1.25, completed);
    default: return 1;
  }
}
function trialModifierText(def) {
  const multiplier = trialDifficulty(def.id);
  switch (def.id) {
    case 'scarcity': return `Food production is reduced to ${+(multiplier * 100).toFixed(2)}%.`;
    case 'frugality': return `All building costs are multiplied by ${+multiplier.toFixed(3)}.`;
    case 'overflow': return `${def.mod} Storage ceilings are multiplied by ${+multiplier.toFixed(3)} while sworn.`;
    default: return def.mod;
  }
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
function siteExpeditionsComplete() {
  return LANDINGS.every(l => EXPEDITIONS.some(e => e.landing === l.id && expDone(e.id)));
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
function rollTradePartner() {
  const nonHuman = TRIBES.filter(t => t.id !== 'human' && habitatAllows(t, state.landing));
  const pick = Math.random() < 0.35
    ? nonHuman[Math.floor(Math.random() * nonHuman.length)]
    : TRIBES[0];
  state.tradePartner = pick.id;
  state.tribesSeen[pick.id] = true;
  ensureDiplomacyEntry(pick.id);
  return pick;
}
function perm(key) {
  switch (key) {
    case 'oralTradition': return trialCount('silence') > 0;
    case 'everwarm': return trialCount('longnight') > 0;
    case 'twinSouls': return trialCount('solitude') > 0;
    case 'blueprints': return trialCount('haste') > 0;
    case 'tinkerers': return trialCount('tinkering') > 0;
    case 'factory': return trialCount('industrialization') > 0;
    case 'explorers': return trialCount('wayfinding') > 0;
  }
  return false;
}
function trialActive(id) { return state.trial && state.trial.id === id; }

// ---------- storage ----------
function capacityOf(id) {
  const s = STORAGE[id];
  if (!s) return Infinity; // knowledge
  return Math.ceil((s.base + s.per * bld(s.bld)) *
    (1 + 0.2 * trialCount('overflow') + 0.15 * upg('deepCellars')) * governanceStorageMod() *
    (trialActive('overflow') ? trialDifficulty('overflow') : 1));
}
function isFull(id) { return state.res[id] >= capacityOf(id) - 0.001; }

function popCap() {
  let cap = 6 + 2 * upg('wanderers');
  cap += bld('hut') * (3 + upg('grandHut') + (perm('twinSouls') ? 2 : 0));
  cap += bld('aqueduct') * 4;
  if (trialActive('solitude')) cap = Math.min(cap, 10);
  return cap;
}
function assignedWorkers() {
  let n = 0;
  for (const j in state.jobs) if (JOBS[j] && !JOBS[j].targeted && j !== 'guard') n += state.jobs[j];
  return n + totalDiplomats() + performerCount() + explorerCount();
}
function unassigned() { return state.pop - assignedWorkers(); }

// Reconcile the whole workforce, including specialists, after population loss
// or loading older saves. Keep food gatherers first when seats must be cut.
function reconcileWorkers() {
  let remaining = state.pop;
  const count = n => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  for (const id of Object.keys(JOBS)) {
    const job = JOBS[id];
    let n = job.unlock() && id !== 'diplomat' ? count(state.jobs[id]) : 0;
    if (id === 'guard') n = Math.min(n, guardCap());
    if (id !== 'guard') n = Math.min(n, remaining);
    if (n) state.jobs[id] = n;
    else delete state.jobs[id];
    if (id !== 'guard') remaining -= n;
  }
  for (const id of Object.keys(state.jobs)) if (!JOBS[id]) delete state.jobs[id];
  for (const id of Object.keys(state.diplomats)) {
    const n = tech('diplomacy') && state.diplomacy[id]
      ? Math.min(count(state.diplomats[id]), remaining) : 0;
    if (n) state.diplomats[id] = n;
    else delete state.diplomats[id];
    remaining -= n;
  }
  state.guardInjuries = Math.min(count(state.guardInjuries), state.jobs.guard || 0);
  state.guardRecruitment = JOBS.guard.unlock() && (state.jobs.guard || 0) < guardCap()
    ? Math.max(0, Math.min(0.999999, Number(state.guardRecruitment) || 0)) : 0;
}

function buildingCost(def) {
  const mult = Math.pow(def.scale, bld(def.id)) *
    (trialActive('frugality') ? trialDifficulty('frugality') : 1) *
    Math.pow(0.9, trialCount('frugality')) *
    (perm('blueprints') ? 0.85 : 1) * governanceCostMod();
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

function queueDef(entry) {
  if (!entry || !['build', 'research', 'expedition'].includes(entry.type)) return null;
  if (entry.type === 'build') return BUILDINGS.find(def => def.id === entry.id);
  if (entry.type === 'research') return TECHS.find(def => def.id === entry.id);
  return EXPEDITIONS.find(def => def.id === entry.id);
}

function queueCost(entry) {
  const def = queueDef(entry);
  if (!def) return null;
  if (entry.type === 'build') return buildingCost(def);
  if (entry.type === 'research') return { knowledge: def.cost };
  return expeditionCost(def);
}

function queueDemand() {
  const demand = {};
  for (const type of ['build', 'research', 'expedition']) {
    for (const entry of state.queues[type]) {
      const cost = queueCost(entry);
      if (!cost) continue;
      for (const [resource, amount] of Object.entries(cost)) {
        demand[resource] = (demand[resource] || 0) + amount;
      }
    }
  }
  return demand;
}

function queueCapacity(type) {
  if (type === 'expedition') return 1;
  const upgrade = type === 'build' ? 'buildingQueue' : 'researchQueue';
  const trial = type === 'build' ? 'buildingQueueTrial' : 'researchQueueTrial';
  return 1 + upg(upgrade) + trialCount(trial);
}

function queueTime(entry) {
  const cost = queueCost(entry);
  if (!cost) return Infinity;
  const rates = production(1);
  let seconds = 0;
  for (const resource in cost) {
    const missing = Math.max(0, cost[resource] - (state.res[resource] || 0));
    if (!missing) continue;
    if ((rates[resource] || 0) <= 0) return Infinity;
    seconds = Math.max(seconds, missing / rates[resource]);
  }
  return seconds;
}

function queueLabel(seconds) {
  if (seconds === Infinity) return 'waiting for supplies';
  if (seconds <= 0.01) return 'ready';
  return `${fmt(Math.ceil(seconds))}s`;
}

function queueEntry(type, id) {
  const def = queueDef({ type, id });
  if (!def || state.queues[type].length >= queueCapacity(type)) return false;
  if (type === 'build') {
    if (bld(id) >= def.max || (def.req && !def.req())) return false;
    if (trialActive('overflow') && Object.values(STORAGE).some(s => s.bld === id)) return false;
  } else if (type === 'research') {
    if (tech(id) || (def.req && !def.req())) return false;
  } else {
    if (expDone(id) || (def.landing && def.landing !== state.landing) || state.pop < def.reqPop) return false;
  }
  const cost = queueCost({ type, id });
  if (canAfford(cost)) return false;
  state.queues[type].push({ type, id });
  return true;
}

function cancelQueue(type, index) {
  if (Number.isInteger(index) && state.queues[type][index]) state.queues[type].splice(index, 1);
}

function attemptBuild(id) {
  const def = BUILDINGS.find(b => b.id === id);
  if (!def || state.queues.build.length >= queueCapacity('build')) return;
  if (canAfford(buildingCost(def))) doBuild(id);
  else queueEntry('build', id);
}

function attemptResearch(id) {
  const def = TECHS.find(t => t.id === id);
  if (!def || state.queues.research.length >= queueCapacity('research')) return;
  if (state.res.knowledge >= def.cost) doResearch(id);
  else queueEntry('research', id);
}

function attemptExpedition(id) {
  const def = EXPEDITIONS.find(e => e.id === id);
  if (!def || state.queues.expedition.length >= queueCapacity('expedition')) return;
  if (canAfford(expeditionCost(def))) doExpedition(id);
  else queueEntry('expedition', id);
}

function updateQueues() {
  for (const type of ['build', 'research', 'expedition']) {
    for (let i = state.queues[type].length - 1; i >= 0; i--) {
      const entry = state.queues[type][i];
      const def = queueDef(entry);
      if (!def) { state.queues[type].splice(i, 1); continue; }
      if (!canAfford(queueCost(entry))) continue;
      const before = type === 'build' ? bld(entry.id) : type === 'research' ? tech(entry.id) : expDone(entry.id);
      if (type === 'build') doBuild(entry.id);
      else if (type === 'research') doResearch(entry.id);
      else doExpedition(entry.id);
      const after = type === 'build' ? bld(entry.id) : type === 'research' ? tech(entry.id) : expDone(entry.id);
      if (after !== before) state.queues[type].splice(i, 1);
    }
  }
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
  return globalProductionFactors().reduce((m, [, factor]) => m * factor, 1);
}

function globalProductionFactors() {
  return [
    ['Morale', 0.70 + Math.max(0, Math.min(100, Number(state.morale) || 0)) * 0.0042857],
    [`Shrines (${bld('shrine')} × 5%) + factories (${bld('factory')} × 10%)`, 1 + 0.05 * bld('shrine') + 0.10 * bld('factory')],
    ['Dynamos', 1 + 0.15 * bld('dynamo')],
    ['Allied tribes', 1 + 0.05 * alliedTribes()],
    ['Stored machinery', 1 + 0.002 * state.res.machinery],
    ['Glacial Peaks', expDone('glacialPeaks') ? 1.10 : 1],
    ['All six sites explored', siteExpeditionsComplete() ? 1.05 : 1],
    ['Everwarm', perm('everwarm') ? 1.05 : 1],
    ['Deep Roots', 1 + 0.05 * upg('deepRoots')],
    ['Haste trial', trialActive('haste') ? 0.70 : 1],
  ];
}

function settlementProductionFactors(res) {
  const factors = [[landingDef().name, landingMod(res)], [lineageDef(state.species).name, lineageMod(res)]];
  for (const e of EXPEDITIONS) {
    if (expDone(e.id) && e.mods?.[res]) factors.push([e.name, e.mods[res]]);
  }
  if (tech('civics')) {
    for (const def of [civicDef(state.policy), governorDef(state.governor), ...(state.council || []).map(councilorDef)]) {
      if (def) factors.push([def.name, def.mods?.[res] || 1]);
    }
  }
  return factors;
}

function moraleCap() {
  return 100 + (tech('festivals') ? 15 : 0) + (tech('civicHarmony') ? 20 : 0);
}

function moraleBand(morale) {
  if (morale < 25) return 0;
  if (morale < 50) return 1;
  if (morale < 80) return 2;
  return 3;
}
function moraleLabel() {
  const m = Number(state.morale) || 0;
  return m < 25 ? 'despairing' : m < 50 ? 'uneasy' : m < 80 ? 'steady' : 'heartened';
}
function updateMorale(dt, foodRate) {
  const winter = SEASONS[seasonIndex()].name === 'Winter';
  let delta = 0;
  if (state.res.food <= 0.0001) delta -= 0.22;
  else if (foodRate < 0) delta -= 0.025;
  else if (state.res.food > 20) delta += state.morale < 70 ? 0.035 : -0.008;
  if (winter) delta -= 0.006;
  if (bld('shrine') > 0) delta += state.morale < 75 ? 0.012 : 0;
  delta += performerCount() * 0.10;
  const before = moraleBand(state.morale);
  state.morale = Math.max(0, Math.min(moraleCap(), state.morale + delta * dt));
  const after = moraleBand(state.morale);
  if (after !== before) {
    const messages = ['The village loses heart; work slows under despair.', 'Unease spreads through Emberhold.', 'The village finds its steady rhythm again.', 'The people are heartened; every task seems lighter.'];
    addLog(messages[after], after < before ? 'log-bad' : 'log-good');
    state.moraleBand = after;
  }
}

function updateExploration(dt) {
  if (!perm('explorers')) return;
  state.surveyPoints = (state.surveyPoints || 0) + explorerCount() * 0.025 * dt;
}

function randomRange(pair) {
  return Math.round(pair[0] + Math.random() * (pair[1] - pair[0]));
}
function randomEventResourceAmount(resource, pair) {
  const storage = STORAGE[resource];
  const scale = storage ? capacityOf(resource) / storage.base : 1;
  return Math.round(randomRange(pair) * scale);
}
function updateRandomEvents(dt) {
  state.randomEventT = (state.randomEventT || 0) + dt;
  if (state.randomEventT < (state.randomEventNext || 60)) return;
  state.randomEventT = 0;
  state.randomEventNext = 55 + Math.random() * 75;
  const lineageEvents = LINEAGE_EVENTS[state.species] || [];
  const local = lineageEvents.length > 0 && Math.random() < 0.5;
  const pool = local ? lineageEvents : RANDOM_EVENTS;
  const event = pool[Math.floor(Math.random() * pool.length)];
  const changes = [];
  const actualChanges = [];
  function record(label, change) {
    if (!change) return;
    actualChanges.push(change);
    changes.push(`${label} ${change > 0 ? '+' : ''}${fmt(change)}`);
  }
  if (event.delta) {
    const before = state.morale;
    state.morale = Math.max(0, Math.min(moraleCap(), before + randomRange(event.delta)));
    record('Morale', state.morale - before);
  }
  for (const { id: resource, name } of RESOURCES) {
    if (!event[resource] || !state.seen[resource]) continue;
    const amount = randomEventResourceAmount(resource, event[resource]);
    const before = state.res[resource];
    // Rewards never discard an existing over-cap stockpile.
    state.res[resource] = amount > 0 ? before + Math.min(amount, Math.max(0, capacityOf(resource) - before)) : Math.max(0, before + amount);
    record(name, state.res[resource] - before);
  }
  const impact = actualChanges.some(n => n < 0) ? 'log-bad' : actualChanges.length ? 'log-good' : '';
  const prefix = local ? `${lineageDef(state.species).name}: ` : '';
  addLog(`${prefix}${event.text}${changes.length ? ` ${changes.join('; ')}.` : ''}`, impact);
}

function lineageMod(res) {
  const lineage = lineageDef(state.species);
  return (lineage.mods[res] === undefined ? 1 : lineage.mods[res]) * (lineage.all || 1);
}

function factoryRecipe() {
  return FACTORY_RECIPES.find(r => r.id === state.factoryRecipe && (!r.tech || tech(r.tech))) || FACTORY_RECIPES[0];
}
function chooseFactoryRecipe(id) {
  const recipe = FACTORY_RECIPES.find(r => r.id === id);
  if (!bld('factory') || !recipe || (recipe.tech && !tech(recipe.tech))) return;
  state.factoryRecipe = id;
}

function production(dt = 0.25, breakdown = null) {
  const rates = {};
  for (const r of RESOURCES) {
    rates[r.id] = 0;
    if (breakdown) breakdown[r.id] = [];
  }
  const add = (res, label, base, factors = []) => {
    const amount = factors.reduce((value, [, factor]) => value * factor, base);
    rates[res] += amount;
    if (breakdown) breakdown[res].push({ label, base, amount, factors: factors.filter(([, factor]) => factor !== 1) });
  };
  const scale = (res, factors) => {
    rates[res] *= factors.reduce((value, [, factor]) => value * factor, 1);
    if (breakdown) for (const entry of breakdown[res]) {
      entry.amount = factors.reduce((value, [, factor]) => value * factor, entry.amount);
      entry.factors.push(...factors.filter(([, factor]) => factor !== 1));
    }
  };
  const global = globalProductionFactors();

  // job output
  for (const j in JOBS) {
    const job = JOBS[j];
    const n = state.jobs[j] || 0;
    if (job.targeted) continue;
    if (n > 0) {
      if (!job.winterproof) {
        const supplied = !job.inputs || (state.res.wood > 0 && state.res.stone > 0);
        add(job.res, `${job.name}: ${n} × ${job.base}/s`, n * job.base, supplied ? [] : [['Missing wood or stone', 0]]);
      }
      if (job.inputs) {
        for (const r in job.inputs) add(r, `${job.name} inputs: ${n} × ${job.inputs[r]}/s`, -n * job.inputs[r]);
      }
    }
  }

  // expedition passives
  if (expDone('oldForest')) add('wood', 'Old Forest passive', 1.5);
  if (expDone('foothills')) add('stone', 'Foothills passive', 1.0);
  if (expDone('sunkenRuins')) add('knowledge', 'Sunken Ruins passive', 0.3);
  if (expDone('emberVein')) add('coal', 'Ember Vein passive', 0.5);
  if (expDone('glacialPeaks')) add('aether', 'Glacial Peaks passive', 0.1);
  if (tradeAvailable()) add('currency', `Trade with ${tribeDef(state.tradePartner).name}`, 0.05);
  if (era() >= 2) add('copper', 'Stone age trace deposits', 0.02);

  // per-resource modifiers
  scale('food', [...global, [`${SEASONS[seasonIndex()].name}${trialActive('longnight') ? ' (Long Night)' : perm('everwarm') ? ' (Everwarm)' : ''}`, seasonMult()],
    ['Forager Lodges', 1 + 0.10 * bld('foragerLodge')], ['Aqueducts', 1 + 0.20 * bld('aqueduct')],
    ['Scarcity completions', 1 + 0.10 * trialCount('scarcity')], ['Scarcity trial', trialActive('scarcity') ? trialDifficulty('scarcity') : 1]]);
  for (const j in JOBS) {
    const job = JOBS[j], n = state.jobs[j] || 0;
    if (!n || job.targeted) continue;
    if (job.winterproof) add('food', `${job.name} hunting: ${j === 'guard' ? ableGuards() : n}/${n} able, winterproof`, (j === 'guard' ? ableGuards() : n) * job.base,
      [...global, ['Weaponry', tech('weaponry') ? 1.50 : 1], ['Weapon Efficiency', tech('weaponEfficiency') ? 1.75 : 1]]);
    if (job.upkeep) add('food', `${job.name} upkeep: ${n} × ${job.upkeep}/s`, -n * job.upkeep);
  }
  scale('wood', [...global, ['Lumber Yards', 1 + 0.10 * bld('lumberYard')], ['Old Forest', expDone('oldForest') ? 1.15 : 1]]);
  scale('stone', [...global, ['Stone Works', 1 + 0.10 * bld('stoneWorks')], ['Foothills', expDone('foothills') ? 1.15 : 1]]);
  scale('knowledge', [...global, ['Libraries', 1 + 0.10 * bld('library')], ['Writing', tech('writing') ? 1.25 : 1],
    ['Sunken Ruins', expDone('sunkenRuins') ? 1.15 : 1], ['Oral Tradition', perm('oralTradition') ? 1.5 : 1], ['Silence trial', trialActive('silence') ? 0 : 1]]);
  scale('iron', [...global, ['Ember Vein', expDone('emberVein') ? 1.10 : 1]]);
  scale('copper', [...global, ['Copper Prospecting', tech('copperProspecting') ? 1.75 : 1],
    ['Metallurgy', tech('metallurgy') ? 2 : 1], ['Electrical Engineering', tech('electricalEngineering') ? 1.5 : 1]]);
  scale('aether', [...global, ['Glacial Peaks', expDone('glacialPeaks') ? 1.10 : 1]]);
  for (const res of ['coal', 'tools', 'currency']) scale(res, global);

  if (bld('steamPlant') > 0) {
    add('power', `Steam Plants: ${bld('steamPlant')} × 1.2/s`, bld('steamPlant') * 1.2);
    add('coal', `Steam Plant fuel: ${bld('steamPlant')} × 0.08/s`, -bld('steamPlant') * 0.08);
  }
  if (bld('dynamo') > 0) add('power', `Dynamos: ${bld('dynamo')} × 1.5/s`, bld('dynamo') * 1.5);
  // The land, lineage, and civic choices shape output; population upkeep is
  // applied afterward so food policies do not alter how much villagers eat.
  for (const r in rates) scale(r, settlementProductionFactors(r));
  // Reserve inputs after other consumption; bonuses affect output, not costs.
  if (bld('factory') > 0 && dt > 0) {
    const recipe = factoryRecipe();
    const factors = settlementProductionFactors(recipe.id);
    const output = factors.reduce((value, [, factor]) => value * factor, bld('factory') * recipe.rate);
    const inputs = { ...recipe.inputs, power: 0.35 };
    let fraction = Math.min(1, Math.max(0, capacityOf(recipe.id) - state.res[recipe.id]) / (output * dt));
    let limitation = fraction < 1 ? `${recipe.name} storage space` : 'Factory utilization';
    for (const r in inputs) {
      const available = Math.max(0, state.res[r] + Math.min(0, rates[r]) * dt);
      const supplied = available / (inputs[r] * bld('factory') * dt);
      if (supplied < fraction) limitation = `${RESOURCES.find(resource => resource.id === r).name} shortage`;
      fraction = Math.min(fraction, supplied);
    }
    add(recipe.id, `Factories (${recipe.name}): ${bld('factory')} × ${recipe.rate}/s`, bld('factory') * recipe.rate, [...factors, [limitation, fraction]]);
    for (const r in inputs) add(r, `Factory inputs (${recipe.name}): ${bld('factory')} × ${inputs[r]}/s`, -inputs[r] * bld('factory'), [[limitation, fraction]]);
  }
  if (state.pop) add('food', `Villager upkeep: ${state.pop} × ${FOOD_PER_POP}/s`, -state.pop * FOOD_PER_POP);
  return rates;
}

function resourceRateTooltip(resource, rate, entries) {
  const number = value => Number(value.toFixed(4)).toString();
  const signed = value => `${value > 0 ? '+' : ''}${number(value)}/s`;
  const lines = [`${resource.name} — net ${signed(rate)}`, 'Amounts per second; modifiers multiply in order.'];
  for (const [heading, outgoing] of [['Income', false], ['Outgoing', true]]) {
    const group = entries.filter(entry => (entry.base < 0) === outgoing);
    lines.push('', `${heading}: ${signed(group.reduce((sum, entry) => sum + entry.amount, 0))}`);
    for (const entry of group) {
      lines.push(`${entry.label}: ${signed(entry.base)}`);
      if (entry.factors.length) lines.push(`  ${entry.factors.map(([label, factor]) => `${label} ×${number(factor)}`).join('; ')} → ${signed(entry.amount)}`);
    }
    if (!group.length) lines.push('None');
  }
  if (isFull(resource.id) && rate > 0) lines.push('', 'Storage full: excess net income is wasted.');
  if (state.res[resource.id] <= 0 && rate < 0) lines.push('', 'Store empty: the shortfall cannot be deducted below zero.');
  return lines.join('\n');
}

function hospitalTimeMod() { return Math.pow(0.9, bld('hospital')); }
function popGrowthNeed() { return (20 + state.pop * 4) * (tech('aphrodisiac') ? 0.75 : 1) * hospitalTimeMod(); }
function guardHealingNeed() { return 90 * hospitalTimeMod(); }

// ---------- log ----------
function addLog(text, cls) {
  state.log.unshift({ d: Math.floor(state.day), t: text, c: cls || '' });
  if (state.log.length > 200) state.log.length = 200;
}

// ---------- trials ----------
function startTrial(id) {
  if (state.trial || state.migrating) return;
  const def = TRIALS.find(t => t.id === id);
  if (!def) return;
  if (def.repeat > 0 && trialCount(id) >= trialMax(def)) return;
  if (def.repeat === 0 && trialCount(id) > 0) return;
  if (def.req && !def.req()) return;
  if (!confirm(`Start ${def.name}? This restarts your migration in the same location with the same lineage, upgrades, and governance settings. Your village, resources, and jobs reset to migration starting values; permanent progress is kept. No Echoes are awarded. Continue?`)) return;
  setOut(id);
  addLog(`The village swears the ${def.name}. ${trialModifierText(def)}`, 'log-important');
  saveGame(true);
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
    case 'expansion':
      if (tr.buildings >= 8) { endTrial(true); return; }
      break;
    case 'scholarship':
      if ((tr.researches || 0) >= 5) { endTrial(true); return; }
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
    case 'wayfinding':
      if (expDone('oldForest')) { endTrial(true); return; }
      break;
    case 'industrialization':
      if (state.res.goods >= 100) { endTrial(true); return; }
      if (tr.daysActive > 1200) { endTrial(false); return; }
      break;
    case 'haste':
      if (state.era >= 5) { endTrial(true); return; }
      if (tr.daysActive > 1200) { endTrial(false); return; }
      break;
  }
}

function updateDiplomacy(dt) {
  if (!state.diplomacy) return;
  for (const id of [state.tradePartner]) {
    if (!localTribe(id) || !state.diplomacy[id]) continue;
    const entry = state.diplomacy[id];
    const nudged = diplomatCount(id) * 0.05 * dt;
    if (nudged) entry.disposition = Math.min(100, entry.disposition + nudged);
  }
  if (state.guardInjuries > 0) state.guardInjuries = Math.max(0, state.guardInjuries - dt / guardHealingNeed());
  state.diplomacyEventT = (state.diplomacyEventT || 0) + dt;
  if (state.diplomacyEventT < 180) return;
  state.diplomacyEventT = 0;
  const ids = localTribe(state.tradePartner) && state.diplomacy[state.tradePartner]
    ? [state.tradePartner] : [];
  if (!ids.length) return;
  const id = ids[Math.floor(Math.random() * ids.length)];
  const entry = state.diplomacy[id];
  const tribe = tribeDef(id);
  if (entry.disposition < 0 && Math.random() < 0.45) {
    resolveTribeRaid(id);
    return;
  }
  const delta = Math.random() < 0.55 ? 5 + Math.floor(Math.random() * 6) : -(2 + Math.floor(Math.random() * 3));
  entry.disposition = Math.max(-100, Math.min(100, entry.disposition + delta));
  addLog(`${tribe.name}: ${delta > 0 ? 'a diplomatic success' : 'a diplomatic slight'} shifts relations by ${delta > 0 ? '+' : ''}${delta}.`, delta > 0 ? 'log-good' : 'log-bad');
}

function resolveTribeRaid(id) {
  const entry = state.diplomacy[id];
  const tribe = tribeDef(id);
  const able = ableGuards();
  const total = state.jobs.guard || 0;
  const wounded = Math.max(0, total - able);
  const armed = tech('weaponry') ? able : 0;
  // Armor keeps a bad fight from becoming fatal; it does not make the
  // settlement more likely to win the engagement.
  const defense = (able + wounded * 0.5 + armed * 0.9) * governanceDefenseMod() * (isMephit() ? 1.35 : 1);
  const raidPower = 3 + (50 - entry.disposition) / 8 + Math.random() * 5;
  if (defense >= raidPower) {
    entry.disposition = Math.max(-100, entry.disposition - 2);
    if (isMephit()) state.diplomacyEventT = -120;
    addLog(`The ${tribe.name} test Emberhold's walls, but ${able} able Guard${able === 1 ? '' : 's'} drive them off.`, 'log-good');
    return;
  }
  const margin = raidPower - defense;
  // Mephit's extra injury rule belongs to attacking Mephit settlements;
  // their own defenders should benefit from the lineage rather than suffer it.
  const harm = 1;
  const deathMult = Math.max(0.15, 1 - armorLevel() * 0.08);
  const deaths = Math.min(able, Math.floor(margin / 5 * deathMult));
  const injuries = Math.min(Math.max(0, able - deaths), Math.max(1, Math.ceil(margin / 3 * harm)));
  state.jobs.guard = Math.max(0, (state.jobs.guard || 0) - deaths);
  state.guardInjuries = Math.min(ableGuards(), (state.guardInjuries || 0) + injuries);
  const lootPool = ['food', 'wood', 'stone', 'tools', 'copper', 'iron', 'coal', 'steel', 'currency']
    .filter(r => (state.res[r] || 0) > 0);
  const loot = [];
  for (let i = 0; i < Math.min(2, lootPool.length); i++) {
    const pick = lootPool.splice(Math.floor(Math.random() * lootPool.length), 1)[0];
    const amount = Math.min(state.res[pick], Math.max(5, Math.floor(state.res[pick] * (0.08 + margin * 0.015))));
    state.res[pick] -= amount;
    loot.push(`${fmt(amount)} ${RESOURCES.find(r => r.id === pick).name}`);
  }
  entry.disposition = Math.max(-100, entry.disposition - 6);
  if (isMephit()) state.diplomacyEventT = -120;
  addLog(`The ${tribe.name} raid Emberhold! ${deaths} Guard${deaths === 1 ? '' : 's'} die${deaths === 1 ? 's' : ''}, ${injuries} suffer injuries, and they make off with ${loot.join(' and ') || 'nothing'}.`, 'log-bad');
}

function trialProgressText() {
  if (!state.trial) return '';
  const tr = state.trial;
  switch (tr.id) {
    case 'scarcity': case 'longnight':
      return `${Math.floor(tr.daysActive)} / ${tr.id === 'scarcity' ? 240 : DAYS_PER_YEAR} days endured`;
    case 'frugality': return `${tr.buildings} / 12 buildings raised`;
    case 'expansion': return `${tr.buildings} / 8 buildings raised`;
    case 'scholarship': return `${tr.researches || 0} / 5 research projects completed`;
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
    case 'wayfinding': return expDone('oldForest') ? 'The Old Forest has been mapped.' : 'The Old Forest expedition must return';
    case 'industrialization': return `${fmt(state.res.goods)} / 100 Industrial Goods — ${Math.floor(tr.daysActive)} / 1200 days`;
    case 'haste': return `${Math.floor(tr.daysActive)} / 1200 days to reach the Age of Light`;
  }
  return '';
}

// ---------- migration (the loop) ----------
function beginMigration() {
  if (!canMigrate()) return;
  state.pendingEchoes = echoesEarned();
  state.echoes += state.pendingEchoes;
  state.pendingSpecies = state.species;
  state.pendingLandings = landingChoicesForMigration();
  state.pendingLanding = (state.pendingLandings.find(l => lineageSelectable(state.pendingSpecies, l.id)) || state.pendingLandings[0]).id;
  state.migrating = true;
  addLog(`The Great Migration is declared. The deeds of ${state.pop} villagers will echo: ${state.pendingEchoes} Echo${state.pendingEchoes === 1 ? '' : 's'} gained. Spend them before setting out.`, 'log-important');
}

function landingChoicesForMigration() {
  const available = LANDINGS.filter(l => l.id !== state.landing);
  const choices = [available.splice(Math.floor(Math.random() * available.length), 1)[0]];
  const costs = [3, 9, 27];
  let points = state.surveyPoints || 0;
  for (const cost of costs) {
    if (points < cost || choices.length >= 4 || !available.length) break;
    points -= cost;
    choices.push(available.splice(Math.floor(Math.random() * available.length), 1)[0]);
  }
  state.surveyPoints = points;
  return choices;
}
function chooseLanding(id) {
  if (!state.migrating || !(state.pendingLandings || []).some(l => l.id === id)) return;
  if (!lineageSelectable(state.pendingSpecies || state.species, id)) return;
  state.pendingLanding = id;
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

function setOut(trialId = null) {
  if (!state.migrating && !trialId) return;
  const settings = trialId ? {
    tradePartner: state.tradePartner, policy: state.policy,
    governor: state.governor, council: [...state.council],
  } : null;
  const landing = LANDINGS.find(l => l.id === (trialId ? state.landing : state.pendingLanding)) ||
    state.pendingLandings[0] || LANDINGS.find(l => l.id !== state.landing) || LANDINGS[0];
  const up = { ...state.upgrades };
  const candidate = state.pendingSpecies || state.species;
  if (!trialId && !lineageSelectable(candidate, landing.id)) return;
  const newSpecies = trialId ? state.species : candidate;
  const unlockedLineages = { ...(state.lineagesUnlocked || { human: true }) };
  const newlyUnlocked = [];
  for (const id in (trialId ? {} : state.diplomacy) || {}) {
    if (state.diplomacy[id].disposition >= 80 && LINEAGES.some(l => l.id === id)) {
      if (!unlockedLineages[id]) newlyUnlocked.push(lineageDef(id).name);
      unlockedLineages[id] = true;
    }
  }
  addLog('The village sets out. The old Emberhold is left to the wind; a new one rises where the ground is kinder.', 'log-important');

  const keep = {
    day: state.day, seen: state.seen,
    echoes: state.echoes, upgrades: state.upgrades,
    trialDone: state.trialDone, expeditions: state.expeditions,
    landingsSeen: state.landingsSeen,
    species: state.species, tribesSeen: state.tribesSeen,
    diplomacy: state.diplomacy,
    won: state.won, savedAt: state.savedAt, log: state.log,
  };
  state = defaultState();
  state.day = keep.day;
  state.seen = keep.seen;
  state.echoes = keep.echoes;
  state.upgrades = keep.upgrades;
  state.trialDone = keep.trialDone;
  state.expeditions = keep.expeditions;
  state.landingsSeen = keep.landingsSeen;
  state.species = keep.species;
  state.species = newSpecies;
  state.lineagesUnlocked = unlockedLineages;
  state.tribesSeen = keep.tribesSeen;
  state.diplomacy = keep.diplomacy;
  state.won = keep.won;
  state.savedAt = keep.savedAt;
  state.log = keep.log;
  state.landing = landing.id;
  if (settings) Object.assign(state, settings);
  if (trialId) state.trial = { id: trialId, startDay: state.day, daysActive: 0, buildings: 0 };
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
  state.landing = landing.id;
  state.landingsSeen[landing.id] = true;
  addLog(`The road ends at ${landing.name}. ${landing.text} (${modsHtml(landing).replace(/<[^>]+>/g, '')})`, 'log-important');
  if (!trialId) {
    const tribe = rollTradePartner();
    addLog(`${tribe.name} are encountered nearby. ${tribe.text} Trade will bring funds once Currency is researched.`, 'log-important');
  }
  if (newlyUnlocked.length) {
    addLog(`${newlyUnlocked.join(' and ')} lineage${newlyUnlocked.length === 1 ? '' : 's'} may now be chosen at future migrations.`, 'log-good');
  }
  state.migrating = false;
  state.pendingEchoes = 0;
  state.pendingSpecies = null;
  state.pendingLandings = [];
  state.pendingLanding = null;
}

function chooseLineage(id) {
  if (!state.migrating || !lineageSelectable(id)) return;
  state.pendingSpecies = id;
}

// ---------- core tick ----------
function tick(dt) {
  state.day += dt * DAY_RATE;

  const rates = production(dt);
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

  updateMorale(dt, rates.food);

  // starvation
  if (state.res.food <= 0.0001) {
    state.res.food = 0;
    state.starveT += dt;
    if (state.starveT >= 20 && state.pop > 1) {
      state.pop--;
      state.starveT = 0;
      reconcileWorkers();
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

  updateGuardRecruitment(dt);
  updateTrial(dt);
  updateDiplomacy(dt);
  updateRandomEvents(dt);
  updateExploration(dt);
  updateQueues();

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
  emitAutomationEvent('tick', { dt });
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
    state.res[r] = Math.min(capacityOf(r), state.res[r] + def.give[r] * lineageMod(r));
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
  if (state.trial && state.trial.id === 'scholarship') state.trial.researches = (state.trial.researches || 0) + 1;
  if (id === 'leatherArmor') state.armor = Math.max(armorLevel(), 1);
  addLog(`Research complete: ${def.name}. ${def.desc}`, 'log-good');
  if (ERA_GATE[id] && ERA_GATE[id] > state.era) {
    state.era = ERA_GATE[id];
    addLog(`The village enters the ${ERAS[state.era - 1].name}.`, 'log-important');
  }
}

function choosePolicy(id) {
  if (!tech('civics') || !CIVICS.some(c => c.id === id)) return;
  if (state.policy === id) return;
  state.policy = id;
  addLog(`The Civic Hall adopts ${civicDef(id).name}. ${civicDef(id).desc}`, 'log-important');
}
function appointGovernor(id) {
  if (!tech('council') || !governorDef(id) || state.governor === id) return;
  if (state.res.currency < 40) return;
  state.res.currency -= 40;
  state.governor = id;
  addLog(`${governorDef(id).name} accepts the governor's seal.`, 'log-good');
}
function toggleCouncilor(id) {
  if (!tech('council') || !councilorDef(id)) return;
  const i = state.council.indexOf(id);
  if (i >= 0) { state.council.splice(i, 1); return; }
  if (state.council.length >= 2 || state.res.currency < 25) return;
  state.res.currency -= 25;
  state.council.push(id);
  addLog(`${councilorDef(id).name} takes a seat on the Council.`, 'log-good');
}

function doExpedition(id) {
  const def = EXPEDITIONS.find(e => e.id === id);
  if (!def || expDone(id)) return;
  if (def.landing && def.landing !== state.landing) return;
  if (state.pop < def.reqPop) return;
  const cost = expeditionCost(def);
  if (!canAfford(cost)) return;
  payCost(cost);
  state.expeditions[id] = true;
  addLog(`Expedition returned: ${def.name} is now part of Emberhold's world. ${def.effect}`, 'log-good');
  if (def.landing && siteExpeditionsComplete()) addLog('All six sites explored! Emberhold gains +5% to all production forever.', 'log-good');
}

function doAssign(job, delta) {
  const j = JOBS[job];
  if (!j || j.targeted || job === 'guard' || !j.unlock()) return;
  state.jobs[job] = state.jobs[job] || 0;
  if (delta > 0 && unassigned() <= 0) return;
  if (delta < 0 && state.jobs[job] <= 0) return;
  state.jobs[job] += delta;
}

function doAssignPerformer(delta) {
  if (!JOBS.performer.unlock()) return;
  state.jobs.performer = performerCount();
  if (delta > 0 && unassigned() <= 0) return;
  if (delta < 0 && performerCount() <= 0) return;
  state.jobs.performer += delta;
  if (state.jobs.performer <= 0) delete state.jobs.performer;
}

function doAssignExplorer(delta) {
  if (!JOBS.explorer.unlock()) return;
  state.jobs.explorer = explorerCount();
  if (delta > 0 && unassigned() <= 0) return;
  if (delta < 0 && explorerCount() <= 0) return;
  state.jobs.explorer += delta;
  if (state.jobs.explorer <= 0) delete state.jobs.explorer;
}

function doAssignDiplomat(id, delta) {
  if (!tech('diplomacy') || !localTribe(id) || !state.diplomacy || !state.diplomacy[id]) return;
  state.diplomats = state.diplomats || {};
  state.diplomats[id] = diplomatCount(id);
  if (delta > 0 && unassigned() <= 0) return;
  if (delta < 0 && diplomatCount(id) <= 0) return;
  state.diplomats[id] += delta;
  if (state.diplomats[id] <= 0) delete state.diplomats[id];
}

function raidLoot(id) {
  const pools = {
    human: ['food', 'wood', 'currency'],
    stonekin: ['stone', 'iron', 'tools'],
    marshfolk: ['food', 'wood', 'copper'],
    skyborn: ['knowledge', 'aether', 'currency'],
    mephit: ['coal', 'tools', 'steel'],
  };
  return tribeDef(id).loot || pools[id] || ['food', 'wood'];
}

function applyRaidCasualties(deaths, injuries) {
  const total = state.jobs.guard || 0;
  let healthy = ableGuards();
  let wounded = Math.max(0, total - healthy);

  // Healthy Guards take the first losses. Wounded Guards are only exposed
  // once the raid's injury count spills past the healthy front line.
  const healthyDeaths = Math.min(healthy, deaths);
  healthy -= healthyDeaths;
  let actualDeaths = healthyDeaths;
  const woundedDeaths = Math.min(wounded, Math.max(0, deaths - healthyDeaths));
  wounded -= woundedDeaths;
  actualDeaths += woundedDeaths;

  const healthyInjuries = Math.min(healthy, injuries);
  healthy -= healthyInjuries;
  const reInjuredDeaths = Math.min(wounded, Math.max(0, injuries - healthyInjuries));
  wounded -= reInjuredDeaths;
  actualDeaths += reInjuredDeaths;

  state.jobs.guard = Math.max(0, total - actualDeaths);
  state.guardInjuries = Math.min(state.jobs.guard, wounded + healthyInjuries);
  return { deaths: actualDeaths, injuries: healthyInjuries };
}

function doRaid(id) {
  const entry = state.diplomacy && state.diplomacy[id];
  if (!entry || !localTribe(id) || !tech('guards')) return;
  const able = ableGuards();
  const cost = { food: 30, tools: 2 };
  if (able < 1 || !canAfford(cost)) return;
  payCost(cost);

  const targetIsMephit = id === 'mephit';
  // Weapons improve the attack; armor only protects troops who come home.
  const totalGuards = state.jobs.guard || 0;
  const wounded = Math.max(0, totalGuards - able);
  const force = able + wounded * 0.5 + (tech('weaponry') ? (able * 0.9 + wounded * 0.45) : 0);
  const difficulty = (5 + Math.max(0, entry.disposition) / 10) * (targetIsMephit ? 1.35 : 1);
  const chance = Math.min(0.9, Math.max(0.15, 0.25 + force * governanceDefenseMod() / (force * governanceDefenseMod() + difficulty) * 0.65));
  const succeeded = Math.random() < chance;
  const injuryMult = targetIsMephit ? 1.75 : 1;
  const deathMult = Math.max(0.15, 1 - armorLevel() * 0.08);
  const deathChance = succeeded ? 0.10 * deathMult : 1;
  const baseDeaths = succeeded
    ? (Math.random() < deathChance ? 1 : 0)
    : Math.max(1, Math.ceil((difficulty - force) / 3));
  const losses = succeeded
    ? Math.min(totalGuards, baseDeaths)
    : Math.min(totalGuards, Math.floor(baseDeaths * deathMult));
  const injuryChance = succeeded ? (targetIsMephit ? 0.80 : 0.55) : 1;
  const baseInjuries = Math.random() < injuryChance
    ? Math.max(1, Math.ceil((succeeded ? 1 : 2) * injuryMult * Math.random()))
    : 0;
  const injuries = Math.min(Math.max(0, totalGuards - losses), baseInjuries);
  const casualties = applyRaidCasualties(losses, injuries);
  const actualDeaths = casualties.deaths;
  const actualInjuries = casualties.injuries;
  entry.disposition = Math.max(-100, entry.disposition - (succeeded ? 28 : 18));

  if (succeeded) {
    state.morale = Math.min(moraleCap(), state.morale + 3);
    const pool = raidLoot(id).filter(r => capacityOf(r) === Infinity || !isFull(r));
    const loot = pool[Math.floor(Math.random() * pool.length)];
    const amount = loot === 'knowledge' ? 35 : loot === 'currency' ? 12 : 20;
    if (loot) {
      state.res[loot] = Math.min(capacityOf(loot), state.res[loot] + amount);
      state.seen[loot] = true;
    }
    const lootText = loot ? `${amount} ${RESOURCES.find(r => r.id === loot).name}` : 'nothing (the stores were full)';
    addLog(`The raid on the ${tribeDef(id).name} succeeds${targetIsMephit ? ', though the fumes leave everyone coughing' : ''}. Emberhold seizes ${lootText}; ${actualDeaths} Guard${actualDeaths === 1 ? '' : 's'} lost and ${actualInjuries} injured.`, 'log-good');
  } else {
    state.morale = Math.max(0, state.morale - 5);
    addLog(`The raid on the ${tribeDef(id).name} fails${targetIsMephit ? ' — the smell alone breaks the charge' : ''}. ${actualDeaths} Guard${actualDeaths === 1 ? '' : 's'} lost and ${actualInjuries} injured.`, 'log-bad');
  }
}

function supplyDiplomacyRequest(id) {
  if (!tech('currency') || !localTribe(id) || !state.diplomacy || !state.diplomacy[id]) return;
  const entry = state.diplomacy[id];
  if (!canAfford({ [entry.request.res]: entry.request.amount })) return;
  payCost({ [entry.request.res]: entry.request.amount });
  entry.disposition = Math.min(100, entry.disposition + 15);
  state.morale = Math.min(moraleCap(), state.morale + 2);
  const tribe = tribeDef(id);
  addLog(`The ${tribe.name} accept the requested goods. Relations improve by 15.`, 'log-good');
  entry.request = randomDiplomacyRequest(id);
}

// ---------- save / load ----------
function saveGame(silent) {
  try {
    const savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, savedAt }));
    state.savedAt = savedAt;
    if (!silent) addLog('Chronicle saved.');
    return true;
  } catch (e) {
    if (!silent) addLog('The chronicle could not be saved. Export a backup before closing.', 'log-bad');
    return false;
  }
}

function normalizeSave(s) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(s) || s.v !== 1 || !object(s.res) || !object(s.jobs) || !object(s.techs))
    throw new Error('Invalid save');
  // Reject broken shapes and non-finite numbers before replacing any stored game.
  function validate(value) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid number');
    if (value && typeof value === 'object') for (const key of Object.keys(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid key');
      validate(value[key]);
    }
  }
  validate(s);
  const d = defaultState();
  for (const key of Object.keys(d)) {
    if (s[key] === undefined) s[key] = d[key];
    else if (d[key] !== null && (typeof s[key] !== typeof d[key] ||
      (Array.isArray(d[key]) ? !Array.isArray(s[key]) : object(d[key]) && !object(s[key]))))
      throw new Error(`Invalid ${key}`);
  }
  if (!Number.isInteger(s.pop) || s.pop < 1 || !Number.isInteger(s.era) || s.era < 1 || s.era > ERAS.length)
    throw new Error('Invalid settlement');
  for (const key of ['res', 'jobs', 'bld', 'trialDone', 'upgrades', 'diplomats']) {
    for (const n of Object.values(s[key]))
      if (typeof n !== 'number' || n < 0) throw new Error(`Invalid ${key}`);
  }
  for (const type of ['build', 'research', 'expedition']) {
    if (!Array.isArray(s.queues[type])) {
      if (s.queues[type] === undefined || s.queues[type] === null) s.queues[type] = [];
      else if (object(s.queues[type])) s.queues[type] = [s.queues[type]];
      else throw new Error(`Invalid ${type} queue`);
    }
    for (const entry of s.queues[type])
      if (!object(entry) || entry.type !== type || typeof entry.id !== 'string' || !queueDef(entry))
        throw new Error(`Invalid ${type} queue`);
  }
  for (const r of RESOURCES) if (s.res[r.id] === undefined) s.res[r.id] = 0;
  for (const entry of Object.values(s.diplomacy)) {
    if (!object(entry) || typeof entry.disposition !== 'number') throw new Error('Invalid diplomacy');
  }
  if (s.trial !== null && (!object(s.trial) || !TRIALS.some(t => t.id === s.trial.id)))
    throw new Error('Invalid trial');
  if (!s.log.every(entry => object(entry) && typeof entry.t === 'string' && typeof entry.d === 'number'))
    throw new Error('Invalid chronicle');
  delete s.res.weapons;
  delete s.res.armor;
  s.armor = Math.max(s.armor, s.techs.leatherArmor ? 1 : 0);
  if (!FACTORY_RECIPES.some(r => r.id === s.factoryRecipe && (!r.tech || s.techs[r.tech]))) s.factoryRecipe = 'goods';
  return s;
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return normalizeSave(JSON.parse(raw));
  } catch (e) { return null; }
}

function offlineProgress() {
  const elapsed = (Date.now() - state.savedAt) / 1000;
  if (elapsed < 60) return;
  const simSeconds = Math.min(elapsed, OFFLINE_CAP) * OFFLINE_RATE;
  const step = 2;
  for (let t = 0; t < simSeconds; t += step) tick(Math.min(step, simSeconds - t));
  const hrs = (elapsed / 3600).toFixed(1);
  const got = Math.min(elapsed, OFFLINE_CAP);
  addLog(`While you were away (~${hrs} h, real-time, capped at 24 h), the village carried on for ${Math.floor(got * OFFLINE_RATE)} seconds.`, 'log-important');
}

async function exportSave() {
  saveGame(true);
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  const filename = `emberhold-save-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  const blob = new Blob([data], { type: 'text/plain;charset=ascii' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);

  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(data);
    addLog(`Save exported and copied to the clipboard (${data.length} characters).`, 'log-good');
  } catch (e) {
    window.prompt('Clipboard access was unavailable. Copy this save string manually:', data);
    addLog(`Save backup downloaded. Copy the string from the prompt if needed (${data.length} characters).`, 'log-important');
  }
  render();
}
function importSave() {
  const data = window.prompt('Paste your save string:');
  if (!data) return;
  try {
    const s = normalizeSave(JSON.parse(decodeURIComponent(escape(atob(data.trim())))));
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
function attrText(s) { return esc(s).replace(/"/g, '&quot;'); }

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
    `Year ${year} of the ${ERAS[state.era - 1].name} — ${landingDef().name} — ${lineageDef(state.species).name}`;
  document.getElementById('time-line').textContent =
    `Day ${doy % DAYS_PER_SEASON + 1} of ${season} — chronicle day ${Math.floor(state.day)}`;
  document.getElementById('pop-line').textContent =
    `${state.pop} villagers${unassigned() ? ` (${unassigned()} unassigned)` : ''} — housing for ${popCap()}`;
  const moraleEl = document.getElementById('morale-line');
  moraleEl.textContent = `Morale ${Math.round(state.morale)} / ${moraleCap()} — ${moraleLabel()} (${state.morale >= 70 ? '+' : ''}${Math.round((0.70 + state.morale * 0.0042857 - 1) * 100)}% production)`;
  moraleEl.className = state.morale < 25 ? 'morale-low' : state.morale >= 80 ? 'morale-high' : '';
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

function renderStores() {
  const breakdown = {};
  const rates = production(0.25, breakdown);
  let h = '';
  for (const r of RESOURCES) {
    if (!resVisible(r.id)) continue;
    const rate = rates[r.id];
    const cls = rate > 0.0001 ? 'rate-pos' : (rate < -0.0001 ? 'rate-neg' : '');
    const cap = capacityOf(r.id);
    const amount = cap === Infinity
      ? fmt(state.res[r.id])
      : `${fmt(state.res[r.id])} / ${fmt(cap)}${isFull(r.id) ? ' FULL' : ''}`;
    h += `<div class="res-row">` +
      `<span class="res-name has-tooltip" data-tooltip="${attrText(r.note)}">${r.name}</span>` +
      `<span class="res-amount ${isFull(r.id) ? 'res-full' : ''}">${amount}</span>` +
      `<span class="res-rate has-tooltip ${cls}" tabindex="0" data-tooltip="${attrText(resourceRateTooltip(r, rate, breakdown[r.id]))}">${fmtRate(rate) || '0/s'}</span>` +
      `</div>`;
  }
  return h;
}

function renderVillage() {
  const L = landingDef();
  let h = `<h2 class="section">Where you stand — ${L.name}</h2>` +
    `<div class="res-note">${L.text}</div>` +
    `<div class="res-note">Population growth: ${fmt(popGrowthNeed())} seconds per new villager while food and housing are available. Guard healing: ${fmt(guardHealingNeed())} seconds per injury.</div>` +
    `<div class="res-note" style="margin:2px 0 6px">The land gives: ${modsHtml(L)}</div>` +
    `<div class="res-note" style="margin:2px 0 6px">${tradeAvailable() ? `Trading with the ${tribeDef(state.tradePartner).name}; funds arrive at ${fmtRate(0.05)} before Banker work.` : `The ${tribeDef(state.tradePartner).name} are nearby. Research Currency to begin trading.`}</div>` +
    `<div class="res-note" style="margin:2px 0 6px">Guard armor: level ${fmt(armorLevel())} — each level reduces death odds by 8% (minimum 15%).</div>` +
    `<div class="res-note" style="margin:2px 0 6px">Morale rises when stores are secure and falls when food runs short or winter bites. The Shrine steadies the people. ${moraleLabel()} morale changes production by ${Math.round((0.70 + state.morale * 0.0042857 - 1) * 100)}%; current ceiling: ${moraleCap()}.</div>`;

  if (bld('factory') > 0) {
    h += '<h2 class="section">Factory production</h2><div class="res-note">All factories share one production line. Rates below are per factory before bonuses. Production slows when supplies run short and pauses when output storage is full. The Industrialization trial requires Industrial Goods.</div>';
    for (const recipe of FACTORY_RECIPES) {
      const unlocked = !recipe.tech || tech(recipe.tech);
      const selected = factoryRecipe().id === recipe.id;
      const inputs = Object.entries({ ...recipe.inputs, power: 0.35 }).map(([r, n]) => `${n} ${RESOURCES.find(res => res.id === r).name}/s`).join(', ');
      h += `<div class="card"><div class="card-head"><span class="card-title">${recipe.name}</span><span class="card-count">${selected ? 'Active' : unlocked ? 'Available' : `Requires ${recipe.unlock}`}</span></div>` +
        `<div class="card-desc">Produces ${recipe.rate}/s; consumes ${inputs}.</div>` +
        `<div class="card-actions"><button data-action="factory-recipe" data-id="${recipe.id}" ${!unlocked || selected ? 'disabled' : ''}>${selected ? 'Producing ' : 'Produce '}${recipe.name}</button></div></div>`;
    }
  }
  h += '<h2 class="section">Crafting</h2>';
  for (const c of CRAFTS) {
    if (!c.req()) continue;
    const forbidden = c.id === 'tools' && trialActive('tinkering');
    const ok = !forbidden && canAfford(c.cost) && !Object.keys(c.give).some(r => isFull(r));
    const fullNote = forbidden ? ' — forbidden by the Trial of Tinkering' :
      (Object.keys(c.give).some(r => isFull(r)) ? ' — store full' : '');
    h += `<div class="card"><div class="card-head">` +
      `<span class="card-title has-tooltip" data-tooltip="${attrText(c.desc)}">${c.name}</span>` +
      `<span class="card-effect">${fullNote.replace(/^ — /, '')}</span></div>` +
      `<div class="card-cost">cost: ${costHtml(c.cost)}</div>` +
      `<div class="card-actions"><button data-action="craft" data-id="${c.id}" data-repeat title="Hold to repeat" ${ok ? '' : 'disabled'}>Craft ${fmt(c.give[Object.keys(c.give)[0]] * lineageMod(Object.keys(c.give)[0]))}</button></div>` +
      `</div>`;
  }

  h += '<h2 class="section">Work — assign villagers</h2>';
  h += `<div class="res-row"><span class="res-name">Unassigned</span>` +
    `<span class="res-amount">${unassigned()}</span>` +
    `<span class="res-rate">of ${state.pop} villagers</span></div>`;
  for (const j in JOBS) {
    const job = JOBS[j];
    if (job.targeted || j === 'guard') continue;
    if (!job.unlock()) continue;
    const n = state.jobs[j] || 0;
    h += `<div class="job-row">` +
      `<span class="job-name has-tooltip" data-tooltip="${attrText(job.desc)}">${job.name}</span>` +
      `<span class="job-assign">${n}</span>` +
      `<span class="job-rate">${fmt(job.base)} ${RESOURCES.find(r => r.id === job.res).name}/s each` +
      (job.inputs ? ` (uses ${Object.entries(job.inputs).map(([r, v]) => `${fmt(v)} ${RESOURCES.find(x => x.id === r).name.toLowerCase()}/s`).join(' + ')})` : '') +
      `</span>` +
      `<span class="job-btns">` +
      `<button data-action="job-dec" data-job="${j}" data-repeat title="Hold to repeat" ${n > 0 ? '' : 'disabled'}>−</button>` +
      `<button data-action="job-inc" data-job="${j}" data-repeat title="Hold to repeat" ${unassigned() > 0 ? '' : 'disabled'}>+</button>` +
      `</span></div>`;
  }
  if (JOBS.performer.unlock()) {
    const n = performerCount();
    h += `<div class="job-row"><span class="job-name has-tooltip" data-tooltip="${attrText(JOBS.performer.desc)}">${JOBS.performer.name}</span>` +
      `<span class="job-assign">${n}</span>` +
      `<span class="job-rate">+0.10 morale/s each</span>` +
      `<span class="job-btns"><button data-action="performer-dec" data-repeat title="Hold to repeat" ${n > 0 ? '' : 'disabled'}>−</button>` +
      `<button data-action="performer-inc" data-repeat title="Hold to repeat" ${unassigned() > 0 ? '' : 'disabled'}>+</button></span></div>`;
  }
  if (JOBS.explorer.unlock()) {
    const n = explorerCount();
    h += `<div class="job-row"><span class="job-name has-tooltip" data-tooltip="${attrText(JOBS.explorer.desc)}">${JOBS.explorer.name}</span>` +
      `<span class="job-assign">${n}</span>` +
      `<span class="job-rate">+0.025 Survey/s each</span>` +
      `<span class="job-btns"><button data-action="explorer-dec" data-repeat title="Hold to repeat" ${n > 0 ? '' : 'disabled'}>−</button>` +
      `<button data-action="explorer-inc" data-repeat title="Hold to repeat" ${unassigned() > 0 ? '' : 'disabled'}>+</button></span></div>`;
  }
  if (JOBS.guard.unlock() && guardCap() > 0) {
    const guards = state.jobs.guard || 0;
    const recruitment = guards < guardCap()
      ? `Next Guard in ${Math.ceil((1 - state.guardRecruitment) / guardRecruitmentRate())}s`
      : 'At capacity';
    h += '<h2 class="section">Guards — independent watch</h2>' +
      `<div class="res-row"><span class="res-name">Guards</span><span class="res-amount">${guards} / ${guardCap()} (${Math.floor(ableGuards())} able)</span><span class="res-rate">${recruitment}</span></div>` +
      `<div class="res-note">Guards recruit automatically, one every ${fmt(1 / guardRecruitmentRate())} seconds, and replace losses up to barracks capacity. They use no villager assignments or population housing. Build Barracks to raise their capacity.</div>`;
  }
  h += `<div class="res-note" style="margin-top:6px">Every villager eats ${fmt(FOOD_PER_POP)} food/s, working or not. Each Guard requires ${fmt(JOBS.guard.upkeep)} food/s, but their hunting is not reduced by winter. Weaponry and Leather Armor research strengthen the watch; injuries heal over time. Every store but Knowledge and Currency has a ceiling — what flows in past a full store is wasted. Storehouses raise the ceilings.</div>`;

  return h;
}

function renderQueue(type) {
  const entries = state.queues[type];
  const label = type === 'build' ? 'Construction' : type === 'research' ? 'Research' : 'Expedition';
  if (!entries.length) return `<div class="queue-empty">${label} queue empty (${queueCapacity(type)} slot${queueCapacity(type) === 1 ? '' : 's'})</div>`;
  return entries.map((entry, index) => {
    const def = queueDef(entry);
    return `<button class="queue-item" data-action="queue-cancel" data-type="${type}" data-index="${index}" title="Click to cancel">` +
      `<span>${esc(def ? def.name : entry.id)}</span><span class="queue-time">${queueLabel(queueTime(entry))}</span></button>`;
  }).join('') + `<div class="queue-capacity">${entries.length} / ${queueCapacity(type)} slots used</div>`;
}

function renderBuild() {
  let h = '<h2 class="section">Construction</h2>';
  h += `<div class="queue"><div class="queue-label">Construction queue</div>${renderQueue('build')}</div>`;
  const knownBuildings = BUILDINGS.filter(b => bld(b.id) > 0 || !b.req || b.req());
  const completedCount = knownBuildings.filter(b => bld(b.id) >= b.max).length;
  const incompleteCount = knownBuildings.length - completedCount;
  h += `<div class="subtabs" role="tablist" aria-label="Construction status">` +
    `<button class="subtab ${buildFilter === 'incomplete' ? 'active' : ''}" data-action="build-filter" data-filter="incomplete" role="tab" aria-selected="${buildFilter === 'incomplete'}">Incomplete <span class="subtab-count">${incompleteCount}</span></button>` +
    `<button class="subtab ${buildFilter === 'complete' ? 'active' : ''}" data-action="build-filter" data-filter="complete" role="tab" aria-selected="${buildFilter === 'complete'}">Completed <span class="subtab-count">${completedCount}</span></button>` +
    `</div>`;
  let any = false;
  for (const b of knownBuildings) {
    const count = bld(b.id);
    const maxed = count >= b.max;
    if ((buildFilter === 'complete') !== maxed) continue;
    any = true;
    const cost = buildingCost(b);
    const queued = state.queues.build.some(entry => entry.id === b.id);
    const forbidden = trialActive('overflow') && Object.values(STORAGE).some(s => s.bld === b.id);
    const ok = !maxed && !forbidden && state.queues.build.length < queueCapacity('build');
    h += `<div class="card"><div class="card-head">` +
      `<span class="card-title has-tooltip" data-tooltip="${attrText(b.desc)}">${b.name}</span>` +
      (b.max === Infinity ? `<span class="card-count">${count} built</span>` : b.max > 1 ? `<span class="card-count">${count} / ${b.max}</span>` : (count ? `<span class="card-count">built</span>` : '')) +
      `<span class="card-effect">${b.effect()}</span></div>` +
      `<div class="card-cost">cost: ${costHtml(cost)}</div>` +
      `<div class="card-actions"><button data-action="build" data-id="${b.id}" ${ok ? '' : 'disabled'}>${maxed ? 'Complete' : queued ? 'Queued' : canAfford(cost) ? 'Build' : 'Queue'}</button></div>` +
      `</div>`;
  }
  if (!any) h += `<div class="res-note">${buildFilter === 'complete' ? 'No completed buildings yet.' : 'Nothing remains to build yet. Learn from the world first.'}</div>`;
  return h;
}

function renderResearch() {
  let h = '<h2 class="section">Research</h2>';
  h += `<div class="queue"><div class="queue-label">Research queue</div>${renderQueue('research')}</div>`;
  let any = false;
  for (const t of TECHS) {
    if (t.req && !t.req()) continue;
    if (tech(t.id)) continue;
    any = true;
    const queued = state.queues.research.some(entry => entry.id === t.id);
    const ok = state.queues.research.length < queueCapacity('research');
    h += `<div class="card"><div class="card-head">` +
      `<span class="card-title has-tooltip" data-tooltip="${attrText(t.desc)}">${t.name}</span>` +
      `<span class="card-count">${fmt(t.cost)} Knowledge</span></div>` +
      `<div class="card-actions"><button data-action="research" data-id="${t.id}" ${ok ? '' : 'disabled'}>${queued ? 'Queued' : state.res.knowledge >= t.cost ? 'Research' : 'Queue'}</button></div>` +
      `</div>`;
  }
  if (!any) h += '<div class="res-note">The wise have nothing left to learn here.</div>';
  h += `<div class="res-note" style="margin-top:6px">Knowledge is produced by Thinkers (build a Library first) and never returns once spent.</div>`;
  return h;
}

function renderDiplomacy() {
  let h = '<h2 class="section">Diplomacy — neighbors and foreign courts</h2>';
  h += '<div class="res-note">Only the current local contact can trade, receive diplomats, or raid. Departed tribes remain in the chronicle, and their alliances still unlock lineages for future migrations.</div>';
  if (!tech('currency')) {
    h += '<div class="card"><div class="card-desc">The tribes will speak, but trade requires Currency. Research it to honor their requests with goods.</div></div>';
  }
  for (const id in (state.diplomacy || {})) {
    const tribe = tribeDef(id);
    const entry = state.diplomacy[id];
    const local = localTribe(id);
    const requestCost = { [entry.request.res]: entry.request.amount };
    const canSupply = local && tradeAvailable() && canAfford(requestCost);
    h += `<div class="card ${local ? '' : 'dimmed'}"><div class="card-head"><span class="card-title has-tooltip" data-tooltip="${attrText(tribe.text)}">${tribe.name}</span>` +
      (local ? '<span class="card-count">nearby</span>' : '<span class="card-count">departed</span>') +
      `<span class="card-count">disposition ${Math.round(entry.disposition)} / 100</span></div>` +
      `<div class="card-desc">${tribe.text}</div>` +
      `<div class="res-note">${habitatText(tribe)}</div>` +
      `<div class="trial-reward">${lineageDef(id).name} lineage: ${lineageDef(id).effect}. ${lineageUnlocked(id) ? 'Unlocked for future migrations.' : 'Migrate with disposition 80+ to unlock for future migrations.'}</div>` +
      (local && entry.disposition >= 80 ? '<div class="trial-reward">Active ally: +5% to all village incomes.</div>' : '') +
      (local && entry.disposition < 0 ? `<div class="trial-mod">Relations are strained: the ${tribe.name} may raid the village.</div>` : '') +
      (local ? `<div class="trial-goal">${diplomacyRequestText(tribe, entry)}</div>` : '<div class="res-note">Only a few nice letters can reach them for now.</div>') +
      (local ? `<div class="card-cost">offer: ${costHtml(requestCost)} — +15 relations</div>` : '') +
      (local ? `<div class="card-actions"><button data-action="diplomacy-supply" data-tribe="${id}" ${canSupply ? '' : 'disabled'}>Supply the request</button></div>` : '');
    if (local && tech('guards')) {
      const raidCost = { food: 30, tools: 2 };
      const canRaid = ableGuards() > 0 && canAfford(raidCost);
      h += `<div class="trial-mod">Raid cost: ${costHtml(raidCost)}. This damages relations and may cost Guards.</div>` +
        `<div class="card-actions"><button data-action="raid" data-tribe="${id}" ${canRaid ? '' : 'disabled'}>Raid the ${tribe.name}</button></div>`;
    }
    if (local && tech('diplomacy')) {
      h += `<div class="res-note">${JOBS.diplomat.name}s assigned: ${diplomatCount(id)} — each adds +3 relations per minute</div>` +
        `<div class="card-actions"><button data-action="diplomat-dec" data-tribe="${id}" ${diplomatCount(id) > 0 ? '' : 'disabled'}>−</button> ` +
        `<button data-action="diplomat-inc" data-tribe="${id}" ${unassigned() > 0 ? '' : 'disabled'}>Assign Diplomat</button></div>`;
    }
    h += '</div>';
  }
  return h;
}

function renderGovernance() {
  if (!tech('civics')) return '<h2 class="section">Governance</h2><div class="card"><div class="card-desc">Writing and the Age of Iron will give Emberhold the laws needed to govern itself.</div></div>';
  let h = '<h2 class="section">Governance — the Civic Hall</h2>';
  h += '<div class="res-note">Choose one policy per settlement. Policies and research reset on migration; Civic Law must be researched again.</div>';
  for (const c of CIVICS) h += `<div class="card ${state.policy === c.id ? 'trial-active' : ''}"><div class="card-head"><span class="card-title">${c.name}</span>${state.policy === c.id ? '<span class="card-count">current policy</span>' : ''}</div><div class="card-effect">${c.desc}</div><div class="card-actions"><button data-action="policy" data-id="${c.id}" ${state.policy === c.id ? 'disabled' : ''}>Adopt</button></div></div>`;
  if (!tech('council')) return h + '<div class="card"><div class="card-desc">Research The Council to appoint a Governor and advisors.</div></div>';
  h += '<h2 class="section">Governor</h2><div class="res-note">Appointments cost 40 Currency. Only one governor may serve at a time.</div>';
  for (const g of GOVERNORS) h += `<div class="card ${state.governor === g.id ? 'trial-active' : ''}"><div class="card-head"><span class="card-title">${g.name}</span>${state.governor === g.id ? '<span class="card-count">serving</span>' : ''}</div><div class="card-effect">${g.desc}</div><div class="card-actions"><button data-action="governor" data-id="${g.id}" ${state.governor === g.id || state.res.currency < 40 ? 'disabled' : ''}>Appoint</button></div></div>`;
  h += '<h2 class="section">Council</h2><div class="res-note">Two seats are available. Advisors cost 25 Currency to seat or may be dismissed freely.</div>';
  for (const c of COUNCILORS) { const active = state.council.includes(c.id); h += `<div class="card ${active ? 'trial-active' : ''}"><div class="card-head"><span class="card-title">${c.name}</span>${active ? '<span class="card-count">seated</span>' : ''}</div><div class="card-effect">${c.desc}</div><div class="card-actions"><button data-action="councilor" data-id="${c.id}" ${!active && (state.council.length >= 2 || state.res.currency < 25) ? 'disabled' : ''}>${active ? 'Dismiss' : 'Seat advisor'}</button></div></div>`; }
  return h;
}

function renderTrials() {
  if (!state.trial && bld('monument') < 1 && !(era() >= 2 && bld('quarry') > 0)) {
    return '<h2 class="section">Trials</h2>' +
      '<div class="card"><div class="card-desc">A stone monument, and oaths sworn upon it, would test this village against itself. ' +
      'The Monument becomes possible in the Age of Iron.</div></div>';
  }
  const earlyWayfinding = !state.trial && bld('monument') < 1;
  let h = `<h2 class="section">Trials${earlyWayfinding ? ' — an oath for the far roads' : ' — oaths sworn upon the Monument'}</h2>`;
  if (earlyWayfinding) h += '<div class="res-note">A Stone-age expedition has revealed a trial that can be sworn before the Monument is raised.</div>';
  h += `<div class="res-note">Starting a trial restarts your migration in the same location with the same settings, after confirmation. One trial may be sworn at a time. Completing a trial grants its reward forever; failing one costs nothing but time.${upg('oathkeepers') ? ' The Oathkeepers remember: repeatable trials may be sworn once more.' : ''}</div>`;
  for (const t of (earlyWayfinding ? TRIALS.filter(t => t.id === 'wayfinding') : TRIALS)) {
    const active = trialActive(t.id);
    const done = trialCount(t.id);
    const max = trialMax(t);
    const maxed = t.repeat > 0 ? done >= max : done > 0;
    const reqOk = !t.req || t.req();
    h += `<div class="card ${active ? 'trial-active' : ''} ${maxed ? 'done' : ''}">` +
      `<div class="card-head"><span class="card-title">${t.name}</span>` +
      `<span class="trial-count">${t.repeat > 0 ? `completed ${done} / ${max}` : (done ? 'completed' : 'sworn once only')}</span></div>` +
      `<div class="trial-mod">While sworn: ${trialModifierText(t)}</div>` +
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
  h += `<div class="queue"><div class="queue-label">Expedition queue</div>${renderQueue('expedition')}</div>`;
  h += '<div class="res-note">Each expedition is sent once. What it finds stays with Emberhold forever.</div>';
  const sitesDone = EXPEDITIONS.filter(e => e.landing && expDone(e.id)).length;
  h += `<div class="res-note">Site expeditions: ${sitesDone}/${LANDINGS.length} established. Develop a settlement at each landing to send its unique expedition. Rewards endure at every landing. Complete all six for +5% to all production${siteExpeditionsComplete() ? ' — earned!' : ' forever.'}</div>`;
  const rates = production();
  let any = false;
  for (const e of EXPEDITIONS) {
    if (e.landing && e.landing !== state.landing) continue;
    if (expDone(e.id)) {
      any = true;
      h += `<div class="card done"><div class="card-head"><span class="card-title">${e.name}</span>` +
        `<span class="card-effect">Established — ${e.effect}</span></div></div>`;
      continue;
    }
    const cost = expeditionCost(e);
    if (!e.landing && !Object.entries(cost).every(([res, amount]) => capacityOf(res) >= amount && rates[res] > 0)) continue;
    any = true;
    const popOk = state.pop >= e.reqPop;
    const site = LANDINGS.find(l => l.id === e.landing);
    const queued = state.queues.expedition.some(entry => entry.id === e.id);
    const ok = popOk && state.queues.expedition.length < queueCapacity('expedition');
    h += `<div class="card"><div class="card-head"><span class="card-title has-tooltip" data-tooltip="${attrText(e.text)}">${e.name}</span></div>` +
      `<div class="card-effect">Grants: ${e.effect}</div>` +
      (site ? `<div class="res-note">Requires settlement at ${site.name} — you are here.</div>` : '') +
      `<div class="card-cost">cost: ${costHtml(cost)} — needs ${e.reqPop} villagers</div>` +
      `<div class="card-actions"><button data-action="exp" data-id="${e.id}" ${ok ? '' : 'disabled'}>${queued ? 'Queued' : canAfford(cost) ? 'Send the expedition' : 'Queue the expedition'}</button></div>` +
      `</div>`;
  }
  if (!any) h += '<div class="res-note">No expeditions within reach yet. Increase storage and maintain positive income for their supplies.</div>';
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
  h += `<div class="res-note">Setting out on a migration abandons the village — research resets, and villagers, stores, and every building are left behind. ` +
    `Completed trials and their rewards, expeditions made, Echoes and everything bought with them endure. ` +
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
    `<div class="card-desc">The departure is sworn and cannot be recalled. You may still tune the Ancestral Shop and choose a lineage, ` +
    `but the scout reports above are fixed and the old village is already committed to the road.</div>` +
    `<div class="card-actions">` +
    `<button data-action="migration-out" ${lineageSelectable(state.pendingSpecies || state.species) ? '' : 'disabled'}>Set out — found the new Emberhold</button></div>` +
    (!lineageSelectable(state.pendingSpecies || state.species) ? '<div class="res-note">Choose a compatible lineage and landing before setting out.</div>' : '') +
    `</div>`;
  h += '<h2 class="section">Scout reports</h2>' +
    `<div class="res-note">Survey points: ${fmt(state.surveyPoints || 0)}. Extra landing reports cost 3, then 9, then 27 points. Choose where the next Emberhold will stand.</div>`;
  for (const landing of (state.pendingLandings || [])) {
    const selected = state.pendingLanding === landing.id;
    const allowed = lineageSelectable(state.pendingSpecies || state.species, landing.id);
    const expedition = EXPEDITIONS.find(e => e.landing === landing.id);
    h += `<div class="card ${selected ? 'lineage-selected' : ''} ${allowed ? '' : 'dimmed'}"><div class="card-head"><span class="card-title has-tooltip" data-tooltip="${attrText(landing.text)}">${landing.name}</span>${selected ? '<span class="card-count">chosen</span>' : ''}</div>` +
      `<div class="card-effect">${modsHtml(landing)}</div>` +
      (expedition ? `<div class="res-note">${expedition.name}: ${expDone(expedition.id) ? 'established' : 'unexplored'} — ${expedition.effect}</div>` : '') +
      `<div class="card-actions"><button data-action="landing" data-id="${landing.id}" ${selected || !allowed ? 'disabled' : ''}>${!allowed ? 'Unsuitable for chosen lineage' : selected ? 'Chosen' : 'Choose this landing'}</button></div></div>`;
  }
  h += '<h2 class="section">Choose a lineage</h2>' +
    '<div class="res-note">Emberborn are always available. Ally with a tribe at disposition 80+ when departing to unlock its lineage for future migrations. Habitat specialists only appear as new neighbors in suitable places. Incompatible lineages and landings are greyed out. To choose a different habitat, first choose a lineage that can live there, such as Emberborn.</div>';
  for (const l of LINEAGES.filter(l => lineageUnlocked(l.id))) {
    const selected = (state.pendingSpecies || state.species) === l.id;
    const allowed = lineageSelectable(l.id);
    h += `<div class="card ${selected ? 'lineage-selected' : ''} ${allowed ? '' : 'dimmed'}"><div class="card-head">` +
      `<span class="card-title has-tooltip" data-tooltip="${attrText(l.desc)}">${l.name}</span>` +
      `<span class="card-effect">${l.effect}</span></div>` +
      `<div class="card-desc">${l.desc}</div><div class="res-note">${habitatText(l)}</div>` +
      `<div class="card-actions"><button data-action="lineage" data-id="${l.id}" ${selected || !allowed ? 'disabled' : ''}>${!allowed ? 'Requires a suitable landing' : selected ? 'Chosen' : 'Choose this lineage'}</button></div></div>`;
  }
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
      `<span class="card-title has-tooltip" data-tooltip="${attrText(u.desc)}">${u.name}</span>` +
      `<span class="card-count">${lvl} / ${u.max}</span>` +
      `<span class="card-effect">${u.effect}</span></div>` +
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

function loadLatestUpdatesTooltip() {
  const button = document.getElementById('btn-updates');
  if (!button || typeof fetch !== 'function' || typeof DOMParser !== 'function') return;
  fetch('changelog.html')
    .then(response => response.ok ? response.text() : Promise.reject(new Error('changelog unavailable')))
    .then(source => {
      const doc = new DOMParser().parseFromString(source, 'text/html');
      const sections = [...doc.querySelectorAll('main section')];
      const section = sections
        .map(section => ({ section, date: section.querySelector('h2')?.textContent.trim() }))
        .filter(entry => entry.date)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const date = section?.date;
      const updates = [...(section?.section.querySelectorAll('li') || [])]
        .map(item => item.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (date && updates.length) button.dataset.tooltip = `Latest updates (${date}):\n${updates.join('\n')}`;
    })
    .catch(() => {});
}

function render() {
  renderHeader();
  document.getElementById('stores').innerHTML = renderStores();
  const panels = {
    village: renderVillage,
    build: renderBuild,
    research: renderResearch,
    diplomacy: renderDiplomacy,
    governance: renderGovernance,
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

// ---------- automation API ----------
// Keep the controller surface separate from the renderer so userscripts and
// accessibility tools do not need to scrape text or reach into lexical globals.
const automationListeners = new Set();

function automationSnapshot() {
  return JSON.parse(JSON.stringify(state));
}

function emitAutomationEvent(type, detail = {}) {
  const payload = { type, state: automationSnapshot(), ...detail };
  for (const listener of automationListeners) listener(payload);
  if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(`emberhold:${type}`, { detail: payload }));
  }
  return payload;
}

const automationActionFns = {
  assign: doAssign,
  assignDiplomat: doAssignDiplomat,
  assignExplorer: doAssignExplorer,
  assignPerformer: doAssignPerformer,
  build: attemptBuild,
  craft: doCraft,
  chooseFactoryRecipe,
  chooseLanding,
  chooseLineage,
  choosePolicy,
  councilor: toggleCouncilor,
  expedition: attemptExpedition,
  migrationBegin: beginMigration,
  migrationBuy,
  migrationOut: setOut,
  migrationRefund,
  raid: doRaid,
  research: attemptResearch,
  trialAbandon: () => endTrial(false),
  trialStart: startTrial,
  supplyDiplomacyRequest,
  governor: appointGovernor,
};

function runAutomationAction(name, ...args) {
  const action = automationActionFns[name];
  if (!action) throw new Error(`Unknown Emberhold action: ${name}`);
  const result = action(...args);
  render();
  emitAutomationEvent('action', { action: name, args });
  return result;
}

window.emberhold = {
  version: 1,
  get state() { return automationSnapshot(); },
  getState: automationSnapshot,
  action(name, ...args) { return runAutomationAction(name, ...args); },
  actions: Object.fromEntries(Object.keys(automationActionFns).map(name =>
    [name, (...args) => runAutomationAction(name, ...args)])),
  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    automationListeners.add(listener);
    return () => automationListeners.delete(listener);
  },
  save() { saveGame(true); return automationSnapshot(); },
  helpers: {
    bld,
    buildingCost,
    canAfford,
    capacityOf,
    expeditionCost,
    factoryRecipe,
    landingDef,
    popCap,
    production,
    queueDemand,
    tech,
    trialActive,
    unassigned,
  },
  render,
  switchTab,
  definitions: { RESOURCES, JOBS, BUILDINGS, CRAFTS, TECHS, CIVICS, GOVERNORS,
    COUNCILORS, TRIALS, EXPEDITIONS, LANDINGS, LINEAGES, UPGRADES },
};

// ---------- events ----------
let repeatTimer = null;
let repeatButton = null;
let suppressRepeatClick = false;

function repeatable(btn) {
  return btn.hasAttribute('data-repeat');
}

function runAction(btn) {
  const a = btn.dataset.action;
  switch (a) {
    case 'tab': switchTab(btn.dataset.tab); break;
    case 'job-inc': doAssign(btn.dataset.job, +1); render(); break;
    case 'job-dec': doAssign(btn.dataset.job, -1); render(); break;
    case 'build': attemptBuild(btn.dataset.id); render(); break;
    case 'build-filter': buildFilter = btn.dataset.filter; render(); break;
    case 'craft': doCraft(btn.dataset.id); render(); break;
    case 'factory-recipe': chooseFactoryRecipe(btn.dataset.id); render(); break;
    case 'research': attemptResearch(btn.dataset.id); render(); break;
    case 'queue-cancel': cancelQueue(btn.dataset.type, +btn.dataset.index); render(); break;
    case 'diplomacy-supply': supplyDiplomacyRequest(btn.dataset.tribe); render(); break;
    case 'raid': doRaid(btn.dataset.tribe); render(); break;
    case 'diplomat-inc': doAssignDiplomat(btn.dataset.tribe, +1); render(); break;
    case 'diplomat-dec': doAssignDiplomat(btn.dataset.tribe, -1); render(); break;
    case 'performer-inc': doAssignPerformer(+1); render(); break;
    case 'performer-dec': doAssignPerformer(-1); render(); break;
    case 'explorer-inc': doAssignExplorer(+1); render(); break;
    case 'explorer-dec': doAssignExplorer(-1); render(); break;
    case 'policy': choosePolicy(btn.dataset.id); render(); break;
    case 'governor': appointGovernor(btn.dataset.id); render(); break;
    case 'councilor': toggleCouncilor(btn.dataset.id); render(); break;
    case 'trial-start': startTrial(btn.dataset.id); render(); break;
    case 'trial-abandon': endTrial(false); render(); break;
    case 'exp': attemptExpedition(btn.dataset.id); render(); break;
    case 'migration-begin': beginMigration(); render(); break;
    case 'migration-out': setOut(); render(); break;
    case 'lineage': chooseLineage(btn.dataset.id); render(); break;
    case 'landing': chooseLanding(btn.dataset.id); render(); break;
    case 'migration-buy': migrationBuy(btn.dataset.id); render(); break;
    case 'migration-refund': migrationRefund(btn.dataset.id); render(); break;
    case 'save': saveGame(); render(); break;
    case 'export': exportSave(); break;
    case 'import': importSave(); break;
    case 'reset': resetGame(); break;
  }
}

function findRepeatButton(meta) {
  return [...document.querySelectorAll('[data-action][data-repeat]')]
    .find(b => b.dataset.action === meta.action &&
      Object.entries(meta).every(([key, value]) => key === 'action' || b.dataset[key] === value));
}

function stopRepeating() {
  if (repeatTimer !== null) clearTimeout(repeatTimer);
  repeatTimer = null;
  repeatButton = null;
}

function repeatStep(meta, startedAt) {
  const btn = findRepeatButton(meta);
  if (!btn || btn.disabled || repeatButton !== meta) {
    stopRepeating();
    return;
  }
  runAction(btn);
  render();
  const heldFor = performance.now() - startedAt;
  const delay = Math.max(40, 180 - heldFor * 0.12);
  repeatTimer = setTimeout(() => repeatStep(meta, startedAt), delay);
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  if (suppressRepeatClick && repeatable(btn)) {
    suppressRepeatClick = false;
    return;
  }
  runAction(btn);
  render();
});

document.addEventListener('pointerdown', (e) => {
  pointerDown = true;
  const btn = e.target.closest('[data-action][data-repeat]');
  if (!btn || btn.disabled || e.button !== 0) return;
  e.preventDefault();
  stopRepeating();
  suppressRepeatClick = true;
  repeatButton = { action: btn.dataset.action, ...btn.dataset };
  runAction(btn);
  render();
  const meta = repeatButton;
  const startedAt = performance.now();
  repeatTimer = setTimeout(() => repeatStep(meta, startedAt), 350);
});

document.addEventListener('mouseover', (e) => {
  if (e.target.closest('.has-tooltip')) tooltipHover = true;
});
document.addEventListener('mouseout', (e) => {
  const tip = e.target.closest('.has-tooltip');
  if (tip && !e.relatedTarget?.closest?.('.has-tooltip')) tooltipHover = false;
});
document.addEventListener('pointerup', () => {
  pointerDown = false;
  stopRepeating();
  setTimeout(() => { suppressRepeatClick = false; }, 0);
});
document.addEventListener('pointercancel', () => {
  pointerDown = false;
  stopRepeating();
  suppressRepeatClick = false;
});

// ---------- boot ----------
function boot() {
  state = loadGame();
  const loaded = !!state;
  state = state || defaultState();
  state.diplomacy = state.diplomacy || {};
  state.diplomats = state.diplomats || {};
  state.policy = state.policy || 'commons';
  state.council = Array.isArray(state.council) ? state.council : [];
  state.tribesSeen = state.tribesSeen || { human: true };
  state.species = state.species || 'human';
  ensureDiplomacyEntry(state.tradePartner || 'human');
  if (loaded) {
    reconcileWorkers();
    offlineProgress();
    addLog('The chronicle resumes.', '');
  } else {
    addLog('A handful of survivors halts in the shelter of a burnt palisade. They name the place Emberhold.', 'log-important');
    addLog('Assign Foragers and Woodcutters below, keep food in the store, and raise Huts as children arrive. Knowledge is written in Libraries, and every store has a ceiling the Storehouse raises.', '');
  }
  if (state.won) {
    document.getElementById('banner').textContent =
      '✦ THE BEACON BURNS — Emberhold endures. You may keep playing. ✦';
    document.getElementById('banner').classList.remove('hidden');
  }
  document.getElementById('btn-save').addEventListener('click', () => { saveGame(); render(); });
  document.getElementById('btn-updates').addEventListener('click', () => {
    window.open('changelog.html', '_blank', 'noopener,noreferrer');
  });
  document.getElementById('btn-export').addEventListener('click', exportSave);
  document.getElementById('btn-import').addEventListener('click', importSave);
  document.getElementById('btn-reset').addEventListener('click', resetGame);
  document.querySelectorAll('#tabs .tab').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));
  loadLatestUpdatesTooltip();

  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 5); // clamp long tab sleeps
    last = now;
    tick(dt);
  }, 250);
  setInterval(() => { if (!tooltipHover && !pointerDown && !document.activeElement?.closest('.has-tooltip')) render(); }, 500);
  setInterval(() => saveGame(true), 15000);
  window.addEventListener('beforeunload', () => saveGame(true));
  render();
}

boot();
