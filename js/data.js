// ============================================================
// EMBERHOLD — game content definitions
// All numbers here are the balance sheet. Later-era costs assume
// the trial rewards (Blueprints, Scarcity stacks) are obtainable.
// ============================================================

const SAVE_KEY = 'emberhold_save_v1';

// --- time ---
const DAY_RATE = 2;        // days per real second
const DAYS_PER_SEASON = 50;
const DAYS_PER_YEAR = 200; // one year = 100 real seconds

// --- resources ---
const RESOURCES = [
  { id: 'food',      name: 'Food',      note: 'eaten by every villager, day and night' },
  { id: 'wood',      name: 'Wood',      note: 'the bones of the village' },
  { id: 'stone',     name: 'Stone',     note: 'quarried once stone-working is learned' },
  { id: 'copper',    name: 'Copper',    note: 'trace veins become useful once prospectors and metallurgists take notice' },
  { id: 'tools',     name: 'Tools',     note: 'crafted at the Workbench; sharpen every trade' },
  { id: 'knowledge', name: 'Knowledge', note: 'the one store with no ceiling; spent on research' },
  { id: 'iron',      name: 'Iron',      note: 'pried from the deep seams' },
  { id: 'coal',      name: 'Coal',      note: 'burns hotter than wood' },
  { id: 'steel',     name: 'Steel',     note: 'smelted from iron and coal in the Foundry' },
  { id: 'machinery', name: 'Machinery', note: 'each unit in storage hums +0.2% to all production' },
  { id: 'aether',    name: 'Aether',    note: 'gathered by those who watch the sky' },
];

// --- eras ---
const ERAS = [
  { name: 'Age of Ember' },
  { name: 'Age of Stone' },
  { name: 'Age of Iron' },
  { name: 'Age of Steam' },
  { name: 'Age of Light' },
];
const ERA_GATE = { stoneWorking: 2, metallurgy: 3, machineryTech: 4, astronomy: 5 };

// --- storage: every store except knowledge has a ceiling.
// capacity = (base + per * buildingLevel) * (1 + 0.2 per Overflow completion)
const STORAGE = {
  food:      { base: 200, per: 400, bld: 'storehouse' },
  wood:      { base: 200, per: 400, bld: 'storehouse' },
  stone:     { base: 150, per: 350, bld: 'storehouse' },
  tools:     { base: 50,  per: 60,  bld: 'storehouse' },
  iron:      { base: 100, per: 250, bld: 'deepStore' },
  copper:    { base: 25,  per: 100, bld: 'deepStore' },
  coal:      { base: 100, per: 300, bld: 'deepStore' },
  steel:     { base: 50,  per: 100, bld: 'deepStore' },
  machinery: { base: 10,  per: 50,  bld: 'vault' },
  aether:    { base: 25,  per: 50,  bld: 'vault' },
};

// --- jobs (per assigned worker, per second) ---
const JOBS = {
  forager:     { name: 'Forager',      res: 'food',      base: 0.55, desc: 'roots, berries, small game',
                 unlock: () => true },
  woodcutter:  { name: 'Woodcutter',   res: 'wood',      base: 0.45, desc: 'fells and splits timber',
                 unlock: () => true },
  miner:       { name: 'Miner',        res: 'stone',     base: 0.28, desc: 'pulls stone from the quarry',
                 unlock: () => bld('quarry') > 0 },
  thinker:     { name: 'Thinker',      res: 'knowledge', base: 0.12, desc: 'argues, measures, writes it down',
                 unlock: () => bld('library') > 0 },
  digger:      { name: 'Coal Digger',  res: 'coal',      base: 0.14, desc: 'black dust under black fingernails',
                 unlock: () => bld('coalSeam') > 0 },
  ironminer:   { name: 'Iron Miner',   res: 'iron',      base: 0.11, desc: 'chases red veins into the dark',
                 unlock: () => bld('deepMine') > 0 },
  copperminer: { name: 'Copper Digger', res: 'copper',   base: 0.08, desc: 'follows green stains through the shallows',
                 unlock: () => tech('copperProspecting') },
  astronomer:  { name: 'Astronomer',   res: 'aether',    base: 0.05, desc: 'listens to the sky at night',
                 unlock: () => bld('observatory') > 0 },
  tinkerer:    { name: 'Tinkerer',    res: 'tools',      base: 0.025, desc: 'steadily assembles tools from wood and stone',
                 inputs: { wood: 0.06, stone: 0.02 },
                 unlock: () => (perm('tinkerers') || trialActive('tinkering')) && bld('workbench') > 0 },
};
const FOOD_PER_POP = 0.12; // food/s eaten per villager

