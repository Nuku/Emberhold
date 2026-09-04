// ============================================================
// EMBERHOLD — engine + UI
// ============================================================
'use strict';

const OFFLINE_CAP = 8 * 3600;   // seconds of offline simulation allowed
const OFFLINE_RATE = 0.5;       // offline runs at half speed

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
function isMephit() { return state.species === 'mephit'; }
function armorLevel() { return Math.max(0, Number(state.armor) || 0); }
function tradeAvailable() { return tech('currency') && !!state.tradePartner; }
function guardCap() { return bld('barracks') * 2; }
function randomDiplomacyRequest() {
  const pool = RESOURCES.filter(r => r.id !== 'knowledge' && r.id !== 'currency' && r.id !== 'machinery' && r.id !== 'aether' && state.seen[r.id]);
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
      request: randomDiplomacyRequest(),
    };
  } else if (!state.diplomacy[id].request || state.diplomacy[id].request.age === undefined) {
    state.diplomacy[id].request = randomDiplomacyRequest();
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
function alliedTribes() { return Object.values(state.diplomacy || {}).filter(entry => entry.disposition >= 80).length; }
function ableGuards() { return Math.max(0, (state.jobs.guard || 0) - (state.guardInjuries || 0)); }
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
function rollTradePartner() {
  const nonHuman = TRIBES.filter(t => t.id !== 'human');
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
    (1 + 0.2 * trialCount('overflow') + 0.15 * upg('deepCellars')) * governanceStorageMod());
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
  for (const j in state.jobs) if (JOBS[j] && !JOBS[j].targeted) n += state.jobs[j];
  return n + totalDiplomats() + performerCount() + explorerCount();
}
function unassigned() { return state.pop - assignedWorkers(); }

