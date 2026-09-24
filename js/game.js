// ============================================================
// EMBERHOLD — engine + UI
// ============================================================
'use strict';

const OFFLINE_CAP = 24 * 3600;  // maximum banked seconds of double-speed play
const BACKGROUND_CATCH_UP_CAP = 60; // simulate at most one delayed minute at once
const SPY_TRAINING_TIME = 180;
const ESPIONAGE_TIME = 20 * 60;
const SPY_CAPTURE_CHANCE = 0.0001;
const MAX_LOCAL_TRIBES = 3;
const POLICY_CHANGE_COOLDOWN = 60 * 60; // real-time seconds; base for future modifiers
const LOG_CATEGORIES = ['progress', 'achievements', 'queue', 'building', 'research', 'combat', 'espionage', 'events'];
const LOG_LIMIT_PER_CATEGORY = 50;
const MALFORMED_DANGER_MAX = 20;
const MALFORMED_DANGER_RATE = 0.001;
const MALFORMED_ATTACK_INTERVAL = [300, 540];
const MALFORMED_FENDED_MESSAGES = [
  'The malformed creatures circle the watchfires, then withdraw for now.',
  'Something with too many joints tests the palisade and finds the Guards waiting.',
  'The night watch drives pale shapes back beyond the settlement lights.',
  'A wet clicking rises from the dark. The Guards answer with steel, and the clicking fades.',
];

let state = null;
let lastStoredSave = null;
let saveLoadFailed = false;
let saveConflict = false;
let lastGameAt = null;
let gameClockWorker = null;
let activeTab = 'village';
let buildFilter = 'incomplete';
const raidSelections = {};
let tooltipHover = false;
let storesTooltipOverlay = null;
let storesTooltipAnchor = null;
let pointerDown = false;

// Game definitions are immutable after data.js loads. Indexing them once keeps
// the simulation and render paths from repeatedly scanning the same arrays.
function indexById(definitions) {
  return new Map(definitions.map(definition => [definition.id, definition]));
}
const RESOURCE_BY_ID = indexById(RESOURCES);
const BUILDING_BY_ID = indexById(BUILDINGS);
const TECH_BY_ID = indexById(TECHS);
const CRAFT_BY_ID = indexById(CRAFTS);
const EXPEDITION_BY_ID = indexById(EXPEDITIONS);
const TRIAL_BY_ID = indexById(TRIALS);
const CIVIC_BY_ID = indexById(CIVICS);
const GOVERNOR_BY_ID = indexById(GOVERNORS);
const COUNCILOR_BY_ID = indexById(COUNCILORS);
const TRIBE_BY_ID = indexById(TRIBES);
const LINEAGE_BY_ID = indexById(LINEAGES);
const LANDING_BY_ID = indexById(LANDINGS);
const UPGRADE_BY_ID = indexById(UPGRADES);
const WONDER_BY_ID = indexById(WONDERS);
const WONDER_UNLOCK_BY_ID = indexById(WONDER_UNLOCKS);
const FACTORY_RECIPE_BY_ID = indexById(FACTORY_RECIPES);
const PLACE_TRAIT_BY_ID = indexById(PLACE_TRAITS);
const LINEAGE_TRAIT_BY_ID = indexById(LINEAGE_TRAITS);
const RESOURCE_PROJECT_BY_ID = indexById(RESOURCE_PROJECTS);

function resourceName(id) { return RESOURCE_BY_ID.get(id)?.name || id; }

// ---------- state ----------
function defaultState() {
  const res = {};
  for (const r of RESOURCES) res[r.id] = 0;
  const seen = {};
  const s = {
    v: 1,
    savedAt: Date.now(),
    bonusTime: 0,
    paused: false,
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
    factoryRecipes: ['goods'],
    buildingPower: {},
    techs: {},
    trialDone: {},
    trial: null,
    expeditions: {},
    expeditionRatings: {},
    beaconsLit: {},
    beaconRevisited: {},
    beaconProgress: 0,
    airControlProgress: 0,
    greatMigrationProgress: 0,
    tradeBlimps: [],
    wonders: {},
    wonderUnlocks: {},
    rapture: { landing: null, workers: 0, tabSeen: false },
    hope: 0,
    ancient: 0,
    hopeEver: false,
    ancientEver: false,
    echoes: 0,
    upgrades: {},
    landing: 'emberplain',
    placeTraits: [],
    traitEffects: {},
    // The starting settlement is already a known landing, even before the
    // player completes their first migration.
    landingsSeen: { emberplain: true },
    ancestralBlessing: false,
    species: 'human',
    lineagesUnlocked: { human: true },
    conqueredLineageTraits: [],
    customLineage: null,
    customLineageDraft: null,
    tradePartner: 'human',
    tradePartners: ['human'],
    tribesSeen: { human: true },
    diplomacy: {},
    culturalConquestRatings: {},
    lineageQualificationRatings: {},
    unifiedRegion: false,
    diplomats: {},
    spies: {},
    spyTraining: null,
    diplomacyEventT: 0,
    randomEventT: 0,
    randomEventNext: 60,
    malformedDanger: 0,
    malformedAttackT: 0,
    malformedAttackNext: MALFORMED_ATTACK_INTERVAL[0],
    surveyPoints: 0,
    pendingLandings: [],
    pendingLanding: null,
    policy: 'commons',
    policyChangedAt: 0,
    governor: null,
    council: [],
    guardInjuries: 0,
    raptureFleeMoraleT: 0,
    guardRecruitment: 0,
    migrationGuardDeaths: 0,
    migrationRaids: 0,
    migrationChallengePending: false,
    pendingMigrationChallenges: [],
    migrationChallenges: [],
    armor: 0,
    migrating: false,
    migrationPreparation: false,
    projects: {},
    pendingEchoes: 0,
    pendingEchoMultiplier: 1,
    shopTab: 'buy',
    won: false,
    achievements: {},
    achievementChecks: {},
    achievementChecksInitialized: false,
    commonalityLineages: {},
    commonalityGuardsReturned: {},
    tutorialDismissed: false,
    settings: { autosave: true, reducedMotion: false, compactStores: false, strictQueueOrder: false, tooltips: true, resetControls: false, fahrenheit: false, woodForCoal: {} },
    // Each category is persisted independently. `log` remains a derived,
    // read-only compatibility view for older integrations and saves.
    logs: Object.fromEntries(LOG_CATEGORIES.map(category => [category, []])),
    log: [],
    logSequence: 0,
  };
  s.res.food = 60;
  s.res.wood = 40;
  s.seen.food = true;
  s.seen.wood = true;
  return s;
}

// ---------- helpers ----------
function tech(id) {
  // Known Terrain permanently carries the benefit of Understanding Home
  // between settlements, as though that research were completed here.
  return !!state.techs[id] || (id === 'understandingHome' && upg('knownTerrain') > 0);
}
function bld(id) { return state.bld[id] || 0; }
function era() { return state.era; }
function expDone(id) { return !!state.expeditions[id]; }
function expeditionRating(id) {
  return Math.max(0, Math.min(4, Number(state.expeditionRatings?.[id]) || (expDone(id) ? 1 : 0)));
}
const POST_STONE_AGE_KNOWLEDGE_COST_MULTIPLIER = 15;
const POST_STONE_AGE_RESEARCH = new Set([
  'ironMites', 'weaponry', 'chainmail', 'machineryTech', 'aluminum', 'airControl', 'distantStores', 'oilPower', 'disciplinedBunking', 'reclaimining', 'lightningMetal',
  'livingAlloy', 'heartwood', 'starGlass', 'basinTempering', 'understandingHome', 'awakenAncients', 'advancedScience',
  'windHarness', 'banking', 'diplomacy', 'spies', 'espionage', 'civics',
  'council', 'commonality', 'festivals', 'civicHarmony', 'workplaceEthics', 'weaponEfficiency',
  'electricalEngineering', 'astronomy', 'optics',
]);
function wonderDef(id = state.landing) { return WONDER_BY_ID.get(id); }
function wonderRecord(id = state.landing) {
  state.wonders = state.wonders || {};
  if (!state.wonders[id]) state.wonders[id] = { found: false, sections: [false, false, false, false, false], progress: 0, researches: {}, expeditions: {}, obstacles: {}, obstacleNotices: {}, outcomes: {} };
  return state.wonders[id];
}
function beaconsLitCount() { return Object.keys(state.beaconsLit || {}).filter(id => state.beaconsLit[id]).length; }
function wonderHintsAvailable() { return tech('optics') && !!state.beaconRevisited?.[state.landing]; }
function wonderChoice(id, choice) { return !!state.wonders?.[id]?.outcomes?.[choice]; }
function wondersWithAnEnding() {
  return Object.values(state.wonders || {}).filter(record =>
    Object.values(record?.outcomes || {}).some(Boolean)).length;
}
function wonderUnlock(id) { return !!state.wonderUnlocks?.[id]; }
function animalHusbandryAvailable() { return wonderChoice('greenfold', 'silence'); }
function solarPowerAvailable() { return wonderChoice('emberplain', 'restore') &&
  ['steamPlant', 'dynamo', 'windDevice', 'livingBlock', 'factory'].some(id => bld(id) > 0); }
function trialCount(id) { return state.trialDone[id] || 0; }
function upg(id) { return state?.upgrades?.[id] || 0; }
function upgradeCost(def, level) { return def.cost ? def.cost(level) : def.costs[level]; }
function civicDef(id) { return CIVIC_BY_ID.get(id) || CIVICS[0]; }
function governorDef(id) { return GOVERNOR_BY_ID.get(id); }
function councilorDef(id) { return COUNCILOR_BY_ID.get(id); }
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
function tribeDef(id) { return TRIBE_BY_ID.get(id) || TRIBES[0]; }
const CUSTOM_LINEAGE_RESOURCES = ['food', 'wood', 'stone', 'tools', 'knowledge', 'currency', 'iron', 'coal', 'steel', 'machinery', 'aether', 'goods'];
const CUSTOM_LINEAGE_TRAITS = [
  ...CUSTOM_LINEAGE_RESOURCES.map(resource => ({ id: `gift-${resource}`, name: `Gifted ${resourceName(resource)}`, effect: `+15% ${resourceName(resource)}`, cost: 1, resource, mod: 1.15, group: 'Production' })),
  ...CUSTOM_LINEAGE_RESOURCES.map(resource => ({ id: `frailty-${resource}`, name: `Frailty: ${resourceName(resource)}`, effect: `−15% ${resourceName(resource)}`, cost: -1, resource, mod: 0.85, group: 'Trade-off' })),
  { id: 'sulfurWards', name: 'Sulfur Wards', effect: '+35% raid defense', cost: 3, special: { key: 'raidDefense', value: 1.35 }, lineage: 'mephit', group: 'Adaptation' },
  { id: 'quickLitters', name: 'Quick Litters', effect: '50% less population-growth time', cost: 3, growthTime: 0.5, lineage: 'rabbitfolk', group: 'Adaptation' },
  { id: 'farSight', name: 'Far Sight', effect: '+25% Survey gain', cost: 2, special: { key: 'survey', value: 1.25 }, lineage: 'skyborn', group: 'Adaptation' },
  { id: 'stoneSentinels', name: 'Stone Sentinels', effect: '+20% Guard recruitment rate', cost: 2, special: { key: 'guardRecruitment', value: 1.20 }, lineage: 'stonekin', group: 'Adaptation' },
  { id: 'practicalImprovisation', name: 'Practical Improvisation', effect: 'Queued work completes 10% faster', cost: 2, special: { key: 'queueTime', value: 0.90 }, lineage: 'human', group: 'Adaptation' },
  { id: 'timid', name: 'Timid', effect: '+10% time to recruit Guards', cost: -2, special: { key: 'guardRecruitmentTime', value: 1.10 }, group: 'Trade-off' },
];
const CUSTOM_LINEAGE_TRAIT_BY_ID = indexById(CUSTOM_LINEAGE_TRAITS);
function customLineagePoints() { return achievementRating('wonder-glassMire-restore') * 3; }
function customLineageTraitCost(ids = []) {
  let positives = 0;
  let negatives = 0;
  let total = 0;
  for (const id of ids) {
    const trait = CUSTOM_LINEAGE_TRAIT_BY_ID.get(id);
    if (!trait) continue;
    if (trait.cost > 0) {
      total += trait.cost + positives;
      positives++;
    } else {
      const cost = trait.cost + negatives;
      if (cost > 0) return Infinity;
      total += cost;
      negatives++;
    }
  }
  return total;
}
function customLineageNextTraitCost(ids = [], trait) {
  if (!trait) return Infinity;
  const selected = ids.map(id => CUSTOM_LINEAGE_TRAIT_BY_ID.get(id)).filter(Boolean);
  if (trait.cost > 0) return trait.cost + selected.filter(other => other.cost > 0).length;
  return trait.cost + selected.filter(other => other.cost <= 0).length;
}
function customLineageTraitIds(ids) {
  const traits = [...new Set(Array.isArray(ids) ? ids.filter(id => CUSTOM_LINEAGE_TRAIT_BY_ID.has(id)) : [])];
  const resources = new Set();
  return traits.filter(id => {
    const resource = CUSTOM_LINEAGE_TRAIT_BY_ID.get(id).resource;
    if (!resource || !resources.has(resource)) { if (resource) resources.add(resource); return true; }
    return false;
  });
}
function customLineageTraitAvailable(trait) {
  return !trait?.lineage || lineageUnlocked(trait.lineage);
}
function normalizeCustomLineage(custom) {
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return null;
  const traits = customLineageTraitIds(custom.traits).filter(id => customLineageTraitAvailable(CUSTOM_LINEAGE_TRAIT_BY_ID.get(id)));
  const name = typeof custom.name === 'string' ? custom.name.trim().slice(0, 40) : '';
  if (!traits.length || customLineageTraitCost(traits) > customLineagePoints() || !name) return null;
  return { name, desc: typeof custom.desc === 'string' ? custom.desc.trim().slice(0, 240) : '', traits };
}
function customLineageDef() {
  const custom = normalizeCustomLineage(state.customLineage);
  if (!custom) return null;
  const traits = custom.traits.map(id => CUSTOM_LINEAGE_TRAIT_BY_ID.get(id));
  const mods = {};
  for (const trait of traits) if (trait.resource) mods[trait.resource] = trait.mod;
  const specials = Object.fromEntries(traits.filter(trait => trait.special).map(trait => [trait.id, trait.special]));
  const growthTime = traits.find(trait => trait.growthTime)?.growthTime;
  return { id: 'custom', name: custom.name, desc: custom.desc || 'A lineage cultivated in the Prism Womb.', effect: traits.map(trait => trait.effect).join(', '), mods, traits: [], traitEffects: {}, specials, growthTime, custom: true };
}
function lineageDef(id) { return id === 'custom' ? customLineageDef() || LINEAGES[0] : LINEAGE_BY_ID.get(id) || LINEAGES[0]; }
function lineageTraitDef(id) { return LINEAGE_TRAIT_BY_ID.get(id); }
function lineageTraits(def) {
  const ids = [...(def?.traits || [])];
  if (def?.id === state.species) ids.push(...acquiredLineageTraitIds());
  return [...new Set(ids)].map(lineageTraitDef).filter(Boolean);
}
function acquiredLineageTraitIds(source = state) {
  return Array.isArray(source?.conqueredLineageTraits) ? source.conqueredLineageTraits : [];
}
function lineageTraitLevelBonus(id, def = lineageDef(state.species)) {
  if (!def?.traits?.includes(id) || def.id !== state.species) return 0;
  return currentPlaceTraits().reduce((bonus, trait) => bonus + (trait.lineageLevelBonus || 0), 0);
}
function lineageTraitLevel(id, def = lineageDef(state.species)) {
  if (!def?.traits?.includes(id)) return def?.id === state.species && acquiredLineageTraitIds().includes(id) ? 0.5 : 0;
  const level = (def.traitLevels?.[id] ?? 1) + lineageTraitLevelBonus(id, def);
  return level === 0 ? -1 : level;
}
function lineageTraitScale(level = 1) {
  if (level > 0 && level < 1) return level;
  return Math.pow(1.5, level >= 1 ? level - 1 : -level - 1);
}
function lineageTraitModifier(modifier, level = 1) {
  if (!level) return 1;
  const magnitude = (modifier - 1) * lineageTraitScale(level);
  return level > 0 ? 1 + magnitude : 1 - magnitude;
}
function lineageSpecialValue(key, def = lineageDef(state.species)) {
  let value = 1;
  for (const [traitId, special] of Object.entries(def?.specials || {})) {
    if (special.key === key) value *= lineageTraitModifier(special.value, def.custom ? 1 : lineageTraitLevel(traitId, def));
  }
  if (def?.id === state.species) for (const lineage of LINEAGES) {
    if (lineage.id === def.id) continue;
    for (const [traitId, special] of Object.entries(lineage.specials || {})) {
      if (special.key === key && acquiredLineageTraitIds().includes(traitId))
        value *= lineageTraitModifier(special.value, 0.5);
    }
  }
  return value;
}
function activeLineageTraitScale() {
  const rawLevel = 1 + currentPlaceTraits().reduce((bonus, trait) => bonus + (trait.lineageLevelBonus || 0), 0);
  const level = rawLevel === 0 ? -1 : rawLevel;
  const scale = lineageTraitScale(level);
  return level < 0 ? 1 / scale : scale;
}
function lineageTraitsText(def) {
  return lineageTraits(def).map(trait => {
    const level = lineageTraitLevel(trait.id, def);
    return `${trait.name}${level !== 1 ? ` (level ${level})` : ''}: ${trait.effect}`;
  }).join('; ');
}
function lineageTraitsHtml(def) {
  const groups = new Map();
  for (const trait of lineageTraits(def)) {
    const entries = groups.get(trait.group) || [];
    const level = lineageTraitLevel(trait.id, def);
    const levelText = level !== 1 ? ` (level ${level})` : '';
    const scaled = level !== 1 ? `\nAt level ${level}: effect magnitude is ×${lineageTraitScale(level).toFixed(2)}${level < 0 ? ' in the opposite direction' : ''}.` : '';
    entries.push(`<span class="has-tooltip" data-tooltip="${attrText(`${trait.desc}\n\n${trait.effect}${scaled}`)}">${esc(trait.name + levelText)}</span>`);
    groups.set(trait.group, entries);
  }
  return [...groups.entries()].map(([group, traits]) => `${esc(group)}: ${traits.join(' · ')}`).join(' — ');
}
function lineageUnlocked(id) { return id === 'custom' ? !!customLineageDef() : !!(state.lineagesUnlocked && state.lineagesUnlocked[id]); }
function habitatAllows(def, landingId) {
  const landing = LANDING_BY_ID.get(landingId);
  return !!def && (!def.habitats || !!landing && def.habitats.some(h => (landing.habitats || []).includes(h)));
}
function lineageSelectable(id, landingId = state.pendingLanding) {
  return lineageUnlocked(id) && (upg('farHorizons') > 0 || habitatAllows(lineageDef(id), landingId));
}
function selectableLineages() {
  return [...LINEAGES, ...(customLineageDef() ? [customLineageDef()] : [])];
}
function localTribeIds() {
  if (state.unifiedRegion) return [];
  const ids = Array.isArray(state.tradePartners)
    ? (state.tradePartner && state.tradePartners[0] !== state.tradePartner
      ? [state.tradePartner]
      : state.tradePartners)
    : [state.tradePartner];
  return [...new Set(ids.filter(id => typeof id === 'string' && habitatAllows(tribeDef(id), state.landing)))];
}
function localTribe(id) { return localTribeIds().includes(id); }
function habitatText(def) {
  return def.habitats ? `Habitat: ${LANDINGS.filter(l => habitatAllows(def, l.id)).map(l => l.name).join(', ')}.` : 'Habitat: any landing.';
}
function isMephit() { return state.species === 'mephit'; }
function mephitTraitScale(id) { return isMephit() ? lineageTraitScale(lineageTraitLevel(id, lineageDef('mephit'))) : 1; }
function mephitDefenseMod() { return 1 + 0.35 * mephitTraitScale('sulfurWalls'); }
function mephitRaidDelay() { return 120 * mephitTraitScale('slowProvocation'); }
function mephitInjuryMod() { return 1 + 0.75 * mephitTraitScale('cruelReprisals'); }
function lineageRaidDefenseMod() { return isMephit() ? mephitDefenseMod() : lineageSpecialValue('raidDefense'); }
function armorLevel() { return Math.max(0, Number(state.armor) || 0); }
function tradeAvailable() { return tech('currency') && localTribeIds().length > 0; }
const TRADE_GOODS = ['food', 'wood', 'stone', 'tools', 'copper', 'iron', 'coal', 'steel', 'machinery', 'goods', 'aluminum'];
const TRADE_MODES = ['buy', 'sell'];
function tradeGoodIndex(resource) { return TRADE_GOODS.indexOf(resource); }
function tradeRate(resource) { return 1.2 ** Math.max(0, tradeGoodIndex(resource)); }
function tradeValue(resource) { return 4 * 1.35 ** Math.max(0, tradeGoodIndex(resource)); }
function tradeBlimpOrders() {
  if (!Array.isArray(state.tradeBlimps)) state.tradeBlimps = [];
  while (state.tradeBlimps.length < bld('tradeBlimp')) state.tradeBlimps.push(null);
  return state.tradeBlimps;
}
function setTradeBlimpOrder(index, mode, resource) {
  if (!Number.isInteger(index) || index < 0 || index >= bld('tradeBlimp') ||
      !TRADE_MODES.includes(mode) || !TRADE_GOODS.includes(resource)) return false;
  tradeBlimpOrders()[index] = { mode, resource };
  return true;
}
function guardCap() { return bld('barracks') * (tech('disciplinedBunking') ? 3 : 2) + 2 * upg('bePrepared'); }
function guardRecruitmentRate() {
  return lineageSpecialValue('guardRecruitment') / (120 * Math.pow(0.9, bld('trainingYard')) * lineageSpecialValue('guardRecruitmentTime')) * Math.pow(1.1, trialCount('conquest')) *
    currentPlaceTraits().reduce((rate, trait) => rate * (trait.guardRecruitment || 1), 1);
}
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
function randomTownStrength(tier = 0) {
  if (tier === 1) return 110 + Math.floor(Math.random() * 61);
  if (tier >= 2) return 150 + Math.floor(Math.random() * 101);
  const band = Math.random();
  if (band < 0.20) return 70 + Math.floor(Math.random() * 20);
  if (band < 0.80) return 90 + Math.floor(Math.random() * 40);
  return 130 + Math.floor(Math.random() * 91);
}
function militaryStrength(entry) { return Math.max(1, Number(entry?.militaryStrength) || 100); }
function militaryStrengthFloor() { return 60; }
function economicStrength(entry) { return Math.max(1, Number(entry?.economicStrength) || 100); }
function tradeableRequestResource(id) {
  // Power is generated capacity rather than a stored good, so it cannot be
  // offered to a neighboring settlement.
  return id !== 'knowledge' && id !== 'currency' && id !== 'machinery' &&
    id !== 'power' && id !== 'aether';
}
function randomDiplomacyRequest(id) {
  const available = RESOURCES.filter(r => tradeableRequestResource(r.id) && state.seen[r.id]);
  const preferred = available.filter(r => (tribeDef(id).requests || []).includes(r.id));
  const pool = preferred.length ? preferred : available;
  const res = (pool.length ? pool : [RESOURCE_BY_ID.get('wood')])[Math.floor(Math.random() * (pool.length || 1))];
  const ageScale = [1, 1.5, 2.5, 4, 6][Math.min(era() - 1, 4)];
  const baseByResource = { food: 120, wood: 100, stone: 80, tools: 12, copper: 15, iron: 20, coal: 25, steel: 15 };
  const target = (baseByResource[res.id] || 20) * ageScale * (0.9 + Math.random() * 0.2);
  const cap = capacityOf(res.id);
  const amount = Math.max(10, Math.round(Math.min(target, cap * 0.8) / 5) * 5);
  return { res: res.id, amount, age: era() };
}
function ensureDiplomacyEntry(id, strengthTier = 0) {
  state.diplomacy = state.diplomacy || {};
  if (!state.diplomacy[id]) {
    const military = randomTownStrength(strengthTier);
    state.diplomacy[id] = {
      disposition: Math.floor(Math.random() * 101) - 50,
      militaryStrength: military,
      militaryBaseStrength: military,
      economicStrength: randomTownStrength(strengthTier),
      request: randomDiplomacyRequest(id),
    };
  } else {
    const entry = state.diplomacy[id];
    if (!Number.isFinite(entry.militaryStrength)) entry.militaryStrength = 100;
    if (!Number.isFinite(entry.militaryBaseStrength)) entry.militaryBaseStrength = entry.militaryStrength;
    if (!Number.isFinite(entry.economicStrength)) entry.economicStrength = 100;
    if (!entry.request || entry.request.age === undefined || !tradeableRequestResource(entry.request.res))
      entry.request = randomDiplomacyRequest(id);
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
  const res = resourceName(entry.request.res);
  return `The ${tribe.name} ${diplomacyTone(entry.disposition)} ${fmt(entry.request.amount)} ${res}.`;
}
function diplomatCount(id) { return (state.diplomats && state.diplomats[id]) || 0; }
function dispositionCap() { return tech('longSpeech') ? 300 : 100; }
function improveDisposition(entry, amount) {
  const current = Number(entry.disposition) || 0;
  const firstBand = Math.max(0, Math.min(amount, 100 - current));
  const effective = firstBand + Math.max(0, amount - firstBand) * 0.5;
  entry.disposition = Math.min(dispositionCap(), current + effective);
}
function totalDiplomats() { return Object.values(state.diplomats || {}).reduce((sum, n) => sum + n, 0); }
function diplomatCost(id) {
  const entry = state.diplomacy && state.diplomacy[id];
  const activeScale = 1 + 0.5 * diplomatCount(id);
  const economicScale = economicStrength(entry) / 100;
  return { currency: Math.ceil(50 * economicScale * activeScale) };
}
function spyCount(id) { return (state.spies && state.spies[id]) || 0; }
function spyTrainingCost(id) {
  const entry = state.diplomacy && state.diplomacy[id];
  const activeScale = 1 + 0.5 * spyCount(id);
  const economicScale = economicStrength(entry) / 100;
  return {
    currency: Math.ceil(100 * economicScale * activeScale),
    tools: Math.max(1, Math.ceil(5 * economicScale * activeScale)),
  };
}
function updateSpyIntel(id) {
  const entry = state.diplomacy && state.diplomacy[id];
  if (!entry) return;
  const count = spyCount(id);
  if (count >= 1) entry.militaryKnown = true;
  if (count >= 2) entry.economicKnown = true;
}
function hireSpy(id) {
  const entry = state.diplomacy && state.diplomacy[id];
  const cost = spyTrainingCost(id);
  if (!tech('spies') || !entry || entry.conquered || !localTribe(id) || state.spyTraining || !canAfford(cost)) return { ok: false, reason: 'unavailable', target: id };
  payCost(cost);
  state.spyTraining = { target: id, remaining: SPY_TRAINING_TIME };
  addLog(`A spy begins training for an assignment in the ${tribeDef(id).name}.`, 'log-important');
  return { ok: true, action: 'sendSpy', target: id, cost: { ...cost }, trainingSeconds: SPY_TRAINING_TIME };
}
function beginEspionage(id) {
  const entry = state.diplomacy && state.diplomacy[id];
  if (!tech('espionage') || !entry || entry.conquered || !localTribe(id) || spyCount(id) < 1 || entry.espionageT > 0 || militaryStrength(entry) <= militaryStrengthFloor(entry)) return { ok: false, reason: 'unavailable', target: id };
  entry.espionageT = ESPIONAGE_TIME;
  addLog(`A spy begins an espionage attempt against the ${tribeDef(id).name}'s military.`, 'log-important');
  return { ok: true, action: 'startEspionage', target: id, durationSeconds: ESPIONAGE_TIME };
}
function spyKilled(id) {
  const entry = state.diplomacy && state.diplomacy[id];
  if (!entry || Math.random() >= 0.5) return;
  const loss = 3 + Math.floor(Math.random() * 3);
  if (!conquestTrialRelationsLocked()) entry.disposition = Math.max(-100, entry.disposition - loss);
  addLog(`The captured spy betrays Emberhold's involvement in the ${tribeDef(id).name}; relations fall by ${loss}.`, 'log-bad');
}
function resolveEspionage(id) {
  const entry = state.diplomacy && state.diplomacy[id];
  if (!entry || spyCount(id) < 1) return;
  if (Math.random() < 0.60) {
    const before = militaryStrength(entry);
    entry.militaryStrength = Math.max(militaryStrengthFloor(entry), Math.floor(before * 0.90));
    addLog(`Espionage succeeds in the ${tribeDef(id).name}. Their Military strength falls from ${Math.round(before)} to ${entry.militaryStrength}.`, 'log-good');
  } else if (Math.random() < 0.10) {
    state.spies[id] = Math.max(0, spyCount(id) - 1);
    addLog(`Espionage fails in the ${tribeDef(id).name}; a spy is caught and killed.`, 'log-bad');
    spyKilled(id);
  } else {
    addLog(`Espionage fails in the ${tribeDef(id).name}, but the spy slips away.`, 'log-bad');
  }
  entry.espionageT = 0;
}
function updateSpies(dt) {
  if (!tech('spies')) return;
  if (state.spyTraining) {
    state.spyTraining.remaining -= dt;
    if (state.spyTraining.remaining <= 0) {
      const id = state.spyTraining.target;
      state.spies[id] = spyCount(id) + 1;
      updateSpyIntel(id);
      addLog(`A trained spy reaches the ${tribeDef(id).name}.`, 'log-good');
      state.spyTraining = null;
    }
  }
  for (const id of Object.keys(state.spies || {})) {
    if (!localTribe(id) || spyCount(id) < 1) continue;
    const entry = state.diplomacy[id];
    const captureChance = 1 - Math.pow(1 - SPY_CAPTURE_CHANCE, dt);
    if (Math.random() < captureChance) {
      state.spies[id] = Math.max(0, spyCount(id) - 1);
      addLog(`A spy in the ${tribeDef(id).name} is caught and killed.`, 'log-bad');
      spyKilled(id);
      if (entry.espionageT > 0 && spyCount(id) < 1) entry.espionageT = 0;
    }
    if (entry.espionageT > 0) {
      entry.espionageT -= dt;
      if (entry.espionageT <= 0) resolveEspionage(id);
    }
  }
}
function performerCount() { return state.jobs?.performer || 0; }
function explorerCount() { return state.jobs?.explorer || 0; }
function alliedTribes() {
  return localTribeIds().filter(id => {
    const entry = state.diplomacy && state.diplomacy[id];
    return entry?.disposition >= 80 || entry?.conquered;
  }).length;
}
function conqueredRealm() {
  return Object.values(state.diplomacy || {}).some(entry => entry?.conquered);
}
function conqueredNationCount(source = state) {
  if (!source || source.unifiedRegion) return 0;
  const held = Array.isArray(source.tradePartners) ? source.tradePartners : [source.tradePartner];
  return [...new Set(held)].filter(id => source.diplomacy?.[id]?.conquered).length;
}
function conqueredStorageMod(source = state) {
  if (source?.trial?.id === 'overflow') return 1;
  return (source?.unifiedRegion ? 2 : 1) + 0.10 * conqueredNationCount(source);
}
function regionUnificationReady() {
  const ids = localTribeIds();
  return ids.length === 3 && ids.every(id => state.diplomacy?.[id]?.conquered);
}
function commonalityLineageCount() {
  return Object.keys(state.commonalityLineages || {})
    .filter(id => id !== 'human' && state.commonalityLineages[id]).length;
}
function fearOfTheConquerorAvailable() {
  return conqueredRealm() && commonalityLineageCount() >= 10;
}
function commonalityActive() { return tech('commonality') && state.policy === 'commonality'; }
function conqueredLineage() {
  const id = localTribeIds().find(id => state.diplomacy?.[id]?.conquered);
  const entry = id && state.diplomacy && state.diplomacy[id];
  if (!commonalityActive() || !entry?.conquered) return null;
  state.commonalityLineages = state.commonalityLineages || {};
  state.commonalityLineages[id] = true;
  return lineageDef(id);
}
function conqueredLineageMod(res) {
  const mod = conqueredLineage()?.mods?.[res] || 1;
  return mod > 1 ? 1 + (mod - 1) * 0.5 : 1;
}
function alliedIncomeBonus() { return commonalityActive() ? 0.075 : 0.05; }
function alliedTribeIncomeBonus(id) {
  const conquered = state.diplomacy?.[id]?.conquered;
  return commonalityActive() && conquered ? 0.075 : 0.05;
}
function returnCommonalityGuards(id) {
  if (!commonalityActive() || !id) return;
  state.commonalityGuardsReturned = state.commonalityGuardsReturned || {};
  if (state.commonalityGuardsReturned[id]) return;
  state.jobs.guard = Math.min(guardCap(), (state.jobs.guard || 0) + 5);
  state.commonalityGuardsReturned[id] = true;
}
function ableGuards() { return Math.floor(Math.max(0, (state.jobs.guard || 0) - (state.guardInjuries || 0))); }
function guardAttackPower(guardCount = ableGuards()) {
  const healthy = Math.max(0, Math.min(ableGuards(), Math.floor(Number(guardCount) || 0)));
  return healthy * (tech('weaponry') ? 1.9 : 1);
}
function guardSiegePower(guardCount = ableGuards()) {
  return guardAttackPower(guardCount) * governanceDefenseMod();
}
function guardLimits() {
  const healthy = ableGuards();
  return { minimum: 1, maximum: healthy, healthy };
}
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
function scarcityWoodMultiplier() {
  return 0.90 / Math.pow(1.25, trialCount('scarcity'));
}
function scarcityMiningLossChance() {
  return 0.001 * Math.pow(1.25, trialCount('scarcity'));
}
function trialModifierText(def) {
  const multiplier = trialDifficulty(def.id);
  switch (def.id) {
    case 'scarcity': return `Stormy weather reduces food to ${+(multiplier * 100).toFixed(2)}% and wood to ${+(scarcityWoodMultiplier() * 100).toFixed(2)}%; mining workers have a ${(scarcityMiningLossChance() * 100).toFixed(3)}% loss chance per tick.`;
    case 'frugality': return `All building costs are multiplied by ${+multiplier.toFixed(3)}.`;
    case 'overflow': return `${def.mod} Storage ceilings are multiplied by ${+multiplier.toFixed(3)} while sworn.`;
    default: return def.mod;
  }
}
function migrationRewardMultiplier(challenges = activeMigrationChallenges()) {
  return 1 + 0.20 * challenges.length;
}
function baseEchoesEarned() {
  return Math.max(0, Math.floor(Math.pow(Math.max(0, state.pop - 10), 2) / 100));
}
function echoesEarned(challenges = activeMigrationChallenges()) {
  return baseEchoesEarned() * migrationRewardMultiplier(challenges);
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
  return LANDINGS.filter(l => !l.postWaters).every(l => EXPEDITIONS.some(e => e.landing === l.id && expDone(e.id)));
}
function practicedMigratorAvailable() { return siteExpeditionsComplete(); }

// ---------- Wonders ----------
// A single worker now needs roughly 20 minutes per section before modifiers;
// the Wonder is meant to be a sustained expedition, not a quick assignment.
const WONDER_SECTION_PROGRESS = 240;
const WONDER_PROGRESS_PER_WORKER = 0.02;
const WONDER_BASE_DANGER = 0.0048;
const WONDER_RESEARCH_COST_MULTIPLIER = 5;
const WONDER_OBSTACLES = [
  { name: 'Aetheric Breach Charge', text: 'A sealed passage blocks the way. The researchers outside can build one shaped explosion, but only one.', cost: { steel: 900, machinery: 240, coal: 1200 } },
  { name: 'Ancestor’s Lockpick', text: 'The lock has no keyhole, only a question written in metal. A strange instrument may persuade it to open.', cost: { steel: 700, machinery: 300, aether: 45 } },
  { name: 'Gravity Anchor', text: 'The floor falls away whenever someone steps forward. Something must pin the expedition to the mountain.', cost: { stone: 1400, steel: 850, machinery: 360 } },
  { name: 'Silence Device', text: 'The defenses wake at every sound. Researchers must build a device that teaches the chamber not to hear.', cost: { machinery: 500, knowledge: 5000, aether: 70 } },
  { name: 'Heart-Seal Key', text: 'The final seal recognizes no human hand. It will require a key built from materials that have remembered stranger owners.', cost: { steel: 1200, machinery: 650, aether: 120 } },
];

function wonderResearchCost(research) {
  return Object.fromEntries(Object.entries(research.cost).map(([id, amount]) =>
    [id, Math.ceil(amount * WONDER_RESEARCH_COST_MULTIPLIER)]));
}
function currentWonderObstacle(record = wonderRecord()) {
  const sectionIndex = wonderSectionIndex(record);
  if (sectionIndex < 0) return null;
  const built = record.obstacles || {};
  for (let index = 0; index < WONDER_OBSTACLES.length; index++) {
    const threshold = Math.ceil(WONDER_SECTION_PROGRESS * (index + 1) / WONDER_OBSTACLES.length);
    const key = `${sectionIndex}:${index}`;
    if (record.progress >= threshold && !built[key])
      return { ...WONDER_OBSTACLES[index], index, sectionIndex, threshold, key };
  }
  return null;
}

function wonderSectionIndex(record = wonderRecord()) {
  return record.sections.findIndex(done => !done);
}
function wonderReadyForDecision(record = wonderRecord()) { return wonderSectionIndex(record) < 0; }
function migrationShopOpen() {
  if (state.migrating) return true;
  const def = wonderDef();
  const record = state.wonders?.[state.landing];
  return !!def && !!record?.found && wonderReadyForDecision(record);
}
function wonderFindCost(def = wonderDef()) {
  if (!def) return {};
  // Every distinct beacon gives the expedition a clearer set of clues. The
  // sixth beacon is the cheapest possible route, but never a cheap route.
  const multiplier = Math.max(1.05, 1.80 - 0.15 * Math.max(0, beaconsLitCount() - 1));
  return Object.fromEntries(Object.entries(def.findCost).map(([id, amount]) => [id, Math.ceil(amount * multiplier)]));
}
function canAffordWonderCost(cost) {
  const survey = cost.survey || 0;
  const physical = { ...cost };
  delete physical.survey;
  return (state.surveyPoints || 0) >= survey && canAfford(physical);
}
function payWonderCost(cost) {
  const physical = { ...cost };
  const survey = physical.survey || 0;
  delete physical.survey;
  if (!canAffordWonderCost(cost)) return false;
  state.surveyPoints -= survey;
  payCost(physical);
  return true;
}
function remainingWonderChoices(record = wonderRecord()) {
  // Outcomes are permanent history and rewards, not a limit on future
  // expeditions. A Wonder can be faced again after all of its fates are known.
  return ['restore', 'silence', 'become'];
}
function findWonder() {
  const def = wonderDef();
  if (!def || !wonderHintsAvailable()) return false;
  const record = wonderRecord(def.id);
  if (record.found || !remainingWonderChoices(record).length) return false;
  const cost = wonderFindCost(def);
  if (!payWonderCost(cost)) return false;
  record.found = true;
  record.sections = [false, false, false, false, false];
  record.progress = 0;
  record.researches = {};
  record.expeditions = {};
  record.obstacles = {};
  record.obstacleNotices = {};
  addLog(`The expedition finds ${def.name}. ${def.findText}`, 'log-important');
  return true;
}
function currentWonderSection(record = wonderRecord(), def = wonderDef()) {
  const index = wonderSectionIndex(record);
  return index < 0 ? null : { index, name: def.sections[index][0], text: def.sections[index][1] };
}
function wonderProgressMultiplier(record = wonderRecord(), def = wonderDef()) {
  let multiplier = 1;
  def.researches.forEach((research, index) => { if (record.researches?.[index]) multiplier *= research.progress || 1; });
  def.expeditions.forEach((expedition, index) => { if (record.expeditions?.[index]) multiplier *= expedition.progress || 1; });
  return multiplier;
}
function wonderDangerMultiplier(record = wonderRecord(), def = wonderDef()) {
  const postWaters = LANDINGS.find(landing => landing.id === def.id)?.postWaters;
  let multiplier = (postWaters ? 2 : 1) * Math.pow(1.25, Math.max(0, wonderSectionIndex(record)));
  def.researches.forEach((research, index) => { if (record.researches?.[index]) multiplier *= research.danger || 1; });
  def.expeditions.forEach((expedition, index) => { if (record.expeditions?.[index]) multiplier *= expedition.danger || 1; });
  return multiplier;
}
function wonderCalamityMultiplier(record = wonderRecord(), def = wonderDef()) {
  let multiplier = 1;
  def.researches.forEach((research, index) => { if (record.researches?.[index]) multiplier *= research.calamity || 1; });
  return multiplier;
}
function activeWonderCalamity() {
  const def = wonderDef();
  const record = state.wonders?.[state.landing];
  if (!def || !record?.found || wonderReadyForDecision(record)) return null;
  const section = Math.max(0, wonderSectionIndex(record));
  return { ...def.calamity, amount: def.calamity.values[section] * wonderCalamityMultiplier(record, def), section };
}
function assignRapture(delta) {
  const def = wonderDef();
  const record = state.wonders?.[state.landing];
  if (!def || !record?.found || wonderReadyForDecision(record) || !Number.isInteger(delta) || !delta) return false;
  state.rapture = state.rapture || { landing: null, workers: 0, tabSeen: false };
  if (state.rapture.landing && state.rapture.landing !== state.landing) return false;
  const next = raptureWorkers() + delta;
  const guardCapacity = Math.max(0, Math.floor(state.jobs.guard || 0)) * 2;
  if (next < 0 || (delta > 0 && (delta > unassigned() || next > guardCapacity))) return false;
  state.rapture.landing = state.landing;
  state.rapture.workers = next;
  if (next > 0) state.rapture.tabSeen = true;
  if (next === 0) resetWonderSection('The last worker leaves the section. The foothold is lost.');
  return true;
}
function enforceRaptureGuardCap() {
  const workers = raptureWorkers();
  const guardCapacity = Math.max(0, Math.floor(state.jobs.guard || 0)) * 2;
  if (workers <= guardCapacity) return 0;
  const fled = workers - guardCapacity;
  state.rapture.workers = guardCapacity;
  state.raptureFleeMoraleT = Math.max(10, Number(state.raptureFleeMoraleT) || 0);
  addLog(`${fled} Rapture worker${fled === 1 ? '' : 's'} flee back to Emberhold as Guard cover falls short.`, 'log-bad');
  return fled;
}
function resetWonderSection(message) {
  const record = state.wonders?.[state.landing];
  if (!record?.found || wonderReadyForDecision(record) || raptureWorkers() > 0) return;
  if (record.progress > 0) {
    record.progress = 0;
    addLog(message, 'log-bad');
  }
}
function wonderDefenseMultiplier() {
  return governanceDefenseMod() * (tech('weaponry') ? 1.20 : 1) * (isMephit() ? mephitDefenseMod() : 1);
}
function resolveWonderGuardOutcome(woundedOnly) {
  const armor = Math.pow(1.10, armorLevel());
  const weights = { injury: 40, death: 40 / armor, hero: 20 * armor };
  if (woundedOnly) weights.death *= 2;
  const total = weights.injury + weights.death + weights.hero;
  let roll = Math.random() * total;
  const healthy = ableGuards();
  if ((roll -= weights.injury) < 0) {
    if (!woundedOnly) state.guardInjuries = Math.min(state.jobs.guard || 0, (state.guardInjuries || 0) + 1);
    addLog('A Guard drags a Rapture worker clear, but is injured in the attempt.', 'log-bad');
    return 'injury';
  }
  if ((roll -= weights.death) < 0) {
    state.jobs.guard = Math.max(0, (state.jobs.guard || 0) - 1);
    if (woundedOnly) state.guardInjuries = Math.max(0, (state.guardInjuries || 0) - 1);
    state.migrationGuardDeaths = (state.migrationGuardDeaths || 0) + 1;
    addLog('A Guard saves a Rapture worker and does not return.', 'log-bad');
    return 'death';
  }
  addLog('A Guard finds a way through the impossible. Everyone in the incident gets out.', 'log-good');
  return 'hero';
}
function resolveWonderIncident() {
  const total = state.jobs.guard || 0;
  const healthy = ableGuards();
  const woundedOnly = healthy <= 0 && total > 0;
  if (total > 0) {
    const saveChance = Math.min(0.98, 0.60 * wonderDefenseMultiplier() * Math.pow(1.10, armorLevel()));
    if (Math.random() < saveChance) {
      resolveWonderGuardOutcome(woundedOnly);
      return;
    }
  }
  state.pop = Math.max(1, state.pop - 1);
  state.rapture.workers = Math.max(0, raptureWorkers() - 1);
  addLog('A Rapture worker is lost inside the Wonder.', 'log-bad');
  reconcileWorkers();
  resetWonderSection('The last worker is gone. The section closes behind them.');
}
function completeWonderSection() {
  const def = wonderDef();
  const record = wonderRecord();
  const section = currentWonderSection(record, def);
  if (!section) return;
  record.sections[section.index] = true;
  record.progress = 0;
  if (wonderReadyForDecision(record)) {
    state.rapture.workers = 0;
    addLog(`The expedition reaches the heart of ${def.name}. ${def.decisionText}`, 'log-important');
  } else {
    addLog(`Section secured: ${section.name}. The expedition presses deeper into ${def.name}.`, 'log-good');
  }
}
function updateWonder(dt) {
  if (!raptureActiveHere() || raptureWorkers() <= 0) return;
  enforceRaptureGuardCap();
  if (raptureWorkers() <= 0) return;
  const record = wonderRecord();
  const def = wonderDef();
  const obstacle = currentWonderObstacle(record);
  const blocked = !!obstacle;
  if (blocked && !record.obstacleNotices?.[obstacle.key]) {
    record.obstacleNotices[obstacle.key] = true;
    queueWonderObstacleAtFront(obstacle, record);
    state.paused = true;
    addLog(`The expedition reaches ${obstacle.name}. Progress stops until it is built.`, 'log-important');
    saveGame(true);
    return;
  }
  const danger = WONDER_BASE_DANGER * wonderDangerMultiplier(record, def);
  const incidentChance = 1 - Math.pow(1 - danger, raptureWorkers() * dt);
  if (Math.random() < incidentChance) resolveWonderIncident();
  if (blocked) return;
  record.progress += raptureWorkers() * WONDER_PROGRESS_PER_WORKER * wonderProgressMultiplier(record, def) * dt;
  if (record.progress >= WONDER_SECTION_PROGRESS) completeWonderSection();
}
function canBuyWonderResearch(index) {
  const def = wonderDef(); const record = wonderRecord(); const research = def?.researches[index];
  const section = wonderSectionIndex(record);
  if (!research || record.researches?.[index] || !record.found || section < 0 || index > section) return false;
  const scaledCost = wonderResearchCost(research);
  const citizens = scaledCost.citizens || 0;
  const cost = { ...scaledCost }; delete cost.citizens;
  return unassigned() >= citizens && canAfford(cost);
}
function buyWonderResearch(index) {
  if (!canBuyWonderResearch(index)) return false;
  const def = wonderDef(); const record = wonderRecord(); const research = def.researches[index];
  const cost = wonderResearchCost(research); const citizens = cost.citizens || 0; delete cost.citizens;
  payCost(cost);
  if (citizens) { state.pop = Math.max(1, state.pop - citizens); reconcileWorkers(); }
  record.researches[index] = true;
  addLog(`Wonder research completed: ${research.name}. ${research.effect}`, 'log-good');
  return true;
}
function buildWonderObstacle() {
  const record = wonderRecord();
  const obstacle = currentWonderObstacle(record);
  if (!obstacle || !record.found || record.obstacles?.[obstacle.key] || !canAfford(obstacle.cost)) return false;
  payCost(obstacle.cost);
  applyReclamation(obstacle.cost);
  record.obstacles[obstacle.key] = true;
  delete record.obstacleNotices[obstacle.key];
  state.paused = false;
  addLog(`${obstacle.name} completed. The expedition can press onward.`, 'log-good');
  return true;
}
function buyWonderExpedition(index) {
  const def = wonderDef(); const record = wonderRecord(); const expedition = def?.expeditions[index];
  if (!expedition || !record.found || record.expeditions?.[index] || !canAfford(expedition.cost)) return false;
  payCost(expedition.cost);
  record.expeditions[index] = true;
  addLog(`Interior expedition returned: ${expedition.name}. ${expedition.effect}`, 'log-good');
  return true;
}
function chooseWonderFate(choice) {
  const def = wonderDef(); const record = wonderRecord();
  if (!def || !wonderReadyForDecision(record) || !remainingWonderChoices(record).includes(choice)) return false;
  record.outcomes[choice] = true;
  const rewardMultiplier = migrationRewardMultiplier();
  state.hope = (state.hope || 0) + rewardMultiplier;
  state.hopeEver = true;
  if (choice === 'become') state.ancient = (state.ancient || 0) + rewardMultiplier;
  if (choice === 'become') state.ancientEver = true;
  addLog(def.aftermath[choice], 'log-important');
  addLog(`Hope gained. The Wonder has touched Emberhold, and the road opens without asking.`, 'log-good');
  record.found = false;
  record.sections = [false, false, false, false, false];
  record.progress = 0;
  record.researches = {};
  record.expeditions = {};
  state.rapture.workers = 0;
  state.rapture.landing = null;
  updateAchievements([`wonder-${def.id}-${choice}`]);
  const cultivateLineage = def.id === 'glassMire' && choice === 'restore';
  if (cultivateLineage) beginCustomLineageDraft();
  beginForcedWonderMigration(cultivateLineage);
  return true;
}
function beginForcedWonderMigration(waitForCustomLineage = false) {
  const compatible = LANDINGS.filter(landing => lineageSelectable(state.species, landing.id));
  const choices = compatible.filter(landing => landing.id !== state.landing);
  const challenges = [...(state.migrationChallenges || [])];
  // A habitat specialist can occasionally have only one viable homeland. The
  // Wonder still forces the reset in that case; it simply carries them back
  // to the same country rather than producing an impossible landing choice.
  const landing = choices[Math.floor(Math.random() * choices.length)] || compatible[0] || LANDINGS[0];
  state.pendingSpecies = state.species;
  state.pendingLandings = [{ ...landing, traits: traitsForLanding(landing.id) }];
  state.pendingLanding = landing.id;
  state.migrating = true;
  state.migrationPreparation = false;
  state.pendingMigrationChallenges = challenges;
  state.pendingEchoMultiplier = 2;
  state.pendingEchoes = state.pendingEchoMultiplier * echoesEarned(challenges);
  // The base reward is earned immediately; challenge bonuses stay pending
  // until the migration is actually completed.
  state.echoes += state.pendingEchoMultiplier * baseEchoesEarned();
  addLog(`The Wonder's deeds will echo: ${state.pendingEchoes} Echo${state.pendingEchoes === 1 ? '' : 's'} gained.`, 'log-important');
  addLog(`The Wonder has been decided. There is no vote on the road ahead; it carries Emberhold toward ${landing.name}.`, 'log-important');
  if (waitForCustomLineage) {
    addLog('The Prism Womb holds the road open. Decide what kind of people will walk it.', 'log-important');
    return;
  }
  setOut();
}

// ---------- landings ----------
function landingDef() { return LANDING_BY_ID.get(state.landing) || LANDINGS[0]; }
function landingAvailable(landing) { return !landing.postWaters || trialCount('newLands') > 0; }
function availableLandings() { return LANDINGS.filter(landingAvailable); }
function malformedBiomeActive(landing = state.landing) { return !!LANDING_BY_ID.get(landing)?.postWaters; }
function malformedDangerForTraits(traits = state.placeTraits) {
  return Math.max(0, Math.min(MALFORMED_DANGER_MAX, (traits || []).reduce((danger, id) =>
    danger + (placeTraitDef(id)?.danger || 0), 0)));
}
function malformedDangerText() {
  if (!malformedBiomeActive()) return '';
  const danger = Math.min(MALFORMED_DANGER_MAX, Math.max(0, state.malformedDanger || 0));
  const required = Math.ceil(danger);
  return `Malformed creature danger: ${danger.toFixed(2)} / ${MALFORMED_DANGER_MAX} · ${required} healthy Guard${required === 1 ? '' : 's'} needed at the next attack`;
}
function landingMod(res) {
  const m = landingDef().mods[res];
  return m === undefined ? 1 : m;
}
function modsHtml(def) {
  const parts = [];
  for (const res in def.mods) {
    const pct = Math.round((def.mods[res] - 1) * 100);
    const name = resourceName(res);
    parts.push(`<span class="${pct > 0 ? 'rate-pos' : 'rate-neg'}">${pct > 0 ? '+' : ''}${pct}% ${name}</span>`);
  }
  return parts.length ? parts.join(', ') : 'nothing more, nothing less';
}
function rollLanding(excludeId) {
  const options = availableLandings().filter(l => l.id !== (excludeId || state.landing));
  const pick = options[Math.floor(Math.random() * options.length)];
  state.landing = pick.id;
  state.landingsSeen[pick.id] = true;
  return pick;
}
function rollTradePartner() {
  const eligible = TRIBES.filter(t => habitatAllows(t, state.landing));
  const nonHuman = eligible.filter(t => t.id !== 'human');
  const first = Math.random() < 0.35 && nonHuman.length
    ? nonHuman[Math.floor(Math.random() * nonHuman.length)]
    : TRIBES[0];
  state.tradePartners = [first.id];
  state.tradePartner = first.id;
  state.tribesSeen[first.id] = true;
  ensureDiplomacyEntry(first.id, 0);
  return first;
}
function desiredLocalTribeCount() {
  return 1 + (explorerCount() > 0 && (state.surveyPoints || 0) >= 1000 ? 1 : 0) + (era() >= 3 ? 1 : 0);
}
function discoverTradePartners() {
  if (!Array.isArray(state.tradePartners)) state.tradePartners = [state.tradePartner];
  const eligible = TRIBES.filter(t => habitatAllows(t, state.landing) && !state.tradePartners.includes(t.id));
  while (state.tradePartners.length < Math.min(MAX_LOCAL_TRIBES, desiredLocalTribeCount()) && eligible.length) {
    const tier = state.tradePartners.length;
    const pick = eligible.splice(Math.floor(Math.random() * eligible.length), 1)[0];
    state.tradePartners.push(pick.id);
    state.tribesSeen[pick.id] = true;
    ensureDiplomacyEntry(pick.id, tier);
    addLog(`A new trading partner appears nearby: ${pick.name}. Their town is stronger and more prosperous than the last contact.`, 'log-important');
  }
  state.tradePartner = state.tradePartners[0];
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
    case 'surveyFlights': return trialCount('whiteout') > 0;
    case 'blackGoldDrills': return trialCount('whiteout') > 0 && upg('blackGoldDrills') > 0;
  }
  return false;
}
function trialActive(id) { return state.trial && state.trial.id === id; }
function conquestTrialRelationsLocked() { return trialActive('conquest'); }
function conquestTrialAvailable() {
  return !!(state.hopeEver || state.ancientEver || state.hope > 0 || state.ancient > 0);
}

// ---------- storage ----------
function currencyCapacity(jobs = state?.jobs, source = state) {
  const storageBonus = state?.trial?.id === 'overflow' ? 1 : 1 + 0.01 * upg('cleverStorage');
  return Math.ceil((CURRENCY_BASE_CAP * (1 + 0.10 * (jobs?.banker || 0)) * storageBonus * conqueredStorageMod(source)) - 1e-12);
}

function capacityOf(id) {
  if (id === 'currency') return currencyCapacity();
  const s = STORAGE[id];
  if (!s) return Infinity; // knowledge
  const overflowActive = trialActive('overflow');
  const permanentStorage = 1 + 0.2 * trialCount('overflow');
  const runStorage = overflowActive ? 1 : 1 + 0.15 * upg('deepCellars');
  const governanceStorage = overflowActive ? 1 : governanceStorageMod();
  const bonusCapacity = s.bonus ? s.bonus.per * bld(s.bonus.bld) : 0;
  return Math.ceil(((s.base + s.per * bld(s.bld) + bonusCapacity) *
    permanentStorage * runStorage * governanceStorage *
    (overflowActive ? 1 : 1 + 0.01 * upg('cleverStorage')) *
    conqueredStorageMod() *
    (overflowActive ? trialDifficulty('overflow') : 1)) - 1e-12);
}
function isFull(id) { return state.res[id] >= capacityOf(id) - 0.001; }

function popCap() {
  let cap = 6 + 2 * upg('wanderers');
  if (upg('practicedMigrator')) cap += 5;
  cap += bld('hut') * (1 + upg('grandHut') + (perm('twinSouls') ? 2 : 0));
  cap += bld('aqueduct') * 4;
  cap += powerAllocation().livingBlock * 5;
  if (trialActive('solitude')) cap = Math.min(cap, 10);
  return cap;
}
function assignedWorkers() {
  let n = 0;
  for (const j in state.jobs) if (JOBS[j] && !JOBS[j].targeted && j !== 'guard') n += state.jobs[j];
  return n + performerCount() + explorerCount() + raptureWorkers();
}
function jobName(id) {
  return id === 'forager' && wonderChoice('floodmeadows', 'silence') ? 'Farmer' : JOBS[id]?.name || id;
}
function unassigned() { return state.pop - assignedWorkers(); }
function raptureWorkers() { return Math.max(0, Math.floor(state.rapture?.workers || 0)); }
function raptureActiveHere() {
  const record = state.wonders?.[state.landing];
  return !!record?.found && !wonderReadyForDecision(record) && state.rapture?.landing === state.landing;
}
function jobCapacity(job) {
  const j = JOBS[job];
  if (!j) return 0;
  if (job === 'forager' && trialActive('whiteout')) return 0;
  if (job === 'guard') return guardCap();
  if (job === 'astronomer') return 2 + wondersWithAnEnding();
  const base = typeof j.max === 'function' ? j.max() : state.pop;
  return base + (workplaceEthicsActive() && j.mining ? 1 : 0);
}
function workplaceEthicsActive() { return tech('workplaceEthics'); }
function workplaceEthicsFull(jobId) {
  const job = JOBS[jobId];
  return workplaceEthicsActive() && job?.mining && job.unlock() &&
    (state.jobs[jobId] || 0) === jobCapacity(jobId);
}
function workplaceEthicsMoralePenalty() {
  return Object.keys(JOBS).filter(workplaceEthicsFull).length * 0.15;
}

// Reconcile the whole workforce, including specialists, after population loss
// or loading older saves. Keep food gatherers first when seats must be cut.
function reconcileWorkers() {
  let remaining = state.pop;
  const count = n => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  for (const id of Object.keys(JOBS)) {
    const job = JOBS[id];
    let n = job.unlock() && id !== 'diplomat' ? count(state.jobs[id]) : 0;
    if (id === 'guard') n = Math.min(n, guardCap());
    if (typeof job.max === 'function' || id === 'astronomer') n = Math.min(n, jobCapacity(id));
    if (id !== 'guard') n = Math.min(n, remaining);
    if (n) state.jobs[id] = n;
    else delete state.jobs[id];
    if (id !== 'guard') remaining -= n;
  }
  for (const id of Object.keys(state.jobs)) if (!JOBS[id]) delete state.jobs[id];
  for (const id of Object.keys(state.diplomats)) {
    const n = tech('diplomacy') && state.diplomacy[id] ? count(state.diplomats[id]) : 0;
    if (n) state.diplomats[id] = n;
    else delete state.diplomats[id];
  }
  if (state.rapture && state.rapture.landing === state.landing && raptureActiveHere()) {
    state.rapture.workers = Math.min(count(state.rapture.workers), remaining);
  } else if (state.rapture) {
    state.rapture.workers = 0;
    state.rapture.landing = null;
  }
  state.guardInjuries = Math.min(count(state.guardInjuries), state.jobs.guard || 0);
  state.guardRecruitment = JOBS.guard.unlock() && (state.jobs.guard || 0) < guardCap()
    ? Math.max(0, Math.min(0.999999, Number(state.guardRecruitment) || 0)) : 0;
}

function buildingCost(def) {
  const scale = def.scale > 1 ? Math.max(1.25, def.scale - 0.01 * upg('fitTogether')) : def.scale;
  const mult = Math.pow(scale, bld(def.id)) *
    (trialActive('frugality') ? trialDifficulty('frugality') : 1) *
    Math.pow(0.9, trialCount('frugality')) *
    (perm('blueprints') ? 0.85 : 1) * governanceCostMod();
  const out = {};
  for (const r in def.cost) out[r] = def.cost[r] * mult;
  if (def.additionalCost) {
    for (const [r, amount] of Object.entries(def.additionalCost(bld(def.id)))) out[r] = (out[r] || 0) + amount * mult;
  }
  return out;
}

function woodForCoalCount(id, total = 1) {
  const value = state.settings?.woodForCoal;
  // Migrate the previous boolean setting without making old saves fail.
  if (value === true) return Math.max(0, Math.floor(total));
  if (typeof value === 'number') return Math.max(0, Math.min(Math.floor(total), Math.floor(value)));
  return Math.max(0, Math.min(Math.floor(total), Math.floor(Number(value?.[id]) || 0)));
}
function effectiveCoalInputs(inputs, id = 'cost', total = 1) {
  if (!inputs?.coal) return { ...inputs };
  const count = woodForCoalCount(id, total);
  if (!count || total <= 0) return { ...inputs };
  const out = { ...inputs };
  const coalShare = inputs.coal * (total - count) / total;
  delete out.coal;
  if (coalShare > 0) out.coal = coalShare;
  out.wood = (out.wood || 0) + inputs.coal * count / total * 5;
  return out;
}
function effectiveCoalCost(cost, id = 'cost', total = 1) {
  if (!cost?.coal) return { ...cost };
  return effectiveCoalInputs(cost, id, total);
}
function setWoodForCoal(id, count) {
  if (!id || !Number.isFinite(count) || count < 0) return false;
  const totals = { steamPlant: bld('steamPlant'), forge: buildingPowerCount('forge'), factory: powerAllocation().factory,
    tinkerer: state.jobs.tinkerer || 0, cost: 1 };
  if (!Object.hasOwn(totals, id)) return false;
  state.settings = state.settings || {};
  const values = typeof state.settings.woodForCoal === 'object' && state.settings.woodForCoal !== null
    ? { ...state.settings.woodForCoal } : {};
  values[id] = Math.max(0, Math.min(totals[id], Math.floor(count)));
  state.settings.woodForCoal = values;
  return true;
}
function woodFuelTotal(id) {
  if (id === 'steamPlant') return bld('steamPlant');
  if (id === 'forge') return buildingPowerCount('forge');
  if (id === 'factory') return powerAllocation().factory;
  if (id === 'tinkerer') return state.jobs.tinkerer || 0;
  return 0;
}
function woodFuelControls(id, total) {
  if (!total) return '';
  const count = woodForCoalCount(id, total);
  return `<div class="card-actions"><span class="res-note">Wood fuel: ${count} / ${total}</span>` +
    `<button data-action="wood-coal-dec" data-id="${id}" data-repeat ${count ? '' : 'disabled'}>−</button>` +
    `<button data-action="wood-coal-inc" data-id="${id}" data-repeat ${count < total ? '' : 'disabled'}>+</button></div>`;
}
function woodFuelInlineControls(id, total) {
  if (!total) return '';
  const count = woodForCoalCount(id, total);
  return `<span class="wood-fuel-controls">[Wood ${count}/${total} ` +
    `<button data-action="wood-coal-dec" data-id="${id}" data-repeat ${count ? '' : 'disabled'}>−</button>` +
    `<button data-action="wood-coal-inc" data-id="${id}" data-repeat ${count < total ? '' : 'disabled'}>+</button>]</span>`;
}
function fuelDescription(id, total, coalRate) {
  const wood = woodForCoalCount(id, total);
  const coal = total - wood;
  const parts = [];
  if (coal) parts.push(`${fmt(coal * coalRate)} Coal/s`);
  if (wood) parts.push(`${fmt(wood * coalRate * 5)} Wood/s`);
  return parts.join(' and ');
}
function canAfford(cost) {
  const effective = effectiveCoalCost(cost);
  for (const r in effective) if (state.res[r] < effective[r]) return false;
  return true;
}
function wonderObstacleQueueId(obstacle) {
  return `wonderObstacle:${state.landing}:${obstacle.sectionIndex}:${obstacle.index}`;
}
function isWonderObstacleQueueId(id) { return typeof id === 'string' && id.startsWith('wonderObstacle:'); }
function canBuild(id) {
  const def = BUILDING_BY_ID.get(id);
  if (!def || bld(id) >= def.max || (def.req && !def.req())) return false;
  return !(trialActive('overflow') && Object.values(STORAGE).some(s => s.bld === id || s.bonus?.bld === id));
}
function payCost(cost) {
  const effective = effectiveCoalCost(cost);
  for (const r in effective) state.res[r] -= effective[r];
}
function applyReclamation(cost) {
  if (!wonderChoice('ashfen', 'silence')) return;
  for (const resource of ['tools', 'steel', 'machinery', 'goods']) {
    if (!cost[resource]) continue;
    state.res[resource] = Math.min(capacityOf(resource), state.res[resource] + cost[resource] * 0.10);
  }
}

function queueDef(entry) {
  if (!entry || !['build', 'research', 'expedition'].includes(entry.type)) return null;
  if (entry.type === 'build') {
    if (entry.id === 'beaconStage') return BUILDING_BY_ID.get('beacon');
    if (entry.id === 'airControlStage') return BUILDING_BY_ID.get('airControl');
    if (entry.id === 'greatMigrationStage') return BUILDING_BY_ID.get('greatMigration');
    if (isWonderObstacleQueueId(entry.id)) {
      const parts = entry.id.split(':');
      const obstacle = WONDER_OBSTACLES[Number(parts[3])];
      return parts.length === 4 && Number.isInteger(Number(parts[2])) && obstacle ? obstacle : null;
    }
    return BUILDING_BY_ID.get(entry.id);
  }
  if (entry.type === 'research') return TECH_BY_ID.get(entry.id);
  return EXPEDITION_BY_ID.get(entry.id);
}

function queueCost(entry) {
  const def = queueDef(entry);
  if (!def) return null;
  if (entry.type === 'build') {
    // Wonder obstacles are queued as construction entries, but unlike regular
    // buildings they have a direct cost and no building scaling metadata.
    if (isWonderObstacleQueueId(entry.id)) return effectiveCoalCost(def.cost);
    return effectiveCoalCost(buildingCost(def));
  }
  if (entry.type === 'research') return effectiveCoalCost(researchCost(def));
  return effectiveCoalCost(expeditionCost(def));
}

// Every staged construction registers its queue entry here. Queue behavior is
// then shared: each update can consume any number of complete stages, while
// never spending materials toward an incomplete stage.
function stagedBuildProject(entry) {
  if (!entry || entry.type !== 'build') return null;
  if (entry.id === 'beaconStage') return {
    count: BEACON_STAGE_COUNT,
    progress: beaconProgress,
    advance: advanceBeaconProject,
  };
  if (entry.id === 'airControlStage') return {
    count: AIR_CONTROL_STAGE_COUNT,
    progress: airControlProgress,
    advance: advanceAirControlProject,
  };
  if (entry.id === 'greatMigrationStage') return {
    count: GREAT_MIGRATION_STAGE_COUNT,
    progress: greatMigrationProgress,
    advance: advanceGreatMigrationProject,
  };
  return null;
}

function researchCost(def) {
  const knowledgeMultiplier = POST_STONE_AGE_RESEARCH.has(def.id)
    ? POST_STONE_AGE_KNOWLEDGE_COST_MULTIPLIER : 1;
  return effectiveCoalCost({ knowledge: def.cost * knowledgeMultiplier, ...(def.materials || {}) });
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
  const trial = type === 'build' ? 'expansion' : 'scholarship';
  return 1 + upg(upgrade) + trialCount(trial);
}

function queuedCostThrough(type, index) {
  const total = {};
  const entries = state.queues[type] || [];
  for (let i = 0; i <= index && i < entries.length; i++) {
    const cost = queueCost(entries[i]);
    if (!cost) continue;
    for (const [resource, amount] of Object.entries(cost)) {
      total[resource] = (total[resource] || 0) + amount;
    }
  }
  return total;
}

function queueTime(entry, type = entry?.type, index = -1) {
  const cost = queueCost(entry);
  if (!cost) return Infinity;
  const requirement = type && index >= 0 ? queuedCostThrough(type, index) : cost;
  const rates = production(1);
  let seconds = 0;
  for (const resource in requirement) {
    const missing = Math.max(0, requirement[resource] - (state.res[resource] || 0));
    if (!missing) continue;
    if ((rates[resource] || 0) <= 0) return Infinity;
    seconds = Math.max(seconds, missing / rates[resource]);
  }
  return seconds * lineageSpecialValue('queueTime');
}

function queueLabel(seconds) {
  if (seconds === Infinity) return 'waiting for supplies';
  if (seconds <= 0.01) return 'ready';
  const totalSeconds = Math.ceil(seconds);
  if (totalSeconds <= 60) return `${fmt(totalSeconds)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  const minuteLabel = `${fmt(minutes)} minute${minutes === 1 ? '' : 's'}`;
  const secondLabel = `${fmt(remainder)} second${remainder === 1 ? '' : 's'}`;
  return `${minuteLabel} and ${secondLabel}`;
}

function queueWaitingHtml(type, index, entry) {
  const cost = queueCost(entry);
  if (!cost) return '';
  const required = Object.entries(cost)
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${fmtCost(amount)} ${resourceName(resource)}`)
    .join(' · ');
  const costHtml = `<span class="queue-cost">requires ${required}</span>`;
  const requirement = queuedCostThrough(type, index);
  const rates = production(1);
  const waiting = Object.entries(requirement).filter(([resource, amount]) =>
    Math.max(0, amount - (state.res[resource] || 0)) > 0);
  if (!waiting.length) return costHtml + '<span class="queue-ready">ready</span>';
  return costHtml + '<span class="queue-waiting">' + waiting.map(([resource, amount]) => {
    const missing = Math.max(0, amount - (state.res[resource] || 0));
    const name = resourceName(resource);
    const rate = rates[resource] || 0;
    const seconds = rate > 0 ? missing / rate : Infinity;
    return `<span class="queue-waiting-item"><span>${fmtHeld(missing)} ${name}</span><span class="queue-time">${queueLabel(seconds)}</span></span>`;
  }).join('') + '</span>';
}

function queueProgressHtml(entry) {
  const project = stagedBuildProject(entry);
  return project ? `<span class="queue-progress">Part ${project.progress() + 1} of ${project.count}</span>` : '';
}

function queueEntry(type, id) {
  const def = queueDef({ type, id });
  if (!def || state.queues[type].length >= queueCapacity(type)) return false;
  if (type === 'build') {
    if (!canBuild(id)) return false;
    if (Number.isFinite(def.max) && bld(id) + state.queues.build.filter(entry => entry.id === id).length >= def.max) return false;
  } else if (type === 'research') {
    if (tech(id) || state.queues.research.some(entry => entry.id === id) ||
        (def.req && !def.req())) return false;
  } else {
    if ((expDone(id) && migrationChallengeCount() <= expeditionRating(id)) || (def.landing && def.landing !== state.landing) || state.pop < def.reqPop) return false;
  }
  const cost = queueCost({ type, id });
  if (canAfford(cost)) return false;
  state.queues[type].push({ type, id });
  return true;
}

function beaconStageCost() { return buildingCost(BUILDING_BY_ID.get('beacon')); }
function beaconProgress() { return Math.max(0, Math.min(BEACON_STAGE_COUNT, Math.floor(state.beaconProgress || 0))); }
function airControlStageCost() { return buildingCost(BUILDING_BY_ID.get('airControl')); }
function airControlProgress() { return Math.max(0, Math.min(AIR_CONTROL_STAGE_COUNT, Math.floor(state.airControlProgress || 0))); }
function greatMigrationProgress() { return Math.max(0, Math.min(GREAT_MIGRATION_STAGE_COUNT, Math.floor(state.greatMigrationProgress || 0))); }
function advanceBeaconProject(parts = 1) {
  const def = BUILDING_BY_ID.get('beacon');
  if (!def || bld('beacon') || !Number.isFinite(parts) || parts < 1) return 0;
  let completed = 0;
  const cost = beaconStageCost();
  while (completed < Math.floor(parts) && beaconProgress() < BEACON_STAGE_COUNT && canAfford(cost)) {
    payCost(cost);
    state.beaconProgress = beaconProgress() + 1;
    completed++;
  }
  if (beaconProgress() >= BEACON_STAGE_COUNT) {
    state.bld.beacon = 1;
    state.won = true;
    state.beaconsLit = state.beaconsLit || {};
    state.beaconsLit[state.landing] = true;
    addLog('The Beacon burns. Its light will outlive the village.', 'log-good');
    updateAchievements(['beacon']);
  }
  return completed;
}
function advanceAirControlProject(parts = 1) {
  const def = BUILDING_BY_ID.get('airControl');
  if (!def || bld('airControl') || !Number.isFinite(parts) || parts < 1) return 0;
  let completed = 0;
  const cost = airControlStageCost();
  while (completed < Math.floor(parts) && airControlProgress() < AIR_CONTROL_STAGE_COUNT && canAfford(cost)) {
    payCost(cost);
    state.airControlProgress = airControlProgress() + 1;
    completed++;
  }
  if (airControlProgress() >= AIR_CONTROL_STAGE_COUNT) {
    state.bld.airControl = 1;
    addLog('Air Control is complete. The primitive air port opens to the sky.', 'log-good');
  }
  return completed;
}
function advanceGreatMigrationProject(parts = 1) {
  const def = BUILDING_BY_ID.get('greatMigration');
  if (!def || bld('greatMigration') || !canBuild('greatMigration') || !Number.isFinite(parts) || parts < 1) return 0;
  let completed = 0;
  const cost = buildingCost(def);
  while (completed < Math.floor(parts) && greatMigrationProgress() < GREAT_MIGRATION_STAGE_COUNT && canAfford(cost)) {
    payCost(cost);
    state.greatMigrationProgress = greatMigrationProgress() + 1;
    completed++;
  }
  if (greatMigrationProgress() >= GREAT_MIGRATION_STAGE_COUNT) {
    state.bld.greatMigration = 1;
    addLog('Migration Across the Great Waters is complete. Emberhold has a road to new lands.', 'log-good');
    if (trialActive('newLands')) endTrial(true);
  }
  return completed;
}

function cancelQueue(type, index) {
  if (Number.isInteger(index) && state.queues[type][index]) state.queues[type].splice(index, 1);
}

function reorderQueue(type, fromIndex, toIndex, after = false) {
  const entries = state.queues[type];
  if (!Array.isArray(entries) || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex) ||
      !entries[fromIndex] || !entries[toIndex] || (fromIndex === toIndex && !after)) return false;
  let insertIndex = toIndex + (after ? 1 : 0);
  const [entry] = entries.splice(fromIndex, 1);
  if (fromIndex < insertIndex) insertIndex--;
  entries.splice(insertIndex, 0, entry);
  return true;
}

function attemptBuild(id) {
  const def = BUILDING_BY_ID.get(id);
  if (!def) return;
  if (id === 'beacon') {
    if (bld(id) || !canBuild(id)) return;
    const cost = beaconStageCost();
    if (canAfford(cost)) advanceBeaconProject();
    else if (!state.queues.build.some(entry => entry.id === 'beaconStage') && state.queues.build.length < queueCapacity('build'))
      state.queues.build.push({ type: 'build', id: 'beaconStage' });
    return;
  }
  if (id === 'airControl') {
    if (bld(id) || !canBuild(id)) return;
    const cost = airControlStageCost();
    if (canAfford(cost)) advanceAirControlProject();
    else if (!state.queues.build.some(entry => entry.id === 'airControlStage') && state.queues.build.length < queueCapacity('build'))
      state.queues.build.push({ type: 'build', id: 'airControlStage' });
    return;
  }
  if (id === 'greatMigration') {
    if (bld(id) || !canBuild(id)) return;
    const cost = buildingCost(def);
    if (canAfford(cost)) advanceGreatMigrationProject();
    else if (!state.queues.build.some(entry => entry.id === 'greatMigrationStage') && state.queues.build.length < queueCapacity('build'))
      state.queues.build.push({ type: 'build', id: 'greatMigrationStage' });
    return;
  }
  if (!canBuild(id) || (Number.isFinite(def.max) &&
      bld(id) + state.queues.build.filter(entry => entry.id === id).length >= def.max)) return;
  const cost = buildingCost(def);
  if (canAfford(cost)) doBuild(id);
  else if (state.queues.build.length < queueCapacity('build')) queueEntry('build', id);
}
function attemptWonderObstacle() {
  const record = wonderRecord();
  const obstacle = currentWonderObstacle(record);
  if (!obstacle || !record.found || record.obstacles?.[obstacle.key]) return false;
  const id = wonderObstacleQueueId(obstacle);
  if (state.queues.build.some(entry => entry.id === id)) {
    state.paused = false;
    return true;
  }
  if (canAfford(obstacle.cost)) return buildWonderObstacle();
  if (state.queues.build.length >= queueCapacity('build')) return false;
  state.queues.build.push({ type: 'build', id });
  state.paused = false;
  addLog(`${obstacle.name} added to the Construction queue.`, 'log-important');
  return true;
}

function queueWonderObstacleAtFront(obstacle, record) {
  if (!upg('wonderousAdvance') || !Object.values(record?.outcomes || {}).some(Boolean)) return false;
  const id = wonderObstacleQueueId(obstacle);
  const existing = state.queues.build.findIndex(entry => entry.id === id);
  if (existing === 0) return true;
  if (existing > 0) {
    const [entry] = state.queues.build.splice(existing, 1);
    state.queues.build.unshift(entry);
  } else {
    state.queues.build.unshift({ type: 'build', id });
  }
  return true;
}

function attemptResearch(id) {
  const def = TECH_BY_ID.get(id);
  if (!def) return;
  if (state.queues.research.some(entry => entry.id === id)) return;
  if (canAfford(researchCost(def))) doResearch(id);
  else if (state.queues.research.length < queueCapacity('research')) queueEntry('research', id);
}

function attemptExpedition(id) {
  const def = EXPEDITION_BY_ID.get(id);
  if (!def) return;
  const cost = expeditionCost(def);
  if (canAfford(cost)) doExpedition(id);
  else if (state.queues.expedition.length < queueCapacity('expedition')) queueEntry('expedition', id);
}

function updateQueues() {
  for (const type of ['build', 'research', 'expedition']) {
    const strict = !!state.settings?.strictQueueOrder;
    const start = strict ? 0 : state.queues[type].length - 1;
    const end = strict ? 1 : -1;
    const step = strict ? 1 : -1;
    for (let i = start; strict ? i < end : i >= end; i += step) {
      const entry = state.queues[type][i];
      const def = queueDef(entry);
      if (!def) continue;
      if (type === 'build' && !['beaconStage', 'airControlStage', 'greatMigrationStage'].includes(entry.id) && !isWonderObstacleQueueId(entry.id) && !canBuild(entry.id)) {
        state.queues[type].splice(i, 1);
        continue;
      }
      if (!canAfford(queueCost(entry))) continue;
      const staged = stagedBuildProject(entry);
      const multiPartSteps = upg('tillItIsComplete') && staged ? staged.count : 1;
      const completed = staged ? staged.advance(multiPartSteps) : type === 'build' ? doBuild(entry.id) :
        type === 'research' ? doResearch(entry.id) : doExpedition(entry.id);
      if (completed && staged && staged.progress() < staged.count) {
        state.queues[type].splice(i, 1);
        state.queues[type].push(entry);
      } else if (completed) state.queues[type].splice(i, 1);
    }
  }
}

// ---------- production ----------
function seasonIndex(day = state.day) {
  if (trialActive('longnight')) return 3;
  return Math.floor((day % DAYS_PER_YEAR) / DAYS_PER_SEASON);
}
function climateDef(landing = state.landing) { return CLIMATES[landing] || CLIMATES.emberplain; }
function placeTraitDef(id) { return PLACE_TRAIT_BY_ID.get(id); }
function currentPlaceTraits() { return (state.placeTraits || []).map(placeTraitDef).filter(Boolean); }
function traitsForLanding(landingId, count = 2) {
  const eligible = PLACE_TRAITS.filter(trait => !trait.climates || trait.climates.includes(landingId));
  const picked = [];
  while (eligible.length && picked.length < count) picked.push(eligible.splice(Math.floor(Math.random() * eligible.length), 1)[0].id);
  return picked;
}
function placeTraitEffectsText(trait) {
  const effects = [];
  for (const [resource, modifier] of Object.entries(trait.mods || {})) {
    const pct = Math.round((modifier - 1) * 100);
    effects.push(`${pct >= 0 ? '+' : '−'}${Math.abs(pct)}% ${resourceName(resource)} production`);
  }
  if (trait.morale) effects.push(`${trait.morale >= 0 ? '+' : '−'}${fmt(Math.abs(trait.morale))} morale/s`);
  if (trait.growth && trait.growth !== 1) {
    const pct = Math.round(Math.abs(1 - trait.growth) * 100);
    effects.push(`Population growth time ${trait.growth < 1 ? '−' : '+'}${pct}%`);
  }
  if (trait.survey && trait.survey !== 1) {
    const pct = Math.round(Math.abs(trait.survey - 1) * 100);
    effects.push(`${trait.survey > 1 ? '+' : '−'}${pct}% Survey gain`);
  }
  if (trait.guardRecruitment && trait.guardRecruitment !== 1) {
    const pct = Math.round(Math.abs(trait.guardRecruitment - 1) * 100);
    effects.push(`${trait.guardRecruitment > 1 ? '+' : '−'}${pct}% Guard recruitment rate`);
  }
  if (trait.vanishChance) effects.push(`${fmt(trait.vanishChance * 100)}% chance per second for a villager to disappear`);
  if (trait.danger) effects.push(`${trait.danger > 0 ? '+' : '−'}${Math.abs(trait.danger)} malformed creature danger at founding`);
  if (trait.rage) effects.push(`Current morale: ${airOfRageMorale() >= 0 ? '+' : '−'}${fmt(Math.abs(airOfRageMorale()))}/s; attacks set it to +0.05/s, then it fades to −0.04/s`);
  if (trait.atavistic) effects.push('Lineage traits become level 2: positive and negative effects are ×1.5 in magnitude; lineage happenings are ×1.5 as likely');
  return effects;
}
function placeTraitTooltip(trait) {
  const activeHere = currentPlaceTraits().some(active => active.id === trait.id);
  const effects = tech('understandingHome') && activeHere ? placeTraitEffectsText(trait) : [];
  return effects.length ? `${trait.desc}\n\nCurrent location:\n${effects.join('\n')}` : trait.desc;
}
function traitsHtml(traitIds) {
  const traits = (traitIds || []).map(placeTraitDef).filter(Boolean);
  return traits.length ? traits.map(trait => `<span class="has-tooltip" data-tooltip="${attrText(placeTraitTooltip(trait))}">${trait.name}</span>`).join(' · ') : 'Unmarked ground';
}
function airOfRageMorale() {
  return currentPlaceTraits().some(trait => trait.rage) ? (state.traitEffects?.airOfRage || 0) : 0;
}
function advancePlaceTraitEffects(dt) {
  if (!currentPlaceTraits().some(trait => trait.rage)) return;
  state.traitEffects = state.traitEffects || {};
  // Rage drains through neutral after an attack, then builds toward a
  // sustained malus when the settlement has no outlet for it.
  state.traitEffects.airOfRage = Math.max(-0.04, Math.min(0.05,
    (state.traitEffects.airOfRage || 0) - 0.0002 * dt));
}
function triggerAirOfRage() {
  if (!currentPlaceTraits().some(trait => trait.rage)) return;
  state.traitEffects = state.traitEffects || {};
  state.traitEffects.airOfRage = 0.05;
  addLog('The anger in the air howls with the departing attack, then begins to spend itself.', 'log-good');
}

// Each 45-day span has two weather patterns, each lasting 15–30 days.
// Date and place determine the schedule, including after reloads and offline
// catch-up, without consuming random draws from combat or other systems.
function dailyWeather(day = state.day, landing = state.landing) {
  const blockStart = Math.floor(day / 45) * 45;
  let date = blockStart;
  const climate = climateDef(landing);
  function roll(salt) {
    let hash = 2166136261;
    for (const char of `${landing}:${date}:${salt}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d);
    hash ^= hash >>> 15;
    return (hash >>> 0) / 4294967296;
  }
  const split = 15 + Math.floor(roll('duration') * 16);
  if (day >= blockStart + split) date += split;
  const endsAt = date === blockStart ? blockStart + split : blockStart + 45;
  let pick = roll('sky') * climate.weights.reduce((sum, weight) => sum + weight, 0);
  let sky = WEATHER[0];
  for (let i = 0; i < climate.weights.length; i++) {
    pick -= climate.weights[i];
    if (pick < 0) { sky = WEATHER[i]; break; }
  }
  const season = seasonIndex(date);
  let temperature = [12, 24, 11, -2][season] + climate.offset + Math.floor(roll('temperature') * 13) - 6;
  // A restored Sunwell catches half of the days that would otherwise become
  // dangerously hot, without making the rest of the climate deterministic.
  if (wonderChoice('emberplain', 'restore') && temperature >= 30 && roll('sunwell-shade') < 0.5) temperature = 29;
  if (trialActive('scarcity') || trialActive('whiteout')) sky = WEATHER.find(weather => weather.id === 'storm') || sky;
  const warmth = temperature <= 0 ? 'Freezing' : temperature < 10 ? 'Cold' : temperature < 20 ? 'Mild' : temperature < 30 ? 'Warm' : 'Hot';
  const mods = { ...sky.mods };
  if (temperature <= 0) mods.food = (mods.food || 1) * 0.90;
  else if (temperature >= 30) mods.food = (mods.food || 1) * 0.95;
  return { ...sky, temperature, warmth, mods, startsAt: date, endsAt };
}

function weatherSummary() {
  const weather = dailyWeather();
  return `${weather.name}, ${weather.warmth.toLowerCase()} (${formatTemperature(weather.temperature)})`;
}

function formatTemperature(celsius) {
  if (state.settings?.fahrenheit) return `${Math.round(celsius * 9 / 5 + 32)}°F`;
  return `${celsius}°C`;
}

function seasonMult() {
  const i = seasonIndex();
  if (trialActive('longnight')) return 0.25;
  if (SEASONS[i].name !== 'Winter') return SEASONS[i].mult;
  return perm('everwarm') ? 0.75 : 0.5;
}

function allMult() {
  return globalProductionFactors().reduce((m, [, factor]) => m * factor, 1);
}

function moraleMult() {
  const morale = Math.max(0, Number(state.morale) || 0);
  const cappedMorale = Math.min(100, morale);
  const excessMorale = Math.max(0, morale - 100);
  const moraleSlope = 0.3 / 70;
  return 1 + (cappedMorale - 70) * moraleSlope + excessMorale * moraleSlope * 0.5;
}

function globalProductionFactors(resource = null) {
  const achievementPower = state.migrationChallenges?.includes('forgottenTruths') ? 0.25 : 1;
  return [
    ['Morale', moraleMult()],
    [`Shrines (${bld('shrine')} × 5%) + factories (${bld('factory')} × 10%)`, 1 + 0.05 * bld('shrine') + (resource === 'food' || resource === 'coal' ? 0 : 0.10 * bld('factory'))],
    ['Dynamos', 1 + 0.15 * bld('dynamo')],
    ['Allied tribes', 1 + localTribeIds().reduce((bonus, id) => {
      const entry = state.diplomacy?.[id];
      return bonus + (entry && (entry.disposition >= 80 || entry.conquered) ? alliedTribeIncomeBonus(id) : 0);
    }, 0)],
    ['United Region', state.unifiedRegion ? 1.15 : 1],
    ['Stored machinery', 1 + 0.002 * state.res.machinery],
    ['Glacial Peaks', expDone('glacialPeaks') ? 1.10 : 1],
    ['All six sites explored', siteExpeditionsComplete() ? 1.05 : 1],
    ['Everwarm', perm('everwarm') ? 1.05 : 1],
    ['Deep Roots', 1 + 0.05 * upg('deepRoots')],
    ['Completion bonus', 1 + 0.0025 * achievementRatingTotal() * achievementPower],
    ['Haste trial', trialActive('haste') ? 0.70 : 1],
  ];
}

function settlementProductionFactors(res, outgoing = false) {
  const factors = [[landingDef().name, landingMod(res)], [lineageDef(state.species).name, baseLineageMod(res)]];
  if (res === 'steel' && !outgoing && steelHearted()) factors.push(['Steel Hearted', 1 + 0.20 * achievementRating('steelHearted')]);
  const challenges = state.migrationChallenges || [];
  if (res === 'food' && !outgoing && challenges.includes('dryGround')) factors.push(['Dry Ground', 0.10]);
  if (challenges.includes('badAncestry')) {
    const bad = state.badAncestry;
    if (bad?.resource === res && bad.modifier) factors.push([`Bad Ancestry (${lineageDef(bad.lineageId).name})`, bad.modifier]);
  }
  if (res === 'steel' && tech('basinTempering')) factors.push(['Basin Tempering', 1.35]);
  if (!outgoing) for (const trait of currentPlaceTraits()) {
    const modifier = trait.mods?.[res];
    if (modifier) factors.push([trait.name, modifier]);
  }
  const conquered = conqueredLineage();
  if (conquered && conqueredLineageMod(res) > 1) factors.push([`${conquered.name} (Commonality)`, conqueredLineageMod(res)]);
  for (const e of EXPEDITIONS) {
    const modifier = outgoing ? e.mods?.outgoing?.[res] : e.mods?.[res];
    if (expDone(e.id) && modifier) factors.push([e.name, modifier]);
  }
  if (tech('civics')) {
    for (const def of [civicDef(state.policy), governorDef(state.governor), ...(state.council || []).map(councilorDef)]) {
      if (def) factors.push([def.name, def.mods?.[res] || 1]);
    }
  }
  return factors;
}

function forgeProductionFactors() {
  const factors = [[landingDef().name, landingMod('steel')], [lineageDef(state.species).name, baseLineageMod('steel')]];
  if (steelHearted()) factors.push(['Steel Hearted', 1.20]);
  if (tech('basinTempering')) factors.push(['Basin Tempering', 1.35]);
  if (lineageSpecialValue('forgeOutput') !== 1) factors.push(['Banked Heat', lineageSpecialValue('forgeOutput')]);
  const conquered = conqueredLineage();
  if (conquered && conqueredLineageMod('steel') > 1) factors.push([`${conquered.name} (Commonality)`, conqueredLineageMod('steel')]);
  for (const e of EXPEDITIONS) {
    if (expDone(e.id) && e.mods?.forge) factors.push([`${e.name} (Forges)`, e.mods.forge]);
  }
  if (tech('civics')) {
    for (const def of [civicDef(state.policy), governorDef(state.governor), ...(state.council || []).map(councilorDef)]) {
      if (def) factors.push([def.name, def.mods?.steel || 1]);
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
function crowdMoralePenalty() {
  return Math.max(0, state.pop - 20) * 0.01;
}
function moralePressures(foodRate = production(0.25).food) {
  const weather = dailyWeather();
  const season = SEASONS[seasonIndex()].name;
  const pressures = [];
  const add = (id, label, rate, count) => {
    const pressure = { id, label, rate };
    if (count !== undefined) pressure.count = count;
    pressures.push(pressure);
  };
  add('weather', `${weather.name} weather`, weather.morale);
  const foodRateValue = state.res.food <= 0.0001 ? -0.22 : foodRate < 0 ? -0.025 : state.res.food > 20 ? (state.morale < 70 ? 0.035 : 0) : 0;
  add('foodStores', state.res.food <= 0.0001 ? 'Empty food stores' : foodRate < 0 ? 'Food production falling short' : 'Secure food stores', foodRateValue);
  add('season', season, season === 'Winter' ? -0.006 : season === 'Summer' ? 0.006 : 0);
  add('shrine', 'Shrines', bld('shrine') > 0 && state.morale < 75 ? 0.012 : 0, bld('shrine'));
  add('farming', 'Farming', wonderChoice('floodmeadows', 'silence') ? 0.1 : 0);
  add('ranch', 'Ranches', bld('ranch') * 0.008, bld('ranch'));
  add('hospital', 'Hospitals', bld('hospital') > 0 && state.morale < 50 ? 0.01 : 0, bld('hospital'));
  add('performers', 'Performers', performerCount() * 0.10, performerCount());
  const activeLivingBlocks = powerAllocation().livingBlock;
  add('livingBlocks', 'Living Blocks', -activeLivingBlocks * 0.1, activeLivingBlocks);
  const beyond20 = Math.max(0, state.pop - 20);
  add('population', 'Villagers beyond 20', -crowdMoralePenalty(), beyond20);
  const fullCrews = Object.keys(JOBS).filter(workplaceEthicsFull).length;
  add('workplaceEthics', 'Workplace Ethics full mining crews', -fullCrews * 0.15, fullCrews);
  for (const trait of currentPlaceTraits()) add(`placeTrait:${trait.id}`, trait.name, trait.morale || 0);
  add('airOfRage', 'Air of Rage', airOfRageMorale());
  add('rapture', 'Rapture workers fleeing back to town', (state.raptureFleeMoraleT || 0) > 0 ? -3 : 0);
  const conquered = localTribeIds().filter(id => state.diplomacy?.[id]?.conquered && !commonalityActive()).length;
  add('conqueredTowns', 'Conquered towns', -conquered, conquered);
  return pressures;
}
function moraleBreakdown(foodRate = production(0.25).food) {
  return moralePressures(foodRate).map(pressure => ({ ...pressure }));
}
function moraleRate(foodRate = production(0.25).food) {
  return moralePressures(foodRate).reduce((sum, pressure) => sum + pressure.rate, 0);
}
function moraleTelemetry() {
  return { value: Number(state.morale) || 0, max: moraleCap(), rate: moraleRate(), pressures: moraleBreakdown() };
}
function marginalMorale(id) {
  const aliases = { performer: 'performers', performers: 'performers', villager: 'population', population: 'population', workplaceEthics: 'workplaceEthics' };
  const key = aliases[id] || id;
  if (key === 'performers') return 0.10;
  if (key === 'population') return -0.01;
  if (key === 'workplaceEthics') return -0.15;
  if (key === 'livingBlocks') return -0.10;
  if (key === 'conqueredTowns') return -1;
  return moralePressures().find(pressure => pressure.id === key)?.rate || 0;
}
function moraleTooltip(foodRate = production(0.25).food) {
  const weather = dailyWeather();
  const up = [];
  const down = [];
  for (const pressure of moralePressures(foodRate)) {
    const { rate, label } = pressure;
    const displayLabel = pressure.id === 'population' ? `${pressure.count} villager${pressure.count === 1 ? '' : 's'} beyond 20` :
      pressure.id === 'performers' ? `${pressure.count} Performer${pressure.count === 1 ? '' : 's'}` :
      pressure.id === 'livingBlocks' ? `${pressure.count} Living Block${pressure.count === 1 ? '' : 's'}` :
      pressure.id === 'conqueredTowns' ? `${pressure.count} conquered town${pressure.count === 1 ? '' : 's'}` : label;
    if (rate > 0) up.push(`+${rate.toFixed(3)} morale/s — ${displayLabel}`);
    else if (rate < 0) down.push(`−${Math.abs(rate).toFixed(3)} morale/s — ${displayLabel}`);
  }
  const weatherNote = weather.morale ? `${weather.name} weather` : `${weather.name} weather — no morale pressure`;
  return ['Current morale pressures', `Weather: ${weatherNote}`, '', 'Up:', ...(up.length ? up : ['None']), '', 'Down:', ...(down.length ? down : ['None'])].join('\n');
}
function updateMorale(dt, foodRate) {
  const delta = moraleRate(foodRate);
  if ((state.raptureFleeMoraleT || 0) > 0) {
    state.raptureFleeMoraleT = Math.max(0, state.raptureFleeMoraleT - dt);
  }
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
  const traitMultiplier = currentPlaceTraits().reduce((value, trait) => value * (trait.survey || 1), 1) * lineageSpecialValue('survey');
  const explorerSurvey = perm('explorers') ? explorerCount() * 0.025 * traitMultiplier : 0;
  const flightSurvey = state.surveyFlightRate || 0;
  if (explorerSurvey || flightSurvey)
    state.surveyPoints = (state.surveyPoints || 0) + (explorerSurvey + flightSurvey) * dt;
  if (!perm('explorers')) return;
  discoverTradePartners();
}

function randomRange(pair) {
  return Math.round(pair[0] + Math.random() * (pair[1] - pair[0]));
}
function randomEventResourceAmount(resource, pair) {
  const storage = STORAGE[resource];
  // Currency has no material storage scaling, so scale setbacks with the
  // settlement's current holdings instead of leaving them stuck at starter size.
  const scale = storage ? capacityOf(resource) / storage.base
    : resource === 'currency' ? Math.max(1, state.res.currency / 100) : 1;
  return Math.round(randomRange(pair) * scale);
}
function updateRandomEvents(dt) {
  state.randomEventT = (state.randomEventT || 0) + dt;
  if (state.randomEventT < (state.randomEventNext || 60)) return;
  state.randomEventT = 0;
  state.randomEventNext = 55 + Math.random() * 75;
  if (trialActive('industrialization') && state.morale < 40 && state.res.coal > 0 &&
      Math.random() < INDUSTRIALIZATION_RIOT_CHANCE) {
    const lossFraction = INDUSTRIALIZATION_RIOT_LOSS[0] +
      Math.random() * (INDUSTRIALIZATION_RIOT_LOSS[1] - INDUSTRIALIZATION_RIOT_LOSS[0]);
    const loss = Math.max(1, Math.round(state.res.coal * lossFraction));
    state.res.coal = Math.max(0, state.res.coal - loss);
    addLog(`The hungry village riots at the coal stores. Coal −${fmt(loss)}.`, 'log-bad');
    return;
  }
  const lineageEvents = LINEAGE_EVENTS[state.species] || [];
  const lineageEventChance = 0.5 * activeLineageTraitScale();
  const local = lineageEvents.length > 0 && Math.random() < lineageEventChance;
  const pool = local ? lineageEvents : RANDOM_EVENTS;
  const event = pool[Math.floor(Math.random() * pool.length)];
  const eventText = event.text.replace('{animal}', FARM_ANIMALS[Math.floor(Math.random() * FARM_ANIMALS.length)] || 'chickens');
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
  let timeRates;
  let timeSeconds;
  if (event.timeReward) {
    timeSeconds = randomRange(event.timeReward);
    timeRates = production(0);
    if (event.survey) {
      const survey = perm('explorers') ? explorerCount() * 0.025 * timeSeconds : 0;
      if (survey) {
        state.surveyPoints = (state.surveyPoints || 0) + survey;
        record('Survey', survey);
      }
    }
  }
  for (const { id: resource, name } of RESOURCES) {
    if (!event[resource] || !state.seen[resource]) continue;
    const amount = (event.timeReward
      ? Math.max(randomEventResourceAmount(resource, event[resource]), Math.round(Math.max(0, timeRates[resource] || 0) * timeSeconds))
      : randomEventResourceAmount(resource, event[resource])) * (local ? lineageSpecialValue('eventReward') : 1);
    const before = state.res[resource];
    // Rewards never discard an existing over-cap stockpile.
    state.res[resource] = amount > 0 ? before + Math.min(amount, Math.max(0, capacityOf(resource) - before)) : Math.max(0, before + amount);
    record(name, state.res[resource] - before);
  }
  const impact = actualChanges.some(n => n < 0) ? 'log-bad' : actualChanges.length ? 'log-good' : '';
  const prefix = local ? `${lineageDef(state.species).name}: ` : '';
  addLog(`${prefix}${eventText}${changes.length ? ` ${changes.join('; ')}.` : ''}`, impact);
}

function malformedCreatureLootPool() {
  return ['food', 'wood', 'stone', 'tools', 'copper', 'iron', 'coal', 'steel', 'machinery', 'aluminum', 'goods', 'aether', 'oil', 'currency']
    .filter(resource => state.seen[resource] && (state.res[resource] || 0) > 0);
}

function resolveMalformedCreatureAttack() {
  const danger = Math.min(MALFORMED_DANGER_MAX, Math.max(0, state.malformedDanger || 0));
  const required = Math.ceil(danger);
  if (!required || ableGuards() >= required) {
    if (required && Math.random() < 0.12) {
      const message = MALFORMED_FENDED_MESSAGES[Math.floor(Math.random() * MALFORMED_FENDED_MESSAGES.length)];
      addLog(`${message} (${ableGuards()} healthy Guard${ableGuards() === 1 ? '' : 's'} against danger ${danger.toFixed(2)}.)`, 'log-good');
    }
    return false;
  }

  const loot = [];
  const pool = malformedCreatureLootPool();
  const count = Math.min(3, pool.length);
  for (let i = 0; i < count; i++) {
    const resource = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const amount = Math.min(state.res[resource], Math.max(1, Math.round(state.res[resource] * (0.08 + Math.random() * 0.14))));
    state.res[resource] = Math.max(0, state.res[resource] - amount);
    loot.push(`${fmt(amount)} ${resourceName(resource)}`);
  }

  const lossFraction = 0.02 + Math.random() * 0.08;
  const populationLoss = state.pop > 1 ? Math.min(state.pop - 1, Math.max(1, Math.round(state.pop * lossFraction))) : 0;
  state.pop = Math.max(1, state.pop - populationLoss);
  reconcileWorkers();
  addLog(`Malformed creatures breach the settlement! They take ${loot.join(', ') || 'nothing'} and ${populationLoss} villager${populationLoss === 1 ? '' : 's'} vanish into the dark.`, 'log-bad');
  return true;
}

function updateMalformedThreat(dt) {
  if (!malformedBiomeActive()) return;
  state.malformedDanger = Math.min(MALFORMED_DANGER_MAX, (state.malformedDanger || 0) + MALFORMED_DANGER_RATE * dt);
  state.malformedAttackT = (state.malformedAttackT || 0) + dt;
  if (state.malformedAttackT < (state.malformedAttackNext || MALFORMED_ATTACK_INTERVAL[0])) return;
  state.malformedAttackT = 0;
  state.malformedAttackNext = MALFORMED_ATTACK_INTERVAL[0] + Math.random() * (MALFORMED_ATTACK_INTERVAL[1] - MALFORMED_ATTACK_INTERVAL[0]);
  resolveMalformedCreatureAttack();
}

function baseLineageMod(res) {
  const lineage = lineageDef(state.species);
  const modifier = (lineage.mods[res] === undefined ? 1 : lineage.mods[res]) * (lineage.all || 1);
  const traitId = lineage.traitEffects?.[res];
  let result = lineageTraitModifier(modifier, traitId ? lineageTraitLevel(traitId, lineage) : 1);
  const nativeTraits = new Set(lineage.traits || []);
  if (!lineage.custom) for (const source of LINEAGES) {
    const acquiredTrait = source.traitEffects?.[res];
    const sourceModifier = source.mods?.[res] ?? 1;
    if (acquiredTrait && !nativeTraits.has(acquiredTrait) && acquiredLineageTraitIds().includes(acquiredTrait) && sourceModifier > 1)
      result *= lineageTraitModifier(sourceModifier, 0.5);
  }
  return result;
}
function lineageMod(res) {
  return baseLineageMod(res) * conqueredLineageMod(res);
}

function factoryRecipe() {
  const recipe = FACTORY_RECIPE_BY_ID.get(factoryRecipes()[0]);
  return recipe && (!recipe.tech || tech(recipe.tech)) ? recipe : FACTORY_RECIPES[0];
}
function factoryRecipes() {
  const selected = upg('dividedAttention') > 0
    ? (Array.isArray(state.factoryRecipes) ? state.factoryRecipes : [state.factoryRecipe])
    : [state.factoryRecipe];
  const valid = [...new Set(selected)].filter(id => {
    const recipe = FACTORY_RECIPE_BY_ID.get(id);
    return recipe && (!recipe.tech || tech(recipe.tech));
  });
  if (!valid.length) return ['goods'];
  return upg('dividedAttention') > 0 ? valid.slice(0, 2) : [valid[0]];
}
function tinkererFactoryAvailable() {
  return wonderChoice('grayrocks', 'silence') && JOBS.tinkerer.unlock();
}
function chooseFactoryRecipe(id) {
  const recipe = FACTORY_RECIPE_BY_ID.get(id);
  if ((!bld('factory') && !tinkererFactoryAvailable()) || !recipe || (recipe.tech && !tech(recipe.tech))) return;
  const selected = factoryRecipes();
  if (upg('dividedAttention') > 0) {
    if (selected.includes(id)) {
      if (selected.length > 1) selected.splice(selected.indexOf(id), 1);
    } else if (selected.length < 2) selected.push(id);
    state.factoryRecipes = selected;
  } else state.factoryRecipes = [id];
  state.factoryRecipe = state.factoryRecipes[0];
}

const DIG_SITE_RESOURCES = { quarry: 'stone', deepMine: 'iron', coalSeam: 'coal' };
const DIG_SITE_WORKERS = { quarry: 'miner', deepMine: 'ironminer', coalSeam: 'digger' };
const DIG_SITE_POWER = 0.2;
function factoryPowerRequirement() { return FACTORY_POWER_REQUIREMENT * (1 + 0.5 * upg('runningHot')); }
const POWER_BUILDINGS = {
  livingBlock: { power: LIVING_BLOCK_POWER_REQUIREMENT, label: 'Living Blocks' },
  ...Object.fromEntries(Object.keys(DIG_SITE_RESOURCES).map(id => [id, { power: DIG_SITE_POWER }])),
  factory: { get power() { return factoryPowerRequirement(); }, label: 'Factories' },
  aluminumWorks: { power: 1, label: 'Sky Metal Forges' },
  // Forges can be switched off, but do not draw from power capacity.
  forge: { power: 0, label: 'Forges' },
};

function powerBuildingControllable(id) {
  return Object.hasOwn(POWER_BUILDINGS, id) &&
    (id === 'livingBlock' || id === 'factory' || id === 'forge' || id === 'aluminumWorks' || tech('awakenAncients'));
}

function powerBuildingMax(id) {
  const worker = DIG_SITE_WORKERS[id];
  return worker ? (bld(id) > 0 ? Math.max(0, Math.floor(state.jobs[worker] || 0)) : 0) : Math.floor(bld(id));
}

function buildingPowerCount(id) {
  if (!powerBuildingControllable(id)) return 0;
  const count = state.buildingPower[id];
  const max = powerBuildingMax(id);
  // New controls default existing buildings to enabled so older saves keep
  // their previous behavior.
  return Number.isFinite(count) ? Math.max(0, Math.min(max, Math.floor(count))) : max;
}

function setBuildingPower(id, count) {
  if (!powerBuildingControllable(id) || !bld(id) || !Number.isFinite(count)) return false;
  state.buildingPower[id] = Math.max(0, Math.min(powerBuildingMax(id), Math.floor(count)));
  return true;
}

function powerAllocation() {
  const powerFactor = settlementProductionFactors('power').reduce((value, [, factor]) => value * factor, 1);
  let available = Math.max(0, (bld('steamPlant') * POWER_PER_STEAM_PLANT + bld('oilPowerPlant') * POWER_PER_OIL_PLANT + bld('dynamo') * 1.5 + bld('windDevice') * POWER_PER_WIND_DEVICE) * powerFactor);
  const active = { forge: buildingPowerCount('forge') };
  for (const id of ['livingBlock', ...Object.keys(DIG_SITE_RESOURCES), 'factory', 'aluminumWorks']) {
    active[id] = Math.min(buildingPowerCount(id), Math.floor((available + 1e-9) / POWER_BUILDINGS[id].power));
    available = Math.max(0, available - active[id] * POWER_BUILDINGS[id].power);
  }
  return active;
}

function digSitePower() {
  const allocation = powerAllocation();
  const active = {};
  for (const id of Object.keys(DIG_SITE_RESOURCES)) {
    active[id] = allocation[id];
  }
  return active;
}

function renderBuildingPower(id, active = powerAllocation()) {
  if (!powerBuildingControllable(id) || !bld(id)) return '';
  const count = buildingPowerCount(id);
  const max = powerBuildingMax(id);
  const info = POWER_BUILDINGS[id];
  const resource = DIG_SITE_RESOURCES[id] ? resourceName(DIG_SITE_RESOURCES[id]) : null;
  const effect = resource ? `, +${active[id] * 10}% ${resource} production` : '';
  const supply = info.power ? `Power allocation: ${count} / ${max} workers enabled; ${active[id]} active (${+(active[id] * info.power).toFixed(2)} capacity)` :
    `Production: ${count} / ${max} enabled; ${active[id]} active`;
  return `<div class="card-desc">${supply}${effect}.</div>` +
    `<div class="card-actions"><button data-action="power-off" data-id="${id}" ${count ? '' : 'disabled'}>Off</button>` +
    `<button data-action="power-dec" data-id="${id}" data-repeat aria-label="Reduce ${id} power" ${count ? '' : 'disabled'}>−</button>` +
    `<button data-action="power-inc" data-id="${id}" data-repeat aria-label="Increase ${id} power" ${count < max ? '' : 'disabled'}>+</button>` +
    `<button data-action="power-all" data-id="${id}" ${count < max ? '' : 'disabled'}>All</button></div>`;
}

function production(dt = 0.25, breakdown = null) {
  state.surveyFlightRate = 0;
  const rates = {};
  const challenges = state.migrationChallenges || [];
  const guardIncome = {};
  const incomeRates = {};
  const outgoingRates = {};
  for (const r of RESOURCES) {
    rates[r.id] = 0;
    incomeRates[r.id] = 0;
    outgoingRates[r.id] = 0;
    if (breakdown) breakdown[r.id] = [];
  }
  const weather = dailyWeather();
  const power = powerAllocation();
  const poweredSites = digSitePower();
  const poweredBonusByResource = {};
  for (const [buildingId, resource] of Object.entries(DIG_SITE_RESOURCES)) {
    poweredBonusByResource[resource] = (poweredBonusByResource[resource] || 0) + (poweredSites[buildingId] || 0);
  }
  const add = (res, label, base, factors = [], source = null) => {
    const active = poweredBonusByResource[res];
    if (base > 0 && active) factors = [...factors, ['Awaken Ancients', 1 + 0.10 * active]];
    if (base > 0 && weather.mods[res]) factors = [...factors, [`Weather (${weather.name}, ${formatTemperature(weather.temperature)})`, weather.mods[res]]];
    if (base > 0 && res === 'food' && (weather.id === 'rain' || weather.id === 'fog')) {
      factors = [...factors, ['Floodwise', lineageSpecialValue('weatherFood')]];
    }
    const amount = factors.reduce((value, [, factor]) => value * factor, base);
    rates[res] += amount;
    if (base < 0) outgoingRates[res] += amount;
    else incomeRates[res] += amount;
    if (source === 'guard' && base > 0) guardIncome[res] = (guardIncome[res] || 0) + amount;
    if (breakdown) breakdown[res].push({ label, base, amount, source, factors: factors.filter(([, factor]) => factor !== 1) });
  };
  const inputCosts = (inputs, id, total) => effectiveCoalInputs(inputs, id, total);
  const scale = (res, factors) => {
    const multiplier = factors.reduce((value, [, factor]) => value * factor, 1);
    rates[res] *= multiplier;
    incomeRates[res] *= multiplier;
    outgoingRates[res] *= multiplier;
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
      const tinkererFactory = j === 'tinkerer' && tinkererFactoryAvailable();
      if (!job.winterproof && tinkererFactory) {
        const selectedRecipes = factoryRecipes();
        for (const recipe of selectedRecipes.map(id => FACTORY_RECIPE_BY_ID.get(id))) {
          const workers = n / selectedRecipes.length;
          const recipeFactor = recipe.id === 'steel' && tech('lightningMetal') ? 1.5 : 1;
          const keepsToolWork = recipe.id === 'tools';
          const rate = keepsToolWork ? job.base : recipe.rate * 0.5 * recipeFactor;
          const recipeInputs = keepsToolWork ? job.inputs : recipe.inputs;
          add(recipe.id, `Tinkerers (${recipe.name}): ${workers} × ${rate}/s`, workers * rate);
          const effectiveInputs = inputCosts(recipeInputs, 'tinkerer', workers);
          for (const r in effectiveInputs) {
            const inputRate = keepsToolWork ? effectiveInputs[r] : effectiveInputs[r] * 0.5 * recipeFactor;
            add(r, `Tinkerer inputs (${recipe.name}): ${workers} × ${inputRate}/s`, -workers * inputRate);
          }
        }
      } else if (!job.winterproof) {
        const poweredBuilding = job.poweredBuilding;
        const enabledBuildings = poweredBuilding ? buildingPowerCount(poweredBuilding) : 0;
        const activeWorkers = poweredBuilding ? Math.min(n, enabledBuildings * 2) : n;
        if (poweredBuilding && activeWorkers < 1) continue;
        const supplied = !job.inputs || (state.res.wood > 0 && state.res.stone > 0);
        const factors = [
          ...(j === 'ironminer' && tech('ironMites') ? [['Iron Mites', 1.30]] : []),
          ...(workplaceEthicsFull(j) ? [['Workplace Ethics', 1.10]] : []),
        ];
        add(job.res, `${jobName(j)}: ${activeWorkers} × ${job.base}/s`, activeWorkers * job.base,
          [...factors, ...(supplied ? [] : [['Missing wood or stone', 0]])]);
        if (poweredBuilding) {
          const poweredBuildings = power[poweredBuilding] || 0;
          const fuelBuildings = Math.max(0, Math.min(Math.ceil(activeWorkers / 2), enabledBuildings) - poweredBuildings);
          if (fuelBuildings) add('coal', `${jobName(j)} fuel: ${fuelBuildings} × 5/s`, -fuelBuildings * 5);
        }
      }
      if (job.inputs && !tinkererFactory) {
        for (const r in job.inputs) add(r, `${jobName(j)} inputs: ${n} × ${job.inputs[r]}/s`, -n * job.inputs[r]);
      }
    }
  }
  if (upg('idleHands') && !trialActive('whiteout') && unassigned() > 0)
    add('food', `Idle Hands: ${unassigned()} × ${JOBS.forager.base}/s`, unassigned() * JOBS.forager.base);
  if (tech('reclaimining') && (state.jobs.forager || 0) > 0)
    add('aluminum', `Foragers reclaiming Aluminum: ${state.jobs.forager} × 0.005/s`, state.jobs.forager * 0.005);

  // expedition passives
  if (expDone('oldForest')) add('wood', 'Old Forest passive', 1.5);
  if (expDone('foothills')) add('stone', 'Foothills passive', 1.0);
  if (expDone('sunkenRuins')) add('knowledge', 'Sunken Ruins passive', 0.3);
  if (upg('journalOfOldTimes')) add('knowledge', 'Journal of Old Times', 0.2 * upg('journalOfOldTimes'));
  if (expDone('emberVein')) add('coal', 'Ember Vein passive', 0.5);
  if (expDone('glacialPeaks')) add('aether', 'Glacial Peaks passive', 0.1);
  const ranchers = state.jobs.rancher || 0;
  if (ranchers > 0) add('fur', `Ranchers: ${ranchers} × 0.035/s`, ranchers * 0.035);
  if (wonderChoice('windmere', 'silence') && explorerCount() > 0) {
    add('knowledge', `Explorers documenting discoveries: ${explorerCount()} × 0.06/s`, explorerCount() * 0.06);
  }
  const localIds = localTribeIds();
  if (tradeAvailable()) add('currency', `Trade with ${localIds.map(id => tribeDef(id).name).join(' and ')}`, 0.05 * localIds.length);
  if (bld('moneyLender') > 0) add('currency', `Money Lenders: ${bld('moneyLender')} × ${state.pop} population × 0.001/s`, bld('moneyLender') * state.pop * 0.001);
  const culturalConquests = localIds.filter(id => state.diplomacy?.[id]?.conquered && state.diplomacy?.[id]?.culturalConquest && !state.unifiedRegion).length;
  if (culturalConquests) add('currency', 'Cultural conquest pressure', -culturalConquests * 0.1);
  if (bld('tradeBlimp') > 0 && dt > 0) {
    for (const [index, order] of tradeBlimpOrders().slice(0, bld('tradeBlimp')).entries()) {
      if (!order || !TRADE_MODES.includes(order.mode) || !TRADE_GOODS.includes(order.resource)) continue;
      const rate = tradeRate(order.resource);
      const value = tradeValue(order.resource);
      if (order.mode === 'buy') {
        const currencyAvailable = Math.max(0, state.res.currency + rates.currency * dt);
        const resourceRoom = Math.max(0, capacityOf(order.resource) - state.res[order.resource] - Math.max(0, rates[order.resource]) * dt);
        const fraction = Math.min(1, currencyAvailable / (rate * value * dt), resourceRoom / (rate * dt));
        add(order.resource, `Trade Blimp ${index + 1} buying ${resourceName(order.resource)}`, rate * fraction);
        add('currency', `Trade Blimp ${index + 1} purchase`, -rate * value * fraction);
      } else {
        const resourceAvailable = Math.max(0, state.res[order.resource] + Math.min(0, rates[order.resource]) * dt);
        const currencyRoom = Math.max(0, capacityOf('currency') - state.res.currency - Math.max(0, rates.currency) * dt);
        const fraction = Math.min(1, resourceAvailable / (rate * dt), currencyRoom / (rate * value * 0.5 * dt));
        add(order.resource, `Trade Blimp ${index + 1} selling ${resourceName(order.resource)}`, -rate * fraction);
        add('currency', `Trade Blimp ${index + 1} sale`, rate * value * 0.5 * fraction);
      }
    }
  }
  if (bld('surveyFlights') > 0 && dt > 0) {
    const output = bld('surveyFlights') * 0.05;
    const inputs = { aether: bld('surveyFlights') * 0.02, aluminum: bld('surveyFlights') * 0.02, machinery: bld('surveyFlights') * 0.01 };
    let fraction = 1;
    for (const r in inputs) fraction = Math.min(fraction, Math.max(0, state.res[r] + Math.min(0, rates[r]) * dt) / (inputs[r] * dt));
    for (const r in inputs) add(r, `Survey Flights fuel: ${bld('surveyFlights')} plane${bld('surveyFlights') === 1 ? '' : 's'}`, -inputs[r], [['Survey Flight utilization', fraction]]);
    state.surveyFlightRate = output * Math.max(0, fraction);
  }
  if (bld('blackGoldDrill') > 0 && dt > 0) {
    const output = bld('blackGoldDrill') * 0.04;
    const room = Math.max(0, capacityOf('oil') - state.res.oil - Math.max(0, rates.oil || 0) * dt);
    const fraction = Math.min(1, room / (output * dt));
    rates.oil = (rates.oil || 0) + output * fraction;
  }
  if (era() >= 2) add('copper', 'Stone age trace deposits', 0.02);

  // per-resource modifiers
  scale('food', [...globalProductionFactors('food'), [`${SEASONS[seasonIndex()].name}${trialActive('longnight') ? ' (Long Night)' : perm('everwarm') ? ' (Everwarm)' : ''}`, seasonMult()],
    ['Forager Lodges', 1 + 0.10 * bld('foragerLodge')], ['Aqueducts', 1 + 0.20 * bld('aqueduct')],
    ['Echoes of Harvest', 1 + 0.01 * upg('echoesOfHarvest')],
    ['Scarcity completions', 1 + 0.10 * trialCount('scarcity')], ['Scarcity trial', trialActive('scarcity') ? trialDifficulty('scarcity') : 1],
    ['Restored River Crown', wonderChoice('floodmeadows', 'restore') ? 1.20 : 1]]);
  for (const j in JOBS) {
    const job = JOBS[j], n = state.jobs[j] || 0;
    if (!n || job.targeted) continue;
    if (job.winterproof) add('food', `${jobName(j)} hunting: ${j === 'guard' ? ableGuards() : n}/${n} able, winterproof`, (j === 'guard' ? ableGuards() : n) * job.base,
      [...global, ['Weaponry', tech('weaponry') ? 1.50 : 1], ['Weapon Efficiency', tech('weaponEfficiency') ? 1.75 : 1],
        ...(j === 'guard' && challenges.includes('dryGround') ? [['Dry Ground (Guards)', 0.55]] : [])], j === 'guard' ? 'guard' : null);
  }
  scale('wood', [...global, ['Lumber Yards', 1 + 0.10 * bld('lumberYard')],
    ['Echoes of Timber', 1 + 0.01 * upg('echoesOfTimber')],
    ['Tree Husbandry', tech('treeHusbandry') ? 1.20 : 1],
    ['Old Forest', expDone('oldForest') ? 1.15 : 1],
    ['Restored Worldroot', wonderChoice('greenfold', 'restore') ? 1.25 : 1],
    ['Scarcity trial', trialActive('scarcity') ? scarcityWoodMultiplier() : 1]]);
  scale('stone', [...global, ['Stone Works', 1 + 0.10 * bld('stoneWorks')], ['Echoes of Stone', 1 + 0.01 * upg('echoesOfStone')], ['Foothills', expDone('foothills') ? 1.15 : 1]]);
  scale('knowledge', [...global, ['Libraries', 1 + 0.10 * bld('library')], ['Writing', tech('writing') ? 1.25 : 1],
    ['Sunken Ruins', expDone('sunkenRuins') ? 1.15 : 1], ['Oral Tradition', perm('oralTradition') ? 1.5 : 1],
    ['Restored Mirrored Orrery', wonderChoice('windmere', 'restore') ? 1.20 : 1], ['Silence trial', trialActive('silence') ? 0 : 1]]);
  // Ancestral Blessing is a flat bonus, so unrelated global production
  // multipliers (such as achievement completion) do not change its value.
  if (state.ancestralBlessing && !trialActive('silence')) add('knowledge', 'Smiling ancestors', 0.33);
  scale('iron', [...global, ['Ember Vein', expDone('emberVein') ? 1.10 : 1]]);
  scale('copper', [...global, ['Copper Prospecting', tech('copperProspecting') ? 1.75 : 1],
    ['Metallurgy', tech('metallurgy') ? 2 : 1], ['Electrical Engineering', tech('electricalEngineering') ? 1.5 : 1]]);
  scale('aether', [...global, ['Glacial Peaks', expDone('glacialPeaks') ? 1.10 : 1],
    ['Restored Mirrored Orrery', wonderChoice('windmere', 'restore') ? 1.20 : 1]]);
  scale('coal', [...globalProductionFactors('coal'), ['Restored Renewal Basin', wonderChoice('ashfen', 'restore') ? 1.15 : 1]]);
  scale('tools', [...global, ['Restored Renewal Basin', wonderChoice('ashfen', 'restore') ? 1.25 : 1]]);
  scale('currency', global);
  if (trialActive('industrialization')) {
    scale('coal', [['Industrialization trial', INDUSTRIALIZATION_COAL_MULTIPLIER]]);
  }

  if (bld('steamPlant') > 0) {
    const steamPower = POWER_PER_STEAM_PLANT + (wonderChoice('emberplain', 'silence') ? 1 : 0);
    add('power', `Steam Plants: ${bld('steamPlant')} × ${steamPower} capacity`, bld('steamPlant') * steamPower);
    const steamCount = woodForCoalCount('steamPlant', bld('steamPlant'));
    const coalFuel = bld('steamPlant') - steamCount;
    const woodFuel = steamCount * 5;
    if (coalFuel) add('coal', `Steam Plant fuel: ${coalFuel} × 0.8/s`, -coalFuel * 0.8);
    if (woodFuel) add('wood', `Steam Plant fuel: ${steamCount} × 4/s`, -woodFuel * 0.8);
  }
  if (bld('oilPowerPlant') > 0) {
    add('power', `Oil Power Plants: ${bld('oilPowerPlant')} × ${POWER_PER_OIL_PLANT} capacity`, bld('oilPowerPlant') * POWER_PER_OIL_PLANT);
    add('oil', `Oil Power Plant fuel: ${bld('oilPowerPlant')} × ${OIL_PLANT_FUEL_RATE}/s`, -bld('oilPowerPlant') * OIL_PLANT_FUEL_RATE);
  }
  if (bld('dynamo') > 0) add('power', `Dynamos: ${bld('dynamo')} × 1.5 capacity`, bld('dynamo') * 1.5);
  if (bld('windDevice') > 0) add('power', `Wind Devices: ${bld('windDevice')} × ${POWER_PER_WIND_DEVICE} capacity`, bld('windDevice') * POWER_PER_WIND_DEVICE);
  if (bld('solarArray') > 0) add('power', `Solar Arrays: ${bld('solarArray')} × ${POWER_PER_SOLAR_ARRAY} capacity`, bld('solarArray') * POWER_PER_SOLAR_ARRAY);
  if (power.livingBlock) add('power', `Living Blocks: ${power.livingBlock} × ${LIVING_BLOCK_POWER_REQUIREMENT} capacity`, -power.livingBlock * LIVING_BLOCK_POWER_REQUIREMENT);
  // The land, lineage, and civic choices shape output; population upkeep is
  // applied afterward so food policies do not alter how much villagers eat.
  for (const r in rates) {
    const incomeFactors = settlementProductionFactors(r);
    const outgoingFactors = settlementProductionFactors(r, true);
    const incomeMultiplier = incomeFactors.reduce((value, [, factor]) => value * factor, 1);
    const guardMultiplier = incomeFactors.filter(([label]) => label !== 'Dry Ground')
      .reduce((value, [, factor]) => value * factor, 1);
    const guardAmount = guardIncome[r] || 0;
    incomeRates[r] = (incomeRates[r] - guardAmount) * incomeMultiplier + guardAmount * guardMultiplier;
    outgoingRates[r] *= outgoingFactors.reduce((value, [, factor]) => value * factor, 1);
    rates[r] = incomeRates[r] + outgoingRates[r];
    if (breakdown) for (const entry of breakdown[r]) {
      const factors = entry.base < 0 ? outgoingFactors : entry.source === 'guard' ? incomeFactors.filter(([label]) => label !== 'Dry Ground') : incomeFactors;
      entry.amount = factors.reduce((value, [, factor]) => value * factor, entry.amount);
      entry.factors.push(...factors.filter(([, factor]) => factor !== 1));
    }
  }
  // Guard upkeep is a fixed food cost. Apply it after settlement production
  // modifiers so landing and civic food bonuses do not increase consumption.
  for (const j in JOBS) {
    const job = JOBS[j], n = state.jobs[j] || 0;
    if (n && job.upkeep) add('food', `${jobName(j)} upkeep: ${n} × ${job.upkeep}/s`, -n * job.upkeep);
  }
  const calamity = activeWonderCalamity();
  if (calamity?.amount) add(calamity.resource, calamity.name, -calamity.amount);
  for (const [id, active] of Object.entries(poweredSites)) {
    if (active) add('power', `${BUILDING_BY_ID.get(id).name}: ${active} × ${DIG_SITE_POWER} capacity`, -active * DIG_SITE_POWER);
  }
  // Reserve inputs after other consumption; bonuses affect output, not costs.
  // Forges are independent production buildings: each one smelts Steel
  // continuously, using fixed amounts of Iron and Coal. Keep this after the
  // settlement scaling pass so expedition bonuses affect supply, not recipe
  // costs; the factory below can still account for Forge consumption.
  const activeForges = power.forge;
  if (activeForges > 0 && dt > 0) {
    const rate = 0.04;
    const inputs = inputCosts({ iron: 0.6 * activeForges, coal: 0.4 * activeForges }, 'forge', activeForges);
    const factors = forgeProductionFactors();
    const output = factors.reduce((value, [, factor]) => value * factor, activeForges * rate);
    let fraction = Math.min(1, Math.max(0, capacityOf('steel') - state.res.steel) / (output * dt));
    let limitation = fraction < 1 ? 'Steel storage space' : 'Forge utilization';
    for (const r in inputs) {
      const available = Math.max(0, state.res[r] + Math.min(0, rates[r]) * dt);
      const supplied = available / (inputs[r] * dt);
      if (supplied < fraction) limitation = `${resourceName(r)} shortage`;
      fraction = Math.min(fraction, supplied);
    }
    add('steel', `Forges: ${activeForges} active × ${rate}/s`, activeForges * rate, [...factors, [limitation, fraction]]);
    for (const r in inputs) add(r, `Forge inputs: ${activeForges} active × ${inputs[r] / activeForges}/s`, -inputs[r], [[limitation, fraction]]);
  }

  if (bld('factory') > 0 && dt > 0) {
    const activeFactories = power.factory;
    const selectedRecipes = factoryRecipes();
    for (const recipe of selectedRecipes.map(id => FACTORY_RECIPE_BY_ID.get(id))) {
      const assignedFactories = activeFactories / selectedRecipes.length;
      const factors = [...global, ...settlementProductionFactors(recipe.id)];
      const lightningMetal = recipe.id === 'steel' && tech('lightningMetal');
      const recipeFactor = lightningMetal ? 1.5 : 1;
      const runningHot = 1 + 0.5 * upg('runningHot');
      const output = factors.reduce((value, [, factor]) => value * factor, assignedFactories * recipe.rate * recipeFactor * runningHot);
      const inputs = inputCosts(Object.fromEntries(Object.entries(recipe.inputs).map(([resource, amount]) =>
        [resource, amount * recipeFactor * assignedFactories * runningHot])), 'factory', assignedFactories);
      const recipeFactors = [...(lightningMetal ? [...factors, ['Lightning Metal', recipeFactor]] : factors), ['Running Hot', runningHot]];
      let fraction = output > 0 ? Math.min(1, Math.max(0, capacityOf(recipe.id) - state.res[recipe.id]) / (output * dt)) : 0;
      let limitation = fraction < 1 ? `${recipe.name} storage space` : 'Factory utilization';
      for (const r in inputs) {
        const available = Math.max(0, state.res[r] + Math.min(0, rates[r]) * dt);
        const supplied = assignedFactories ? available / (inputs[r] * dt) : 0;
        if (supplied < fraction) limitation = `${resourceName(r)} shortage`;
        fraction = Math.min(fraction, supplied);
      }
      if (activeFactories < bld('factory')) {
        limitation = buildingPowerCount('factory') < bld('factory') ? 'Power disabled' : 'Power shortage';
        if (!activeFactories) fraction = 0;
      }
      add(recipe.id, `Factories (${recipe.name}): ${assignedFactories} active × ${recipe.rate}/s`, assignedFactories * recipe.rate * runningHot, [...recipeFactors, [limitation, fraction]]);
      for (const r in inputs) add(r, `Factory inputs (${recipe.name}): ${assignedFactories} active × ${inputs[r] / assignedFactories}/s`, -inputs[r], [
        ...(lightningMetal ? [['Lightning Metal', recipeFactor]] : []), ['Running Hot', runningHot], [limitation, fraction]]);
    }
  }
  if (state.pop) add('food', `Villager upkeep: ${state.pop} × ${FOOD_PER_POP}/s`, -state.pop * FOOD_PER_POP);
  return rates;
}

// Return the current effective output of one worker in a job.  This uses the
// same production pipeline as the UI, including global, settlement, and
// resource-specific multipliers, so automation can avoid assigning workers to
// jobs that are currently producing nothing (for example during Silence).
function jobProduction(jobId) {
  const job = JOBS[jobId];
  if (!job || !job.res || !Number(job.base) || job.targeted) return 0;
  const previous = Number(state.jobs[jobId] || 0);
  state.jobs[jobId] = previous + 1;
  const breakdown = {};
  production(0, breakdown);
  state.jobs[jobId] = previous;
  const resultResource = job.factoryLike && tinkererFactoryAvailable() ? factoryRecipe().id : job.res;
  const name = jobName(jobId);
  const entry = (breakdown[resultResource] || []).find(item => item.label.startsWith(`${name}:`) ||
    item.label.startsWith(`${name} (`) || item.label.startsWith(`${name}s (`));
  return entry ? entry.amount / (previous + 1) : 0;
}

function resourceRateTooltip(resource, rate, entries) {
  const number = value => Number(value.toFixed(4)).toString();
  const signed = value => `${value > 0 ? '+' : ''}${number(value)}/s`;
  const power = resource.id === 'power';
  if (power) {
    const capacityAmount = value => `${value > 0 ? '+' : ''}${number(value)} capacity`;
    const generated = entries.filter(entry => entry.base > 0)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const allocated = entries.filter(entry => entry.base < 0)
      .reduce((sum, entry) => sum - entry.amount, 0) +
      powerAllocation().factory * factoryPowerRequirement();
    const remaining = Math.max(0, generated - allocated);
    return [
      `${resource.name} — ${number(remaining)} capacity remaining`,
      'Capacity is provided by generators and allocated to enabled buildings; it does not drain.',
      '',
      `Generated: ${number(generated)} capacity`,
      `Allocated: ${number(allocated)} capacity`,
      `Remaining: ${number(remaining)} capacity`,
      '',
      ...entries.map(entry => `${entry.base > 0 ? 'Generated' : 'Allocated'}: ${entry.label}: ${capacityAmount(entry.amount)}`),
    ].join('\n');
  }
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
    if (!power && isFull(resource.id) && rate > 0) lines.push('', 'Storage full: excess net income is wasted.');
  if (state.res[resource.id] <= 0 && rate < 0) lines.push('', 'Store empty: the shortfall cannot be deducted below zero.');
  return lines.join('\n');
}

function hospitalTimeMod() { return Math.pow(0.9, bld('hospital')); }
function popGrowthNeed() {
  const lineageGrowth = lineageDef(state.species).growthTime || 1;
  const growthTrait = lineageDef(state.species).growthTrait;
  const atavisticGrowth = lineageTraitModifier(lineageGrowth, growthTrait ? lineageTraitLevel(growthTrait) : 1) * lineageSpecialValue('growthTime');
  return (20 + state.pop * 4) * 0.67 * (tech('aphrodisiac') ? 0.75 : 1) * hospitalTimeMod() * atavisticGrowth / moraleMult();
}
function populationGrowthTime() {
  return popGrowthNeed() * currentPlaceTraits().reduce((time, trait) => time * (trait.growth || 1), 1);
}
function populationGrowthTooltip() {
  const base = 20 + state.pop * 4;
  const lineageGrowth = lineageDef(state.species).growthTime || 1;
  const growthTrait = lineageDef(state.species).growthTrait;
  const effectiveLineageGrowth = lineageTraitModifier(lineageGrowth, growthTrait ? lineageTraitLevel(growthTrait) : 1);
  const atavistic = growthTrait && effectiveLineageGrowth !== lineageGrowth;
  const growthTraits = currentPlaceTraits().filter(trait => trait.growth && trait.growth !== 1);
  const lines = [
    `Population growth — ${fmt(populationGrowthTime())} seconds per new villager`,
    'Time modifiers multiply in order.',
    '',
    `Base: 20 + ${state.pop} villagers × 4 = ${fmt(base)} seconds`,
    `Settlement pace: ×0.67 → ${fmt(base * 0.67)} seconds`,
  ];
  let time = base * 0.67;
  if (tech('aphrodisiac')) {
    time *= 0.75;
    lines.push(`Fertility Rites: ×0.75 → ${fmt(time)} seconds`);
  }
  if (bld('hospital')) {
    time *= hospitalTimeMod();
    lines.push(`Hospitals (${bld('hospital')}): ×${fmt(hospitalTimeMod())} → ${fmt(time)} seconds`);
  }
  if (effectiveLineageGrowth !== 1) {
    time *= effectiveLineageGrowth;
    lines.push(`${lineageDef(state.species).name}${atavistic ? ' with Atavistic Aura' : ''}: ×${fmt(effectiveLineageGrowth)} → ${fmt(time)} seconds`);
  }
  time /= moraleMult();
  lines.push(`Morale growth speed: ÷${fmt(moraleMult())} → ${fmt(time)} seconds`);
  for (const trait of growthTraits) {
    time *= trait.growth;
    lines.push(`${trait.name}: ×${fmt(trait.growth)} → ${fmt(time)} seconds`);
  }
  return lines.join('\n');
}
function guardHealingNeed() { return 90 * hospitalTimeMod(); }

// ---------- log ----------
function logCategory(text) {
  const value = String(text).toLowerCase();
  if (/spy|espionage/.test(value)) return 'espionage';
  if (/research complete|research completed|wonder research completed|technology/.test(value)) return 'research';
  if (/raid|attack|siege|guard|injur|killed|die|combat|riot/.test(value)) return 'combat';
  if (/queue|queued/.test(value)) return 'queue';
  // Match construction terminology as words. In particular, ordinary event
  // text such as "Beaverkin builders" must remain in the Events category.
  if (/completed \(\d+\)|\b(?:build|built|building|construction|beacon)\b/.test(value)) return 'building';
  if (/achievement/.test(value)) return 'achievements';
  if (/chronicle resumes|village has grown|era|migration|expedition returned|saved|imported|exported/.test(value)) return 'progress';
  return 'events';
}

function logMatchesFilter(entry, filter) {
  return filter === 'all' || (entry.k || logCategory(entry.t)) === filter;
}

function addLog(text, cls) {
  const category = logCategory(text);
  const entry = { d: Math.floor(state.day), t: text, c: cls || '', k: category, n: ++state.logSequence };
  state.logs[category] ||= [];
  state.logs[category].unshift(entry);
  if (state.logs[category].length > LOG_LIMIT_PER_CATEGORY) state.logs[category].length = LOG_LIMIT_PER_CATEGORY;
  state.log = allLogEntries();
}

function allLogEntries(source = state) {
  return LOG_CATEGORIES.flatMap(category => source.logs?.[category] || [])
    .sort((a, b) => (b.n || 0) - (a.n || 0));
}

// ---------- trials ----------
function startTrial(id) {
  if (state.trial || state.migrating) return;
  const def = TRIAL_BY_ID.get(id);
  if (!def) return;
  if (def.repeat > 0 && trialCount(id) >= trialMax(def)) return;
  if (def.repeat === 0 && trialCount(id) > 0) return;
  if (def.req && !def.req()) return;
  if (!confirm(`Start ${def.name}? This restarts your migration in the same location with the same lineage, upgrades, and governance settings. Your village, resources, and jobs reset to migration starting values; permanent progress is kept. You will receive the migration Echoes due from your village immediately, since there will be no chance to spend them first. All four difficulty options will be turned on for the trial and will remain active until it ends. Continue?`)) return;
  const earned = echoesEarned([]);
  state.echoes += earned;
  state.migrationChallenges = MIGRATION_CHALLENGES.map(challenge => challenge.id);
  state.badAncestry = rollBadAncestry(state.species);
  setOut(id);
  addLog(`The village swears the ${def.name}. The migration's deeds grant ${earned} Echo${earned === 1 ? '' : 'es'} immediately. ${trialModifierText(def)}`, 'log-important');
  saveGame(true);
}

function endTrial(success) {
  if (!state.trial) return;
  const def = TRIAL_BY_ID.get(state.trial.id);
  if (success) {
    state.trialDone[def.id] = trialCount(def.id) + 1;
    updateAchievements(['trialist']);
    addLog(`${def.name} complete! ${def.reward}`, 'log-good');
  } else {
    addLog(`${def.name} failed. The oath is broken, but oaths can be sworn again.`, 'log-bad');
  }
  if (def.id === 'newLands' && !success) {
    state.queues.build = state.queues.build.filter(entry => entry.id !== 'greatMigrationStage');
    state.greatMigrationProgress = 0;
  }
  state.trial = null;
  state.migrationChallenges = [];
  state.badAncestry = null;
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
      if ((tr.steelProduced || 0) >= 100) { endTrial(true); return; }
      break;
    case 'longnight':
      if (tr.daysActive >= LONG_NIGHT_DURATION) { endTrial(true); return; }
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
      if (tr.daysActive >= 240) { endTrial((state.jobs.tinkerer || 0) > 0); return; }
      break;
    case 'wayfinding':
      if (expDone('oldForest')) { endTrial(true); return; }
      break;
    case 'industrialization':
      if (state.res.goods >= 100) { endTrial(true); return; }
      break;
    case 'whiteout':
      if (state.res.food <= 0) { endTrial(false); return; }
      if (tr.daysActive >= WHITEOUT_DURATION) { endTrial(true); return; }
      break;
    case 'haste':
      if (state.era >= 5) { endTrial(true); return; }
      if (tr.daysActive > 20000) { endTrial(false); return; }
      break;
    case 'conquest':
      if ((tr.targets || []).length && tr.targets.every(id => state.diplomacy?.[id]?.conquered)) { endTrial(true); return; }
      break;
    case 'newLands':
      if (bld('greatMigration') > 0) { endTrial(true); return; }
      break;
  }
}

function updateDiplomacy(dt) {
  if (!state.diplomacy) return;
  const relationsLocked = conquestTrialRelationsLocked();
  for (const id of localTribeIds()) {
    if (!localTribe(id) || !state.diplomacy[id]) continue;
    const entry = state.diplomacy[id];
    if (entry.conquered) continue;
    const nudged = relationsLocked ? 0 : diplomatCount(id) * 0.05 * dt;
    if (nudged) improveDisposition(entry, nudged);
  }
  if (Object.values(state.diplomacy).some(entry => entry.disposition >= 80 || entry.conquered))
    updateAchievements(['diplomat']);
  if (state.guardInjuries > 0) state.guardInjuries = Math.max(0, state.guardInjuries - dt / guardHealingNeed());
  if (relationsLocked) return;
  state.diplomacyEventT = (state.diplomacyEventT || 0) + dt;
  if (state.diplomacyEventT < 180) return;
  state.diplomacyEventT = 0;
  const ids = localTribeIds().filter(id => state.diplomacy[id] && !state.diplomacy[id].conquered);
  if (!ids.length) return;
  const id = ids[Math.floor(Math.random() * ids.length)];
  const entry = state.diplomacy[id];
  const tribe = tribeDef(id);
  if (entry.disposition < 0 && Math.random() < 0.45) {
    resolveTribeRaid(id);
    return;
  }
  const delta = Math.random() < 0.55 ? 5 + Math.floor(Math.random() * 6) : -(2 + Math.floor(Math.random() * 3));
  if (delta > 0) improveDisposition(entry, delta);
  else entry.disposition = Math.max(-100, entry.disposition + delta);
  if (entry.disposition >= 80) updateAchievements(['diplomat']);
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
  const defense = (able + wounded * 0.5 + armed * 0.9) * governanceDefenseMod() * lineageRaidDefenseMod();
  // Incoming raids should create pressure without deleting a settlement's
  // entire military investment.  Hostility still matters, but the old power
  // curve made a merely adequate garrison pay an outsized price on a loss.
  const raidPower = (militaryStrength(entry) / 20 + (50 - entry.disposition) / 20 + Math.random() * 4) * 0.8;
  if (defense >= raidPower) {
    if (!conquestTrialRelationsLocked()) entry.disposition = Math.max(-100, entry.disposition - 2);
    if (isMephit()) state.diplomacyEventT = -mephitRaidDelay();
    addLog(`The ${tribe.name} test Emberhold's walls, but ${able} able Guard${able === 1 ? '' : 's'} drive them off.`, 'log-good');
    return;
  }
  const margin = raidPower - defense;
  // Mephit's extra injury rule belongs to attacking Mephit settlements;
  // their own defenders should benefit from the lineage rather than suffer it.
  const harm = 1;
  const deathMult = Math.max(0.15, 1 - armorLevel() * 0.08);
  const deaths = Math.min(able, Math.floor(margin / 7 * deathMult));
  const injuries = Math.min(Math.max(0, able - deaths), Math.max(1, Math.ceil(margin / 4 * harm)));
  state.jobs.guard = Math.max(0, (state.jobs.guard || 0) - deaths);
  state.migrationGuardDeaths = (state.migrationGuardDeaths || 0) + deaths;
  state.guardInjuries = Math.min(ableGuards(), (state.guardInjuries || 0) + injuries);
  const lootPool = ['food', 'wood', 'stone', 'tools', 'copper', 'iron', 'coal', 'steel', 'currency']
    .filter(r => (state.res[r] || 0) > 0);
  const loot = [];
  for (let i = 0; i < Math.min(2, lootPool.length); i++) {
    const pick = lootPool.splice(Math.floor(Math.random() * lootPool.length), 1)[0];
    const amount = Math.min(state.res[pick], Math.max(5, Math.floor(state.res[pick] * (0.05 + margin * 0.01))));
    state.res[pick] -= amount;
    loot.push(`${fmt(amount)} ${resourceName(pick)}`);
  }
  if (!conquestTrialRelationsLocked()) entry.disposition = Math.max(-100, entry.disposition - 6);
  if (isMephit()) state.diplomacyEventT = -mephitRaidDelay();
  addLog(`The ${tribe.name} raid Emberhold! ${deaths} Guard${deaths === 1 ? '' : 's'} die${deaths === 1 ? 's' : ''}, ${injuries} suffer injuries, and they make off with ${loot.join(' and ') || 'nothing'}.`, 'log-bad');
}

function trialProgressText() {
  if (!state.trial) return '';
  const tr = state.trial;
  switch (tr.id) {
    case 'scarcity': case 'longnight':
      return `${Math.floor(tr.daysActive)} / ${tr.id === 'scarcity' ? 240 : tr.id === 'longnight' ? LONG_NIGHT_DURATION : DAYS_PER_YEAR} days endured`;
    case 'frugality': return `${tr.buildings} / 12 buildings raised`;
    case 'expansion': return `${tr.buildings} / 8 buildings raised`;
    case 'scholarship': return `${tr.researches || 0} / 5 research projects completed`;
    case 'silence': return `${fmt(tr.steelProduced || 0)} / 100 Steel produced after Metallurgy`;
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
    case 'tinkering': return `${Math.floor(tr.daysActive)} / 240 days endured — ${state.jobs.tinkerer || 0} Tinkerer assigned (at least 1 must still be assigned when the 240 days run out)`;
    case 'wayfinding': return expDone('oldForest') ? 'The Old Forest has been mapped.' : 'The Old Forest expedition must return';
    case 'industrialization': return `${fmt(state.res.goods)} / 100 Industrial Goods — no deadline; coal production 20%`;
    case 'whiteout': return `${Math.floor(tr.daysActive)} / ${WHITEOUT_DURATION} days endured — food must never run out`;
    case 'haste': return `${Math.floor(tr.daysActive)} / 20000 days to reach the Age of Light`;
    case 'conquest': return `${(tr.targets || []).filter(id => state.diplomacy?.[id]?.conquered).length} / ${(tr.targets || []).length} nations conquered`;
    case 'newLands': return `${greatMigrationProgress()} / ${GREAT_MIGRATION_STAGE_COUNT} stages completed — reach the Age of Light and build Trade Blimps again`;
  }
  return '';
}

// ---------- migration (the loop) ----------
function projectProgress(id) {
  return Math.max(0, Math.min(100, Math.floor(state.projects?.[id] || 0)));
}

function projectPartCost(project) {
  return project.total / 100;
}

function advanceResourceProject(id, parts = 1) {
  const project = RESOURCE_PROJECT_BY_ID.get(id);
  if (!project || !Number.isFinite(parts) || parts < 1) return 0;
  state.projects = state.projects || {};
  let completed = 0;
  const cost = projectPartCost(project);
  while (completed < Math.floor(parts) && projectProgress(id) < 100 &&
      (state.res[project.resource] || 0) >= cost) {
    state.res[project.resource] -= cost;
    state.projects[id] = projectProgress(id) + 1;
    completed++;
  }
  if (completed && projectProgress(id) === 100)
    addLog(`${project.name} are complete.`, 'log-good');
  return completed;
}

function autoFillMigrationSupplies() {
  if (!state.migrating || !state.migrationPreparation || !upg('knownTask')) return;
  // Commit the available matching stores in whole 1% steps, including output
  // that was produced during this simulation step.
  for (const project of RESOURCE_PROJECTS) advanceResourceProject(project.id, 100);
}

function migrationPreparationComplete() {
  return RESOURCE_PROJECTS.every(project => projectProgress(project.id) >= 100);
}

function prepareMigration(id, parts = 1) {
  if (!state.migrating || !state.migrationPreparation) return 0;
  return advanceResourceProject(id, parts);
}

function beginMigration() {
  if (!canMigrate()) return;
  state.pendingEchoMultiplier = 1;
  state.pendingEchoes = echoesEarned([]);
  state.echoes += state.pendingEchoes;
  state.pendingSpecies = state.species;
  state.pendingLandings = landingChoicesForMigration();
  state.pendingLanding = (state.pendingLandings.find(l => lineageSelectable(state.pendingSpecies, l.id)) || state.pendingLandings[0]).id;
  state.migrationPreparation = true;
  state.projects = Object.fromEntries(RESOURCE_PROJECTS.map(project => [project.id, 0]));
  state.pendingMigrationChallenges = [];
  state.pendingBadAncestry = null;
  state.migrating = true;
  addLog(`The Great Migration is declared. The deeds of ${state.pop} villagers will echo: ${state.pendingEchoes} Echo${state.pendingEchoes === 1 ? '' : 's'} gained. Spend them before setting out.`, 'log-important');
}

function beginSoftReset() {
  if (state.migrating) return;
  if (!window.confirm('Begin a soft reset? This ends the current settlement and any active trial without granting Echoes or other rewards. You will receive migration choices and can set out immediately. Continue?')) return;
  state.pendingEchoes = 0;
  state.pendingEchoMultiplier = 1;
  state.pendingSpecies = state.species;
  state.pendingLandings = landingChoicesForMigration();
  state.pendingLanding = (state.pendingLandings.find(l => lineageSelectable(state.pendingSpecies, l.id)) || state.pendingLandings[0]).id;
  // A voluntary soft reset does not make the player rebuild provisions before
  // leaving. The migration choices remain, but the road is ready immediately.
  state.migrationPreparation = false;
  state.projects = {};
  state.pendingMigrationChallenges = [];
  state.pendingBadAncestry = null;
  state.migrating = true;
  addLog('A soft reset is declared. No Echoes or rewards are gained; choose a new road and set out when ready.', 'log-important');
  saveGame(true);
}

function landingChoicesForMigration() {
  const available = availableLandings().filter(l => l.id !== state.landing);
  const draw = () => {
    const landing = available.splice(Math.floor(Math.random() * available.length), 1)[0];
    return { ...landing, traits: traitsForLanding(landing.id) };
  };
  const choices = [draw()];
  const costs = [3, 9, 27];
  let points = state.surveyPoints || 0;
  for (const cost of costs) {
    if (points < cost || choices.length >= 4 || !available.length) break;
    points -= cost;
    choices.push(draw());
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
  const def = UPGRADE_BY_ID.get(id);
  if (!def || !migrationShopOpen()) return;
  if (id === 'farHorizons' && !LINEAGES.some(l => l.id !== 'human' && lineageUnlocked(l.id))) return;
  if (id === 'fearOfTheConqueror' && !fearOfTheConquerorAvailable()) return;
  if (id === 'practicedMigrator' && !practicedMigratorAvailable()) return;
  if (id === 'animalHusbandry' && !animalHusbandryAvailable()) return;
  if (id === 'blackGoldDrills' && !perm('surveyFlights')) return;
  if (def.req && !def.req()) return;
  const lvl = upg(id);
  if (lvl >= def.max) return;
  const cost = upgradeCost(def, lvl);
  if (state.echoes < cost) return;
  state.echoes -= cost;
  state.upgrades[id] = lvl + 1;
}

function buyWonderUnlock(id) {
  const def = WONDER_UNLOCK_BY_ID.get(id);
  if (!def || !state.migrating || wonderUnlock(id) || state.hope < def.cost ||
      (def.req && !def.req())) return false;
  state.hope -= def.cost;
  state.wonderUnlocks[id] = true;
  addLog(`${def.name} purchased with Hope. Its instructions will survive the next founding.`, 'log-good');
  return true;
}

function migrationRefund(id) {
  const def = UPGRADE_BY_ID.get(id);
  if (!def || !migrationShopOpen()) return;
  const lvl = upg(id);
  if (lvl <= 0) return;
  state.upgrades[id] = lvl - 1;
  if (state.upgrades[id] === 0) delete state.upgrades[id];
  state.echoes += upgradeCost(def, lvl - 1);
}

function totalMigrationEchoes() {
  return state.echoes + UPGRADES.reduce((total, u) => {
    const levels = upg(u.id);
    return total + Array.from({ length: levels }, (_, level) => upgradeCost(u, level))
      .reduce((spent, cost) => spent + cost, 0);
  }, 0);
}

function setOut(trialId = null) {
  if (!state.migrating && !trialId) return;
  if (!trialId && state.migrationPreparation && !migrationPreparationComplete()) return;
  if (!trialId && state.rapture?.landing === state.landing && raptureWorkers() > 0) {
    state.rapture.workers = 0;
    resetWonderSection('The migration recalls the last Rapture workers. The active section closes behind them.');
  }
  const settings = trialId ? {
    tradePartner: state.tradePartner,
    tradePartners: [...(state.tradePartners || [state.tradePartner])],
    policy: state.policy,
    policyChangedAt: state.policyChangedAt,
    governor: state.governor, council: [...state.council],
  } : null;
  const selectedLanding = !trialId && (state.pendingLandings || []).find(l => l.id === state.pendingLanding);
  const landing = LANDING_BY_ID.get(trialId ? state.landing : state.pendingLanding) ||
    state.pendingLandings[0] || LANDINGS.find(l => l.id !== state.landing) || LANDINGS[0];
  const ancestralBlessing = !!trialId || !!state.landingsSeen[landing.id];
  const up = { ...state.upgrades };
  const candidate = state.pendingSpecies || state.species;
  if (!trialId && !lineageSelectable(candidate, landing.id)) return;
  if (!trialId) {
    state.migrationChallengePending = true;
    updateAchievements();
  }
  const chosenChallenges = trialId ? [...(state.migrationChallenges || [])] : [...(state.pendingMigrationChallenges || [])];
  if (!trialId && chosenChallenges.includes('badAncestry') && !state.pendingBadAncestry) {
    state.pendingBadAncestry = rollBadAncestry(candidate);
  }
  const chosenBadAncestry = !trialId && chosenChallenges.includes('badAncestry')
    ? (state.pendingBadAncestry || rollBadAncestry(candidate)) : null;
  if (!trialId) {
    // Challenge choices are only a projection while the migration is in
    // progress. Award their bonus once, on departure, without ever changing
    // the spendable pouch when a choice is toggled.
    const echoMultiplier = Number.isFinite(state.pendingEchoMultiplier) ? state.pendingEchoMultiplier : 1;
    state.echoes += echoMultiplier * Math.max(0, echoesEarned(chosenChallenges) - baseEchoesEarned());
  }
  const newSpecies = trialId ? state.species : candidate;
  const unlockedLineages = { ...(state.lineagesUnlocked || { human: true }) };
  const newlyUnlocked = [];
  const newlyUnlockedIds = [];
  const achievementTriggers = [];
  for (const id in (trialId ? {} : state.diplomacy) || {}) {
    if ((state.diplomacy[id].disposition >= 80 || state.diplomacy[id].conquered) && LINEAGES.some(l => l.id === id)) {
      if (!unlockedLineages[id]) { newlyUnlocked.push(lineageDef(id).name); newlyUnlockedIds.push(id); }
      unlockedLineages[id] = true;
      achievementTriggers.push(`lineage-${id}`);
    }
  }
  const lineageQualificationRatings = { ...(state.lineageQualificationRatings || {}) };
  const qualifyingLineages = new Set(newlyUnlockedIds);
  if (LINEAGES.some(lineage => lineage.id === newSpecies)) qualifyingLineages.add(newSpecies);
  const setOutRating = Math.max(1, chosenChallenges.length);
  for (const id of qualifyingLineages) {
    lineageQualificationRatings[id] = Math.max(Number(lineageQualificationRatings[id]) || 0, setOutRating);
    achievementTriggers.push(`lineage-${id}`, 'lineage-half', 'lineage-all');
  }
  addLog('The village sets out. The old Emberhold is left to the wind; a new one rises where the ground is kinder.', 'log-important');

  const keep = {
    echoes: state.echoes, upgrades: state.upgrades,
    trialDone: state.trialDone, expeditions: state.expeditions, expeditionRatings: state.expeditionRatings,
    beaconsLit: state.beaconsLit, beaconRevisited: state.beaconRevisited, wonders: state.wonders,
    wonderUnlocks: state.wonderUnlocks,
    hope: state.hope, ancient: state.ancient,
    hopeEver: state.hopeEver, ancientEver: state.ancientEver,
    landingsSeen: state.landingsSeen,
    species: state.species, tribesSeen: state.tribesSeen,
    customLineage: state.customLineage,
    diplomacy: state.diplomacy,
    culturalConquestRatings: state.culturalConquestRatings,
    lineageQualificationRatings,
    achievements: state.achievements,
    migrationChallenges: state.migrationChallenges,
    badAncestry: state.badAncestry,
    commonalityLineages: state.commonalityLineages,
    tutorialDismissed: state.tutorialDismissed,
    settings: { ...state.settings, resetControls: false },
    placeTraits: state.placeTraits,
    won: state.won, savedAt: state.savedAt, bonusTime: state.bonusTime,
    logs: state.logs, logSequence: state.logSequence,
  };
  state = defaultState();
  state.echoes = keep.echoes;
  state.upgrades = keep.upgrades;
  state.trialDone = keep.trialDone;
  state.expeditions = keep.expeditions;
  state.expeditionRatings = keep.expeditionRatings;
  state.beaconsLit = keep.beaconsLit;
  state.beaconRevisited = keep.beaconRevisited;
  state.wonders = keep.wonders;
  state.wonderUnlocks = keep.wonderUnlocks;
  state.hope = keep.hope;
  state.ancient = keep.ancient;
  state.hopeEver = keep.hopeEver;
  state.ancientEver = keep.ancientEver;
  state.landingsSeen = keep.landingsSeen;
  state.species = keep.species;
  state.species = newSpecies;
  state.customLineage = keep.customLineage;
  state.lineagesUnlocked = unlockedLineages;
  state.tribesSeen = keep.tribesSeen;
  state.diplomacy = keep.diplomacy;
  state.culturalConquestRatings = keep.culturalConquestRatings;
  state.lineageQualificationRatings = keep.lineageQualificationRatings;
  state.achievements = keep.achievements;
  state.migrationChallenges = chosenChallenges;
  state.badAncestry = !trialId && chosenChallenges.includes('badAncestry')
    ? chosenBadAncestry : keep.badAncestry;
  state.commonalityLineages = keep.commonalityLineages;
  state.tutorialDismissed = keep.tutorialDismissed;
  state.settings = keep.settings;
  state.won = keep.won;
  state.savedAt = keep.savedAt;
  state.bonusTime = keep.bonusTime;
  state.ancestralBlessing = ancestralBlessing;
  state.logs = keep.logs;
  state.logSequence = keep.logSequence || 0;
  state.log = allLogEntries();
  state.landing = landing.id;
  if (!trialId && state.beaconsLit?.[landing.id]) state.beaconRevisited[landing.id] = true;
  state.placeTraits = trialId ? [...(keep.placeTraits || [])] : [...(selectedLanding?.traits || traitsForLanding(landing.id))];
  state.malformedDanger = malformedBiomeActive(landing.id) ? malformedDangerForTraits(state.placeTraits) : 0;
  state.malformedAttackT = 0;
  state.malformedAttackNext = MALFORMED_ATTACK_INTERVAL[0] + Math.random() * (MALFORMED_ATTACK_INTERVAL[1] - MALFORMED_ATTACK_INTERVAL[0]);
  if (settings) Object.assign(state, settings);
  if (trialId) state.trial = { id: trialId, startDay: state.day, daysActive: 0, buildings: 0 };
  if (trialId === 'conquest') {
    const targets = TRIBES.filter(tribe => habitatAllows(tribe, state.landing)).slice(0, 3);
    state.tradePartners = targets.map(tribe => tribe.id);
    state.tradePartner = state.tradePartners[0];
    state.trial.targets = state.tradePartners;
    for (const [index, id] of state.tradePartners.entries()) {
      state.tribesSeen[id] = true;
      const entry = ensureDiplomacyEntry(id, index);
      entry.disposition = 0;
      entry.conquered = false;
      entry.siegeReady = false;
    }
    addLog('Three nations surround the new Emberhold. Their relations are fixed at 0; only conquest can settle the matter.', 'log-important');
  }
  if (trialId === 'silence') state.trial.steelProduced = 0;
  if (trialId === 'whiteout') {
    // Whiteout begins at the first-blimp milestone so the challenge is about
    // keeping a stranded settlement alive, not replaying the entire tech tree.
    for (const id of [
      'stoneWorking', 'currency', 'guards', 'copperProspecting', 'masonry',
      'craftsmanship', 'deepMining', 'seamMining', 'metallurgy',
      'machineryTech', 'aluminum', 'airControl',
    ]) state.techs[id] = true;
    for (const id of [
      'hut', 'storehouse', 'foragerLodge', 'lumberYard', 'quarry',
      'stoneWorks', 'workbench', 'library', 'barracks', 'deepMine',
      'deepStore', 'coalSeam', 'forge', 'workshop', 'aluminumWorks',
      'steamPlant', 'airControl', 'tradeBlimp',
    ]) state.bld[id] = 1;
    state.airControlProgress = AIR_CONTROL_STAGE_COUNT;
    for (const id of ['stone', 'tools', 'copper', 'iron', 'coal', 'steel', 'machinery', 'aluminum', 'currency'])
      state.seen[id] = true;
    state.res.food = Math.min(capacityOf('food'), 600);
    state.res.currency = Math.min(capacityOf('currency'), 2000);
    state.tradeBlimps = [{ mode: 'buy', resource: 'food' }];
    addLog('The Whiteout cuts Emberhold off from the land. The Trade Blimp is the only lifeline; no Forager can work.', 'log-important');
  }
  for (const t in ERA_GATE) if (state.techs[t] && ERA_GATE[t] > state.era) state.era = ERA_GATE[t];

  state.pop = 4 + 2 * upg('wanderers');
  if (!trialId && chosenChallenges.includes('nothingManual')) {
    state.jobs.tinkerer = 1;
    addLog('Nothing Manual takes hold. One Tinkerer joins the new settlement immediately; additional Tinkerers can be assigned normally.', 'log-important');
  }
  if (upg('practicedMigrator')) {
    state.era = 2;
    state.techs.stoneWorking = true;
    state.pop += 5;
  }
  if (up.lorekeepers) {
    state.bld.library = 1;
    state.res.knowledge = 30;
    state.seen.knowledge = true;
  }
  if (trialId === 'silence') {
    // Silence requires the full prerequisite chain plus Metallurgy, but
    // knowledge production is disabled for the entire trial.
    state.res.knowledge = 1700;
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
  addLog(`The road ends at ${landing.name}. ${landing.text} (${modsHtml(landing).replace(/<[^>]+>/g, '')}) Traits: ${currentPlaceTraits().map(trait => trait.name).join(', ') || 'Unmarked ground'}.`, 'log-important');
  if (!trialId) {
    const tribe = rollTradePartner();
    addLog(`${tribe.name} are encountered nearby. ${tribe.text} Trade will bring funds once Currency is researched.`, 'log-important');
    discoverTradePartners();
  }
  if (newlyUnlocked.length) {
    addLog(`${newlyUnlocked.join(' and ')} lineage${newlyUnlocked.length === 1 ? '' : 's'} may now be chosen at future migrations.`, 'log-good');
  }
  state.migrating = false;
  state.migrationPreparation = false;
  state.projects = {};
  state.pendingEchoes = 0;
  state.pendingEchoMultiplier = 1;
  state.pendingSpecies = null;
  state.pendingLandings = [];
  state.pendingLanding = null;
  state.pendingMigrationChallenges = [];
  state.pendingBadAncestry = null;
  achievementTriggers.push('firstDay');
  if (state.era >= 2) achievementTriggers.push('stoneAge');
  if (state.era >= 5) achievementTriggers.push('beacon');
  updateAchievements(achievementTriggers);
}

const MIGRATION_CHALLENGES = [
  { id: 'dryGround', name: 'Dry Ground', desc: 'Food production is reduced by 90%.' },
  { id: 'badAncestry', name: 'Bad Ancestry', desc: 'Gain a random negative production trait from another ancestry.' },
  { id: 'nothingManual', name: 'Nothing Manual', desc: 'Manual crafting is forbidden; Tinkerers can still work.' },
  { id: 'forgottenTruths', name: 'Forgotten Truths', desc: 'Achievement bonuses operate at 25% power.' },
];
const CHALLENGE_RATING_NAMES = ['unrated', 'wooden', 'copper', 'silver', 'gold'];
function activeMigrationChallenges() {
  // Choices made in the preparation screen are only proposals. Challenge
  // effects begin when setOut commits them to migrationChallenges.
  return state.migrationChallenges || [];
}
function migrationChallengeCount() { return activeMigrationChallenges().length; }
function rollBadAncestry(currentSpecies = state.species) {
  const candidates = [];
  for (const lineage of LINEAGES) {
    if (lineage.id === currentSpecies) continue;
    for (const [resource, modifier] of Object.entries(lineage.mods || {}))
      if (modifier < 1) candidates.push({ lineageId: lineage.id, resource, modifier });
  }
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}
function toggleMigrationChallenge(id) {
  if (!state.migrating || !MIGRATION_CHALLENGES.some(challenge => challenge.id === id)) return;
  const selected = state.pendingMigrationChallenges || (state.pendingMigrationChallenges = []);
  const index = selected.indexOf(id);
  if (index >= 0) selected.splice(index, 1);
  else selected.push(id);
  if (id === 'badAncestry') state.pendingBadAncestry = selected.includes(id) ? rollBadAncestry(state.pendingSpecies || state.species) : null;
  // Keep the projected reward up to date for the migration panel, but do not
  // mutate the current Echo supply. The challenge bonus is awarded on setOut.
  state.pendingEchoes = echoesEarned(selected);
}

function chooseLineage(id) {
  if (!state.migrating || !lineageSelectable(id)) return;
  state.pendingSpecies = id;
}

function beginCustomLineageDraft() {
  state.customLineageDraft = { traits: [] };
}
function chooseCustomLineageTrait(id) {
  const draft = state.customLineageDraft;
  const trait = CUSTOM_LINEAGE_TRAIT_BY_ID.get(id);
  if (!draft || !trait || !customLineageTraitAvailable(trait)) return;
  const index = draft.traits.indexOf(id);
  if (index >= 0) draft.traits.splice(index, 1);
  else {
    if (trait.resource && draft.traits.some(other => CUSTOM_LINEAGE_TRAIT_BY_ID.get(other)?.resource === trait.resource)) return;
    const next = [...draft.traits, id];
    if (customLineageTraitCost(next) > customLineagePoints()) return;
    draft.traits.push(id);
  }
}
function createCustomLineage(name, desc) {
  const draft = state.customLineageDraft;
  if (!draft || !draft.traits.length || customLineageTraitCost(draft.traits) > customLineagePoints()) return false;
  if (name === undefined) name = window.prompt('Name this cultivated lineage:', 'Custom');
  if (name === null) return false;
  name = String(name).trim().slice(0, 40);
  if (!name) return false;
  if (desc === undefined) desc = window.prompt('Describe this lineage:', 'Life shaped in the Prism Womb.');
  if (desc === null) return false;
  state.customLineage = { name, desc: String(desc).trim().slice(0, 240), traits: [...draft.traits] };
  state.customLineageDraft = null;
  state.pendingSpecies = 'custom';
  addLog(`${name} are cultivated in the Prism Womb and will found the next Emberhold.`, 'log-good');
  return true;
}

// ---------- core tick ----------
function advanceRealTime(elapsed, allowBackgroundCatchUp = false) {
  if (saveConflict || state.paused || elapsed <= 0) return;
  // The regular timer is unreliable in a background tab, so it banks delayed
  // time. The dedicated Worker can safely catch up short timer delays.
  if (elapsed > 5 && (!allowBackgroundCatchUp || elapsed > BACKGROUND_CATCH_UP_CAP)) {
    state.bonusTime = Math.min(OFFLINE_CAP, state.bonusTime + elapsed);
    return;
  }
  const bonus = Math.min(state.bonusTime, elapsed);
  state.bonusTime -= bonus;
  tick(elapsed + bonus);
}

function updateGameClock(allowBackgroundCatchUp = false) {
  const now = Date.now();
  if (state.paused) {
    lastGameAt = now;
    return;
  }
  if (lastGameAt !== null) advanceRealTime((now - lastGameAt) / 1000, allowBackgroundCatchUp);
  lastGameAt = now;
}

function startGameClock() {
  // Workers are scheduled more reliably than window timers in background tabs.
  // Date.now() remains authoritative, so a delayed worker message cannot add or
  // lose time; it only wakes the simulation to account for elapsed time.
  if (typeof Worker === 'function') {
    try {
      gameClockWorker = new Worker('js/game-clock.worker.js?v=publish-20260923u0002');
      gameClockWorker.addEventListener('message', () => {
        updateGameClock(true);
        renderBonusTimer();
      });
      gameClockWorker.postMessage({ type: 'start', interval: 250 });
      return;
    } catch (_) {
      gameClockWorker = null;
    }
  }
  setInterval(() => {
    updateGameClock();
    renderBonusTimer();
  }, 250);
}

function togglePause() {
  updateGameClock();
  state.paused = !state.paused;
  lastGameAt = Date.now();
  addLog(state.paused ? 'The chronicle is paused.' : 'The chronicle resumes.', 'log-important');
  saveGame(true);
  render();
}

function tick(dt) {
  if (saveConflict) return;
  // Integrate each day's conditions separately, including during double speed.
  while (dt > 0) {
    const untilTomorrow = (Math.floor(state.day) + 1 - state.day) / DAY_RATE;
    const step = Math.min(dt, untilTomorrow);
    tickStep(step);
    dt -= step;
  }
}

function tickStep(dt) {
  updateAchievements();

  const rates = production(dt);
  const steelBefore = state.res.steel;
  for (const r in rates) {
    if (r === 'power') {
      state.res.power = Math.max(0, rates.power);
      state.seen.power = true;
      continue;
    }
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
  autoFillMigrationSupplies();
  if (trialActive('silence')) {
    state.trial.steelProduced = (state.trial.steelProduced || 0) +
      Math.max(0, state.res.steel - steelBefore);
  }

  advancePlaceTraitEffects(dt);
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

  // Mining is dangerous during the Trial of Scarcity. A single worker can be
  // lost at work per simulation step; scaling the chance by both elapsed time
  // and the number of miners keeps the rate stable during catch-up.
  if (trialActive('scarcity')) {
    const miningJobs = Object.keys(JOBS).filter(id => JOBS[id].mining && (state.jobs[id] || 0) > 0);
    const miningWorkers = miningJobs.reduce((total, id) => total + (state.jobs[id] || 0), 0);
    const lossChance = 1 - Math.pow(1 - scarcityMiningLossChance(), miningWorkers * dt);
    if (state.pop > 1 && miningWorkers > 0 && Math.random() < lossChance) {
      let pick = Math.random() * miningWorkers;
      const job = miningJobs.find(id => (pick -= state.jobs[id] || 0) < 0) || miningJobs[miningJobs.length - 1];
      state.jobs[job] = Math.max(0, (state.jobs[job] || 0) - 1);
      if (state.jobs[job] === 0) delete state.jobs[job];
      state.pop--;
      reconcileWorkers();
      addLog(`${jobName(job)} lost at work. The Ancients watch over Emberhold.`, 'log-bad');
    }
  }

  // growth
  if (state.res.food > 0 && state.pop < popCap()) {
    state.growthT += dt;
    if (state.growthT >= populationGrowthTime()) {
      state.growthT = 0;
      state.pop++;
      if (state.pop % 5 === 0) addLog(`The village has grown to ${state.pop} souls.`, 'log-good');
    }
  }

  updateGuardRecruitment(dt);
  updateTrial(dt);
  updateSpies(dt);
  updateDiplomacy(dt);
  updateRandomEvents(dt);
  updateMalformedThreat(dt);
  updateExploration(dt);
  if (raptureActiveHere() && raptureWorkers() === 0) resetWonderSection('No one remains in the active section. The foothold is lost.');
  updateWonder(dt);
  updateQueues();

  // seasons
  state.day += dt * DAY_RATE;
  const sIdx = seasonIndex();
  const pIdx = seasonIndex(state.day - dt * DAY_RATE);
  if (sIdx !== pIdx) {
    const flavor = {
      Spring: 'Spring returns. The fields wake.',
      Summer: 'High summer. Provisions come easy.',
      Autumn: 'Autumn. The harvest slows.',
      Winter: 'Winter has come. Food grows scarce.',
    };
    addLog(flavor[SEASONS[sIdx].name], SEASONS[sIdx].name === 'Winter' ? 'log-bad' : '');
  }

  // Loss chances are expressed per one-second simulation tick. Scaling the
  // probability keeps offline and double-speed play fair without permitting
  // multiple disappearances from a single trait in one step.
  const vanishChance = 1 - currentPlaceTraits().reduce((survival, trait) =>
    survival * Math.pow(1 - (trait.vanishChance || 0), dt), 1);
  if (state.pop > 1 && vanishChance > 0 && Math.random() < vanishChance) {
    const source = currentPlaceTraits().find(trait => trait.vanishChance);
    state.pop--;
    reconcileWorkers();
    addLog(`Someone simply vanishes near ${source.name}. Taken by the ancestors? Likely. Don't think hard on it.`, 'log-bad');
  }
  updateAchievements();
  emitAutomationEvent('tick', { dt });
}

// ---------- actions ----------
function doBuild(id) {
  if (isWonderObstacleQueueId(id)) return buildWonderObstacle();
  const def = BUILDING_BY_ID.get(id);
  if (!def) return false;
  if (!canBuild(id)) {
    if (trialActive('overflow') && Object.values(STORAGE).some(s => s.bld === id || s.bonus?.bld === id)) {
    addLog('The oath of the Overflow forbids new storage.', 'log-bad');
    }
    return false;
  }
  const cost = buildingCost(def);
  if (!canAfford(cost)) return false;
  payCost(cost);
  applyReclamation(cost);
  const previousCount = bld(id);
  const previousEnabled = state.buildingPower[id];
  state.bld[id] = previousCount + 1;
  const discoveredResource = { alloyMine: 'livingAlloy', heartwoodGrove: 'heartwood', starLens: 'starGlass', ranch: 'fur', blackGoldDrill: 'oil' }[id];
  if (discoveredResource) state.seen[discoveredResource] = true;
  // A new copy joins the allocation only when every existing copy was on.
  // Partial or fully disabled allocations remain the player's choice.
  if (Object.hasOwn(POWER_BUILDINGS, id) && Number.isFinite(previousEnabled) &&
      Math.max(0, Math.min(previousCount, Math.floor(previousEnabled))) >= previousCount) {
    state.buildingPower[id] = previousCount + 1;
  }
  if (state.trial && ['frugality', 'expansion'].includes(state.trial.id)) state.trial.buildings++;
  addLog(`${def.name} completed (${bld(id)}).`);

  if (id === 'beacon') {
    state.won = true;
    state.beaconsLit = state.beaconsLit || {};
    state.beaconsLit[state.landing] = true;
    updateAchievements(['beacon']);
  }
  return true;
}

function doCraft(id) {
  const def = CRAFT_BY_ID.get(id);
  if (!def || !def.req()) return;
  if ((state.migrationChallenges || []).includes('nothingManual')) return;
  if (id === 'tools' && trialActive('tinkering')) return;
  if (!canAfford(def.cost)) return;
  for (const r in def.give) if (isFull(r)) return; // no room in the store
  payCost(def.cost);
  for (const r in def.give) {
    state.res[r] = Math.min(capacityOf(r), state.res[r] + def.give[r] * lineageMod(r));
    state.seen[r] = true;
  }
  if (id === 'steel' && trialActive('silence')) {
    state.trial.steelProduced = (state.trial.steelProduced || 0) + def.give.steel * lineageMod('steel');
  }
}

function nothingManualActive() {
  return !!state?.migrationChallenges?.includes('nothingManual');
}

function doResearch(id) {
  const def = TECH_BY_ID.get(id);
  if (!def || tech(id)) return false;
  if (def.req && !def.req()) return false;
  const cost = researchCost(def);
  if (!canAfford(cost)) return false;
  payCost(cost);
  state.techs[id] = true;
  if (state.trial && state.trial.id === 'scholarship') state.trial.researches = (state.trial.researches || 0) + 1;
  if (id === 'leatherArmor') state.armor = Math.max(armorLevel(), 1);
  if (id === 'chainmail') state.armor = Math.max(armorLevel(), 2);
  addLog(`Research complete: ${def.name}. ${def.desc}`, 'log-good');
  if (ERA_GATE[id] && ERA_GATE[id] > state.era) {
    state.era = ERA_GATE[id];
    addLog(`The village enters the ${ERAS[state.era - 1].name}.`, 'log-important');
    discoverTradePartners();
  }
  return true;
}

function policyChangeCooldown() { return POLICY_CHANGE_COOLDOWN / (upg('adaptableGovernance') ? 2 : 1); }
function policyCooldownRemaining() {
  if (!state.policyChangedAt) return 0;
  return Math.max(0, policyChangeCooldown() - (Date.now() - state.policyChangedAt) / 1000);
}
function choosePolicy(id) {
  const def = CIVIC_BY_ID.get(id);
  if (!tech('civics') || !def || (def.req && !def.req())) return;
  if (state.policy === id || policyCooldownRemaining() > 0) return;
  state.policy = id;
  state.policyChangedAt = Date.now();
  if (id === 'commonality' && state.diplomacy?.[state.tradePartner]?.conquered) {
    state.commonalityLineages = state.commonalityLineages || {};
    state.commonalityLineages[state.tradePartner] = true;
    returnCommonalityGuards(state.tradePartner);
  }
  addLog(`The Civic Hall adopts ${def.name}. ${def.desc}`, 'log-important');
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
  const def = EXPEDITION_BY_ID.get(id);
  if (!def || (expDone(id) && migrationChallengeCount() <= expeditionRating(id))) return false;
  if (def.landing && def.landing !== state.landing) return false;
  if (state.pop < def.reqPop) return false;
  const cost = expeditionCost(def);
  if (!canAfford(cost)) return false;
  payCost(cost);
  state.expeditions[id] = true;
  state.expeditionRatings = state.expeditionRatings || {};
  state.expeditionRatings[id] = Math.max(expeditionRating(id), Math.max(1, migrationChallengeCount()));
  addLog(`Expedition returned: ${def.name} is now part of Emberhold's world. ${def.effect}`, 'log-good');
  if (def.landing && siteExpeditionsComplete()) addLog('All six sites explored! Emberhold gains +5% to all production forever.', 'log-good');
  updateAchievements(['wayfarer']);
  return true;
}

function doAssign(job, delta) {
  const j = JOBS[job];
  if (!j || j.targeted || job === 'guard' || !j.unlock() || !Number.isInteger(delta) || delta === 0) return false;
  const current = Number(state.jobs[job] || 0);
  if (!Number.isInteger(current) || current < 0) return false;
  if (delta > 0 && (delta > unassigned() || current + delta > jobCapacity(job))) return false;
  if (delta < 0 && current + delta < 0) return false;
  state.jobs[job] = current;
  state.jobs[job] += delta;
  if (state.jobs[job] <= 0) delete state.jobs[job];
  return true;
}
function setJob(job, amount) {
  if (!Number.isFinite(amount) || amount < 0 || !JOBS[job] || JOBS[job].targeted || job === 'guard' || !JOBS[job].unlock()) return false;
  const current = Number(state.jobs[job] || 0);
  const target = Math.floor(amount);
  if (target === current) return true;
  if (target > jobCapacity(job) || (target > current && target - current > unassigned())) return false;
  return doAssign(job, target - current);
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
  discoverTradePartners();
}

function doAssignDiplomat(id, delta) {
  if (!tech('diplomacy') || !localTribe(id) || !state.diplomacy || !state.diplomacy[id] ||
      !Number.isInteger(delta) || delta === 0) return false;
  state.diplomats = state.diplomats || {};
  state.diplomats[id] = diplomatCount(id);
  if (delta > 0 && !canAfford(diplomatCost(id))) return false;
  if (delta < 0 && diplomatCount(id) <= 0) return false;
  if (delta > 0) payCost(diplomatCost(id));
  state.diplomats[id] += delta;
  if (state.diplomats[id] <= 0) delete state.diplomats[id];
  return true;
}

function raidLoot(id) {
  const pools = {
    human: ['food', 'wood', 'currency'],
    stonekin: ['stone', 'iron', 'tools'],
    marshfolk: ['food', 'wood', 'copper'],
    skyborn: ['knowledge', 'aether', 'currency'],
    mephit: ['coal', 'tools', 'steel'],
  };
  const loot = [...(tribeDef(id).loot || pools[id] || ['food', 'wood'])];
  if (tech('currency') && !loot.includes('currency')) loot.push('currency');
  return loot;
}

function raidStage(id = 'raid') {
  return RAID_STAGES.find(stage => stage.id === id) || RAID_STAGES[0];
}

function raidUncommonLoot() {
  return [
    tech('currency') ? 'currency' : null,
    tech('craftsmanship') ? 'tools' : null,
    tech('metallurgy') ? 'steel' : null,
  ].filter(Boolean);
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
  state.migrationGuardDeaths = (state.migrationGuardDeaths || 0) + actualDeaths;
  return { deaths: actualDeaths, injuries: healthyInjuries };
}

function predictRaid(id, stageId = 'raid', guardCount = ableGuards()) {
  const entry = state.diplomacy && state.diplomacy[id];
  const stage = raidStage(stageId);
  const limits = guardLimits();
  const deployed = Math.max(0, Math.min(limits.maximum, Math.floor(Number(guardCount) || 0)));
  const targetIsMephit = id === 'mephit';
  const difficulty = (militaryStrength(entry) / 20 + Math.max(0, Number(entry?.disposition) || 0) / 10) * stage.difficulty * (targetIsMephit ? 1.35 : 1);
  const force = guardAttackPower(deployed);
  const chance = Math.min(0.9, Math.max(0.35, 0.4 + force * governanceDefenseMod() / (force * governanceDefenseMod() + difficulty) * 0.55));
  return { target: id, stage: stage.id, deployedGuards: deployed, force, difficulty, chance, likelyWin: chance >= 0.5 };
}

function doRaid(id, stageId = 'raid', guardCount = ableGuards()) {
  const entry = state.diplomacy && state.diplomacy[id];
  if (!entry || entry.conquered || !localTribe(id) || !tech('guards')) return { ok: false, reason: 'unavailable', target: id, stage: stageId };
  const stage = raidStage(stageId);
  const able = ableGuards();
  const deployed = Math.floor(Number(guardCount));
  const cost = stage.cost;
  if (!Number.isFinite(deployed) || deployed < 1 || deployed > able) return { ok: false, reason: 'invalid-guard-count', target: id, stage: stage.id, limits: guardLimits() };
  if (!canAfford(cost)) return { ok: false, reason: 'unaffordable', target: id, stage: stage.id, cost };
  payCost(cost);
  state.migrationRaids = (state.migrationRaids || 0) + 1;
  triggerAirOfRage();

  const targetIsMephit = id === 'mephit';
  // Weapons improve the attack; armor only protects troops who come home.
  const totalGuards = deployed;
  const force = guardAttackPower(deployed);
  const difficulty = (militaryStrength(entry) / 20 + Math.max(0, entry.disposition) / 10) * stage.difficulty * (targetIsMephit ? 1.35 : 1);
  // A properly staffed raid should be a dependable active choice, not a coin
  // flip.  It still needs enough Guards to overcome stronger neighbors.
  const chance = Math.min(0.9, Math.max(0.35, 0.4 + force * governanceDefenseMod() / (force * governanceDefenseMod() + difficulty) * 0.55));
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
  if (!conquestTrialRelationsLocked()) entry.disposition = Math.max(-100, entry.disposition - (succeeded ? 28 : 18));

  if (succeeded) {
    if (upg('fearOfTheConqueror') > 0) {
      const erosion = RAID_STAGES.indexOf(stage) + 1;
      const before = militaryStrength(entry);
      entry.militaryStrength = Math.max(1, before - erosion);
      addLog(`The victory spreads fear through the ${tribeDef(id).name}; their Military strength falls by ${erosion}.`, 'log-good');
    }
    if (stage.id === 'siege') entry.siegeReady = true;
    state.morale = Math.min(moraleCap(), state.morale + 3);
    const common = raidLoot(id).filter(r => capacityOf(r) === Infinity || !isFull(r));
    const uncommon = raidUncommonLoot().filter(r => capacityOf(r) === Infinity || !isFull(r));
    const loot = [];
    const addLoot = pool => {
      if (!pool.length) return;
      const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const base = pick === 'knowledge' ? 35 : pick === 'currency' ? 12 : 20;
      const amount = Math.max(1, Math.round(base * stage.loot * economicStrength(entry) / 100));
      const gained = Math.min(capacityOf(pick) - state.res[pick], amount);
      if (gained > 0) {
        state.res[pick] += gained;
        state.seen[pick] = true;
        loot.push(`${gained} ${resourceName(pick)}`);
      }
    };
    for (let i = 0; i < stage.rolls; i++) addLoot(common);
    for (let i = 0; i < (stage.uncommon || 0); i++) addLoot(uncommon);
    const lootText = loot.length ? loot.join(', ') : 'nothing (the stores were full)';
    addLog(`The ${stage.name.toLowerCase()} on the ${tribeDef(id).name} succeeds${targetIsMephit ? ', though the fumes leave everyone coughing' : ''}. Emberhold seizes ${lootText}; ${actualDeaths} Guard${actualDeaths === 1 ? '' : 's'} lost and ${actualInjuries} injured.`, 'log-good');
  } else {
    state.morale = Math.max(0, state.morale - 5);
    addLog(`The ${stage.name.toLowerCase()} on the ${tribeDef(id).name} fails${targetIsMephit ? ' — the smell alone breaks the charge' : ''}. ${actualDeaths} Guard${actualDeaths === 1 ? '' : 's'} lost and ${actualInjuries} injured.`, 'log-bad');
  }
  return { ok: true, action: stage.id === 'siege' ? 'siege' : 'attack', target: id, stage: stage.id,
    succeeded, deployedGuards: deployed, force, difficulty, chance, deaths: actualDeaths, injuries: actualInjuries, cost: { ...cost } };
}

function supplyDiplomacyRequest(id) {
  if (conquestTrialRelationsLocked() || !tech('currency') || !localTribe(id) || !state.diplomacy || !state.diplomacy[id]) return;
  const entry = state.diplomacy[id];
  if (!canAfford({ [entry.request.res]: entry.request.amount })) return;
  payCost({ [entry.request.res]: entry.request.amount });
  improveDisposition(entry, 15);
  if (entry.disposition >= 80) updateAchievements(['diplomat']);
  state.morale = Math.min(moraleCap(), state.morale + 2);
  const tribe = tribeDef(id);
  addLog(`The ${tribe.name} accept the requested goods. Relations improve by 15.`, 'log-good');
  entry.request = randomDiplomacyRequest(id);
}

// ---------- save / load ----------
function checkSaveConflict() {
  if (localStorage.getItem(SAVE_KEY) === lastStoredSave) return false;
  if (!saveConflict) {
    saveConflict = true;
    addLog('Paused: another Emberhold tab changed the saved game. Reload this tab to continue with that save. This tab will not overwrite it.', 'log-bad');
  }
  return true;
}

function conquerTown(id) {
  const entry = state.diplomacy && state.diplomacy[id];
  if (!entry || !localTribe(id) || entry.conquered) return { ok: false, reason: 'not-conquerable', target: id };
  const cultural = tech('longSpeech') && entry.disposition >= 300;
  if (!cultural && !entry.siegeReady) return { ok: false, reason: 'not-conquerable', target: id };
  const cost = cultural ? CULTURAL_CONQUEST_COST : CONQUEST_COST;
  if (!cultural && ableGuards() < 15) return { ok: false, reason: 'insufficient-healthy-guards', target: id, requiredGuards: 15 };
  if (!canAfford(cost)) return { ok: false, reason: 'unaffordable', target: id, cost: { ...cost } };
  payCost(cost);
  if (!cultural) {
    state.jobs.guard = Math.max(0, (state.jobs.guard || 0) - 15);
    state.guardInjuries = Math.min(state.guardInjuries || 0, state.jobs.guard);
  } else {
    entry.culturalConquest = true;
    state.culturalConquestRatings = state.culturalConquestRatings || {};
    state.culturalConquestRatings[id] = Math.max(Number(state.culturalConquestRatings[id]) || 0, Math.max(1, migrationChallengeCount()));
  }
  entry.conquered = true;
  entry.siegeReady = false;
  returnCommonalityGuards(id);
  addLog(cultural
    ? `Emberhold culturally conquers the ${tribeDef(id).name} with a payment of ${costText(cost)}. The town joins the realm without deploying Guards, though the effort weighs on Currency until the region is united.`
    : `Emberhold conquers the ${tribeDef(id).name}. The occupation train costs ${costText(cost)}, and the town joins the realm while steadily weighing on morale.`, 'log-good');
  updateAchievements(cultural ? ['diplomat', 'culturalConquest'] : ['diplomat']);
  return { ok: true, action: 'conquer', target: id, deployedGuards: cultural ? 0 : 15, cultural, cost: { ...cost } };
}
function releaseTown(id) {
  const entry = state.diplomacy && state.diplomacy[id];
  if (!entry || !localTribe(id) || !entry.conquered || state.unifiedRegion) return { ok: false, reason: 'not-releasable', target: id };
  entry.conquered = false;
  const returnedGuards = entry.culturalConquest ? 0 : 15;
  if (returnedGuards) {
    state.jobs.guard = Math.min(guardCap(), (state.jobs.guard || 0) + returnedGuards);
    state.guardInjuries = Math.min(state.guardInjuries || 0, state.jobs.guard);
  }
  addLog(`Emberhold releases the ${tribeDef(id).name}. The town is no longer conquered${returnedGuards ? `, and ${returnedGuards} occupation Guards return to the ranks` : ''}.`, 'log-good');
  return { ok: true, action: 'release', target: id, returnedGuards };
}
function uniteRegion() {
  if (!regionUnificationReady() || state.unifiedRegion) return { ok: false, reason: 'not-ready' };
  const ids = localTribeIds();
  state.lineagesUnlocked = state.lineagesUnlocked || { human: true };
  state.conqueredLineageTraits = acquiredLineageTraitIds();
  const nativeTraits = new Set(lineageDef(state.species).traits || []);
  const acquiredTraits = new Set(state.conqueredLineageTraits);
  const achievementTriggers = ['unitedRegion'];
  state.lineageQualificationRatings = state.lineageQualificationRatings || {};
  const lineageRunRating = Math.max(1, migrationChallengeCount());
  for (const id of ids) {
    if (!LINEAGES.some(lineage => lineage.id === id)) continue;
    state.lineagesUnlocked[id] = true;
    state.lineageQualificationRatings[id] = Math.max(Number(state.lineageQualificationRatings[id]) || 0, lineageRunRating);
    achievementTriggers.push(`lineage-${id}`, 'lineage-half', 'lineage-all');
    for (const trait of lineageTraits(lineageDef(id))) {
      if (trait.group === 'Trade-off' || trait.group === 'Habitat' || nativeTraits.has(trait.id) || acquiredTraits.has(trait.id)) continue;
      acquiredTraits.add(trait.id);
      state.conqueredLineageTraits.push(trait.id);
    }
  }
  state.jobs.guard = (state.jobs.guard || 0) + 15 * ids.length;
  state.guardInjuries = Math.min(state.guardInjuries || 0, state.jobs.guard);
  state.unifiedRegion = true;
  addLog(`The conquered towns unite as one nation. The occupation Guards return to the ranks; production rises by 15%, storage doubles, and the nation adopts ${state.conqueredLineageTraits.length} new lineage traits at half strength.`, 'log-good');
  updateAchievements(achievementTriggers);
  return { ok: true, action: 'unite-region', returnedGuards: 15 * ids.length };
}
function saveGame(silent) {
  try {
    if (saveLoadFailed) return false;
    if (saveConflict || checkSaveConflict()) return false;
    if (lastGameAt !== null) updateGameClock();
    const savedAt = Date.now();
    const { log, ...saveState } = state;
    const serialized = JSON.stringify({ ...saveState, savedAt });
    localStorage.setItem(SAVE_KEY, serialized);
    lastStoredSave = serialized;
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
  const hadSeparateLogs = Object.prototype.hasOwnProperty.call(s, 'logs');
  const hadFactoryRecipe = Object.prototype.hasOwnProperty.call(s, 'factoryRecipe');
  const savedTradePartners = Array.isArray(s.tradePartners);
  const legacyTradePartner = s.tradePartner;
  // Reject broken shapes and non-finite numbers before replacing any stored game.
  function validate(value) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid number');
    if (value && typeof value === 'object') for (const key of Object.keys(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid key');
      validate(value[key]);
    }
  }
  validate(s);
  // Saves created before the pause control should continue running when loaded.
  if (!Object.prototype.hasOwnProperty.call(s, 'paused')) s.paused = false;
  const d = defaultState();
  for (const key of Object.keys(d)) {
    if (s[key] === undefined) s[key] = d[key];
    else if (d[key] !== null && (typeof s[key] !== typeof d[key] ||
      (Array.isArray(d[key]) ? !Array.isArray(s[key]) : object(d[key]) && !object(s[key]))))
      throw new Error(`Invalid ${key}`);
  }
  s.customLineage = normalizeCustomLineage(s.customLineage);
  if (s.species === 'custom' && !s.customLineage) s.species = 'human';
  if (s.pendingSpecies === 'custom' && !s.customLineage) s.pendingSpecies = s.species;
  if (!object(s.customLineageDraft)) s.customLineageDraft = null;
  else s.customLineageDraft = { traits: customLineageTraitIds(s.customLineageDraft.traits)
    .filter((id, index, traits) => customLineageTraitCost(traits.slice(0, index + 1)) <= customLineagePoints()) };
  s.projects = Object.fromEntries(RESOURCE_PROJECTS.map(project => {
    const value = s.projects[project.id];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('Invalid project progress');
    return [project.id, Math.max(0, Math.min(100, Math.floor(Number(value) || 0)))];
  }));
  if (!Number.isFinite(s.beaconProgress) || s.beaconProgress < 0) throw new Error('Invalid Beacon progress');
  s.beaconProgress = Math.min(BEACON_STAGE_COUNT, Math.floor(s.beaconProgress));
  if (!Number.isFinite(s.airControlProgress) || s.airControlProgress < 0) throw new Error('Invalid Air Control progress');
  s.airControlProgress = Math.min(AIR_CONTROL_STAGE_COUNT, Math.floor(s.airControlProgress));
  if (!Number.isFinite(s.malformedDanger) || s.malformedDanger < 0) throw new Error('Invalid malformed creature danger');
  s.malformedDanger = Math.min(MALFORMED_DANGER_MAX, s.malformedDanger);
  if (!Number.isFinite(s.malformedAttackT) || s.malformedAttackT < 0 ||
      !Number.isFinite(s.malformedAttackNext) || s.malformedAttackNext < 0)
    throw new Error('Invalid malformed creature attack timer');
  if (!Number.isFinite(s.greatMigrationProgress) || s.greatMigrationProgress < 0) throw new Error('Invalid Great Waters progress');
  s.greatMigrationProgress = Math.min(GREAT_MIGRATION_STAGE_COUNT, Math.floor(s.greatMigrationProgress));
  s.migrationChallenges = [...new Set((s.migrationChallenges || []).filter(id => MIGRATION_CHALLENGES.some(challenge => challenge.id === id)))];
  s.pendingMigrationChallenges = [...new Set((s.pendingMigrationChallenges || []).filter(id => MIGRATION_CHALLENGES.some(challenge => challenge.id === id)))];
  s.expeditions = object(s.expeditions) ? Object.fromEntries(Object.entries(s.expeditions).filter(([id, done]) => EXPEDITION_BY_ID.has(id) && done === true)) : {};
  s.expeditionRatings = object(s.expeditionRatings)
    ? Object.fromEntries(Object.entries(s.expeditionRatings).filter(([id, rating]) => EXPEDITION_BY_ID.has(id) && Number.isInteger(rating) && rating >= 1 && rating <= 4))
    : {};
  for (const id of Object.keys(s.expeditions)) if (!s.expeditionRatings[id]) s.expeditionRatings[id] = 1;
  const lineageIds = new Set(LINEAGES.map(lineage => lineage.id));
  s.lineageQualificationRatings = object(s.lineageQualificationRatings)
    ? Object.fromEntries(Object.entries(s.lineageQualificationRatings).filter(([id, rating]) => lineageIds.has(id) && Number.isInteger(rating) && rating >= 1 && rating <= 4))
    : {};
  for (const id of lineageIds) if (s.lineagesUnlocked?.[id] && !s.lineageQualificationRatings[id]) s.lineageQualificationRatings[id] = 1;
  const tribeIds = new Set(TRIBES.map(tribe => tribe.id));
  s.culturalConquestRatings = object(s.culturalConquestRatings)
    ? Object.fromEntries(Object.entries(s.culturalConquestRatings).filter(([id, rating]) => tribeIds.has(id) && Number.isInteger(rating) && rating >= 1 && rating <= 4))
    : {};
  for (const [id, entry] of Object.entries(s.diplomacy || {}))
    if (tribeIds.has(id) && entry?.culturalConquest && !s.culturalConquestRatings[id]) s.culturalConquestRatings[id] = 1;
  if (!s.achievements || typeof s.achievements !== 'object' || Array.isArray(s.achievements)) throw new Error('Invalid achievements');
  for (const [id, value] of Object.entries(s.achievements)) {
    if (!ACHIEVEMENTS.some(achievement => achievement.id === id) ||
        (value !== true && (!Number.isInteger(value) || value < 1 || value > 4))) delete s.achievements[id];
  }
  // Older saves may not have recorded the initial landing. The current
  // settlement is necessarily known and should count as a return destination.
  s.landingsSeen[s.landing] = true;
  s.placeTraits = [...new Set(s.placeTraits.filter(id => typeof id === 'string' && PLACE_TRAIT_BY_ID.has(id)))].slice(0, 2);
  if (s.migrating) for (const landing of s.pendingLandings) {
    if (!landing || typeof landing.id !== 'string') continue;
    if (!Array.isArray(landing.traits)) landing.traits = traitsForLanding(landing.id);
    else landing.traits = [...new Set(landing.traits.filter(id => typeof id === 'string' && PLACE_TRAIT_BY_ID.has(id)))].slice(0, 2);
  }
  s.bonusTime = Math.max(0, Math.min(OFFLINE_CAP, s.bonusTime));
  if (!Number.isInteger(s.pop) || s.pop < 1 || !Number.isInteger(s.era) || s.era < 1 || s.era > ERAS.length)
    throw new Error('Invalid settlement');
  for (const key of ['res', 'jobs', 'bld', 'trialDone', 'upgrades', 'diplomats']) {
    for (const n of Object.values(s[key]))
      if (typeof n !== 'number' || n < 0) throw new Error(`Invalid ${key}`);
  }
  // Foundry was the original one-off Steel unlock. Preserve it as a Forge
  // before normalizing building toggles so migrated Forges start enabled.
  if (s.bld.foundry) {
    s.bld.forge = (s.bld.forge || 0) + s.bld.foundry;
    delete s.bld.foundry;
  }
  // Only persist controls for buildings that exist. Recording a zero for an
  // unbuilt type would make its first completed instance look explicitly off.
  s.buildingPower = Object.fromEntries(Object.keys(POWER_BUILDINGS)
    .filter(id => s.bld[id] > 0)
    .map(id => {
      const max = DIG_SITE_WORKERS[id] ? Math.max(0, Math.floor(s.jobs[DIG_SITE_WORKERS[id]] || 0)) : Math.floor(s.bld[id]);
      return [id, Number.isFinite(s.buildingPower[id])
        ? Math.max(0, Math.min(max, Math.floor(s.buildingPower[id])))
        : max];
    }));
  if (!savedTradePartners) s.tradePartners = [legacyTradePartner || 'human'];
  s.tradePartners = [...new Set(s.tradePartners.filter(id => typeof id === 'string'))];
  if (!s.tradePartners.length) s.tradePartners = [s.tradePartner || 'human'];
  s.tradePartner = s.tradePartners[0];
  for (const n of Object.values(s.spies))
    if (typeof n !== 'number' || n < 0) throw new Error('Invalid spies');
  if (s.spyTraining !== null && (!object(s.spyTraining) || typeof s.spyTraining.target !== 'string' ||
      typeof s.spyTraining.remaining !== 'number' || s.spyTraining.remaining < 0))
    throw new Error('Invalid spy training');
  for (const type of ['build', 'research', 'expedition']) {
    if (!Array.isArray(s.queues[type])) {
      if (s.queues[type] === undefined || s.queues[type] === null) s.queues[type] = [];
      else if (object(s.queues[type])) s.queues[type] = [s.queues[type]];
      else throw new Error(`Invalid ${type} queue`);
    }
    for (const entry of s.queues[type]) {
      if (!object(entry) || entry.type !== type || typeof entry.id !== 'string' || !queueDef(entry))
        throw new Error(`Invalid ${type} queue`);
      // Queue prices are intentionally live. Discard the legacy snapshot so
      // imported saves cannot resurrect the old price-locking behavior.
      delete entry.cost;
    }
  }
  let queuedBuildings = Object.create(null);
  s.queues.build = s.queues.build.filter(entry => {
    if (isWonderObstacleQueueId(entry.id)) return true;
    const def = BUILDING_BY_ID.get(entry.id);
    if (!def || !Number.isFinite(def.max)) return true;
    const kept = queuedBuildings[entry.id] || 0;
    if ((s.bld[entry.id] || 0) + kept >= def.max) return false;
    queuedBuildings[entry.id] = kept + 1;
    return true;
  });
  const queuedResearch = new Set();
  s.queues.research = s.queues.research.filter(entry => {
    if (s.techs[entry.id] || queuedResearch.has(entry.id)) return false;
    queuedResearch.add(entry.id);
    return true;
  });
  for (const r of RESOURCES) if (s.res[r.id] === undefined) s.res[r.id] = 0;
  s.res.currency = Math.min(currencyCapacity(s.jobs, s), s.res.currency);
  s.beaconsLit = Object.fromEntries(Object.entries(s.beaconsLit || {})
    .filter(([id, lit]) => LANDING_BY_ID.has(id) && lit === true));
  s.beaconRevisited = Object.fromEntries(Object.entries(s.beaconRevisited || {})
    .filter(([id, revisited]) => LANDING_BY_ID.has(id) && revisited === true && s.beaconsLit[id]));
  // Older saves that reached the Beacon predate the per-landing record. They
  // still qualify for the first Wonder hint.
  if (s.won && !Object.keys(s.beaconsLit).length) s.beaconsLit[s.landing] = true;
  s.hope = Math.max(0, Number(s.hope) || 0);
  s.ancient = Math.max(0, Number(s.ancient) || 0);
  s.hopeEver = !!s.hopeEver || s.hope > 0;
  s.ancientEver = !!s.ancientEver || s.ancient > 0;
  s.wonderUnlocks = object(s.wonderUnlocks) ? Object.fromEntries(
    Object.entries(s.wonderUnlocks).filter(([id, unlocked]) => WONDER_UNLOCK_BY_ID.has(id) && unlocked === true)
  ) : {};
  s.wonders = Object.fromEntries(Object.entries(s.wonders || {})
    .filter(([id, record]) => LANDING_BY_ID.has(id) && object(record))
    .map(([id, record]) => {
      record.found = !!record.found;
      record.sections = Array.isArray(record.sections) ? record.sections.slice(0, 5).map(Boolean) : [false, false, false, false, false];
      while (record.sections.length < 5) record.sections.push(false);
      record.progress = Math.max(0, Number(record.progress) || 0);
      record.researches = object(record.researches) ? record.researches : {};
      record.expeditions = object(record.expeditions) ? record.expeditions : {};
      record.obstacles = object(record.obstacles) ? Object.fromEntries(Object.entries(record.obstacles).filter(([index, built]) => /^[0-4]:[0-4]$/.test(index) && built === true)) : {};
      record.obstacleNotices = object(record.obstacleNotices) ? Object.fromEntries(Object.entries(record.obstacleNotices).filter(([index, noticed]) => /^[0-4]:[0-4]$/.test(index) && noticed === true)) : {};
      record.outcomes = object(record.outcomes) ? record.outcomes : {};
      return [id, record];
    }));
  if (!object(s.rapture)) s.rapture = { landing: null, workers: 0, tabSeen: false };
  s.rapture.landing = LANDING_BY_ID.has(s.rapture.landing) ? s.rapture.landing : null;
  s.rapture.workers = Math.max(0, Math.floor(Number(s.rapture.workers) || 0));
  s.rapture.tabSeen = !!s.rapture.tabSeen;
  s.raptureFleeMoraleT = Math.max(0, Math.min(10, Number(s.raptureFleeMoraleT) || 0));
  // Power visibility belongs to the current settlement. Older saves could
  // carry the discovery flag across a migration even after all power-related
  // buildings had been left behind.
  const hasPowerBuilding = ['steamPlant', 'oilPowerPlant', 'dynamo', 'windDevice', 'livingBlock', 'factory']
    .some(id => (s.bld[id] || 0) > 0);
  if (!hasPowerBuilding) {
    s.seen.power = false;
    s.res.power = 0;
  }
  for (const entry of Object.values(s.diplomacy)) {
    if (!object(entry) || typeof entry.disposition !== 'number') throw new Error('Invalid diplomacy');
    if (entry.militaryStrength === undefined) entry.militaryStrength = 100;
    if (entry.militaryBaseStrength === undefined) entry.militaryBaseStrength = entry.militaryStrength;
    if (entry.economicStrength === undefined) entry.economicStrength = 100;
    if (typeof entry.militaryStrength !== 'number' || entry.militaryStrength < 1 ||
        typeof entry.militaryBaseStrength !== 'number' || entry.militaryBaseStrength < 1 ||
        typeof entry.economicStrength !== 'number' || entry.economicStrength < 1)
      throw new Error('Invalid town strength');
  }
  if (s.trial !== null && (!object(s.trial) || !TRIALS.some(t => t.id === s.trial.id)))
    throw new Error('Invalid trial');
  const hasLegacyLog = Object.prototype.hasOwnProperty.call(s, 'log');
  const legacyLog = Array.isArray(s.log) ? s.log : [];
  // Current saves omit the derived legacy `log` array and persist only the
  // categorized logs. Validate `log` when an older save actually contains it,
  // but do not reject valid current saves just because it is absent.
  if ((hasLegacyLog && !Array.isArray(s.log)) ||
      !legacyLog.every(entry => object(entry) && typeof entry.t === 'string' && typeof entry.d === 'number'))
    throw new Error('Invalid chronicle');
  if (!hadSeparateLogs && legacyLog.length) {
    s.logs = Object.fromEntries(LOG_CATEGORIES.map(category => [category, []]));
    let sequence = legacyLog.length;
    for (const entry of legacyLog) {
      const category = logCategory(entry.t);
      s.logs[category].push({ ...entry, k: category, n: sequence-- });
    }
  }
  if (!object(s.logs)) throw new Error('Invalid chronicle');
  if (hadSeparateLogs) {
    const entries = LOG_CATEGORIES.flatMap(category => s.logs[category] || []);
    s.logs = Object.fromEntries(LOG_CATEGORIES.map(category => [category, []]));
    for (const entry of entries) {
      const category = logCategory(entry.t);
      s.logs[category].push({ ...entry, k: category });
    }
  }
  let maxSequence = 0;
  for (const category of LOG_CATEGORIES) {
    if (!Array.isArray(s.logs[category])) throw new Error('Invalid chronicle');
    s.logs[category] = s.logs[category]
      .filter(entry => object(entry) && typeof entry.t === 'string' && typeof entry.d === 'number')
      .map(entry => {
        const normalized = { ...entry, k: category, n: Number.isFinite(entry.n) ? entry.n : ++maxSequence };
        maxSequence = Math.max(maxSequence, normalized.n);
        return normalized;
      })
      .sort((a, b) => b.n - a.n)
      .slice(0, LOG_LIMIT_PER_CATEGORY);
  }
  s.logSequence = Math.max(Number.isFinite(s.logSequence) ? s.logSequence : 0, maxSequence);
  s.log = allLogEntries({ logs: s.logs });
  if (s.settings.woodForCoal === true) s.settings.woodForCoal = {
    steamPlant: s.bld.steamPlant || 0,
    forge: s.bld.forge || 0,
    factory: s.bld.factory || 0,
    tinkerer: s.jobs.tinkerer || 0,
    cost: 1,
  };
  delete s.res.weapons;
  delete s.res.armor;
  s.armor = Math.max(s.armor, s.techs.chainmail ? 2 : s.techs.leatherArmor ? 1 : 0);
  if (!FACTORY_RECIPES.some(r => r.id === s.factoryRecipe && (!r.tech || s.techs[r.tech]))) s.factoryRecipe = 'goods';
  s.factoryRecipes = hadFactoryRecipe && Array.isArray(s.factoryRecipes) ? [...new Set(s.factoryRecipes)].filter(id =>
    FACTORY_RECIPES.some(r => r.id === id && (!r.tech || s.techs[r.tech]))).slice(0, 2) : [s.factoryRecipe];
  if (!s.factoryRecipes.length) s.factoryRecipes = [s.factoryRecipe];
  if (!(s.upgrades.dividedAttention > 0)) s.factoryRecipes = [s.factoryRecipes[0]];
  s.factoryRecipe = s.factoryRecipes[0];
  // Reset controls are intentionally session-only and never reopen from a save.
  s.settings.resetControls = false;
  return s;
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    lastStoredSave = raw;
    if (!raw) return null;
    return normalizeSave(JSON.parse(raw));
  } catch (e) {
    saveLoadFailed = true;
    return null;
  }
}

function offlineProgress() {
  const now = Date.now();
  if (state.paused) {
    state.savedAt = now;
    return;
  }
  const elapsed = Math.max(0, (now - state.savedAt) / 1000);
  state.bonusTime = Math.min(OFFLINE_CAP, state.bonusTime + elapsed);
  state.savedAt = now;
  if (elapsed >= 60) addLog('Time away has been banked for double-speed play (up to 24 hours).', 'log-important');
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
    const trimmed = data.trim();
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (_) {
      const binary = atob(trimmed);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    }
    const s = normalizeSave(parsed);
    s.savedAt = Date.now();
    const serialized = JSON.stringify(s);
    localStorage.setItem(SAVE_KEY, serialized);
    const stored = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (stored.res.knowledge !== s.res.knowledge || stored.trial?.id !== s.trial?.id) {
      throw new Error('The browser did not retain the imported save');
    }
    saveLoadFailed = false;
    lastStoredSave = serialized;
    saveConflict = false;
    state = s;
    reconcileWorkers();
    applySettings();
    addLog(`Save imported successfully: ${fmt(state.res.knowledge)} Knowledge, ${state.pop} villagers.`, 'log-good');
    saveGame(true);
    render();
  } catch (e) {
    console.error('Save import failed:', e);
    addLog(`Save import failed: ${e.message || 'unrecognized save format'}`, 'log-bad');
    render();
  }
}
function resetGame() {
  if (!window.confirm('HARD RESET WARNING: erase everything in this chronicle, including all migrations, trials, Wonders, achievements, and permanent upgrades? This cannot be undone. Continue?')) return;
  if (!window.confirm('Final warning: all Emberhold data will be permanently deleted. Erase everything?')) return;
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
function fmtHeld(n) {
  return fmt(Math.floor(n));
}
function fmtCost(n) {
  return fmt(Math.ceil(n));
}
function fmtEchoCost(n) {
  return Math.ceil(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtAvailablePower(n) {
  return fmt(Math.floor((n + 1e-9) * 10) / 10);
}
function fmtRate(n) {
  if (!n) return '';
  return ` ${n > 0 ? '+' : ''}${fmt(n)}/s`;
}
function costHtml(cost) {
  const parts = [];
  const effective = effectiveCoalCost(cost);
  for (const r in effective) {
    const have = state.res[r] || 0;
    parts.push(`<span class="${have >= effective[r] ? 'ok' : 'lack'}">${fmtCost(effective[r])} ${resourceName(r)}</span>`);
  }
  return parts.join(', ');
}
function costText(cost) {
  return Object.entries(effectiveCoalCost(cost)).map(([r, amount]) => `${fmtCost(amount)} ${resourceName(r)}`).join(', ');
}

function lineageAccessCount() { return LINEAGES.filter(lineage => lineageUnlocked(lineage.id)).length; }
function steelHearted() { return !!state.achievements?.steelHearted; }

const WONDER_ACHIEVEMENT_REWARDS = {
  emberplain: { restore: 'Unlock Solar Arrays and soften extreme heat in future settlements.', silence: 'Steam Plants gain +1 Power capacity.', become: 'Gain 1 Ancient point.' },
  greenfold: { restore: 'Unlock Heartwood research for future settlements.', silence: 'Unlock Animal Husbandry and Ranches for future settlements.', become: 'Gain 1 Ancient point.' },
  grayrocks: { restore: 'Unlock Living Alloy research for future settlements.', silence: 'Tinkerers can run factory recipes without Power at half speed.', become: 'Gain 1 Ancient point.' },
  floodmeadows: { restore: 'River Crown power increases Food production by 20%.', silence: 'Foragers become Farmers and gain a Farming bonus.', become: 'Gain 1 Ancient point.' },
  ashfen: { restore: 'Renewal Basin power increases Coal production by 15% and Tools by 25%.', silence: 'Recover 10% of factory-material construction costs.', become: 'Gain 1 Ancient point.' },
  windmere: { restore: 'Mirrored Orrery power increases Knowledge and Aether production by 20%, and unlocks Star Glass research.', silence: 'Explorers generate additional Knowledge and document discoveries.', become: 'Gain 1 Ancient point.' },
  pallidExpanse: { restore: 'The White Engine stabilizes distance across future settlements.', silence: 'The White Engine is locked and no longer alters the roads.', become: 'Gain 1 Ancient point.' },
  glassMire: { restore: 'The Prism Womb makes carefully bounded new life possible.', silence: 'The Prism Womb is sealed before it can reproduce.', become: 'Gain 1 Ancient point.' },
  hollowCanopy: { restore: 'The Breath Archive preserves extinct voices in the living forest.', silence: 'The Breath Archive releases no more dead things into the world.', become: 'Gain 1 Ancient point.' },
  redChasm: { restore: 'The Red Equation resumes its ancient alloy calculations.', silence: 'The Red Equation’s furnace is cooled and contained.', become: 'Gain 1 Ancient point.' },
  drownedMoon: { restore: 'The Lunar Ossuary gives the Drowned Moon a dependable calendar.', silence: 'The Lunar Ossuary’s memory-drinking bell is silenced.', become: 'Gain 1 Ancient point.' },
  boneOrchard: { restore: 'The Pale Genealogy cultivates new animals and useful symbioses.', silence: 'The Pale Genealogy is left to ordinary hunger and death.', become: 'Gain 1 Ancient point.' },
  blackTidelands: { restore: 'The Inkwell Leviathan carries its archive along the alien coast.', silence: 'The Inkwell Leviathan sinks and its dangerous pages dissolve.', become: 'Gain 1 Ancient point.' },
  singingCrater: { restore: 'The Resonant Maw becomes a warning beacon for the new lands.', silence: 'The Resonant Maw’s answer is never sung.', become: 'Gain 1 Ancient point.' },
};
function wonderAchievements() {
  const fates = [['restore', 'Restoration', 'Restore its old purpose'], ['silence', 'Silence', 'Silence it'], ['become', 'Transformation', 'Become one with it']];
  return WONDERS.flatMap(def => fates.map(([choice, title, action]) => ({
    id: `wonder-${def.id}-${choice}`,
    name: `${def.name}: ${title}`,
    desc: `${action} and earn this Wonder’s fate. Reward: ${WONDER_ACHIEVEMENT_REWARDS[def.id][choice]}`,
    test: () => wonderChoice(def.id, choice),
    progress: () => wonderChoice(def.id, choice) ? 'Fate completed' : 'Not yet faced',
  })));
}

const ACHIEVEMENTS = [
  { id: 'firstDay', name: 'Ashes to Ashes', desc: 'Let Emberhold see its first day.', test: () => state.day >= 1, progress: () => `${fmt(Math.min(state.day, 1))} / 1 day` },
  { id: 'stoneAge', name: 'Stone Remembered', desc: 'Reach the Age of Stone.', test: () => state.era >= 2, progress: () => `Age ${Math.min(state.era, 2)} / 2` },
  { id: 'builder', name: 'A Place to Stand', desc: 'Raise three Huts.', test: () => bld('hut') >= 3, progress: () => `${fmt(Math.min(bld('hut'), 3))} / 3 Huts` },
  { id: 'scholar', name: 'A Curious People', desc: 'Complete five research projects.', test: () => Object.keys(state.techs).length >= 5, progress: () => `${Math.min(Object.keys(state.techs).length, 5)} / 5 projects` },
  { id: 'diplomat', name: 'Good Neighbors', desc: 'Reach 80 disposition with a tribe or conquer one.', test: () => Object.values(state.diplomacy || {}).some(e => e.disposition >= 80 || e.conquered), progress: () => `${Math.max(0, ...Object.values(state.diplomacy || {}).map(e => e.disposition || 0))} / 80 disposition` },
  { id: 'unitedRegion', name: 'One Nation', desc: 'Unite the three conquered tribes into one nation.', test: () => !!state.unifiedRegion, progress: () => state.unifiedRegion ? 'Region united' : `${localTribeIds().filter(id => state.diplomacy?.[id]?.conquered).length} / 3 tribes conquered` },
  { id: 'culturalConquest', name: 'Words Without Weapons', desc: 'Culturally conquer a neighboring town with Long Speech.', test: () => Object.values(state.diplomacy || {}).some(entry => entry.culturalConquest), progress: () => Object.values(state.diplomacy || {}).some(entry => entry.culturalConquest) ? 'A town joined through Long Speech' : 'No cultural conquests yet' },
  { id: 'peacefulUnification', name: 'A United Voice', desc: 'Unite the region in a migration with no offensive combat.', test: () => !!state.unifiedRegion && (state.migrationRaids || 0) === 0, progress: () => state.unifiedRegion ? ((state.migrationRaids || 0) === 0 ? 'Region united without offensive combat' : `${state.migrationRaids} offensive actions this migration`) : `${localTribeIds().filter(id => state.diplomacy?.[id]?.conquered).length} / 3 towns united` },
  { id: 'wayfarer', name: 'The Long Road', desc: 'Establish three expedition sites.', test: () => Object.keys(state.expeditions || {}).filter(id => expeditionRating(id) > 0).length >= 3, progress: () => `${Math.min(Object.keys(state.expeditions || {}).filter(id => expeditionRating(id) > 0).length, 3)} / 3 sites` },
  { id: 'trialist', name: 'Oathbound', desc: 'Complete a trial.', test: () => Object.values(state.trialDone || {}).some(n => n > 0), progress: () => `${Object.values(state.trialDone || {}).reduce((a, n) => a + n, 0)} completed` },
  { id: 'beacon', name: 'The Beacon Burns', desc: 'Reach the Age of Light.', test: () => state.era >= 5 || state.won, progress: () => `Age ${Math.min(state.era, 5)} / 5` },
  { id: 'firstFlight', name: 'Up, Up and Away', desc: 'Construct your first Trade Blimp.', test: () => bld('tradeBlimp') >= 1, progress: () => `${Math.min(bld('tradeBlimp'), 1)} / 1 Trade Blimp` },
  { id: 'manyHands', name: 'Many Hands', desc: 'Grow Emberhold to 25 people.', test: () => state.pop >= 25, progress: () => `${Math.min(state.pop, 25)} / 25 people` },
  { id: 'steelHearted', name: 'Steel Hearted', desc: 'Hold 1,000 Steel at once.', effect: '+20% Steel production', test: () => (state.res.steel || 0) >= 1000, progress: () => `${fmt(Math.min(state.res.steel || 0, 1000))} / 1,000 Steel` },
  { id: 'butchersBill', name: "The Butcher's Bill", desc: 'Lose at least 25 Guards during a single migration.', test: () => state.migrationChallengePending && (state.migrationGuardDeaths || 0) >= 25, progress: () => `${Math.min(state.migrationGuardDeaths || 0, 25)} / 25 Guard deaths this migration` },
  { id: 'peacefulMigration', name: 'The Quiet Road', desc: 'Complete a migration without launching a raid.', test: () => state.migrationChallengePending && (state.migrationRaids || 0) === 0, progress: () => `${state.migrationRaids || 0} raids launched this migration` },
  ...LINEAGES.map(lineage => ({
    id: `lineage-${lineage.id}`,
    name: `Lineage: ${lineage.name}`,
    desc: `Gain access to the ${lineage.name} lineage.`,
    test: () => lineageUnlocked(lineage.id),
    progress: () => lineageUnlocked(lineage.id) ? 'Lineage available' : 'Not yet available',
  })),
  { id: 'lineage-half', name: 'Many Peoples', desc: 'Gain access to at least half of all lineages.', test: () => lineageAccessCount() >= Math.ceil(LINEAGES.length / 2), progress: () => `${lineageAccessCount()} / ${Math.ceil(LINEAGES.length / 2)} lineages` },
  { id: 'lineage-all', name: 'A World of Kin', desc: 'Gain access to every lineage.', test: () => lineageAccessCount() >= LINEAGES.length, progress: () => `${lineageAccessCount()} / ${LINEAGES.length} lineages` },
  ...wonderAchievements(),
];

function completedAchievementCount() { return Object.keys(state.achievements || {}).filter(id => state.achievements[id]).length; }
function achievementRating(id) {
  const value = state.achievements?.[id];
  return value === true ? 1 : Math.max(0, Math.min(4, Number(value) || 0));
}
function achievementRatingTotal() {
  return Object.keys(state.achievements || {}).reduce((sum, id) => sum + achievementRating(id), 0);
}
function achievementRequirementRating(achievement) {
  if (achievement.id === 'wayfarer') {
    const ratings = EXPEDITIONS.filter(e => e.landing && !LANDING_BY_ID.get(e.landing)?.postWaters)
      .map(e => expeditionRating(e.id)).filter(Boolean).sort((a, b) => b - a);
    return ratings.length >= 3 ? ratings[2] : 0;
  }
  if (achievement.id === 'culturalConquest') {
    const ratings = Object.values(state.culturalConquestRatings || {}).sort((a, b) => b - a);
    return ratings[0] || (achievement.test() ? 1 : 0);
  }
  if (achievement.id === 'lineage-half' || achievement.id === 'lineage-all') {
    const needed = achievement.id === 'lineage-half' ? Math.ceil(LINEAGES.length / 2) : LINEAGES.length;
    const ratings = LINEAGES.map(lineage => Number(state.lineageQualificationRatings?.[lineage.id]) || (lineageUnlocked(lineage.id) ? 1 : 0))
      .filter(Boolean).sort((a, b) => b - a);
    return ratings.length >= needed ? ratings[needed - 1] : 0;
  }
  if (achievement.id.startsWith('lineage-')) {
    const lineageId = achievement.id.slice('lineage-'.length);
    return Number(state.lineageQualificationRatings?.[lineageId]) || (lineageUnlocked(lineageId) ? 1 : 0);
  }
  const required = achievement.requires || [];
  // Achievements without prerequisites are eligible for the full challenge
  // rating. Returning 1 here would silently cap every standalone achievement
  // at wooden strength.
  if (!required.length) return CHALLENGE_RATING_NAMES.length - 1;
  const needed = Math.max(1, Math.min(required.length, achievement.requireCount || required.length));
  const ratings = required.map(achievementRating).filter(Boolean).sort((a, b) => b - a).slice(0, needed);
  return ratings.length === needed ? Math.min(...ratings) : 0;
}
function updateAchievements(triggeredIds = []) {
  state.achievements = state.achievements || {};
  state.achievementChecks = state.achievementChecks && typeof state.achievementChecks === 'object' && !Array.isArray(state.achievementChecks)
    ? state.achievementChecks : {};
  state.migrationChallenges = Array.isArray(state.migrationChallenges) ? state.migrationChallenges : [];
  state.pendingMigrationChallenges = Array.isArray(state.pendingMigrationChallenges) ? state.pendingMigrationChallenges : [];
  const initialized = !!state.achievementChecksInitialized;
  const triggered = new Set(triggeredIds);
  for (const achievement of ACHIEVEMENTS) {
    const requirementRating = achievementRequirementRating(achievement);
    // Explicit completion events may occur at the boundary where the raw
    // state condition has not been updated yet (for example, a new settlement
    // starts at day zero but Ashes to Ashes is granted immediately).
    const met = achievement.test() || triggered.has(achievement.id);
    const newlyMet = initialized && met && !state.achievementChecks[achievement.id];
    state.achievementChecks[achievement.id] = met;
    if (met && requirementRating) {
      const oldRating = achievementRating(achievement.id);
      const newRating = ['wayfarer', 'culturalConquest', 'lineage-half', 'lineage-all'].includes(achievement.id) || achievement.id.startsWith('lineage-')
        ? requirementRating
        : Math.min(Math.max(1, migrationChallengeCount()), requirementRating);
      // A rating is a record of the conditions when the achievement was
      // earned. Do not retrospectively promote it just because its persistent
      // condition remains true during a later, harder migration. It can be
      // raised only by meeting the condition again or completing its action.
      const ratingCanImproveInPlace = achievement.id === 'wayfarer';
      if (newRating > oldRating && (!oldRating || newlyMet || triggered.has(achievement.id) || ratingCanImproveInPlace)) {
        state.achievements[achievement.id] = newRating;
        const ratingName = CHALLENGE_RATING_NAMES[newRating];
        addLog(`Achievement completed: ${achievement.name} (${ratingName}). Completion bonus +${(newRating * 0.25).toFixed(2)}% to all production.`, 'log-good');
      }
    }
  }
  state.achievementChecksInitialized = true;
}
function totalTrialsCompleted() { return Object.values(state.trialDone || {}).reduce((sum, n) => sum + n, 0); }
function totalUpgrades() { return Object.values(state.upgrades || {}).reduce((sum, n) => sum + n, 0); }
function setSetting(id) {
  state.settings = state.settings || {};
  state.settings[id] = !state.settings[id];
  applySettings();
  saveGame(true);
}
function applySettings() {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('reduced-motion', !!state.settings?.reducedMotion);
  document.body.classList.toggle('compact-stores', !!state.settings?.compactStores);
  document.body.classList.toggle('tooltips-off', !state.settings?.tooltips);
}

// ---------- UI ----------
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function attrText(s) { return esc(s).replace(/"/g, '&quot;'); }

// Keep the first screen focused on the settlement's immediate needs. Systems
// join the tab bar when the player has enough context to do something with
// them, rather than asking a new player to understand the whole game at once.
const TAB_UNLOCKS = {
  village: () => true,
  build: () => true,
  research: () => bld('library') > 0,
  diplomacy: () => tech('currency'),
  governance: () => tech('civics'),
  trials: () => bld('monument') > 0 || !!state.trial,
  expeditions: () => era() >= 2 && bld('quarry') > 0,
  wonders: () => !!state.rapture?.tabSeen,
  migration: () => bld('monument') > 0 || !!state.migrating,
  stats: () => state.day >= 1 || state.migrating || state.won,
  settings: () => true,
};

function tabUnlocked(id) { return !!TAB_UNLOCKS[id]?.(); }

function renderNextStep() {
  if (state.trial) {
    const trial = TRIAL_BY_ID.get(state.trial.id);
    if (trial) {
      return `<div class="next-step card trial-active"><div class="card-head"><span class="card-title">${trial.name}</span><span class="card-count">Active trial</span></div>` +
        `<div class="card-desc"><strong>Goal:</strong> ${trial.goal}</div>` +
        `<div class="trial-goal"><strong>Progress:</strong> ${trialProgressText()}</div>` +
        `<div class="card-actions"><button data-action="tab" data-tab="trials">Open Trials</button></div></div>`;
    }
  }
  if (state.tutorialDismissed) return '';
  let title = 'Begin the settlement';
  let text = 'Assign your four villagers to Foragers and Woodcutters, then keep enough food coming to grow.';
  let action = 'Village';
  let tab = 'village';
  if (unassigned() === 0 && bld('hut') === 0) {
    title = 'Make room to grow';
    text = 'Build a Hut from the Build tab. Shelter raises your population capacity.';
    action = 'Open Build';
    tab = 'build';
  } else if (bld('hut') > 0 && bld('library') === 0) {
    title = 'Preserve what you learn';
    text = 'Build a Library when you can. It unlocks Thinkers, who produce the Knowledge needed for research.';
    action = 'Open Build';
    tab = 'build';
  } else if (bld('library') > 0 && !tech('stoneWorking')) {
    title = 'Turn knowledge into progress';
    text = 'Assign a Thinker, then research Stone Working. It opens the next age and the Quarry.';
    action = 'Open Research';
    tab = 'research';
  } else if (tech('stoneWorking') && !bld('quarry')) {
    title = 'Reach beyond the ash';
    text = 'Build the Quarry to reveal stone and miners. New discoveries will open more of Emberhold.';
    action = 'Open Build';
    tab = 'build';
  } else if (era() >= 2 && !tech('craftsmanship')) {
    title = 'Choose your direction';
    text = 'Research Craftsmanship for Tools, or follow the other available discoveries as your stores grow.';
    action = 'Open Research';
    tab = 'research';
  } else {
    return '';
  }
  return `<div class="next-step card"><div class="card-head"><span class="card-title">${title}</span><span class="card-count">Next step</span></div>` +
    `<div class="card-desc">${text}</div><div class="card-actions"><button data-action="tab" data-tab="${tab}">${action}</button><button data-action="tutorial-dismiss">Dismiss tutorial</button></div></div>`;
}

function resVisible(id) {
  if (id === 'power' && !['steamPlant', 'oilPowerPlant', 'dynamo', 'windDevice', 'solarArray', 'livingBlock', 'factory']
    .some(building => bld(building) > 0)) return false;
  return !!state.seen?.[id];
}

function renderBonusTimer() {
  const timer = document.getElementById('bonus-timer');
  timer.classList.toggle('hidden', state.bonusTime <= 0);
  const seconds = Math.ceil(state.bonusTime);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  timer.textContent = `2× speed · ${[hours, minutes, seconds % 60].map(n => String(n).padStart(2, '0')).join(':')}`;
}

function renderHeader() {
  renderBonusTimer();
  const pauseButton = document.getElementById('btn-pause');
  pauseButton.textContent = state.paused ? 'Resume' : 'Pause';
  pauseButton.setAttribute('aria-pressed', String(state.paused));
  pauseButton.setAttribute('aria-label', state.paused ? 'Resume the game' : 'Pause the game');
  const doy = Math.floor(state.day % DAYS_PER_YEAR);
  const season = SEASONS[Math.floor(doy / DAYS_PER_SEASON)].name;
  const year = Math.floor(state.day / DAYS_PER_YEAR) + 1;
  const traitLabels = currentPlaceTraits().map(trait =>
    `<span class="has-tooltip" tabindex="0" data-tooltip="${attrText(placeTraitTooltip(trait))}">${esc(trait.name)}</span>`).join(', ');
  const challengeCount = (state.migrationChallenges || []).length;
  const locationEl = document.getElementById('location-line');
  locationEl.textContent = `${landingDef().name}${challengeCount ? ` ★` : ''}`;
  locationEl.className = challengeCount ? `challenge-star challenge-star-${challengeCount}` : '';
  locationEl.title = challengeCount ? `${challengeCount} self-challenge${challengeCount === 1 ? '' : 's'} active` : '';
  document.getElementById('era-line').innerHTML =
    `Year ${year} of the ${esc(ERAS[state.era - 1].name)}${traitLabels ? ` — ${traitLabels}` : ''} — ${esc(lineageDef(state.species).name)}`;
  document.getElementById('time-line').textContent =
    `${state.paused ? 'Paused · ' : ''}Day ${doy % DAYS_PER_SEASON + 1} of ${season} — chronicle day ${Math.floor(state.day)} — ${weatherSummary()}`;
  document.getElementById('pop-line').textContent =
    `${state.pop} villagers${unassigned() ? ` (${unassigned()} unassigned)` : ''} — housing for ${popCap()}`;
  const moraleEl = document.getElementById('morale-line');
  moraleEl.textContent = `Morale ${Math.round(state.morale)} / ${moraleCap()} — ${moraleLabel()} (${moraleMult() >= 1 ? '+' : ''}${Math.round((moraleMult() - 1) * 100)}% production and population growth speed)`;
  moraleEl.className = state.morale < 25 ? 'morale-low' : state.morale >= 80 ? 'morale-high' : '';
  moraleEl.classList.add('has-tooltip');
  moraleEl.tabIndex = 0;
  moraleEl.dataset.tooltip = attrText(moraleTooltip());
  const echoEl = document.getElementById('echo-line');
  if (bld('monument') > 0 || state.echoes > 0 || state.migrating) {
    echoEl.classList.remove('hidden');
    echoEl.textContent = state.migrating
      ? `Migration prepared — ${fmtHeld(state.echoes)} Echoes in the pouch`
      : `${fmtHeld(state.echoes)} Echo${Math.floor(state.echoes) === 1 ? '' : 'es'} in the pouch — next migration at this size: ${fmtHeld(echoesEarned())}`;
  } else {
    echoEl.classList.add('hidden');
  }
  const wonderEl = document.getElementById('wonder-line');
  if ((state.hope || 0) > 0 || (state.ancient || 0) > 0 || beaconsLitCount() > 0) {
    wonderEl.classList.remove('hidden');
    wonderEl.textContent = `Beacons lit: ${beaconsLitCount()} · Hope: ${state.hope || 0} · Ancient: ${state.ancient || 0}`;
  } else {
    wonderEl.classList.add('hidden');
  }
}

function renderStores() {
  const breakdown = {};
  const rates = production(0.25, breakdown);
  const activePower = powerAllocation();
  let h = '';
  for (const r of RESOURCES) {
    if (!resVisible(r.id)) continue;
    const rate = rates[r.id];
    const cls = rate > 0.0001 ? 'rate-pos' : (rate < -0.0001 ? 'rate-neg' : '');
    const cap = capacityOf(r.id);
    const amount = r.id === 'power'
      ? `${fmtAvailablePower(Math.max(0, state.res[r.id] - activePower.factory * factoryPowerRequirement()))} capacity`
      : cap === Infinity
      ? fmtHeld(state.res[r.id])
      : `${fmtHeld(state.res[r.id])} / ${fmt(cap)}${isFull(r.id) ? ' FULL' : ''}`;
    const status = r.id === 'power' ? (rate > 0.0001 ? 'online' : 'offline') : (fmtRate(rate) || '0/s');
    h += `<div class="res-row">` +
      `<span class="res-name has-tooltip" data-tooltip="${attrText(r.note)}">${r.name}</span>` +
      `<span class="res-amount ${isFull(r.id) ? 'res-full' : ''}">${amount}</span>` +
      `<span class="res-rate has-tooltip ${cls}" tabindex="0" data-tooltip="${attrText(resourceRateTooltip(r, rate, breakdown[r.id]))}">${status}</span>` +
      `</div>`;
  }
  if (perm('explorers') || bld('surveyFlights') > 0) {
    const rate = explorerCount() * 0.025 + (state.surveyFlightRate || 0);
    const cls = rate > 0.0001 ? 'rate-pos' : '';
    h += `<div class="res-row">` +
      `<span class="res-name has-tooltip" data-tooltip="Survey points gathered by Explorers and Survey Flights; spent to reveal additional landing choices during migration.">Survey</span>` +
      `<span class="res-amount">${fmtHeld(state.surveyPoints || 0)}</span>` +
      `<span class="res-rate ${cls}">${fmtRate(rate) || '0/s'}</span>` +
      `</div>`;
  }
  return h;
}

function renderVillage() {
  const L = landingDef();
  let h = renderNextStep() +
    `<div class="res-note">${L.name}</div>` +
    `<div class="res-note">Population growth: <span class="has-tooltip" tabindex="0" data-tooltip="${attrText(populationGrowthTooltip())}">${fmt(populationGrowthTime())} seconds</span> per new villager while food and housing are available. Guard healing: ${fmt(guardHealingNeed())} seconds per injury.</div>` +
    `<div class="res-note" style="margin:2px 0 6px">The land gives: ${modsHtml(L)}</div>` +
    `<div class="res-note" style="margin:2px 0 6px">Guard armor: level ${fmt(armorLevel())} — each level reduces death odds by 8% (minimum 15%).</div>`;
  if (malformedBiomeActive()) h += `<div class="res-note trial-mod">${malformedDangerText()}</div>`;

  if (bld('factory') > 0 || tinkererFactoryAvailable()) {
    h += '<h2 class="section">Factory production</h2><div class="res-note">' +
      (upg('dividedAttention') > 0 ? 'Divided Attention lets you select two outputs; factories and Tinkerers split their assigned workers evenly between them. ' : '') +
      'All factories share one production line. After the World Anvil is silenced, Tinkerers can use this same recipe list at half the factory rate without needing Power. Production slows when supplies run short and pauses when output storage is full. The Industrialization trial requires Industrial Goods.</div>';
    for (const recipe of FACTORY_RECIPES) {
      const unlocked = !recipe.tech || tech(recipe.tech);
      if (!unlocked) continue;
      const selected = factoryRecipes().includes(recipe.id);
      const recipeFactor = recipe.id === 'steel' && tech('lightningMetal') ? 1.5 : 1;
      const activeFactories = powerAllocation().factory;
      const inputs = Object.entries(effectiveCoalInputs(Object.fromEntries(Object.entries(recipe.inputs).map(([r, n]) => [r, n * recipeFactor * activeFactories])), 'factory', activeFactories))
        .map(([r, n]) => `${fmt(activeFactories ? n / activeFactories : n)} ${resourceName(r)}/s`).join(', ');
      const powerText = `${factoryPowerRequirement()} Power capacity per factory`;
      h += `<div class="card"><div class="card-head"><span class="card-title">${recipe.name}</span><span class="card-count">${selected ? 'Active' : 'Available'}</span></div>` +
        `<div class="card-desc">Produces ${fmt(recipe.rate * recipeFactor)}/s; requires ${powerText}${inputs ? ` and consumes ${inputs}` : ''}.</div>` +
        `<div class="card-actions"><button data-action="factory-recipe" data-id="${recipe.id}" ${(selected && factoryRecipes().length === 1) || (!selected && factoryRecipes().length >= 2) ? 'disabled' : ''}>${selected ? 'Producing ' : 'Produce '}${recipe.name}</button></div>` +
        (selected ? woodFuelControls('factory', powerAllocation().factory) : '') + '</div>';
    }
  }
  if (bld('forge') > 0) {
    h += '<h2 class="section">Forge production</h2><div class="res-note">Each Forge smelts Steel automatically. Production slows when Iron or Coal runs short and pauses when the Steel store is full.</div>';
    const activeForges = buildingPowerCount('forge');
    const forgeInputs = effectiveCoalInputs({ iron: 0.6 * activeForges, coal: 0.4 * activeForges }, 'forge', activeForges);
    h += `<div class="card"><div class="card-head"><span class="card-title">Steel</span><span class="card-count">${bld('forge')} Forge${bld('forge') === 1 ? '' : 's'}</span></div>` +
      `<div class="card-desc">Produces ${fmt(0.04 * bld('forge'))}/s; consumes ${fmt(forgeInputs.iron)} Iron/s and ${fmt(forgeInputs.wood || forgeInputs.coal)} ${forgeInputs.wood ? 'Wood' : 'Coal'}/s.</div>` +
      woodFuelControls('forge', buildingPowerCount('forge')) + '</div>';
  }
  h += renderWonderAssignment();
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
    const assignment = typeof job.max === 'function' || job.mining || j === 'astronomer' ? `${n}/${jobCapacity(j)}` : n;
    const tinkererFactory = j === 'tinkerer' && tinkererFactoryAvailable();
    const workRecipe = tinkererFactory ? factoryRecipe() : null;
    const workRate = workRecipe ? workRecipe.id === 'tools' ? job.base : workRecipe.rate * 0.5 * (workRecipe.id === 'steel' && tech('lightningMetal') ? 1.5 : 1) : job.base;
    const workResource = workRecipe ? workRecipe.id : job.res;
    const workInputs = workRecipe ? workRecipe.id === 'tools' ? job.inputs : effectiveCoalInputs(Object.fromEntries(Object.entries(workRecipe.inputs).map(([r, amount]) => [r, amount * 0.5 * n])), 'tinkerer', n) : job.inputs;
    h += `<div class="job-row">` +
      `<span class="job-name has-tooltip" data-tooltip="${attrText(job.desc)}">${jobName(j)}</span>` +
      `<span class="job-assign">${assignment}</span>` +
      `<span class="job-rate">${fmt(workRate)} ${resourceName(workResource)}/s each` +
      (workInputs ? ` (uses ${Object.entries(workInputs).map(([r, v]) => `${fmt(n ? v / n : v)} ${resourceName(r).toLowerCase()}/s`).join(' + ')})` : '') +
      (tinkererFactory ? ` ${woodFuelInlineControls('tinkerer', n)}` : '') +
      `</span>` +
      `<span class="job-btns">` +
      `<button data-action="job-dec" data-job="${j}" data-repeat title="Hold to repeat" ${n > 0 ? '' : 'disabled'}>−</button>` +
      `<button data-action="job-inc" data-job="${j}" data-repeat title="Hold to repeat" ${unassigned() > 0 && n < jobCapacity(j) ? '' : 'disabled'}>+</button>` +
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
      `<span class="job-rate">+0.025 Survey/s each${wonderChoice('windmere', 'silence') ? '; +0.06 Knowledge/s each' : ''}</span>` +
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
  h += `<div class="res-note" style="margin-top:6px">Every villager eats ${fmt(FOOD_PER_POP)} food/s, working or not. Each Guard requires ${fmt(JOBS.guard.upkeep)} food/s, but their hunting is not reduced by winter. Weaponry, Leather Armor, and Chainmail research strengthen the watch; injuries heal over time. Every store has a ceiling — what flows in past a full store is wasted. Storehouses raise most material ceilings.</div>`;

  return h;
}

function renderQueue(type) {
  const entries = state.queues[type];
  const label = type === 'build' ? 'Construction' : type === 'research' ? 'Research' : 'Expedition';
  if (!entries.length) return `<div class="queue-empty">${label} queue empty (${queueCapacity(type)} slot${queueCapacity(type) === 1 ? '' : 's'})</div>`;
  return entries.map((entry, index) => {
    const def = queueDef(entry);
    // Show cumulative missing resources so each later item includes the demand
    // that earlier items will take from the stores before it can be supplied.
    const details = queueWaitingHtml(type, index, entry);
    return `<button class="queue-item" draggable="true" data-action="queue-cancel" data-queue-item="true" data-type="${type}" data-index="${index}" title="Drag to reorder; click to cancel">` +
      `<span class="queue-name">${esc(def ? def.name : entry.id)}${queueProgressHtml(entry)}</span>` +
      `<span class="queue-details">${details}</span></button>`;
  }).join('') + `<div class="queue-capacity">${entries.length} / ${queueCapacity(type)} slots used</div>`;
}

function renderBuild() {
  let h = '<h2 class="section">Construction</h2>';
  const knownBuildings = BUILDINGS.filter(b => bld(b.id) > 0 || !b.req || b.req());
  const completedCount = knownBuildings.filter(b => bld(b.id) >= b.max).length;
  const incompleteCount = knownBuildings.length - completedCount;
  const controllablePowerBuildings = ['livingBlock', ...Object.keys(DIG_SITE_RESOURCES), 'factory', 'forge']
    .filter(id => powerBuildingControllable(id) && bld(id));
  h += `<div class="subtabs" role="tablist" aria-label="Construction status">` +
    `<button class="subtab ${buildFilter === 'incomplete' ? 'active' : ''}" data-action="build-filter" data-filter="incomplete" role="tab" aria-selected="${buildFilter === 'incomplete'}">Incomplete <span class="subtab-count">${incompleteCount}</span></button>` +
    `<button class="subtab ${buildFilter === 'complete' ? 'active' : ''}" data-action="build-filter" data-filter="complete" role="tab" aria-selected="${buildFilter === 'complete'}">Completed <span class="subtab-count">${completedCount}</span></button>` +
    (controllablePowerBuildings.length ? `<button class="subtab ${buildFilter === 'power' ? 'active' : ''}" data-action="build-filter" data-filter="power" role="tab" aria-selected="${buildFilter === 'power'}">Power</button>` : '') +
    `</div>`;
  if (buildFilter === 'power' && controllablePowerBuildings.length) {
    h += '<div class="res-note">Set how many workers are powered. Power is allocated to Living Blocks first, then Quarry, Deep Mine, Coal Seam, and finally Factories; enabled workers without capacity remain inactive. Forges can be toggled here and do not use Power capacity.</div>';
    const active = powerAllocation();
    for (const id of controllablePowerBuildings) {
      h += `<div class="card"><div class="card-title">${BUILDING_BY_ID.get(id).name}</div>${renderBuildingPower(id, active)}</div>`;
    }
    return h;
  }
  if (buildFilter === 'power') buildFilter = 'incomplete';
  let any = false;
  for (const b of knownBuildings) {
    const count = bld(b.id);
    const maxed = count >= b.max;
    if ((buildFilter === 'complete') !== maxed) continue;
    any = true;
    const cost = buildingCost(b);
    const beaconProject = b.id === 'beacon' && !count;
    const airControlProject = b.id === 'airControl' && !count;
    const greatMigrationProject = b.id === 'greatMigration' && !count;
    const stagedProject = beaconProject || airControlProject || greatMigrationProject;
    const stageId = beaconProject ? 'beaconStage' : airControlProject ? 'airControlStage' : 'greatMigrationStage';
    const queued = state.queues.build.some(entry => entry.id === (stagedProject ? stageId : b.id));
    const forbidden = trialActive('overflow') && Object.values(STORAGE).some(s => s.bld === b.id || s.bonus?.bld === b.id);
    const ok = !maxed && !forbidden &&
      (canAfford(cost) || state.queues.build.length < queueCapacity('build'));
    h += `<div class="card"><div class="card-head">` +
      `<span class="card-title has-tooltip" data-tooltip="${attrText(b.desc)}">${b.name}</span>` +
      (b.max === Infinity ? `<span class="card-count">${count} built</span>` : b.max > 1 ? `<span class="card-count">${count} / ${b.max}</span>` : (count ? `<span class="card-count">built</span>` : '')) +
      `<span class="card-effect">${beaconProject ? `${beaconProgress()} / ${BEACON_STAGE_COUNT} stages` : airControlProject ? `${airControlProgress()} / ${AIR_CONTROL_STAGE_COUNT} stages` : greatMigrationProject ? `${greatMigrationProgress()} / ${GREAT_MIGRATION_STAGE_COUNT} stages` : b.effect()}</span></div>` +
      `<div class="card-cost">cost: ${costHtml(cost)}</div>` +
      renderBuildingPower(b.id) +
      (b.id === 'steamPlant' ? woodFuelControls('steamPlant', count) : '') +
      `<div class="card-actions"><button data-action="build" data-id="${b.id}"${stagedProject ? ' data-repeat' : ''} ${ok ? '' : 'disabled'}>${maxed ? 'Complete' : queued ? 'Queued' : beaconProject ? `Commit stage ${beaconProgress() + 1}` : airControlProject ? `Commit stage ${airControlProgress() + 1}` : greatMigrationProject ? `Commit stage ${greatMigrationProgress() + 1}` : canAfford(cost) ? 'Build' : 'Queue'}</button></div>` +
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
    const queued = state.queues.research.some(entry => entry.id === t.id);
    const cost = researchCost(t);
    const ready = canAfford(cost);
    const ok = !queued && (ready || state.queues.research.length < queueCapacity('research'));
    h += `<div class="card"><div class="card-head">` +
      `<span class="card-title has-tooltip" data-tooltip="${attrText(t.desc)}">${t.name}</span>` +
      `<span class="card-count">${costHtml(cost)}</span></div>` +
      `<div class="card-actions"><button data-action="research" data-id="${t.id}" ${ok ? '' : 'disabled'}>${queued ? 'Queued' : ready ? 'Research' : 'Queue'}</button></div>` +
      `</div>`;
  }
  if (!any) h += '<div class="res-note">The wise have nothing left to learn here.</div>';
  h += `<div class="res-note" style="margin-top:6px">Knowledge is produced by Thinkers (build a Library first) and never returns once spent.</div>`;
  return h;
}

function renderDiplomacy() {
  let h = '<h2 class="section">Diplomacy — neighbors and foreign courts</h2>';
  h += '<div class="res-note">Local contacts can trade, receive diplomats, or be raided at the same time. Departed tribes remain in the chronicle, and their alliances still unlock lineages for future migrations.</div>';
  if (state.unifiedRegion) {
    h += '<div class="card"><div class="card-title">One Nation</div><div class="card-desc">The region is united. Production is +15%, storage capacity is doubled, and the occupation Guards have returned.</div></div>';
  } else if (regionUnificationReady()) {
    h += '<div class="card"><div class="card-title">Unite the Region</div><div class="card-desc">Join the three conquered towns as one nation, return 45 Guards from occupation duty, unlock their lineages, gain +15% production, and double storage.</div><div class="card-actions"><button data-action="unite-region">Unite the Region</button></div></div>';
  }
  if (conquestTrialRelationsLocked()) h += '<div class="trial-mod">The three nations hate Emberhold for reasons known only to the Ancients. Relations are fixed at 0 until they are conquered.</div>';
  const knownEntries = Object.entries(state.diplomacy || {});
  const nearbyCount = knownEntries.filter(([id]) => localTribe(id)).length;
  const distantCount = knownEntries.length - nearbyCount;
  const tab = state.diplomacyTab === 'trade' && bld('tradeBlimp') > 0 ? 'trade' : state.diplomacyTab === 'distant' ? 'distant' : 'nearby';
  state.diplomacyTab = tab;
  h += `<div class="subtabs" role="tablist" aria-label="Diplomacy contacts">` +
    `<button class="subtab ${tab === 'nearby' ? 'active' : ''}" data-action="diplomacy-tab" data-diplomacy-tab="nearby" role="tab" aria-selected="${tab === 'nearby'}">Here <span class="subtab-count">${nearbyCount}</span></button>` +
    `<button class="subtab ${tab === 'distant' ? 'active' : ''}" data-action="diplomacy-tab" data-diplomacy-tab="distant" role="tab" aria-selected="${tab === 'distant'}">Known elsewhere <span class="subtab-count">${distantCount}</span></button>` +
    (bld('tradeBlimp') > 0 ? `<button class="subtab ${tab === 'trade' ? 'active' : ''}" data-action="diplomacy-tab" data-diplomacy-tab="trade" role="tab" aria-selected="${tab === 'trade'}">Trade <span class="subtab-count">${bld('tradeBlimp')}</span></button>` : '') +
    '</div>';
  if (tab === 'trade') return h + renderTradeBlimps();
  if (!tech('currency')) {
    h += '<div class="card"><div class="card-desc">The tribes will speak, but trade requires Currency. Research it to honor their requests with goods.</div></div>';
  }
  let visible = 0;
  for (const [id, entry] of knownEntries) {
    const tribe = tribeDef(id);
    const local = localTribe(id);
    if (state.unifiedRegion && (state.tradePartners || []).includes(id)) continue;
    if ((tab === 'nearby') !== local) continue;
    visible++;
    const requestCost = { [entry.request.res]: entry.request.amount };
    const canSupply = !conquestTrialRelationsLocked() && local && tradeAvailable() && canAfford(requestCost);
    h += `<div class="card ${local ? '' : 'dimmed'}${entry.conquered ? ' conquered-card' : ''}"><div class="card-head"><span class="card-title has-tooltip" data-tooltip="${attrText(tribe.text)}">${tribe.name}</span>` +
      (local ? '<span class="card-count">nearby</span>' : '<span class="card-count">departed</span>') +
      (entry.conquered ? '<span class="status-badge conquered-badge" aria-label="Conquered realm">CONQUERED</span>' : '') +
      `<span class="card-count">likability ${Math.round(entry.disposition)} / ${dispositionCap()}%</span></div>` +
      `<div class="card-desc">${tribe.text}</div>` +
      `<div class="res-note">${habitatText(tribe)}</div>` +
      `<div class="res-note">Military strength: ${entry.militaryKnown ? Math.round(militaryStrength(entry)) : 'unknown'} · Economic strength: ${entry.economicKnown ? Math.round(economicStrength(entry)) : 'unknown'}</div>` +
      `<div class="trial-reward">${lineageDef(id).name} lineage traits: ${lineageTraitsHtml(lineageDef(id))}. ${lineageUnlocked(id) ? 'Unlocked for future migrations.' : 'Migrate with disposition 80+ to unlock for future migrations.'}</div>` +
      (local && (entry.disposition >= 80 || entry.conquered) ? `<div class="trial-reward">Active ally: +${Math.round(alliedTribeIncomeBonus(id) * 1000) / 10}% to all village incomes.</div>` : '') +
      (local && !entry.conquered && entry.disposition < 0 ? `<div class="trial-mod">Relations are strained: the ${tribe.name} may raid the village.</div>` : '') +
      (local && !entry.conquered ? `<div class="trial-goal">${diplomacyRequestText(tribe, entry)}</div>` : local ? '<div class="res-note">This realm is under Emberhold rule; it no longer sends diplomatic requests.</div>' : '<div class="res-note">Only a few nice letters can reach them for now.</div>') +
      (local && !entry.conquered ? `<div class="card-cost">offer: ${costHtml(requestCost)} — +15 relations</div>` : '') +
      (local && !entry.conquered ? `<div class="card-actions"><button data-action="diplomacy-supply" data-tribe="${id}" ${canSupply ? '' : 'disabled'}>Supply the request</button></div>` : '');
    if (local && entry.conquered && !state.unifiedRegion) {
      h += `<div class="card-actions"><button data-action="release-town" data-tribe="${id}">Release the ${tribe.name}</button></div>`;
    }
    if (local && tech('spies') && !entry.conquered) {
      const spyTraining = state.spyTraining?.target === id;
      const spyCost = spyTrainingCost(id);
      const canHire = !state.spyTraining && canAfford(spyCost);
      h += `<div class="res-note">Spies stationed: ${spyCount(id)} — one reveals Military strength; two reveal Economic strength.</div>` +
        (spyTraining ? `<div class="trial-mod">Spy training: ${Math.ceil(state.spyTraining.remaining)}s remaining.</div>` : `<div class="card-actions"><button data-action="spy-hire" data-tribe="${id}" ${canHire ? '' : 'disabled'}>Hire and train a spy (${costHtml(spyCost)})</button></div>`);
      if (tech('espionage') && spyCount(id) > 0 && (entry.espionageT > 0 || militaryStrength(entry) > militaryStrengthFloor(entry))) {
        h += entry.espionageT > 0
          ? `<div class="trial-mod">Espionage attempt in progress: ${Math.ceil(entry.espionageT / 60)} minutes remaining.</div>`
          : `<div class="card-actions"><button data-action="espionage" data-tribe="${id}">Attack Military strength (20 minutes)</button></div>`;
      }
    }
    if (local && tech('guards')) {
      if (entry.conquered) {
        h += `<div class="trial-reward">CONQUERED REALM — +${Math.round(alliedTribeIncomeBonus(id) * 1000) / 10}% to all village incomes. This realm no longer produces diplomatic events.</div>`;
      } else {
        h += '<div class="trial-mod">Attack stages cost more and become harder, but grant more loot rolls. The final three stages also roll for uncommon loot.</div>';
        const selectedStage = raidStage(raidSelections[id]);
        const canRaid = ableGuards() > 0 && canAfford(selectedStage.cost);
        h += `<div class="card-actions raid-actions">` +
          `<label for="raid-stage-${id}">Attack type</label>` +
          `<select id="raid-stage-${id}" data-raid-select="${id}" aria-label="Attack type against the ${tribe.name}">` +
          RAID_STAGES.map(stage => {
            const uncommon = stage.uncommon ? ` + ${stage.uncommon} uncommon` : '';
            return `<option value="${stage.id}" ${stage.id === selectedStage.id ? 'selected' : ''}>${stage.name} — ${costText(stage.cost)} — ${stage.rolls} roll${stage.rolls === 1 ? '' : 's'}${uncommon}</option>`;
          }).join('') +
          `</select><button data-action="raid" data-tribe="${id}" data-stage="${selectedStage.id}" ${canRaid ? '' : 'disabled'}>Attack</button></div>`;
        if (entry.siegeReady) {
          const canConquer = ableGuards() >= 15 && canAfford(CONQUEST_COST);
          h += `<div class="trial-reward">The siege succeeded. Conquest commits 15 healthy Guards, costs ${costText(CONQUEST_COST)}, grants the ally bonus, and causes a steady −1 morale pressure.</div>` +
            `<div class="card-cost">conquest cost: ${costHtml(CONQUEST_COST)}</div>` +
            `<div class="card-actions"><button data-action="conquer" data-tribe="${id}" ${canConquer ? '' : 'disabled'}>Conquer the ${tribe.name} (15 healthy Guards)</button></div>`;
        }
      }
    }
    if (local && tech('longSpeech') && !entry.conquered && entry.disposition >= 300) {
      const canCulturallyConquer = canAfford(CULTURAL_CONQUEST_COST);
      h += `<div class="trial-reward">Long Speech can bring this town into the realm through cultural conquest. This costs ${costText(CULTURAL_CONQUEST_COST)}, spends no Guards, and adds −0.1 Currency/s pressure until regional unification.</div>` +
        `<div class="card-cost">cultural conquest cost: ${costHtml(CULTURAL_CONQUEST_COST)}</div>` +
        `<div class="card-actions"><button data-action="conquer" data-tribe="${id}" ${canCulturallyConquer ? '' : 'disabled'}>Culturally conquer the ${tribe.name} (no Guards)</button></div>`;
    }
    if (local && tech('diplomacy') && !entry.conquered && !conquestTrialRelationsLocked()) {
      const diplomatCostNow = diplomatCost(id);
      h += `<div class="res-note">${JOBS.diplomat.name}s assigned: ${diplomatCount(id)} — each adds +3 relations per minute</div>` +
        `<div class="card-actions"><button data-action="diplomat-inc" data-tribe="${id}" ${canAfford(diplomatCostNow) ? '' : 'disabled'}>Assign Diplomat (${costHtml(diplomatCostNow)})</button></div>`;
    }
    h += '</div>';
  }
  if (!visible) h += `<div class="res-note">${tab === 'nearby' ? 'No contacts are currently here.' : 'No distant contacts are recorded yet.'}</div>`;
  return h;
}

function renderTradeBlimps() {
  let h = '<h2 class="section">Trade Blimps</h2>';
  h += '<div class="res-note">Each blimp carries one good at a time. Buying starts at 1 unit/s and rises by ×1.2 for each higher good; selling returns half the purchase value. Orders pause automatically when storage or Currency is insufficient.</div>';
  for (let index = 0; index < bld('tradeBlimp'); index++) {
    const order = tradeBlimpOrders()[index];
    const resource = order?.resource || TRADE_GOODS[0];
    const mode = order?.mode || 'buy';
    const rate = tradeRate(resource);
    const value = tradeValue(resource);
    h += `<div class="card"><div class="card-head"><span class="card-title">Trade Blimp ${index + 1}</span><span class="card-count">${order ? `${mode}ing` : 'idle'}</span></div>` +
      `<div class="card-desc">${order ? `${mode === 'buy' ? 'Buys' : 'Sells'} ${fmt(rate)} ${resourceName(resource)}/s at ${fmt(value)} Currency each${mode === 'sell' ? ' (receives half value)' : ''}.` : 'Choose one good and an order.'}</div>` +
      `<div class="card-actions"><select data-trade-resource="${index}" aria-label="Good for Trade Blimp ${index + 1}">${TRADE_GOODS.map(id => `<option value="${id}" ${id === resource ? 'selected' : ''}>${resourceName(id)} — ${fmt(tradeRate(id))}/s — ${fmt(tradeValue(id))} Currency</option>`).join('')}</select>` +
      `<button data-action="trade-order" data-index="${index}" data-mode="buy" data-resource="${resource}">Buy</button>` +
      `<button data-action="trade-order" data-index="${index}" data-mode="sell" data-resource="${resource}">Sell</button></div></div>`;
  }
  return h;
}

function renderGovernance() {
  if (!tech('civics')) return '<h2 class="section">Governance</h2><div class="card"><div class="card-desc">Writing and the Age of Iron will give Emberhold the laws needed to govern itself.</div></div>';
  let h = '<h2 class="section">Governance — the Civic Hall</h2>';
  const remaining = Math.ceil(policyCooldownRemaining());
  h += `<div class="res-note">Choose one policy per settlement. Changing policy starts a ${fmt(policyChangeCooldown() / 60)}-minute cooldown, including time offline. Policies and research reset on migration; Civic Law must be researched again.</div>`;
  if (remaining > 0) h += `<div class="res-note">Next policy change available in ${Math.floor(remaining / 60)}m ${remaining % 60}s.</div>`;
  for (const c of CIVICS.filter(c => !c.req || c.req())) h += `<div class="card ${state.policy === c.id ? 'trial-active' : ''}"><div class="card-head"><span class="card-title">${c.name}</span>${state.policy === c.id ? '<span class="card-count">current policy</span>' : ''}</div><div class="card-effect">${c.desc}</div><div class="card-actions"><button data-action="policy" data-id="${c.id}" ${state.policy === c.id || remaining > 0 ? 'disabled' : ''}>Adopt</button></div></div>`;
  if (!tech('council')) return h + '<div class="card"><div class="card-desc">Research The Council to appoint a Governor and advisors.</div></div>';
  h += '<h2 class="section">Governor</h2><div class="res-note">Appointments cost 40 Currency. Only one governor may serve at a time.</div>';
  for (const g of GOVERNORS) h += `<div class="card ${state.governor === g.id ? 'trial-active' : ''}"><div class="card-head"><span class="card-title">${g.name}</span>${state.governor === g.id ? '<span class="card-count">serving</span>' : ''}</div><div class="card-effect">${g.desc}</div><div class="card-actions"><button data-action="governor" data-id="${g.id}" ${state.governor === g.id || state.res.currency < 40 ? 'disabled' : ''}>Appoint</button></div></div>`;
  h += '<h2 class="section">Council</h2><div class="res-note">Two seats are available. Advisors cost 25 Currency to seat or may be dismissed freely.</div>';
  for (const c of COUNCILORS) { const active = state.council.includes(c.id); h += `<div class="card ${active ? 'trial-active' : ''}"><div class="card-head"><span class="card-title">${c.name}</span>${active ? '<span class="card-count">seated</span>' : ''}</div><div class="card-effect">${c.desc}</div><div class="card-actions"><button data-action="councilor" data-id="${c.id}" ${!active && (state.council.length >= 2 || state.res.currency < 25) ? 'disabled' : ''}>${active ? 'Dismiss' : 'Seat advisor'}</button></div></div>`; }
  return h;
}

function renderTrials() {
  if (!state.trial && bld('monument') < 1 && !(era() >= 2 && bld('quarry') > 0) && !conquestTrialAvailable()) {
    return '<h2 class="section">Trials</h2>' +
      '<div class="card"><div class="card-desc">A stone monument, and oaths sworn upon it, would test this village against itself. ' +
      'The Monument becomes possible in the Age of Iron.</div></div>';
  }
  const earlyWayfinding = !state.trial && bld('monument') < 1 && era() >= 2 && bld('quarry') > 0;
  const earlyConquest = !state.trial && bld('monument') < 1 && conquestTrialAvailable();
  let h = `<h2 class="section">Trials${earlyConquest ? ' — an oath of force' : earlyWayfinding ? ' — an oath for the far roads' : ' — oaths sworn upon the Monument'}</h2>`;
  if (earlyWayfinding) h += '<div class="res-note">A Stone-age expedition has revealed a trial that can be sworn before the Monument is raised.</div>';
  if (earlyConquest) h += '<div class="res-note">Hope has opened an oath that can be sworn before the Monument is raised.</div>';
  h += `<div class="res-note">Starting a trial restarts your migration in the same location with the same settings, after confirmation. One trial may be sworn at a time. Completing a trial grants its reward forever; failing one costs nothing but time.${upg('oathkeepers') ? ' The Oathkeepers remember: repeatable trials may be sworn once more.' : ''}</div>`;
  const visibleTrials = earlyConquest || earlyWayfinding
    ? TRIALS.filter(t => (earlyConquest && t.id === 'conquest') || (earlyWayfinding && t.id === 'wayfinding'))
    : TRIALS;
  for (const t of visibleTrials) {
    const active = trialActive(t.id);
    const done = trialCount(t.id);
    const max = trialMax(t);
    const maxed = t.repeat > 0 ? done >= max : done > 0;
    const reqOk = !t.req || t.req();
    h += `<div class="card ${active ? 'trial-active' : ''} ${maxed ? 'done' : ''}">` +
      `<div class="card-head"><span class="card-title">${t.name}</span>` +
      `<span class="trial-count">${t.repeat > 0 ? `completed ${done} / ${max}` : (done ? 'completed' : 'sworn once only')}</span></div>` +
      `<div class="card-desc">${t.text}</div>` +
      `<div class="trial-mod">While sworn: ${trialModifierText(t)}</div>` +
      `<div class="trial-goal">Goal: ${t.goal}</div>` +
      `<div class="trial-reward">Reward: ${t.reward}</div>`;
    if (active) {
      h += `<div class="trial-progress">${trialProgressText()}</div>` +
        `<div class="card-actions"><button data-action="trial-abandon">Break the oath (fail)</button></div>`;
    } else if (!maxed) {
      const canStart = reqOk && !state.trial && !state.migrating;
      const actionText = state.trial ? 'Another trial is sworn' : state.migrating ? 'Migration in progress' : (reqOk ? 'Swear the oath' : 'Not yet possible');
      h += `<div class="card-actions"><button data-action="trial-start" data-id="${t.id}" ${canStart ? '' : 'disabled'}>` +
        `${actionText}</button></div>`;
    } else {
      h += `<div class="trial-progress">Its lesson has been learned.</div>`;
    }
    h += '</div>';
  }
  return h;
}

function wonderCostHtml(cost) {
  return Object.entries(effectiveCoalCost(cost)).map(([id, amount]) => {
    const have = id === 'survey' ? state.surveyPoints || 0 : id === 'citizens' ? unassigned() : state.res[id] || 0;
    const label = id === 'survey' ? 'Survey' : id === 'citizens' ? 'unassigned citizens' : resourceName(id);
    return `<span class="${have >= amount ? 'ok' : 'lack'}">${fmtCost(amount)} ${label}</span>`;
  }).join(', ');
}
function renderWonderDiscovery() {
  const def = wonderDef();
  if (!def) return '';
  const record = wonderRecord(def.id);
  if (record.found) return '';
  if (!tech('optics')) {
    return '<div class="res-note">Research Optics first. Only a properly focused beacon can reveal the way to a Wonder.</div>';
  }
  if (!state.beaconsLit?.[state.landing]) {
    return '<div class="res-note">A beacon must burn at this landing before its hints can lead to its Wonder.</div>';
  }
  if (!state.beaconRevisited?.[state.landing]) {
    return '<div class="res-note">The beacon has burned, but its deeper signal waits. Migrate, then return to this landing.</div>';
  }
  const remaining = remainingWonderChoices(record);
  if (!remaining.length) return `<div class="card done"><div class="card-head"><span class="card-title">${def.name}</span><span class="card-effect">Every known fate has been faced</span></div><div class="card-desc">${def.short}</div></div>`;
  const cost = wonderFindCost(def);
  const ok = canAffordWonderCost(cost);
  return `<div class="card wonder-card"><div class="card-head"><span class="card-title">Find ${def.name}</span><span class="card-count">${beaconsLitCount()} distinct beacon${beaconsLitCount() === 1 ? '' : 's'} guide the search</span></div>` +
    `<div class="card-desc">${def.short}. ${def.findText}</div><div class="card-cost">cost: ${wonderCostHtml(cost)}</div>` +
    `<div class="card-actions"><button data-action="wonder-find" ${ok ? '' : 'disabled'}>Send the Wonder expedition</button></div></div>`;
}
function renderWonderAssignment() {
  const def = wonderDef(); const record = state.wonders?.[state.landing];
  if (!def || !record?.found || wonderReadyForDecision(record)) return '';
  const section = currentWonderSection(record, def);
  const workers = raptureWorkers();
  const raptureCapacity = Math.max(0, Math.floor(state.jobs.guard || 0)) * 2;
  return `<h2 class="section">The Wonder</h2><div class="card wonder-card"><div class="card-head"><span class="card-title">${def.name}</span><span class="card-count">${section.name}</span></div>` +
    `<div class="card-desc">${section.text}</div><div class="res-note">Assign people to Rapture work. This is dangerous. Once someone is assigned, the Wonders tab will track the expedition.</div>` +
    `<div class="job-row"><span class="job-name">Rapture workers</span><span class="job-assign">${workers} / ${raptureCapacity}</span><span class="job-rate">${fmt(record.progress)} / ${WONDER_SECTION_PROGRESS} foothold progress</span>` +
    `<span class="job-btns"><button data-action="rapture-dec" data-repeat title="Hold to repeat" ${workers > 0 ? '' : 'disabled'}>−</button><button data-action="rapture-inc" data-repeat title="Hold to repeat" ${unassigned() > 0 ? '' : 'disabled'}>+</button></span></div></div>`;
}
function renderWonder() {
  const def = wonderDef();
  if (!def) return '<h2 class="section">Wonders</h2>';
  const record = wonderRecord(def.id);
  let h = '<h2 class="section">Wonders</h2>';
  if (!record.found) {
    h += `<div class="res-note">The current landing is ${landingDef().name}. A beacon’s clues may reveal something grander than a ruin.</div>` + renderWonderDiscovery();
    return h;
  }
  const section = currentWonderSection(record, def);
  h += `<div class="card wonder-card"><div class="card-head"><span class="card-title">${def.name}</span><span class="card-count">${section ? `Section ${section.index + 1} of 5` : 'The heart is open'}</span></div>` +
    `<div class="card-desc">${section ? section.text : def.decisionText}</div></div>`;
  h += '<h2 class="section">Sections</h2><div class="wonder-sections">' + def.sections.map(([name, text], index) => {
    const done = !!record.sections[index];
    const tooltipClass = done ? ' has-tooltip' : '';
    const tooltipAttrs = done ? ` tabindex="0" data-tooltip="${attrText(text)}"` : '';
    return `<div class="wonder-section ${done ? 'done' : index === section?.index ? 'active' : ''}${tooltipClass}"${tooltipAttrs}><span>${index + 1}</span>${name}</div>`;
  }).join('') + '</div>';
  if (section) {
    const calamity = activeWonderCalamity();
    const obstacle = currentWonderObstacle(record);
    const obstacleBlocked = !!obstacle;
    const workers = raptureWorkers();
    const healthy = ableGuards(); const total = state.jobs.guard || 0;
    const raptureCapacity = Math.max(0, Math.floor(total)) * 2;
    const woundedOnly = healthy <= 0 && total > 0;
    const armor = Math.pow(1.10, armorLevel());
    const guardWeights = { injury: 40, death: (40 / armor) * (woundedOnly ? 2 : 1), hero: 20 * armor };
    const sum = guardWeights.injury + guardWeights.death + guardWeights.hero;
    h += `<div class="wonder-progress"><div><strong>${section.name}</strong><span>${fmt(record.progress)} / ${WONDER_SECTION_PROGRESS} progress</span></div><progress value="${record.progress}" max="${WONDER_SECTION_PROGRESS}"></progress></div>`;
    h += `<div class="card wonder-calamity"><div class="card-head"><span class="card-title">Calamity: ${calamity.name}</span><span class="card-count">Section ${section.index + 1}</span></div>` +
      `<div class="card-desc">${calamity.text}</div><div class="trial-mod">−${fmt(calamity.amount)} ${resourceName(calamity.resource)}/s while this attempt continues.</div></div>`;
    if (obstacleBlocked) {
      const canBuild = canAfford(obstacle.cost);
      const queued = state.queues.build.some(entry => entry.id === wonderObstacleQueueId(obstacle));
      h += `<div class="card wonder-calamity"><div class="card-head"><span class="card-title">Path blocked: ${obstacle.name}</span><span class="card-count">Obstruction ${obstacle.index + 1} of 5</span></div>` +
        `<div class="card-desc">${obstacle.text}</div><div class="card-cost">build cost: ${wonderCostHtml(obstacle.cost)}</div>` +
        `<div class="card-actions"><button data-action="wonder-obstacle" ${queued || canBuild || state.queues.build.length < queueCapacity('build') ? '' : 'disabled'}>${queued ? 'Queued' : canBuild ? `Build ${obstacle.name}` : `Queue ${obstacle.name}`}</button></div></div>`;
    }
    h += `<div class="card"><div class="card-head"><span class="card-title">Rapture work</span><span class="card-count">${workers} assigned</span></div>` +
      `<div class="res-note">Section danger: ${fmt(wonderDangerMultiplier(record, def))}×. Each section is 25% deadlier than the last. Guards intervene on a lethal incident with a ${Math.round(Math.min(0.98, 0.60 * wonderDefenseMultiplier() * armor) * 100)}% citizen-survival chance.</div>` +
      `<div class="res-note">${healthy} healthy Guard${healthy === 1 ? '' : 's'}; Rapture capacity is ${total * 2}.${woundedOnly ? ` Only injured Guards remain, so guard death is ${Math.round(guardWeights.death / sum * 100)}%.` : ''} Guard outcomes after a save: ${Math.round(guardWeights.injury / sum * 100)}% injury, ${Math.round(guardWeights.death / sum * 100)}% death, ${Math.round(guardWeights.hero / sum * 100)}% both survive.</div>` +
        `<div class="job-row"><span class="job-name">Rapture workers</span><span class="job-assign">${workers} / ${raptureCapacity}</span><span class="job-rate">${fmt(WONDER_PROGRESS_PER_WORKER * wonderProgressMultiplier(record, def))} progress/s each</span>` +
        `<span class="job-btns"><button data-action="rapture-dec" data-repeat title="Hold to repeat" ${workers > 0 ? '' : 'disabled'}>−</button><button data-action="rapture-inc" data-repeat title="Hold to repeat" ${unassigned() > 0 ? '' : 'disabled'}>+</button></span></div></div>`;
    h += '<h2 class="section">Research outside</h2><div class="res-note">Researchers remain outside the Wonder. Some answers ask for people who will not come back.</div>';
    def.researches.forEach((research, index) => {
      if (index > section.index) return;
      const done = !!record.researches?.[index]; const ok = canBuyWonderResearch(index);
      h += `<div class="card ${done ? 'done' : ''}"><div class="card-head"><span class="card-title">${research.name}</span><span class="card-effect">${done ? 'Completed' : research.effect}</span></div>` +
        `<div class="card-cost">cost: ${wonderCostHtml(wonderResearchCost(research))}</div><div class="card-actions"><button data-action="wonder-research" data-id="${index}" ${done || !ok ? 'disabled' : ''}>${done ? 'Completed' : 'Research'}</button></div></div>`;
    });
    h += '<h2 class="section">Interior expeditions</h2><div class="res-note">These preparations help only this attempt. They do not endure as ordinary expeditions do.</div>';
    def.expeditions.forEach((expedition, index) => {
      const done = !!record.expeditions?.[index]; const ok = canAfford(expedition.cost);
      h += `<div class="card ${done ? 'done' : ''}"><div class="card-head"><span class="card-title">${expedition.name}</span><span class="card-effect">${done ? 'Completed' : expedition.effect}</span></div>` +
        `<div class="card-cost">cost: ${wonderCostHtml(expedition.cost)}</div><div class="card-actions"><button data-action="wonder-expedition" data-id="${index}" ${done || !ok ? 'disabled' : ''}>${done ? 'Returned' : 'Send expedition'}</button></div></div>`;
    });
  } else {
    h += '<h2 class="section">The decision</h2><div class="res-note">The fifth section is complete. Whatever happens next, Emberhold will be carried into a migration without choosing the road.</div>';
    const fates = [
      ['become', 'Become One with the Wonder', 'Send the leader into it. Gain Ancient points, and nothing else. Let us pray.'],
      ['restore', 'Restore Its Old Purpose', 'Turn it on and let it do the work for which the Ancient Ones built it.'],
      ['silence', 'Silence the Wonder', 'Turn away from its answers and make sure it troubles nobody ever again.'],
    ];
    fates.forEach(([id, name, text]) => {
      const done = !!record.outcomes?.[id];
      h += `<div class="card ${done ? 'done' : ''}"><div class="card-head"><span class="card-title">${name}</span><span class="card-count">${done ? 'Faced before — repeatable' : 'Ends this attempt'}</span></div><div class="card-desc">${text}</div>` +
        `<div class="card-actions"><button data-action="wonder-fate" data-id="${id}">${done ? 'Choose this fate again' : 'Choose this fate'}</button></div></div>`;
    });
    h += renderShop();
  }
  return h;
}

function renderExpeditions() {
  let h = '<h2 class="section">Expeditions — widen the world</h2>';
  h += '<div class="res-note">Expedition discoveries endure. Site expeditions can be repeated on a harder challenge run to improve their recorded rating.</div>';
  if (beaconsLitCount() > 0) h += '<h2 class="section">Beacon hints</h2>' + renderWonderDiscovery();
  const sitesDone = EXPEDITIONS.filter(e => e.landing && !LANDING_BY_ID.get(e.landing)?.postWaters && expDone(e.id)).length;
  const expeditionLandings = LANDINGS.filter(landing => !landing.postWaters).length;
  h += `<div class="res-note">Site expeditions: ${sitesDone}/${expeditionLandings} established. Develop a settlement at each established landing to send its unique expedition. Rewards endure at every landing. Complete all six for +5% to all production${siteExpeditionsComplete() ? ' — earned!' : ' forever.'}</div>`;
  const rates = production();
  let any = false;
  for (const e of EXPEDITIONS) {
    if (e.landing && e.landing !== state.landing) continue;
    const done = expDone(e.id);
    const canImprove = done && migrationChallengeCount() > expeditionRating(e.id);
    if (done && !canImprove) {
      any = true;
      h += `<div class="card done"><div class="card-head"><span class="card-title">${e.name}</span>` +
        `<span class="card-effect">Established (${CHALLENGE_RATING_NAMES[expeditionRating(e.id)]}) — ${e.effect}</span></div>` +
        `<div class="card-desc">${e.text}</div></div>`;
      continue;
    }
    const cost = expeditionCost(e);
    if (!e.landing && !Object.entries(cost).every(([res, amount]) => capacityOf(res) >= amount && rates[res] > 0)) continue;
    any = true;
    const popOk = state.pop >= e.reqPop;
    const site = LANDING_BY_ID.get(e.landing);
    const queued = state.queues.expedition.some(entry => entry.id === e.id);
    const ok = popOk && (canAfford(cost) || state.queues.expedition.length < queueCapacity('expedition'));
    h += `<div class="card ${done ? 'done' : ''}"><div class="card-head"><span class="card-title has-tooltip" data-tooltip="${attrText(e.text)}">${e.name}</span></div>` +
      `<div class="card-desc">${e.text}</div>` +
      `<div class="card-effect">${done ? `Established (${CHALLENGE_RATING_NAMES[expeditionRating(e.id)]}); improve to ${CHALLENGE_RATING_NAMES[Math.min(4, migrationChallengeCount())]}` : `Grants: ${e.effect}`}</div>` +
      (site ? `<div class="res-note">Requires settlement at ${site.name} — you are here.</div>` : '') +
      `<div class="card-cost">cost: ${costHtml(cost)} — needs ${e.reqPop} villagers</div>` +
      `<div class="card-actions"><button data-action="exp" data-id="${e.id}" ${ok ? '' : 'disabled'}>${queued ? 'Queued' : done ? canAfford(cost) ? 'Repeat at higher difficulty' : 'Queue higher-difficulty repeat' : canAfford(cost) ? 'Send the expedition' : 'Queue the expedition'}</button></div>` +
      `</div>`;
  }
  if (!any) h += '<div class="res-note">No expeditions within reach yet. Increase storage and maintain positive income for their supplies.</div>';
  return h;
}

function renderCustomLineageLab() {
  const draft = state.customLineageDraft;
  if (!draft) return '';
  const points = customLineagePoints();
  const spent = customLineageTraitCost(draft.traits);
  const ready = draft.traits.length > 0 && spent <= points;
  let h = '<h2 class="section">The Prism Womb — Custom Lineage</h2>' +
    `<div class="card trial-active"><div class="card-head"><span class="card-title">Cultivate a new people</span><span class="card-count">${spent} / ${points} genetic point${points === 1 ? '' : 's'}</span></div>` +
    '<div class="card-desc">Your point budget is three times the star rating for The Prism Womb: Restoration (3–12 points). Only improving that achievement adds points. Each positive trait costs 1 more than the positive trait before it. The first frailty refunds 1 point, the second is free, and further frailties are unavailable. The lineage may settle anywhere.</div>';
  for (const group of ['Production', 'Adaptation', 'Trade-off']) {
    const traits = CUSTOM_LINEAGE_TRAITS.filter(trait => trait.group === group);
    h += `<div class="res-note">${group}</div><div class="card-actions">` + traits.map(trait => {
      const selected = draft.traits.includes(trait.id);
      const sameResource = trait.resource && draft.traits.some(id => CUSTOM_LINEAGE_TRAIT_BY_ID.get(id)?.resource === trait.resource && id !== trait.id);
      const cost = customLineageNextTraitCost(draft.traits, trait);
      const hasLineage = customLineageTraitAvailable(trait);
      const blocked = !selected && (!hasLineage || sameResource || !Number.isFinite(cost) || customLineageTraitCost([...draft.traits, trait.id]) > points);
      const requirement = trait.lineage ? ` — requires ${lineageDef(trait.lineage).name}` : '';
      return `<button data-action="custom-lineage-trait" data-id="${trait.id}" ${blocked ? 'disabled' : ''}>${selected ? 'Selected: ' : ''}${esc(trait.name)} (${cost > 0 ? '+' : ''}${cost})${!hasLineage ? esc(requirement) : ''}</button>`;
    }).join('') + '</div><div class="res-note">' + traits.map(trait => `${esc(trait.name)}: ${esc(trait.effect)}`).join(' · ') + '</div>';
  }
  if (customLineageDef()) h += `<div class="res-note">Creating this lineage replaces the existing Custom lineage, ${esc(customLineageDef().name)}.</div>`;
  h += `<div class="card-actions"><button data-action="custom-lineage-create" ${ready ? '' : 'disabled'}>Name and cultivate Custom</button></div></div>`;
  return h;
}

function renderMigration() {
  if (!state.migrating && bld('monument') < 1) {
    return '<h2 class="section">The Great Migration</h2>' +
      '<div class="card"><div class="card-desc">When the Monument stands, the village may weigh its own worth — ' +
      'and, if the generations have been generous, leave everything behind to found a new Emberhold, ' +
      'carrying only what echoes.</div></div>';
  }

  let h = '<h2 class="section">The Great Migration</h2>';
  h += `<div class="res-note">Setting out on a migration abandons the village — research resets, and villagers, stores, and every building are left behind. ` +
    `Completed trials and their rewards, expeditions made, Echoes and everything bought with them endure. ` +
    `Echoes gained grow with the population you leave: floor((villagers − 10)² ÷ 100), increased by 20% per self-challenge. ` +
    `The road, not the village, chooses the destination — each founding lands in different country, with its own gifts and shortages.</div>`;

  if (state.migrating) {
    h += '<h2 class="section">Self-challenges</h2><div class="res-note">Choose any challenges for this founding. Every challenge raises achievements earned during the migration to the matching rating.</div>';
    h += MIGRATION_CHALLENGES.map(challenge => {
      const selected = (state.pendingMigrationChallenges || []).includes(challenge.id);
      return `<div class="card ${selected ? 'lineage-selected' : ''}"><div class="card-head"><span class="card-title">${challenge.name}</span><span class="card-count">${selected ? 'on' : 'off'}</span></div><div class="card-desc">${challenge.desc}</div><div class="card-actions"><button data-action="migration-challenge" data-id="${challenge.id}">${selected ? 'Turn off' : 'Turn on'}</button></div></div>`;
    }).join('');
  }

  h += renderCustomLineageLab();

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
    `<span class="card-count">+${fmtHeld(state.pendingEchoes)} Echoes earned — ${fmtHeld(state.echoes)} in the pouch</span></div>` +
    `<div class="card-desc">The departure is sworn and cannot be recalled. ${state.migrationPreparation ? 'The village must now provision the road before it can leave. Each supply is filled in 100 small commitments, so the stores can be gathered and packed over time.' : 'The road is ready immediately; choose a destination and set out when ready.'}</div>` +
    renderMigrationPreparation() +
    `<div class="card-actions">` +
    `<button data-action="migration-out" ${lineageSelectable(state.pendingSpecies || state.species) && (!state.migrationPreparation || migrationPreparationComplete()) ? '' : 'disabled'}>${state.migrationPreparation && !migrationPreparationComplete() ? 'Finish preparations to set out' : 'Set out — found the new Emberhold'}</button></div>` +
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
      `<div class="res-note">Climate: ${climateDef(landing.id).name} — ${climateDef(landing.id).text}</div>` +
      (landing.postWaters ? '<div class="res-note trial-mod">Malformed creatures dwell here. Their danger starts with the biome traits and rises slowly toward 20; healthy Guards are the defense.</div>' : '') +
      `<div class="res-note">Place traits: ${traitsHtml(landing.traits)}</div>` +
      (expedition ? `<div class="res-note">${expedition.name}: ${expDone(expedition.id) ? 'established' : 'unexplored'} — ${expedition.effect}</div>` : '') +
      `<div class="card-actions"><button data-action="landing" data-id="${landing.id}" ${selected || !allowed ? 'disabled' : ''}>${!allowed ? 'Unsuitable for chosen lineage' : selected ? 'Chosen' : 'Choose this landing'}</button></div></div>`;
  }
  h += '<h2 class="section">Choose a lineage</h2>' +
    '<div class="res-note">Emberborn are always available. Ally with a tribe at disposition 80+ when departing to unlock its lineage for future migrations. Habitat specialists only appear as new neighbors in suitable places. Incompatible lineages and landings are greyed out. To choose a different habitat, first choose a lineage that can live there, such as Emberborn.</div>';
  for (const l of selectableLineages().filter(l => lineageUnlocked(l.id))) {
    const selected = (state.pendingSpecies || state.species) === l.id;
    const allowed = lineageSelectable(l.id);
    h += `<div class="card ${selected ? 'lineage-selected' : ''} ${allowed ? '' : 'dimmed'}"><div class="card-head">` +
      `<span class="card-title has-tooltip" data-tooltip="${attrText(l.desc)}">${l.name}</span></div>` +
      `<div class="card-desc">${l.desc}</div><div class="res-note">Traits: ${lineageTraitsHtml(l)}</div>` +
      `<div class="card-actions"><button data-action="lineage" data-id="${l.id}" ${selected || !allowed ? 'disabled' : ''}>${!allowed ? 'Requires a suitable landing' : selected ? 'Chosen' : 'Choose this lineage'}</button></div></div>`;
  }
  h += renderShop();
  return h;
}

function renderShop() {
  const tab = state.shopTab || 'buy';
  let h = '<h2 class="section">Ancestral Shop — what echoes endure</h2>';
  if (!migrationShopOpen()) {
    h += '<div class="res-note">Points can be added and removed only while a migration is being prepared — a fresh respec before every founding, handy for swearing trials.</div>';
  } else if (!state.migrating) {
    h += '<div class="res-note">The Wonder is ready for its fate. You may spend or refund Echoes before choosing, but the choice still begins the forced migration.</div>';
  }
  const available = [];
  const purchased = [];
  const wonderUnlocks = WONDER_UNLOCKS.filter(def => !def.req || def.req());
  if (wonderUnlocks.length) {
    h += '<h2 class="section">Hope-bound discoveries</h2>';
    h += '<div class="res-note">Hope can preserve a Wonder’s instructions between migrations. The resulting research and buildings still have to be completed in a settlement.</div>';
    for (const def of wonderUnlocks) {
      const bought = wonderUnlock(def.id);
      h += `<div class="card ${bought ? 'done' : ''}"><div class="card-head">` +
        `<span class="card-title has-tooltip" data-tooltip="${attrText(def.desc)}">${def.name}</span>` +
        `<span class="card-effect">${def.effect}</span></div>` +
        `<div class="card-cost">${bought ? 'purchased' : `cost: ${def.cost} Hope`}</div>` +
        `<div class="card-actions"><button data-action="wonder-unlock" data-id="${def.id}" ${!bought && state.migrating && state.hope >= def.cost ? '' : 'disabled'}>${bought ? 'Purchased' : 'Purchase'}</button></div></div>`;
    }
  }
  for (const u of UPGRADES) {
    if (u.req && !u.req()) continue;
    if (u.id === 'farHorizons' && !LINEAGES.some(l => l.id !== 'human' && lineageUnlocked(l.id))) continue;
    if (u.id === 'fearOfTheConqueror' && !fearOfTheConquerorAvailable()) continue;
    if (u.id === 'practicedMigrator' && !practicedMigratorAvailable()) continue;
    if (u.id === 'animalHusbandry' && !animalHusbandryAvailable()) continue;
    if (u.id === 'blackGoldDrills' && !perm('surveyFlights')) continue;
    const lvl = upg(u.id);
    const maxed = lvl >= u.max;
    const nextCost = maxed ? null : upgradeCost(u, lvl);
    if (state.migrating && !maxed && nextCost > totalMigrationEchoes()) continue;
    const card = `<div class="card ${maxed ? 'done' : ''}"><div class="card-head">` +
      `<span class="card-title has-tooltip" data-tooltip="${attrText(u.desc)}">${u.name}</span>` +
      `<span class="card-count">${lvl} / ${u.max}</span>` +
      `<span class="card-effect">${u.effect}</span></div>` +
      `<div class="card-cost">${maxed ? 'fully learned' : `next level: ${fmtEchoCost(nextCost)} Echo${nextCost === 1 ? '' : 'es'}`}</div>` +
      `<div class="card-actions">` +
      `<button data-action="migration-buy" data-id="${u.id}" ${migrationShopOpen() && !maxed && state.echoes >= nextCost ? '' : 'disabled'}>Buy</button> ` +
      `<button data-action="migration-refund" data-id="${u.id}" ${migrationShopOpen() && lvl > 0 ? '' : 'disabled'}>Refund</button>` +
      `</div></div>`;
    (maxed ? purchased : available).push(card);
  }
  h += `<div class="subtabs" role="tablist" aria-label="Ancestral Shop upgrades">` +
    `<button class="subtab ${tab === 'buy' ? 'active' : ''}" data-action="shop-tab" data-shop-tab="buy" role="tab" aria-selected="${tab === 'buy'}">Buy <span class="subtab-count">${available.length}</span></button>` +
    `<button class="subtab ${tab === 'purchased' ? 'active' : ''}" data-action="shop-tab" data-shop-tab="purchased" role="tab" aria-selected="${tab === 'purchased'}">Purchased <span class="subtab-count">${purchased.length}</span></button>` +
    `</div>`;
  const visible = tab === 'purchased' ? purchased : available;
  h += visible.length ? visible.join('') : `<div class="res-note">${tab === 'purchased' ? 'No ancestral upgrades are fully learned yet.' : 'Every available ancestral upgrade is fully learned.'}</div>`;
  return h;
}

function renderMigrationPreparation() {
  if (!state.migrationPreparation) return '';
  let h = '<h2 class="section">Migration preparations</h2>';
  h += `<div class="res-note">Each 1% consumes one hundredth of the total listed cost. ${upg('knownTask') ? 'Known Task automatically commits matching supplies as they are produced.' : 'Hold a button to commit available supplies as they arrive.'}</div>`;
  for (const project of RESOURCE_PROJECTS) {
    const progress = projectProgress(project.id);
    const partCost = projectPartCost(project);
    const affordable = (state.res[project.resource] || 0) >= partCost;
    h += `<div class="card ${progress >= 100 ? 'done' : ''}">` +
      `<div class="card-head"><span class="card-title">${project.name}</span><span class="card-count">${progress}%</span></div>` +
      `<div class="card-desc">${fmtHeld(progress * partCost)} / ${fmtCost(project.total)} ${resourceName(project.resource)} committed.</div>` +
      `<progress value="${progress}" max="100" aria-label="${attrText(project.name)} progress"></progress>` +
      `<div class="card-cost">${fmtCost(partCost)} ${resourceName(project.resource)} per 1% · ${fmtHeld(state.res[project.resource] || 0)} available</div>` +
      `<div class="card-actions"><button data-action="migration-prepare" data-id="${project.id}" data-repeat ${progress >= 100 || !affordable ? 'disabled' : ''}>${progress >= 100 ? 'Complete' : 'Commit 1%'}</button></div></div>`;
  }
  return h;
}

function renderStats() {
  const tab = state.statsTab || 'stats';
  const completed = completedAchievementCount();
  let h = '<h2 class="section">Emberhold record</h2>' +
    `<div class="subtabs" role="tablist" aria-label="Statistics sections">` +
    ['stats', 'achievements', 'perks'].map(id => `<button class="subtab ${tab === id ? 'active' : ''}" data-action="stats-tab" data-stats-tab="${id}" role="tab" aria-selected="${tab === id}">${id[0].toUpperCase() + id.slice(1)}${id === 'achievements' ? ` <span class="subtab-count">${completed}/${ACHIEVEMENTS.length}</span>` : ''}</button>`).join('') + '</div>';
  if (tab === 'achievements') {
    h += '<div class="res-note stats-intro">Achievements are the work Emberhold is expected to do. Complete them naturally as your settlement grows.</div>';
    h += ACHIEVEMENTS.filter(a => achievementRating(a.id) > 0).map(a => { const rating = achievementRating(a.id); return `<div class="achievement-card card done"><div class="card-head"><span class="card-title">✦ ${a.name}</span><span class="card-count">${CHALLENGE_RATING_NAMES[rating]}</span><span class="card-effect">${a.effect ? `${a.effect} ×${rating}; ` : ''}+${(0.25 * rating).toFixed(2)}% production</span></div><div class="card-desc">${a.desc}</div><div class="achievement-progress">Achievement bonus at ${CHALLENGE_RATING_NAMES[rating]} strength</div></div>`; }).join('');
    return h;
  }
  if (tab === 'perks') {
    h += '<div class="res-note stats-intro">Perks are your proof of passage — permanent progress and rare accomplishments worth showing off.</div>';
    const perks = [
      ['Echoes carried', fmtHeld(state.echoes), 'The ancestral currency of every migration.'],
      ['Ancestral upgrades', `${totalUpgrades()} levels`, `${Object.keys(state.upgrades || {}).length} upgrade paths awakened.`],
      ['Trials completed', fmt(totalTrialsCompleted()), 'Oaths that left a mark on the lineage.'],
      ['Expeditions established', `${Object.keys(state.expeditions || {}).length} / ${LANDINGS.length}`, 'Roads and sites remembered across migrations.'],
      ['Lineages unlocked', `${selectableLineages().filter(lineage => lineageUnlocked(lineage.id)).length} / ${selectableLineages().length}`, 'The peoples who may yet call Emberhold home.'],
      ['Tribes encountered', `${Object.keys(state.tribesSeen || {}).length}`, 'Contacts recorded in the chronicle.'],
    ];
    h += perks.map(([name, value, desc]) => `<div class="perk-card card"><div class="card-head"><span class="card-title">${name}</span><span class="card-effect">${value}</span></div><div class="card-desc">${desc}</div></div>`).join('');
    return h;
  }
  const buildings = Object.values(state.bld || {}).reduce((sum, n) => sum + n, 0);
  const research = Object.keys(state.techs || {}).length;
  h += '<div class="stats-grid">' + [
    ['Current era', ERAS[state.era - 1]?.name || 'Unknown', `Age ${state.era} of ${ERAS.length}`],
    ['Settlement age', `${fmt(state.day)} days`, `at ${landingDef().name}`],
    ['Population', fmt(state.pop), `${fmt(popCap())} housing capacity`],
    ['Buildings raised', fmt(buildings), `${Object.keys(state.bld || {}).length} types`],
    ['Research completed', fmt(research), `${Object.keys(state.techs || {}).length} discoveries`],
    ['Current lineage', lineageDef(state.species).name, lineageTraitsText(lineageDef(state.species))],
    ['Completion bonus', `+${(achievementRatingTotal() * 0.25).toFixed(2)}%`, `${completed} of ${ACHIEVEMENTS.length} achievements completed; ratings add their strength`],
  ].map(([label, value, note]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`).join('') + '</div>';
  h += '<h2 class="section">Lifetime marks</h2><div class="res-note">Completed trials: ' + fmt(totalTrialsCompleted()) + ' · Sites established: ' + Object.keys(state.expeditions || {}).length + ' · Echoes held: ' + fmtHeld(state.echoes) + '</div>';
  return h;
}

function renderSettings() {
  const settings = state.settings || {};
  let h = '<h2 class="section">Settings</h2><div class="res-note settings-intro">Tune the chronicle to suit your session. Preferences are stored with your save.</div>';
  const options = [
    ['autosave', 'Autosave', 'Save the chronicle automatically every 15 seconds.'],
    ['reducedMotion', 'Reduced motion', 'Remove hover lifts and animated transitions.'],
    ['compactStores', 'Compact stores', 'Use a tighter resource list in the persistent sidebar.'],
    ['strictQueueOrder', 'Strict queue order', 'Process queued items one at a time from first to last.'],
    ['tooltips', 'Tooltips', 'Show helpful details when hovering over labeled elements.'],
    ['resetControls', 'Show reset controls', 'Expose the soft and hard reset actions below. Keep this off during ordinary play.'],
  ];
  h += options.map(([id, name, desc]) => `<div class="setting-row"><div><div class="setting-name">${name}</div><div class="setting-desc">${desc}</div></div><button class="setting-toggle ${settings[id] ? 'enabled' : ''}" data-action="setting-toggle" data-setting="${id}" aria-pressed="${!!settings[id]}">${settings[id] ? 'On' : 'Off'}</button></div>`).join('');
  h += `<div class="setting-row"><div><div class="setting-name">Temperature unit</div><div class="setting-desc">Show weather temperatures in Celsius or Fahrenheit.</div></div><button class="setting-toggle ${settings.fahrenheit ? 'enabled' : ''}" data-action="setting-toggle" data-setting="fahrenheit" aria-pressed="${!!settings.fahrenheit}">${settings.fahrenheit ? 'Fahrenheit' : 'Celsius'}</button></div>`;
  h += `<div class="setting-row"><div><div class="setting-name">Wood for one-time coal costs</div><div class="setting-desc">Use 5× Wood for the next building, research, expedition, or craft cost that contains Coal.</div></div>${woodFuelInlineControls('cost', 1)}</div>`;
  h += '<h2 class="section">Chronicle tools</h2><div class="settings-actions"><button data-action="save">Save now</button><button data-action="export">Export save</button><button data-action="import">Import save</button></div>';
  if (settings.resetControls) {
    h += '<div class="reset-controls card"><div class="card-title">Leave this chronicle</div><div class="card-desc">Use a soft reset when a trial or settlement has reached a dead end. It gives migration choices and makes the road ready immediately, but grants no Echoes or rewards.</div><div class="settings-actions"><button data-action="soft-reset">Soft Reset</button><button data-action="reset" class="danger-button">Hard Reset</button></div><div class="res-note settings-note"><strong>Hard Reset erases everything.</strong> All settlements, migrations, trials, Wonders, achievements, and permanent upgrades will be deleted. Export a backup first if there is any chance you may want to return.</div></div>';
  }
  h += '<div class="res-note settings-note">Export a backup before resetting. Imported saves replace the current chronicle after validation.</div>';
  return h;
}

// Patch existing nodes instead of replacing panels, preserving focus and hover.
function updateContent(element, html) {
  // Native dropdowns must retain both their node and options while open.
  const focused = document.activeElement;
  if (focused && element.contains(focused) && focused.matches('select, input, textarea, [contenteditable="true"]')) return;
  const template = document.createElement('template');
  template.innerHTML = html;
  function patch(parent, desired) {
    const nextNodes = [...desired.childNodes];
    for (let i = 0; i < nextNodes.length; i++) {
      const next = nextNodes[i];
      const current = parent.childNodes[i];
      if (!current) {
        parent.appendChild(next.cloneNode(true));
      } else if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
        current.replaceWith(next.cloneNode(true));
      } else if (current.nodeType === 1) {
        for (const attribute of [...current.attributes]) {
          if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
        }
        for (const attribute of next.attributes) {
          if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
        }
        patch(current, next);
      } else if (current.nodeValue !== next.nodeValue) {
        current.nodeValue = next.nodeValue;
      }
    }
    while (parent.childNodes.length > nextNodes.length) parent.lastChild.remove();
  }
  patch(element, template.content);
}

function renderLog() {
  const el = document.getElementById('log');
  const filter = document.querySelector('[data-log-filter].active')?.dataset.logFilter || 'all';
  let h = '';
  const entries = filter === 'all' ? allLogEntries() : (state.logs[filter] || []);
  for (const e of entries.slice(0, LOG_LIMIT_PER_CATEGORY)) {
    h += `<div class="log-entry ${e.c}"><span class="log-day">d${e.d}</span>${esc(e.t)}</div>`;
  }
  updateContent(el, h);
}

function renderSidePanel() {
  for (const type of ['build', 'research', 'expedition']) {
    const el = document.getElementById(`queue-${type}`);
    const label = type === 'build' ? 'Building Queue' : type === 'research' ? 'Research Queue' : 'Expedition Queue';
    updateContent(el, `<div class="queue-label">${label} (${state.queues[type].length}/${queueCapacity(type)})</div>${renderQueue(type)}`);
  }
}

function loadLatestUpdatesTooltip() {
  const button = document.getElementById('btn-updates');
  if (!button || typeof fetch !== 'function' || typeof DOMParser !== 'function') return;
      fetch('changelog.html?v=publish-20260923u0002')
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
      if (date && updates.length) {
        button.dataset.tooltip = `Latest updates (${date}):\n${updates.join('\n')}`;
        if (button.matches('.has-tooltip:hover, .has-tooltip:focus')) positionTooltip(button);
      }
    })
    .catch(() => {});
}

function render() {
  updateAchievements();
  renderHeader();
  document.querySelectorAll('#tabs .tab').forEach(button => {
    const unlocked = tabUnlocked(button.dataset.tab);
    button.classList.toggle('hidden', !unlocked);
    button.setAttribute('aria-hidden', String(!unlocked));
  });
  updateContent(document.getElementById('stores'), renderStores());
  const panels = {
    village: renderVillage,
    build: renderBuild,
    research: renderResearch,
    diplomacy: renderDiplomacy,
    governance: renderGovernance,
    trials: renderTrials,
    expeditions: renderExpeditions,
    wonders: renderWonder,
    migration: renderMigration,
    stats: renderStats,
    settings: renderSettings,
  };
  updateContent(document.getElementById('panel-' + activeTab), panels[activeTab]());
  renderSidePanel();
  renderLog();
  const tip = document.querySelector('.has-tooltip:hover, .has-tooltip:focus');
  if (tip) {
    positionTooltip(tip);
    positionStoresTooltip(tip);
  }
}

function switchTab(tab) {
  if (!tabUnlocked(tab)) return;
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
  if (!state) return null;
  const snapshot = JSON.parse(JSON.stringify({ ...state, power: powerStatus() }));
  snapshot.diplomacy = Object.fromEntries(Object.entries(snapshot.diplomacy || {}).map(([id, record]) => {
    const base = Number(record.militaryBaseStrength) || Number(record.militaryStrength) || 100;
    const current = Math.max(1, Number(record.militaryStrength) || 100);
    const floor = militaryStrengthFloor();
    const siegeDefense = current * raidStage('siege').difficulty;
    return [id, { ...record,
      hostile: Number(record.disposition) < 0,
      conquered: record.conquered === true,
      conquerable: record.conquered !== true && record.siegeReady === true,
      enemyAttack: current,
      enemyDefense: current,
      knownEnemyAttack: record.militaryKnown === true ? current : null,
      knownEnemyDefense: record.militaryKnown === true ? current : null,
      siegeDefense,
      fortification: siegeDefense,
      espionageReduction: Math.max(0, base - current),
      maximumEspionageReduction: Math.max(0, base - floor),
      espionageReductionLevel: Math.max(0, base - current),
      maximumEspionageReductionLevel: Math.max(0, base - floor),
      spies: spyCount(id),
    }];
  }));
  return snapshot;
}

function powerStatus() {
  const breakdown = {};
  const rates = production(0, breakdown);
  const generated = breakdown.power.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0);
  const active = powerAllocation();
  const used = breakdown.power.reduce((sum, entry) => sum + Math.max(0, -entry.amount), 0) +
    active.factory * factoryPowerRequirement();
  const buildings = {};
  for (const [id, info] of Object.entries(POWER_BUILDINGS)) {
    if (!powerBuildingControllable(id) || bld(id) < 1) continue;
    const enabled = buildingPowerCount(id);
    const capacity = powerBuildingMax(id);
    const job = DIG_SITE_WORKERS[id] || null;
    buildings[id] = { built: bld(id), capacity, enabled, active: active[id], powerPerBuilding: info.power,
      requested: enabled * info.power, used: active[id] * info.power,
      ...(job ? { job, workerCapacity: capacity } : {}),
      ...(DIG_SITE_RESOURCES[id] ? { resource: DIG_SITE_RESOURCES[id], productionBonus: active[id] * 0.10 } : {}) };
  }
  const requested = used + Object.values(buildings).reduce((sum, building) => sum + building.requested - building.used, 0);
  return { generated, used, available: Math.max(0, rates.power - active.factory * factoryPowerRequirement()), requested,
    shortfall: Math.max(0, requested - generated), buildings };
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
  setJob,
  assignRapture,
  findWonder,
  wonderResearch: buyWonderResearch,
  wonderObstacle: attemptWonderObstacle,
  wonderExpedition: buyWonderExpedition,
  chooseWonderFate,
  buyWonderUnlock,
  setBuildingPower,
  setWoodForCoal,
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
  migrationPrepare: prepareMigration,
  migrationBuy,
  migrationOut: setOut,
  migrationRefund,
  raid: doRaid,
  attack: doRaid,
  siege: (id, guardCount = ableGuards()) => doRaid(id, 'siege', guardCount),
  conquer: conquerTown,
  release: releaseTown,
  research: attemptResearch,
  reorderQueue,
  trialAbandon: () => endTrial(false),
  trialStart: startTrial,
  supplyDiplomacyRequest,
  governor: appointGovernor,
  spyHire: hireSpy,
  sendSpy: hireSpy,
  espionage: beginEspionage,
  startEspionage: beginEspionage,
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
  getPower: powerStatus,
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
    spyCount,
    woodForCoalCount,
    woodFuelTotal,
    buildingCost,
    canBuild,
    canAfford,
    capacityOf,
    expeditionCost,
    factoryRecipe,
    factoryRecipes,
    buildingPowerCount,
    digSitePower,
    setBuildingPower,
    landingDef,
    popCap,
    production,
    jobProduction,
    jobCapacity,
    queueDemand,
    morale: moraleTelemetry,
    moraleRate,
    moraleBreakdown,
    marginalMorale,
    researchCost,
    tech,
    trialActive,
    unassigned,
    setJob,
    assignRapture,
    findWonder,
    wonderResearch: buyWonderResearch,
    wonderObstacle: attemptWonderObstacle,
    wonderExpedition: buyWonderExpedition,
    chooseWonderFate,
    buyWonderUnlock,
    guardAttackPower,
    guardSiegePower,
    guardLimits,
    conquestCost: () => ({ ...CONQUEST_COST }),
    validGuardCounts: guardLimits,
    predictAttack: predictRaid,
    predictSiege: (id, guardCount = ableGuards()) => predictRaid(id, 'siege', guardCount),
    canWinAttack: (id, stageId = 'raid', guardCount = ableGuards()) => predictRaid(id, stageId, guardCount).likelyWin,
    canWinSiege: (id, guardCount = ableGuards()) => predictRaid(id, 'siege', guardCount).likelyWin,
    sendSpy: hireSpy,
    startEspionage: beginEspionage,
  },
  render,
  switchTab,
  definitions: { RESOURCES, RESOURCE_PROJECTS, JOBS, BUILDINGS, CRAFTS, TECHS, CIVICS, GOVERNORS,
    COUNCILORS, TRIALS, EXPEDITIONS, WONDERS, WONDER_UNLOCKS, LANDINGS, LINEAGES, UPGRADES, FACTORY_RECIPES },
};

// ---------- events ----------
let repeatTimer = null;
let repeatButton = null;
let suppressRepeatClick = false;
let draggedQueueItem = null;
let suppressQueueClick = false;

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
    case 'migration-challenge': toggleMigrationChallenge(btn.dataset.id); render(); break;
    case 'factory-recipe': chooseFactoryRecipe(btn.dataset.id); render(); break;
    case 'power-off': setBuildingPower(btn.dataset.id, 0); render(); break;
    case 'power-dec': setBuildingPower(btn.dataset.id, buildingPowerCount(btn.dataset.id) - 1); render(); break;
    case 'power-inc': setBuildingPower(btn.dataset.id, buildingPowerCount(btn.dataset.id) + 1); render(); break;
    case 'power-all': setBuildingPower(btn.dataset.id, powerBuildingMax(btn.dataset.id)); render(); break;
    case 'wood-coal-dec': setWoodForCoal(btn.dataset.id, woodForCoalCount(btn.dataset.id, woodFuelTotal(btn.dataset.id)) - 1); render(); break;
    case 'wood-coal-inc': setWoodForCoal(btn.dataset.id, woodForCoalCount(btn.dataset.id, woodFuelTotal(btn.dataset.id)) + 1); render(); break;
    case 'research': attemptResearch(btn.dataset.id); render(); break;
    case 'queue-cancel': cancelQueue(btn.dataset.type, +btn.dataset.index); render(); break;
    case 'diplomacy-supply': supplyDiplomacyRequest(btn.dataset.tribe); render(); break;
    case 'diplomacy-tab': state.diplomacyTab = btn.dataset.diplomacyTab === 'trade' ? 'trade' : btn.dataset.diplomacyTab === 'distant' ? 'distant' : 'nearby'; render(); break;
    case 'trade-order': setTradeBlimpOrder(+btn.dataset.index, btn.dataset.mode, btn.dataset.resource); render(); break;
    case 'spy-hire': hireSpy(btn.dataset.tribe); render(); break;
    case 'espionage': beginEspionage(btn.dataset.tribe); render(); break;
    case 'raid': doRaid(btn.dataset.tribe, btn.dataset.stage); render(); break;
    case 'conquer': conquerTown(btn.dataset.tribe); render(); break;
    case 'release-town': releaseTown(btn.dataset.tribe); render(); break;
    case 'unite-region': uniteRegion(); render(); break;
    case 'diplomat-inc': doAssignDiplomat(btn.dataset.tribe, +1); render(); break;
    case 'diplomat-dec': doAssignDiplomat(btn.dataset.tribe, -1); render(); break;
    case 'performer-inc': doAssignPerformer(+1); render(); break;
    case 'performer-dec': doAssignPerformer(-1); render(); break;
    case 'explorer-inc': doAssignExplorer(+1); render(); break;
    case 'explorer-dec': doAssignExplorer(-1); render(); break;
    case 'rapture-inc': assignRapture(+1); render(); break;
    case 'rapture-dec': assignRapture(-1); render(); break;
    case 'wonder-find': findWonder(); render(); break;
    case 'wonder-research': buyWonderResearch(+btn.dataset.id); render(); break;
    case 'wonder-obstacle': attemptWonderObstacle(); render(); break;
    case 'wonder-expedition': buyWonderExpedition(+btn.dataset.id); render(); break;
    case 'wonder-fate': chooseWonderFate(btn.dataset.id); render(); break;
    case 'policy': choosePolicy(btn.dataset.id); render(); break;
    case 'governor': appointGovernor(btn.dataset.id); render(); break;
    case 'councilor': toggleCouncilor(btn.dataset.id); render(); break;
    case 'trial-start': startTrial(btn.dataset.id); render(); break;
    case 'trial-abandon': endTrial(false); render(); break;
    case 'exp': attemptExpedition(btn.dataset.id); render(); break;
    case 'migration-begin': beginMigration(); render(); break;
    case 'migration-out': setOut(); render(); break;
    case 'migration-prepare': prepareMigration(btn.dataset.id); render(); break;
    case 'lineage': chooseLineage(btn.dataset.id); render(); break;
    case 'custom-lineage-trait': chooseCustomLineageTrait(btn.dataset.id); render(); break;
    case 'custom-lineage-create': createCustomLineage(); render(); break;
    case 'landing': chooseLanding(btn.dataset.id); render(); break;
    case 'migration-buy': migrationBuy(btn.dataset.id); render(); break;
    case 'wonder-unlock': buyWonderUnlock(btn.dataset.id); render(); break;
    case 'migration-refund': migrationRefund(btn.dataset.id); render(); break;
    case 'shop-tab': state.shopTab = btn.dataset.shopTab === 'purchased' ? 'purchased' : 'buy'; render(); break;
    case 'stats-tab': state.statsTab = btn.dataset.statsTab; render(); break;
    case 'setting-toggle': setSetting(btn.dataset.setting); render(); break;
    case 'tutorial-dismiss': state.tutorialDismissed = true; saveGame(true); render(); break;
    case 'save': saveGame(); render(); break;
    case 'export': exportSave(); break;
    case 'import': importSave(); break;
    case 'soft-reset':
      beginSoftReset();
      if (state.migrating) switchTab('migration');
      else render();
      break;
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
  const logFilter = e.target.closest('[data-log-filter]');
  if (logFilter) {
    document.querySelectorAll('[data-log-filter]').forEach(button => button.classList.remove('active'));
    logFilter.classList.add('active');
    renderLog();
    return;
  }
  const logAction = e.target.closest('[data-log-action]');
  if (logAction) {
    if (logAction.dataset.logAction === 'clear-all') {
      state.logs = Object.fromEntries(LOG_CATEGORIES.map(category => [category, []]));
    } else {
      const filter = document.querySelector('[data-log-filter].active')?.dataset.logFilter || 'all';
      if (filter === 'all') state.logs = Object.fromEntries(LOG_CATEGORIES.map(category => [category, []]));
      else state.logs[filter] = [];
    }
    state.log = allLogEntries();
    render();
    return;
  }
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  if (suppressQueueClick && btn.dataset.action === 'queue-cancel') {
    suppressQueueClick = false;
    return;
  }
  if (suppressRepeatClick && repeatable(btn)) {
    suppressRepeatClick = false;
    return;
  }
  runAction(btn);
  render();
});

document.addEventListener('dragstart', (e) => {
  const item = e.target.closest('[data-queue-item]');
  if (!item) return;
  draggedQueueItem = { type: item.dataset.type, index: +item.dataset.index, item };
  item.classList.add('queue-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', `${draggedQueueItem.type}:${draggedQueueItem.index}`);
  // The queue renders its own insertion preview. Hide the browser's native
  // drag ghost so it does not appear as a second copy of the dragged item.
  const dragImage = document.createElement('canvas');
  dragImage.width = 1;
  dragImage.height = 1;
  e.dataTransfer.setDragImage(dragImage, 0, 0);
});

document.addEventListener('dragover', (e) => {
  const insertionPreview = draggedQueueItem?.preview;
  const onPreview = insertionPreview && (e.target === insertionPreview || insertionPreview.contains(e.target));
  if (onPreview) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    draggedQueueItem.drop = {
      index: +insertionPreview.dataset.index,
      after: insertionPreview.dataset.after === 'true',
    };
    return;
  }
  const target = e.target.closest('[data-queue-item]');
  if (!draggedQueueItem || !target || target.dataset.type !== draggedQueueItem.type) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const before = e.clientY < target.getBoundingClientRect().top + target.offsetHeight / 2;
  const preview = ensureQueueDragPreview();
  preview.dataset.index = target.dataset.index;
  preview.dataset.after = String(!before);
  draggedQueueItem.drop = { index: +target.dataset.index, after: !before };
  if (before) target.before(preview);
  else target.after(preview);
  target.classList.toggle('queue-drop-before', before);
  target.classList.toggle('queue-drop-after', !before);
});

document.addEventListener('drop', (e) => {
  const target = e.target.closest('[data-queue-item]');
  if (!draggedQueueItem) return;
  const preview = draggedQueueItem.preview;
  const onPreview = preview && (e.target === preview || preview.contains(e.target));
  if ((!target || target.dataset.type !== draggedQueueItem.type) && !onPreview) return;
  e.preventDefault();
  const drop = draggedQueueItem.drop || {
    index: target ? +target.dataset.index : +preview.dataset.index,
    after: target ? e.clientY >= target.getBoundingClientRect().top + target.offsetHeight / 2 : preview.dataset.after === 'true',
  };
  const moved = reorderQueue(draggedQueueItem.type, draggedQueueItem.index, drop.index, drop.after);
  suppressQueueClick = moved;
  clearQueueDragState();
  if (moved) render();
});

document.addEventListener('dragend', () => {
  if (draggedQueueItem) clearQueueDragState();
});

function clearQueueDragState() {
  if (draggedQueueItem?.preview) draggedQueueItem.preview.remove();
  document.querySelectorAll('.queue-dragging, .queue-drop-before, .queue-drop-after')
    .forEach(item => item.classList.remove('queue-dragging', 'queue-drop-before', 'queue-drop-after'));
  draggedQueueItem = null;
  if (suppressQueueClick) setTimeout(() => { suppressQueueClick = false; }, 0);
}

function ensureQueueDragPreview() {
  if (draggedQueueItem.preview) return draggedQueueItem.preview;
  const preview = document.createElement('div');
  preview.className = 'queue-item queue-drag-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.innerHTML = draggedQueueItem.item.innerHTML;
  draggedQueueItem.preview = preview;
  return preview;
}

document.addEventListener('change', (e) => {
  const tradeSelect = e.target.closest('[data-trade-resource]');
  if (tradeSelect) {
    const card = tradeSelect.closest('.card');
    card?.querySelectorAll('[data-action="trade-order"]').forEach(button => { button.dataset.resource = tradeSelect.value; });
    render();
    return;
  }
  const select = e.target.closest('[data-raid-select]');
  if (!select) return;
  const stage = raidStage(select.value);
  const tribeId = select.dataset.raidSelect;
  raidSelections[tribeId] = stage.id;
  const button = select.parentElement.querySelector('[data-action="raid"]');
  if (button) {
    button.dataset.stage = stage.id;
    button.disabled = ableGuards() < 1 || !canAfford(stage.cost);
  }
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
  const tip = e.target.closest('.has-tooltip');
  if (tip) {
    tooltipHover = true;
    positionTooltip(tip);
    positionStoresTooltip(tip);
    if (tip.matches('#stores-panel .res-rate.has-tooltip')) showStoresTooltip(tip);
  }
});
document.addEventListener('focusin', (e) => {
  const tip = e.target.closest('.has-tooltip');
  if (tip) {
    positionTooltip(tip);
    positionStoresTooltip(tip);
    if (tip.matches('#stores-panel .res-rate.has-tooltip')) showStoresTooltip(tip);
  }
});
if (typeof window.addEventListener === 'function') {
  window.addEventListener('resize', () => {
    const tip = document.querySelector('#stores-panel .res-rate.has-tooltip:hover, #stores-panel .res-rate.has-tooltip:focus');
    if (tip) {
      positionTooltip(tip);
      positionStoresTooltip(tip);
    }
  });
  window.addEventListener('scroll', () => {
    const tip = document.querySelector('.has-tooltip:hover, .has-tooltip:focus');
    if (tip) {
      positionTooltip(tip);
      positionStoresTooltip(tip);
    }
  }, true);
}
document.addEventListener('mouseout', (e) => {
  const tip = e.target.closest('.has-tooltip');
  const related = e.relatedTarget;
  if (tip && !related?.closest?.('.has-tooltip') && !related?.closest?.('.stores-tooltip-overlay')) {
    tooltipHover = false;
    if (tip.matches('#stores-panel .res-rate.has-tooltip')) hideStoresTooltip();
  }
  if (e.target.closest('.stores-tooltip-overlay') && !related?.closest?.('.stores-tooltip-overlay') && related !== storesTooltipAnchor) hideStoresTooltip();
});

function showStoresTooltip(tip) {
  if (storesTooltipAnchor === tip && storesTooltipOverlay) return;
  hideStoresTooltip();
  storesTooltipAnchor = tip;
  storesTooltipOverlay = document.createElement('div');
  storesTooltipOverlay.className = 'stores-tooltip-overlay';
  storesTooltipOverlay.textContent = tip.dataset.tooltip || '';
  document.body.appendChild(storesTooltipOverlay);
  tip.classList.add('stores-tooltip-active');
  positionStoresTooltip(tip);
}

function hideStoresTooltip() {
  storesTooltipAnchor?.classList.remove('stores-tooltip-active');
  storesTooltipOverlay?.remove();
  storesTooltipAnchor = null;
  storesTooltipOverlay = null;
}

function positionStoresTooltip(tip) {
  if (!tip.matches('#stores-panel .res-rate.has-tooltip')) return;
  const rect = tip.getBoundingClientRect();
  const gutter = 8;
  const width = tooltipWidth(tip);
  const boxWidth = width + 20;
  const left = Math.max(gutter, Math.min(rect.right - boxWidth, window.innerWidth - boxWidth - gutter));
  document.getElementById('stores-panel')?.style.setProperty('--stores-tooltip-left', `${left}px`);
  document.getElementById('stores-panel')?.style.setProperty('--stores-tooltip-width', `${width}px`);
  document.getElementById('stores-panel')?.style.setProperty('--stores-tooltip-top', `${rect.bottom}px`);
  document.getElementById('stores-panel')?.style.setProperty('--stores-tooltip-bottom', `${window.innerHeight - rect.top + gutter}px`);
  if (storesTooltipOverlay && storesTooltipAnchor === tip) {
    storesTooltipOverlay.style.left = `${left}px`;
    storesTooltipOverlay.style.width = `${width}px`;
    storesTooltipOverlay.style.top = tip.classList.contains('tooltip-above') ? 'auto' : `${rect.bottom}px`;
    storesTooltipOverlay.style.bottom = tip.classList.contains('tooltip-above') ? `${window.innerHeight - rect.top + gutter}px` : 'auto';
  }
}

function tooltipWidth(tip) {
  if (!tip.matches('#stores-panel .res-rate.has-tooltip')) return Math.min(330, window.innerWidth - 32);
  const longestLine = Math.max(...(tip.dataset.tooltip || '').split('\n').map(line => line.length), 0);
  const desired = Math.min(420, Math.max(250, longestLine * 6.2 + 18));
  return Math.max(0, Math.min(desired, window.innerWidth - 36));
}

function positionTooltip(tip) {
  const rect = tip.getBoundingClientRect();
  const width = tooltipWidth(tip);
  const charsPerLine = Math.max(20, Math.floor(width / 6.2));
  const lines = (tip.dataset.tooltip || '').split('\n')
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  const estimatedHeight = Math.min(window.innerHeight * 0.55, 14 + lines * 15);
  const below = window.innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  tip.classList.toggle('tooltip-above', below < estimatedHeight && above > below);
}
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
  if (!loaded) state.paused = true;
  state.diplomacy = state.diplomacy || {};
  state.diplomats = state.diplomats || {};
  state.policy = state.policy || 'commons';
  state.council = Array.isArray(state.council) ? state.council : [];
  state.settings = { autosave: true, reducedMotion: false, compactStores: false, strictQueueOrder: false, tooltips: true, resetControls: false, fahrenheit: false, woodForCoal: {}, ...(state.settings || {}) };
  if (saveLoadFailed) state.settings.autosave = false;
  state.achievements = state.achievements || {};
  state.shopTab = ['buy', 'purchased'].includes(state.shopTab) ? state.shopTab : 'buy';
  state.statsTab = ['stats', 'achievements', 'perks'].includes(state.statsTab) ? state.statsTab : 'stats';
  state.diplomacyTab = ['nearby', 'distant', 'trade'].includes(state.diplomacyTab) ? state.diplomacyTab : 'nearby';
  applySettings();
  state.tribesSeen = state.tribesSeen || { human: true };
  state.species = state.species || 'human';
  state.tradePartners = Array.isArray(state.tradePartners) && state.tradePartners.length
    ? state.tradePartners : [state.tradePartner || 'human'];
  state.tradePartner = state.tradePartners[0];
  for (const id of state.tradePartners) ensureDiplomacyEntry(id);
  discoverTradePartners();
  if (loaded) {
    reconcileWorkers();
    offlineProgress();
    addLog('The chronicle resumes.', '');
  } else {
    addLog(saveLoadFailed
      ? 'The previous chronicle could not be loaded. It was preserved; import a backup before continuing.'
      : 'A handful of survivors halts in the shelter of a burnt palisade. They name the place Emberhold.', 'log-important');
    addLog('Assign Foragers and Woodcutters below, keep food in the store, and raise Huts as children arrive. Knowledge is written in Libraries, and every store has a ceiling the Storehouse raises.', '');
  }
  document.getElementById('btn-save').addEventListener('click', () => { saveGame(); render(); });
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-updates').addEventListener('click', () => {
    window.open('changelog.html', '_blank', 'noopener,noreferrer');
  });
  document.getElementById('btn-export').addEventListener('click', exportSave);
  document.getElementById('btn-import').addEventListener('click', importSave);
  document.querySelectorAll('#tabs .tab').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));
  loadLatestUpdatesTooltip();

  lastGameAt = Date.now();
  saveGame(true);
  startGameClock();
  setInterval(() => { if (!tooltipHover && !pointerDown && !document.activeElement?.closest('.has-tooltip')) render(); }, 500);
  setInterval(() => { if (state.settings.autosave) saveGame(true); }, 15000);
  window.addEventListener('beforeunload', () => saveGame(true));
  window.addEventListener('storage', event => {
    if (event.key === SAVE_KEY || event.key === null) {
      if (checkSaveConflict()) render();
    }
  });
  render();
}

boot();