// --- buildings ---
const BUILDINGS = [
  { id: 'hut', name: 'Hut', max: 40, scale: 1.35,
    cost: { wood: 30 },
    effect: () => `+3 population cap${perm('twinSouls') ? ' (+2 Twin Souls)' : ''}`,
    desc: 'shelter raises children' },

  { id: 'storehouse', name: 'Storehouse', max: 20, scale: 2.1,
    cost: { wood: 80 },
    effect: () => `+400 food and wood, +350 stone, +60 tools capacity`,
    desc: 'a ceiling for every granary; raise it' },

  { id: 'foragerLodge', name: 'Forager Lodge', max: 5, scale: 1.7,
    cost: { wood: 45 },
    effect: () => '+10% food production', desc: 'drying racks and seed lore' },

  { id: 'lumberYard', name: 'Lumber Yard', max: 5, scale: 1.7,
    cost: { wood: 70, tools: 10 },
    effect: () => '+10% wood production',
    req: () => tech('craftsmanship'), desc: 'saws instead of axes' },

  { id: 'quarry', name: 'Quarry', max: 1, scale: 1,
    cost: { wood: 150 },
    effect: () => 'unlocks Stone and Miners',
    req: () => tech('stoneWorking'), desc: 'the earth can be asked for more' },

  { id: 'stoneWorks', name: 'Stone Works', max: 3, scale: 1.7,
    cost: { stone: 90, wood: 40 },
    effect: () => '+10% stone production',
    req: () => bld('quarry') > 0, desc: 'cut stone fits where rubble will not' },

  { id: 'workbench', name: 'Workbench', max: 1, scale: 1,
    cost: { wood: 120 },
    effect: () => 'unlocks crafting of Tools',
    req: () => tech('craftsmanship'), desc: 'good tools repay their cost a hundredfold' },

  { id: 'library', name: 'Library', max: 3, scale: 1.8,
    cost: { wood: 100 },
    effect: () => 'unlocks Thinkers; +10% knowledge production',
    desc: 'memory, written down so it survives' },

  { id: 'monument', name: 'Monument', max: 1, scale: 1,
    cost: { wood: 260, stone: 220, tools: 15 },
    effect: () => 'unlocks the Trials',
    req: () => era() >= 3, desc: 'a stone that dares the village to be better' },

  { id: 'deepMine', name: 'Deep Mine', max: 1, scale: 1,
    cost: { stone: 260, tools: 30 },
    effect: () => 'unlocks Iron and Iron Miners',
    req: () => tech('deepMining'), desc: 'the deep rock holds iron' },

  { id: 'deepStore', name: 'Deep Store', max: 12, scale: 2.0,
    cost: { wood: 400, stone: 300, tools: 25 },
    effect: () => '+250 iron, +100 copper, +300 coal, +100 steel capacity',
    req: () => tech('deepMining'), desc: 'sealed shafts that keep ore dry and safe' },

  { id: 'coalSeam', name: 'Coal Seam', max: 1, scale: 1,
    cost: { stone: 320, wood: 160 },
    effect: () => 'unlocks Coal and Coal Diggers',
    req: () => tech('seamMining'), desc: 'stone that burns' },

  { id: 'foundry', name: 'Foundry', max: 1, scale: 1,
    cost: { stone: 380, iron: 90, tools: 25 },
    effect: () => 'unlocks smelting of Steel',
    req: () => tech('metallurgy'), desc: 'iron, disciplined by fire' },

  { id: 'aqueduct', name: 'Aqueduct', max: 2, scale: 1.8,
    cost: { stone: 520, wood: 220, tools: 15 },
    effect: () => '+20% food production, +4 population cap',
    req: () => tech('hydraulics'), desc: 'clean water, fat fields' },

  { id: 'shrine', name: 'Shrine', max: 5, scale: 1.8,
    cost: { wood: 220, stone: 220 },
    effect: () => '+5% all production',
    req: () => era() >= 3, desc: 'for whatever watches over Emberhold' },

  { id: 'workshop', name: 'Workshop', max: 1, scale: 1,
    cost: { iron: 260, tools: 60 },
    effect: () => 'unlocks crafting of Machinery',
    req: () => tech('machineryTech'), desc: 'devices that make devices' },

  { id: 'dynamo', name: 'Dynamo', max: 1, scale: 1,
    cost: { copper: 140, steel: 50, machinery: 25, tools: 60 },
    effect: () => '+15% all production',
    req: () => tech('electricalEngineering'), desc: 'copper coils turn motion into possibility' },

  { id: 'vault', name: 'Vault', max: 12, scale: 2.0,
    cost: { steel: 100, tools: 80 },
    effect: () => '+50 machinery and aether capacity',
    req: () => tech('machineryTech'), desc: 'a quiet room where delicate things wait' },

  { id: 'factory', name: 'Factory', max: 3, scale: 1.8,
    cost: { steel: 70, tools: 55 },
    effect: () => '+10% all production',
    req: () => bld('workshop') > 0, desc: 'the drumbeat of the new age' },

  { id: 'observatory', name: 'Observatory', max: 1, scale: 1,
    cost: { steel: 130, machinery: 20, tools: 60 },
    effect: () => 'unlocks Aether and Astronomers',
    req: () => tech('astronomy') && expDone('sunkenRuins'),
    desc: 'the ruins held a lens; the sky holds more' },

  { id: 'beacon', name: 'The Beacon', max: 1, scale: 1,
    cost: { steel: 650, machinery: 260, aether: 130, knowledge: 4000 },
    effect: () => 'a light that will outlive the village',
    req: () => tech('optics'), desc: 'the end of the chronicle, or its beginning' },
];