function buildingCost(def) {
  const mult = Math.pow(def.scale, bld(def.id)) *
    (trialActive('frugality') ? 1.5 : 1) *
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
  m *= 0.70 + Math.max(0, Math.min(100, Number(state.morale) || 0)) * 0.0042857;
  m *= 1 + 0.05 * bld('shrine') + 0.10 * bld('factory');
  m *= 1 + 0.15 * bld('dynamo');
  m *= 1 + 0.05 * alliedTribes();
  m *= 1 + 0.002 * state.res.machinery;
  if (expDone('glacialPeaks')) m *= 1.10;
  if (perm('everwarm')) m *= 1.05;
  m *= 1 + 0.05 * upg('deepRoots');
  if (trialActive('haste')) m *= 0.70;
  return m;
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
function updateRandomEvents(dt) {
  state.randomEventT = (state.randomEventT || 0) + dt;
  if (state.randomEventT < (state.randomEventNext || 60)) return;
  state.randomEventT = 0;
  state.randomEventNext = 55 + Math.random() * 75;
  const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
  const delta = randomRange(event.delta);
  state.morale = Math.max(0, Math.min(moraleCap(), state.morale + delta));
  for (const resource of ['food', 'wood', 'currency']) {
    if (!event[resource]) continue;
    const amount = randomRange(event[resource]);
    state.res[resource] = Math.max(0, Math.min(capacityOf(resource), state.res[resource] + amount));
    state.seen[resource] = true;
  }
  const impact = delta > 0 ? 'log-good' : 'log-bad';
  addLog(`${event.text} Morale ${delta > 0 ? '+' : ''}${delta}.`, impact);
}

function lineageMod(res) {
  const lineage = lineageDef(state.species);
  return (lineage.mods[res] === undefined ? 1 : lineage.mods[res]) * (lineage.all || 1);
}

function production() {
  const rates = {};
  for (const r of RESOURCES) rates[r.id] = 0;
  const global = allMult();
  let winterproofFood = 0;
  let guardUpkeep = 0;

  // job output
  for (const j in JOBS) {
    const job = JOBS[j];
    const n = state.jobs[j] || 0;
    if (job.targeted) continue;
    if (n > 0) {
      const able = j === 'guard' ? ableGuards() : n;
      if (job.winterproof) {
        winterproofFood += able * job.base;
      } else if (!job.inputs || (state.res.wood > 0 && state.res.stone > 0)) {
        rates[job.res] += n * job.base;
      }
      if (job.upkeep) guardUpkeep += n * job.upkeep;
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
  if (tradeAvailable()) rates.currency += 0.05;
  if (era() >= 2) rates.copper += 0.02; // trace deposits found throughout the Stone age

  // per-resource modifiers
  rates.food *= global * seasonMult() *
    (1 + 0.10 * bld('foragerLodge')) *
    (1 + 0.20 * bld('aqueduct')) *
    (1 + 0.10 * trialCount('scarcity')) *
    (trialActive('scarcity') ? 0.5 : 1);
  winterproofFood *= global *
    (1 + 0.50 * (tech('weaponry') ? 1 : 0)) *
    (1 + 0.75 * (tech('weaponEfficiency') ? 1 : 0));
  rates.food += winterproofFood - guardUpkeep;

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
  rates.currency *= global;

  if (bld('steamPlant') > 0) {
    rates.power += bld('steamPlant') * 1.2;
    rates.coal -= bld('steamPlant') * 0.08;
  }
  if (bld('dynamo') > 0) rates.power += bld('dynamo') * 1.5;
  if (bld('factory') > 0 && state.res.power > 0) {
    rates.goods += bld('factory') * 0.08;
    rates.power -= bld('factory') * 0.35;
  }

  // The land, lineage, and civic choices shape output; population upkeep is
  // applied afterward so food policies do not alter how much villagers eat.
  for (const r in rates) rates[r] *= landingMod(r) * lineageMod(r) * governanceMod(r);
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
  if (state.trial || state.migrating) return;
  const def = TRIALS.find(t => t.id === id);
  if (!def) return;
  if (def.repeat > 0 && trialCount(id) >= trialMax(def)) return;
  if (def.repeat === 0 && trialCount(id) > 0) return;
  if (def.req && !def.req()) return;
  if (!confirm(`Start ${def.name}? This restarts your migration in the same location with the same lineage, upgrades, and governance settings. Your village, resources, and jobs reset to migration starting values; permanent progress is kept. No Echoes are awarded. Continue?`)) return;
  setOut(id);
  addLog(`The village swears the ${def.name}. ${def.mod}`, 'log-important');
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
  for (const id in state.diplomacy) {
    const entry = state.diplomacy[id];
    const nudged = diplomatCount(id) * 0.02 * dt;
    if (nudged) entry.disposition = Math.min(100, entry.disposition + nudged);
  }
  if (state.guardInjuries > 0) state.guardInjuries = Math.max(0, state.guardInjuries - dt / 90);
  state.diplomacyEventT = (state.diplomacyEventT || 0) + dt;
  if (state.diplomacyEventT < 180) return;
  state.diplomacyEventT = 0;
  const ids = Object.keys(state.diplomacy);
  if (!ids.length) return;
  const id = ids[Math.floor(Math.random() * ids.length)];
  const entry = state.diplomacy[id];
  const tribe = tribeDef(id);
  if (entry.disposition < 50 && Math.random() < 0.45) {
    resolveTribeRaid(id);
    return;
  }
  const delta = Math.random() < 0.55 ? 5 + Math.floor(Math.random() * 6) : -(5 + Math.floor(Math.random() * 6));
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
  const defense = (able + wounded * 0.5 + armed * 0.9) * (isMephit() ? 1.35 : 1);
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
  state.pendingLanding = state.pendingLandings[0].id;
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
  const newSpecies = trialId ? state.species : (state.pendingSpecies || state.species);
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
    techs: state.techs, day: state.day, seen: state.seen,
    echoes: state.echoes, upgrades: state.upgrades,
    trialDone: state.trialDone, expeditions: state.expeditions,
    landingsSeen: state.landingsSeen,
    species: state.species, tribesSeen: state.tribesSeen,
    diplomacy: state.diplomacy,
    armor: state.armor,
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
  state.species = keep.species;
  state.species = newSpecies;
  state.lineagesUnlocked = unlockedLineages;
  state.tribesSeen = keep.tribesSeen;
  state.diplomacy = keep.diplomacy;
  state.armor = Math.max(keep.armor || 0, state.techs.leatherArmor ? 1 : 0);
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
  if (!state.migrating || !lineageUnlocked(id)) return;
  state.pendingSpecies = id;
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

  updateMorale(dt, rates.food);

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
  updateDiplomacy(dt);
  updateRandomEvents(dt);
  updateExploration(dt);

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
  if (state.pop < def.reqPop) return;
  const cost = expeditionCost(def);
  if (!canAfford(cost)) return;
  payCost(cost);
  state.expeditions[id] = true;
  addLog(`Expedition returned: ${def.name} is now part of Emberhold's world. ${def.effect}`, 'log-good');
}

function doAssign(job, delta) {
  const j = JOBS[job];
  if (!j || j.targeted || !j.unlock()) return;
  state.jobs[job] = state.jobs[job] || 0;
  if (delta > 0 && unassigned() <= 0) return;
  if (delta > 0 && job === 'guard' && (state.jobs.guard || 0) >= guardCap()) return;
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
  if (!tech('diplomacy') || !state.diplomacy || !state.diplomacy[id]) return;
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
  return pools[id] || ['food', 'wood'];
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
  if (!entry || !tech('guards')) return;
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
  if (!tech('currency') || !state.diplomacy || !state.diplomacy[id]) return;
  const entry = state.diplomacy[id];
  if (!canAfford({ [entry.request.res]: entry.request.amount })) return;
  payCost({ [entry.request.res]: entry.request.amount });
  entry.disposition = Math.min(100, entry.disposition + 8);
  state.morale = Math.min(moraleCap(), state.morale + 2);
  const tribe = tribeDef(id);
  addLog(`The ${tribe.name} accept the requested goods. Relations improve by 8.`, 'log-good');
  entry.request = randomDiplomacyRequest();
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
    delete s.res.weapons;
    delete s.res.armor;
    if (s.armor === undefined) s.armor = s.techs.leatherArmor ? 1 : 0;
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

function renderVillage() {
  const rates = production();
  const L = landingDef();
  let h = `<h2 class="section">Where you stand — ${L.name}</h2>` +
    `<div class="res-note">${L.text}</div>` +
    `<div class="res-note" style="margin:2px 0 6px">The land gives: ${modsHtml(L)}</div>` +
    `<div class="res-note" style="margin:2px 0 6px">${tradeAvailable() ? `Trading with the ${tribeDef(state.tradePartner).name}; funds arrive at ${fmtRate(0.05)} before Banker work.` : `The ${tribeDef(state.tradePartner).name} are nearby. Research Currency to begin trading.`}</div>` +
    `<div class="res-note" style="margin:2px 0 6px">Guard armor: level ${fmt(armorLevel())} — each level reduces death odds by 8% (minimum 15%).</div>` +
    `<div class="res-note" style="margin:2px 0 6px">Morale rises when stores are secure and falls when food runs short or winter bites. The Shrine steadies the people. ${moraleLabel()} morale changes production by ${Math.round((0.70 + state.morale * 0.0042857 - 1) * 100)}%; current ceiling: ${moraleCap()}.</div>` +
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
      `<span class="res-name has-tooltip" data-tooltip="${attrText(r.note)}">${r.name}</span>` +
      `<span class="res-amount ${isFull(r.id) ? 'res-full' : ''}">${amount}</span>` +
      `<span class="res-rate ${cls}">${fmtRate(rate)}</span>` +
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
      `<span class="card-title has-tooltip" data-tooltip="${attrText(c.desc)}">${c.name}</span>` +
      `<span class="card-effect">${fullNote.replace(/^ — /, '')}</span></div>` +
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
    if (job.targeted) continue;
    if (!job.unlock()) continue;
    const n = state.jobs[j] || 0;
    h += `<div class="job-row">` +
      `<span class="job-name has-tooltip" data-tooltip="${attrText(job.desc)}">${job.name}</span>` +
      `<span class="job-assign">${j === 'guard' && state.guardInjuries ? `${n} (${Math.floor(ableGuards())} able)` : n}</span>` +
      `<span class="job-rate">${fmt(job.base)} ${RESOURCES.find(r => r.id === job.res).name}/s each` +
      (job.inputs ? ` (uses ${Object.entries(job.inputs).map(([r, v]) => `${fmt(v)} ${RESOURCES.find(x => x.id === r).name.toLowerCase()}/s`).join(' + ')})` : '') +
      `</span>` +
      `<span class="job-btns">` +
      `<button data-action="job-dec" data-job="${j}" ${n > 0 ? '' : 'disabled'}>−</button>` +
      `<button data-action="job-inc" data-job="${j}" ${unassigned() > 0 && (j !== 'guard' || n < guardCap()) ? '' : 'disabled'}>+</button>` +
      `</span></div>`;
  }
  if (JOBS.performer.unlock()) {
    const n = performerCount();
    h += `<div class="job-row"><span class="job-name has-tooltip" data-tooltip="${attrText(JOBS.performer.desc)}">${JOBS.performer.name}</span>` +
      `<span class="job-assign">${n}</span>` +
      `<span class="job-rate">+0.10 morale/s each</span>` +
      `<span class="job-btns"><button data-action="performer-dec" ${n > 0 ? '' : 'disabled'}>−</button>` +
      `<button data-action="performer-inc" ${unassigned() > 0 ? '' : 'disabled'}>+</button></span></div>`;
  }
  if (JOBS.explorer.unlock()) {
    const n = explorerCount();
    h += `<div class="job-row"><span class="job-name has-tooltip" data-tooltip="${attrText(JOBS.explorer.desc)}">${JOBS.explorer.name}</span>` +
      `<span class="job-assign">${n}</span>` +
      `<span class="job-rate">+0.025 Survey/s each</span>` +
      `<span class="job-btns"><button data-action="explorer-dec" ${n > 0 ? '' : 'disabled'}>−</button>` +
      `<button data-action="explorer-inc" ${unassigned() > 0 ? '' : 'disabled'}>+</button></span></div>`;
  }
  h += `<div class="res-note" style="margin-top:6px">Every villager eats ${fmt(FOOD_PER_POP)} food/s, working or not. Guards also require ${fmt(JOBS.guard.upkeep)} food/s each, but their hunting is not reduced by winter. Weaponry and Leather Armor research strengthen the watch; injuries heal over time. Every store but Knowledge and Currency has a ceiling — what flows in past a full store is wasted. Storehouses raise the ceilings.</div>`;

  return h;
}

function renderBuild() {
  let h = '<h2 class="section">Construction</h2>';
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
    const ok = !maxed && canAfford(cost);
    h += `<div class="card"><div class="card-head">` +
      `<span class="card-title has-tooltip" data-tooltip="${attrText(b.desc)}">${b.name}</span>` +
      (b.max > 1 ? `<span class="card-count">${count} / ${b.max}</span>` : (count ? `<span class="card-count">built</span>` : '')) +
      `<span class="card-effect">${b.effect()}</span></div>` +
      `<div class="card-cost">cost: ${costHtml(cost)}</div>` +
      `<div class="card-actions"><button data-action="build" data-id="${b.id}" ${ok ? '' : 'disabled'}>${maxed ? 'Complete' : 'Build'}</button></div>` +
      `</div>`;
  }
  if (!any) h += `<div class="res-note">${buildFilter === 'complete' ? 'No completed buildings yet.' : 'Nothing remains to build yet. Learn from the world first.'}</div>`;
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
      `<span class="card-title has-tooltip" data-tooltip="${attrText(t.desc)}">${t.name}</span>` +
      `<span class="card-count">${fmt(t.cost)} Knowledge</span></div>` +
      `<div class="card-actions"><button data-action="research" data-id="${t.id}" ${ok ? '' : 'disabled'}>Research</button></div>` +
      `</div>`;
  }
  if (!any) h += '<div class="res-note">The wise have nothing left to learn here.</div>';
  h += `<div class="res-note" style="margin-top:6px">Knowledge is produced by Thinkers (build a Library first) and never returns once spent.</div>`;
  return h;
}

function renderDiplomacy() {
  let h = '<h2 class="section">Diplomacy — neighbors and foreign courts</h2>';
  h += '<div class="res-note">Disposition ranges from hostile (−100) to warm (+100). Friendly tribes make gentler requests; diplomats and events can shift relations over time.</div>';
  if (!tech('currency')) {
    h += '<div class="card"><div class="card-desc">The tribes will speak, but trade requires Currency. Research it to honor their requests with goods.</div></div>';
  }
  for (const id in (state.diplomacy || {})) {
    const tribe = tribeDef(id);
    const entry = state.diplomacy[id];
    const requestCost = { [entry.request.res]: entry.request.amount };
    const canSupply = tradeAvailable() && canAfford(requestCost);
    h += `<div class="card"><div class="card-head"><span class="card-title has-tooltip" data-tooltip="${attrText(tribe.text)}">${tribe.name}</span>` +
      `<span class="card-count">disposition ${Math.round(entry.disposition)} / 100</span></div>` +
      (entry.disposition >= 80 ? '<div class="trial-reward">Active ally: +5% to all village incomes.</div>' : '') +
      (entry.disposition < 50 ? `<div class="trial-mod">Relations are strained: the ${tribe.name} may raid the village.</div>` : '') +
      `<div class="trial-goal">${diplomacyRequestText(tribe, entry)}</div>` +
      `<div class="card-cost">offer: ${costHtml(requestCost)}</div>` +
      `<div class="card-actions"><button data-action="diplomacy-supply" data-tribe="${id}" ${canSupply ? '' : 'disabled'}>Supply the request</button></div>`;
    if (tech('guards')) {
      const raidCost = { food: 30, tools: 2 };
      const canRaid = ableGuards() > 0 && canAfford(raidCost);
      h += `<div class="trial-mod">Raid cost: ${costHtml(raidCost)}. This damages relations and may cost Guards.</div>` +
        `<div class="card-actions"><button data-action="raid" data-tribe="${id}" ${canRaid ? '' : 'disabled'}>Raid the ${tribe.name}</button></div>`;
    }
    if (tech('diplomacy')) {
      h += `<div class="res-note">${JOBS.diplomat.name}s assigned: ${diplomatCount(id)} — each nudges relations upward over time</div>` +
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
  h += '<div class="res-note">Choose one policy per settlement. Policies reset on migration, while the knowledge of Civic Law endures.</div>';
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
    h += `<div class="card"><div class="card-head"><span class="card-title has-tooltip" data-tooltip="${attrText(e.text)}">${e.name}</span></div>` +
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
    `<div class="card-desc">The departure is sworn and cannot be recalled. You may still tune the Ancestral Shop and choose a lineage, ` +
    `but the scout reports above are fixed and the old village is already committed to the road.</div>` +
    `<div class="card-actions">` +
    `<button data-action="migration-out">Set out — found the new Emberhold</button></div>` +
    `</div>`;
  h += '<h2 class="section">Scout reports</h2>' +
    `<div class="res-note">Survey points: ${fmt(state.surveyPoints || 0)}. Extra landing reports cost 3, then 9, then 27 points. Choose where the next Emberhold will stand.</div>`;
  for (const landing of (state.pendingLandings || [])) {
    const selected = state.pendingLanding === landing.id;
    h += `<div class="card ${selected ? 'lineage-selected' : ''}"><div class="card-head"><span class="card-title has-tooltip" data-tooltip="${attrText(landing.text)}">${landing.name}</span>${selected ? '<span class="card-count">chosen</span>' : ''}</div>` +
      `<div class="card-effect">${modsHtml(landing)}</div>` +
      `<div class="card-actions"><button data-action="landing" data-id="${landing.id}" ${selected ? 'disabled' : ''}>${selected ? 'Chosen' : 'Choose this landing'}</button></div></div>`;
  }
  h += '<h2 class="section">Choose a lineage</h2>' +
    '<div class="res-note">Your next Emberhold inherits one lineage. Human lineages are always available; allied tribes become available after you migrate while their disposition is 80 or higher.</div>';
  for (const l of LINEAGES.filter(l => lineageUnlocked(l.id))) {
    const selected = (state.pendingSpecies || state.species) === l.id;
    h += `<div class="card ${selected ? 'lineage-selected' : ''}"><div class="card-head">` +
      `<span class="card-title has-tooltip" data-tooltip="${attrText(l.desc)}">${l.name}</span>` +
      `<span class="card-effect">${l.effect}</span></div>` +
      `<div class="card-actions"><button data-action="lineage" data-id="${l.id}" ${selected ? 'disabled' : ''}>${selected ? 'Chosen' : 'Choose this lineage'}</button></div></div>`;
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

function render() {
  renderHeader();
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
    case 'build-filter': buildFilter = btn.dataset.filter; render(); break;
    case 'craft': doCraft(btn.dataset.id); render(); break;
    case 'research': doResearch(btn.dataset.id); render(); break;
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
    case 'exp': doExpedition(btn.dataset.id); render(); break;
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
});

document.addEventListener('mouseover', (e) => {
  if (e.target.closest('.has-tooltip')) tooltipHover = true;
});
document.addEventListener('mouseout', (e) => {
  const tip = e.target.closest('.has-tooltip');
  if (tip && !e.relatedTarget?.closest?.('.has-tooltip')) tooltipHover = false;
});
document.addEventListener('pointerdown', () => { pointerDown = true; });
document.addEventListener('pointerup', () => { pointerDown = false; });
document.addEventListener('pointercancel', () => { pointerDown = false; });

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
    // drop assignments that no longer qualify (e.g. saves from before a job gate changed)
    for (const j in state.jobs) if (!JOBS[j] || !JOBS[j].unlock()) delete state.jobs[j];
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
  setInterval(() => { if (!tooltipHover && !pointerDown) render(); }, 500);
  setInterval(() => saveGame(true), 15000);
  window.addEventListener('beforeunload', () => saveGame(true));
  render();
}

boot();