// --- research ---
const TECHS = [
  { id: 'stoneWorking', name: 'Stone Working', cost: 15,
    desc: 'Unlocks the Quarry. Enters the Age of Stone.' },
  { id: 'copperProspecting', name: 'Copper Prospecting', cost: 120,
    desc: 'Increases trace Copper extraction and unlocks Copper Diggers.',
    req: () => tech('stoneWorking') },
  { id: 'craftsmanship', name: 'Craftsmanship', cost: 40,
    desc: 'Unlocks the Workbench (Tools) and Lumber Yards.' },
  { id: 'writing', name: 'Writing', cost: 80,
    desc: '+25% knowledge production. The chronicle begins.' },
  { id: 'masonry', name: 'Masonry', cost: 150,
    desc: 'Unlocks Stone Works.',
    req: () => tech('craftsmanship') },
  { id: 'hydraulics', name: 'Hydraulics', cost: 260,
    desc: 'Unlocks the Aqueduct.',
    req: () => tech('masonry') },
  { id: 'deepMining', name: 'Deep Mining', cost: 320,
    desc: 'Unlocks the Deep Mine (Iron).',
    req: () => tech('craftsmanship') },
  { id: 'seamMining', name: 'Seam Surveying', cost: 450,
    desc: 'Unlocks the Coal Seam.',
    req: () => tech('deepMining') },
  { id: 'metallurgy', name: 'Metallurgy', cost: 600,
    desc: 'Unlocks the Foundry and Steel. Enters the Age of Iron.',
    req: () => tech('seamMining') },
  { id: 'machineryTech', name: 'Mechanism', cost: 1000,
    desc: 'Unlocks the Workshop (Machinery). Enters the Age of Steam.',
    req: () => tech('metallurgy') },
  { id: 'electricalEngineering', name: 'Electrical Engineering', cost: 1600,
    desc: 'Improves Copper extraction and unlocks the Dynamo.',
    req: () => tech('machineryTech') },
  { id: 'astronomy', name: 'Astronomy', cost: 1800,
    desc: 'Unlocks the Observatory — requires the Sunken Ruins expedition. Enters the Age of Light.',
    req: () => tech('machineryTech') },
  { id: 'optics', name: 'Optics', cost: 3000,
    desc: 'Unlocks the Beacon.',
    req: () => tech('astronomy') },
];

// --- crafting (instant conversions) ---
const CRAFTS = [
  { id: 'tools',     name: 'Tools',     give: { tools: 1 },     cost: { wood: 40 },
    req: () => bld('workbench') > 0, desc: 'carved and fire-hardened' },
  { id: 'steel',     name: 'Steel',     give: { steel: 1 },     cost: { iron: 15, coal: 10 },
    req: () => bld('foundry') > 0, desc: 'iron, disciplined by fire' },
  { id: 'machinery', name: 'Machinery', give: { machinery: 1 }, cost: { steel: 5, coal: 20 },
    req: () => bld('workshop') > 0, desc: 'gears, springs, patience' },
];

// --- trials: challenge modes. repeat = 0 means once-only. ---
const TRIALS = [
  { id: 'scarcity', name: 'Trial of Scarcity', repeat: 5,
    mod: 'Food production is halved.',
    goal: 'Keep the village fed for 240 days. If the food ever runs out, the trial fails.',
    reward: '+10% food production, permanently, for each completion.' },

  { id: 'frugality', name: 'Trial of Frugality', repeat: 3,
    mod: 'All building costs are raised by 50%.',
    goal: 'Complete 12 constructions while the trial is active.',
    reward: 'All building costs reduced 10%, permanently, for each completion.' },

  { id: 'overflow', name: 'Trial of the Overflow', repeat: 3,
    mod: 'No new storage may be built while the oath stands.',
    goal: 'Have every store you have discovered filled to its ceiling at the same moment.',
    reward: 'All storage ceilings +20%, permanently, for each completion.',
    req: () => bld('storehouse') > 0 },

  { id: 'tinkering', name: 'Trial of Tinkering', repeat: 0,
    mod: 'Tools may not be crafted by hand while the oath stands.',
    goal: 'Assign at least one Tinkerer and keep the Workbench running for 240 days without manually crafting Tools.',
    reward: 'Tinkerers: unlocks a job that steadily assembles Tools from wood and stone.',
    req: () => bld('workbench') > 0 },

  { id: 'silence', name: 'Trial of Silence', repeat: 0,
    mod: 'Knowledge production is stopped entirely.',
    goal: 'Research Metallurgy, spending only what was hoarded before the silence.',
    reward: 'Oral Tradition: Thinkers produce +50% knowledge, permanently.',
    req: () => era() >= 2 },

  { id: 'longnight', name: 'Trial of the Long Night', repeat: 0,
    mod: 'Winters are brutally harsh: food production x0.25 during winter.',
    goal: 'Survive a full year under the trial (200 days).',
    reward: 'Everwarm: winter food penalty halved (x0.75) and +5% to all production, permanently.' },

  { id: 'solitude', name: 'Trial of Solitude', repeat: 0,
    mod: 'The village is capped at 10 villagers. No children are born past ten.',
    goal: 'Stockpile 800 knowledge with only ten minds.',
    reward: 'Twin Souls: every Hut grants +2 extra population cap, permanently.' },

  { id: 'haste', name: 'Trial of Haste', repeat: 0,
    mod: 'All production reduced by 30%.',
    goal: 'Reach the Age of Light within 1200 days of starting the trial.',
    reward: 'Blueprints: all building costs reduced 15%, permanently.',
    req: () => era() >= 3 },
];

// --- landings: where the migration ends up. Modifiers multiply production
// of that resource (passive income included). The road decides, for now.
const LANDINGS = [
  { id: 'emberplain', name: 'The Emberplain', mods: {},
    text: 'A wide plain of ash-grass and old roads. Nothing comes easy; nothing is denied.' },
  { id: 'greenfold', name: 'The Greenfold', mods: { wood: 1.25, stone: 0.8, iron: 0.8 },
    text: 'Old oak country. Timber for the taking — but the ground hoards its stone and iron.' },
  { id: 'grayrocks', name: 'The Grayrocks', mods: { stone: 1.3, iron: 1.25, food: 0.8 },
    text: 'High, thin-soiled country. Stone and ore in abundance; the fields are poor.' },
  { id: 'floodmeadows', name: 'The Floodmeadows', mods: { food: 1.25, wood: 0.85 },
    text: 'A river\'s patience made this ground rich. Trees are few and far between.' },
  { id: 'ashfen', name: 'The Ashfen', mods: { coal: 1.35, food: 0.85 },
    text: 'The ground smokes gently here. Coal for the digging, but little cares to grow.' },
  { id: 'windmere', name: 'The Windmere', mods: { knowledge: 1.2, aether: 1.15, food: 0.9 },
    text: 'Still water under open sky. Minds are clear here; bellies less so.' },
];

// --- migration (loop) rewards: Echoes, spent in the ancestral shop.
// Earned on declaring a migration: floor((pop - 10)^2 / 100).
const UPGRADES = [
  { id: 'deepRoots', name: 'Deep Roots', max: 5, costs: [2, 4, 8, 16, 32],
    effect: '+5% to all production, per level',
    desc: 'the village remembers how to flourish' },
  { id: 'wanderers', name: 'Wandering Kin', max: 5, costs: [1, 2, 4, 8, 16],
    effect: 'begin each age with +2 villagers, per level',
    desc: 'kin hear the call and arrive' },
  { id: 'grandHut', name: 'Grand Designs', max: 3, costs: [3, 7, 15],
    effect: 'every Hut grants +1 population cap, per level',
    desc: 'born knowing how to build roomier' },
  { id: 'deepCellars', name: 'Deep Cellars', max: 3, costs: [4, 9, 18],
    effect: 'all storage ceilings +15%, per level',
    desc: 'the knack of keeping is never quite lost' },
  { id: 'lorekeepers', name: 'Lorekeepers', max: 1, costs: [5],
    effect: 'begin each age with a Library raised and 30 Knowledge',
    desc: 'someone always saves the books' },
  { id: 'caravans', name: 'Pack Caravans', max: 1, costs: [8],
    effect: 'begin each age with 300 food, 300 wood, 150 stone, 25 tools',
    desc: 'the wagons are loaded before the leaving' },
  { id: 'oathkeepers', name: 'Oathkeepers', max: 1, costs: [10],
    effect: 'repeatable Trials may be sworn one extra time each',
    desc: 'some oaths outlive the village that swore them' },
  { id: 'oldMaps', name: 'Old Maps', max: 1, costs: [12],
    effect: 'all expedition costs reduced 25%',
    desc: 'the scouts no longer wander lost' },
];

// --- expeditions: one-time, expand the playing field permanently ---
const EXPEDITIONS = [
  { id: 'oldForest', name: 'The Old Forest', reqPop: 12,
    cost: { wood: 400, tools: 10 },
    effect: '+1.5 wood/s gathered passively, +15% wood production',
    text: 'Beyond the fields stands forest no axe has named. Scouts return with timber like ironwood and stories of wolves.' },

  { id: 'foothills', name: 'The Foothills', reqPop: 15,
    cost: { wood: 350, stone: 550 },
    effect: '+1 stone/s quarried passively, +15% stone production',
    text: 'Where the land lifts, stone lies close to the surface, waiting.' },

  { id: 'sunkenRuins', name: 'The Sunken Ruins', reqPop: 20,
    cost: { knowledge: 1200, tools: 80 },
    effect: '+0.3 knowledge/s, +15% knowledge production, and the lens needed for the Observatory',
    text: 'Half-drowned towers of people who came before. Their libraries are silted but not silent.' },

  { id: 'emberVein', name: 'The Ember Vein', reqPop: 25,
    cost: { steel: 160, coal: 320 },
    effect: '+0.5 coal/s gathered passively, +10% iron production',
    text: 'A seam of coal that burns on its own in the winter. The mountain is warm to the touch.' },

  { id: 'glacialPeaks', name: 'The Glacial Peaks', reqPop: 35,
    cost: { machinery: 90, aether: 30 },
    effect: '+0.1 aether/s gathered passively, +10% to all production',
    text: 'Above the cloud line the air is thin and clear, and the stars seem close enough to harvest.' },
];

// --- season food multipliers ---
const SEASONS = [
  { name: 'Spring', mult: 1.0 },
  { name: 'Summer', mult: 1.05 },
  { name: 'Autumn', mult: 0.9 },
  { name: 'Winter', mult: 0.5 }, // 0.75 with Everwarm, 0.25 during Long Night
];
