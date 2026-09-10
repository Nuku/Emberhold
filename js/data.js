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
const LONG_NIGHT_DURATION = DAYS_PER_YEAR * 10;

// --- resources ---
const RESOURCES = [
  { id: 'food',      name: 'Food',      note: 'eaten by every villager, day and night' },
  { id: 'wood',      name: 'Wood',      note: 'the bones of the village' },
  { id: 'stone',     name: 'Stone',     note: 'quarried once stone-working is learned' },
  { id: 'copper',    name: 'Copper',    note: 'trace veins become useful once prospectors and metallurgists take notice' },
  { id: 'tools',     name: 'Tools',     note: 'crafted at the Workbench; sharpen every trade' },
  { id: 'knowledge', name: 'Knowledge', note: 'the one store with no ceiling; spent on research' },
  { id: 'currency',  name: 'Currency',  note: 'funds arriving from trade with neighboring tribes' },
  { id: 'iron',      name: 'Iron',      note: 'pried from the deep seams' },
  { id: 'coal',      name: 'Coal',      note: 'burns hotter than wood' },
  { id: 'steel',     name: 'Steel',     note: 'smelted from iron and coal in the Forge' },
  { id: 'machinery', name: 'Machinery', note: 'each unit in storage hums +0.2% to all production' },
  { id: 'livingAlloy', name: 'Living Alloy', note: 'a metal that remembers the shape of the Ancient forge that made it' },
  { id: 'heartwood', name: 'Heartwood', note: 'wood that grows in the shape of a tree no living forest has seen' },
  { id: 'starGlass', name: 'Star Glass', note: 'dark glass that remembers stars which have not yet risen' },
  { id: 'fur', name: 'Fur', note: 'warm hides, carefully prepared and traded wherever people still endure' },
  { id: 'power',     name: 'Power',     note: 'available capacity from plants and dynamos; powered industry shuts off when capacity is insufficient' },
  { id: 'goods',     name: 'Industrial Goods', note: 'made only by a powered Factory' },
  { id: 'aether',    name: 'Aether',    note: 'gathered by those who watch the sky' },
];
const RESOURCE_NAMES = new Map(RESOURCES.map(resource => [resource.id, resource.name]));

// Power is capacity, not a stockpile. These baseline values are intentionally
// separate so research and upgrades can tune generation and demand later.
const POWER_PER_STEAM_PLANT = 3;
const POWER_PER_WIND_DEVICE = 1;
const POWER_PER_SOLAR_ARRAY = 5;
const FACTORY_POWER_REQUIREMENT = 1.5;
const LIVING_BLOCK_POWER_REQUIREMENT = 1;
const INDUSTRIALIZATION_COAL_MULTIPLIER = 0.2;
const INDUSTRIALIZATION_RIOT_CHANCE = 0.2;
const INDUSTRIALIZATION_RIOT_LOSS = [0.10, 0.25];
const CURRENCY_BASE_CAP = 2000;

// --- eras ---
const ERAS = [
  { name: 'Age of Ember' },
  { name: 'Age of Stone' },
  { name: 'Age of Iron' },
  { name: 'Age of Steam' },
  { name: 'Age of Light' },
];
const ERA_GATE = { stoneWorking: 2, metallurgy: 3, machineryTech: 4, astronomy: 5 };

// --- storage: material stores use building-based ceilings; Currency has its
// own base cap so it can gain separate modifiers later.
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
  livingAlloy: { base: 50, per: 150, bld: 'alloyMine' },
  heartwood: { base: 50, per: 150, bld: 'heartwoodGrove' },
  starGlass: { base: 50, per: 150, bld: 'starLens' },
  fur: { base: 0, per: 1000, bld: 'ranch' },
};

// --- jobs (per assigned worker, per second) ---
const JOBS = {
  forager:     { name: 'Forager',      res: 'food',      base: 0.55, desc: 'roots, berries, small game',
                 unlock: () => true },
  woodcutter:  { name: 'Woodcutter',   res: 'wood',      base: 0.45, desc: 'fells and splits timber',
                 unlock: () => true },
  rancher:     { name: 'Rancher',       res: 'food',      base: 0.18, desc: 'raises animals for food and Fur',
                 max: () => bld('ranch') * 2,
                 unlock: () => bld('ranch') > 0 },
  miner:       { name: 'Miner',        res: 'stone',     base: 0.28, mining: true, desc: 'pulls stone from the quarry',
                 max: () => bld('stoneWorks') + 1,
                 unlock: () => bld('quarry') > 0 },
  thinker:     { name: 'Thinker',      res: 'knowledge', base: 0.12, desc: 'argues, measures, writes it down',
                 max: () => bld('library') + 1,
                 unlock: () => bld('library') > 0 },
  experimentalist: { name: 'Experimentalist', res: 'knowledge', base: 0.60, desc: 'tests theories in the Instrument Hall',
                     max: () => bld('instrumentHall'),
                     unlock: () => bld('instrumentHall') > 0 },
  banker:      { name: 'Banker',      res: 'currency',  base: 0.08, desc: 'keeps trade moving and funds arriving',
                 max: () => bld('moneyLender'),
                 trade: true, unlock: () => tech('banking') && tradeAvailable() },
  diplomat:   { name: 'Diplomat',    res: 'currency',  base: 0, targeted: true,
                desc: 'improves relations with an assigned tribe',
                unlock: () => tech('diplomacy') },
  performer:  { name: 'Performer',   base: 0, targeted: true,
                desc: 'keeps spirits high with song, story, and spectacle',
                unlock: () => bld('amphitheatre') > 0 },
  explorer:   { name: 'Explorer',    base: 0, targeted: true,
                desc: 'walks the old roads and gathers Survey points for future migrations',
                unlock: () => perm('explorers') },
  guard:       { name: 'Guard',       res: 'food',      base: 0.14, upkeep: 0.20, winterproof: true,
                 desc: 'recruits automatically outside the population; hunts between watches; barracks set capacity',
                 unlock: () => tech('guards') && bld('barracks') > 0 },
  digger:      { name: 'Coal Digger',  res: 'coal',      base: 0.14, mining: true, desc: 'black dust under black fingernails',
                 max: () => bld('deepStore') + 3,
                 unlock: () => bld('coalSeam') > 0 },
  ironminer:   { name: 'Iron Miner',   res: 'iron',      base: 0.11, mining: true, desc: 'chases red veins into the dark',
                 max: () => bld('deepStore') + 3,
                 unlock: () => bld('deepMine') > 0 },
  alloyminer:   { name: 'Living Alloy Miner', res: 'livingAlloy', base: 0.06, mining: true, desc: 'coaxes metal that tries to crawl back into the mountain',
                 max: () => bld('alloyMine') * 2,
                 unlock: () => bld('alloyMine') > 0 },
  heartwoodcutter: { name: 'Heartwood Cutter', res: 'heartwood', base: 0.06, mining: true, desc: 'coaxes impossible timber from the Conservatory’s roots',
                    max: () => bld('heartwoodGrove') * 2,
                    unlock: () => bld('heartwoodGrove') > 0 },
  starglasscutter: { name: 'Star Glass Cutter', res: 'starGlass', base: 0.06, mining: true, desc: 'cuts dark glass from reflections that do not belong to this sky',
                    max: () => bld('starLens') * 2,
                    unlock: () => bld('starLens') > 0 },
  copperminer: { name: 'Copper Digger', res: 'copper',   base: 0.08, mining: true, desc: 'follows green stains through the shallows',
                 max: () => Math.max(JOBS.miner.max(), JOBS.ironminer.max()),
                 unlock: () => tech('copperProspecting') },
  astronomer:  { name: 'Astronomer',   res: 'aether',    base: 0.05, desc: 'listens to the sky at night',
                 unlock: () => bld('observatory') > 0 },
  tinkerer:    { name: 'Tinkerer',    res: 'tools',      base: 0.025, factoryLike: true, desc: 'steadily assembles tools from wood and stone',
                 inputs: { wood: 0.06, stone: 0.02 },
                 max: () => 1 + Math.floor((state.jobs.woodcutter || 0) / 5),
                 unlock: () => (perm('tinkerers') || trialActive('tinkering')) && bld('workbench') > 0 },
};
const FOOD_PER_POP = 0.12; // food/s eaten per villager

// --- buildings ---
const BUILDINGS = [
  { id: 'hut', name: 'Hut', max: 40, scale: 1.35,
    cost: { wood: 30 },
    effect: () => `+1 population cap${perm('twinSouls') ? ' (+2 Twin Souls)' : ''}`,
    desc: 'shelter raises children' },

  { id: 'storehouse', name: 'Storehouse', max: 20, scale: 2.1,
    cost: { wood: 80 },
    effect: () => `+400 food and wood, +350 stone, +60 tools capacity`,
    desc: 'a ceiling for every granary; raise it' },

  { id: 'foragerLodge', name: 'Forager Lodge', max: 5, scale: 1.7,
    cost: { wood: 45 },
    effect: () => '+10% food production', desc: 'drying racks and seed lore' },

  { id: 'ranch', name: 'Ranch', max: Infinity, scale: 2.0,
    cost: { wood: 600, stone: 300, tools: 40, currency: 80 },
    effect: () => `+2 Rancher capacity; +${fmt(1000 * bld('ranch'))} Fur storage; +0.008 morale/s per Ranch`,
    req: () => upg('animalHusbandry') > 0, desc: 'fences, sheds, and patient hands teach animals to live alongside Emberhold' },

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
    cost: { wood: 260, stone: 220, tools: 15, currency: 20 },
    effect: () => 'unlocks the Trials',
    req: () => era() >= 3, desc: 'a stone that dares the village to be better' },

  { id: 'barracks', name: 'Barracks', max: Infinity, scale: 1.8,
    cost: { wood: 180, stone: 120, tools: 10 },
    effect: () => `+2 Guard capacity (maximum ${bld('barracks') * 2 + 2})`,
    req: () => tech('guards'), desc: 'a roof, a watch bell, and somewhere to hang a spear' },

  { id: 'trainingYard', name: 'Training Yard', max: Infinity, scale: 1.8,
    cost: { wood: 220, stone: 160, tools: 20 },
    effect: () => '−10% time to recruit replacement Guards per level (compounding)',
    req: () => tech('trainingYard'), desc: 'drills turn recruits into a watchful line' },

  { id: 'hospital', name: 'Hospital', max: Infinity, scale: 1.8,
    cost: { wood: 150, stone: 100, tools: 10 },
    effect: () => '−10% Guard healing and population growth time per level (compounding)',
    req: () => tech('hospital'), desc: 'care for the wounded and a healthy start for new families' },

  { id: 'deepMine', name: 'Deep Mine', max: 1, scale: 1,
    cost: { stone: 260, tools: 30 },
    effect: () => 'unlocks Iron and Iron Miners',
    req: () => tech('deepMining'), desc: 'the deep rock holds iron' },

  { id: 'alloyMine', name: 'Living Alloy Mine', max: Infinity, scale: 2.0,
    cost: { steel: 900, machinery: 400, aether: 100, goods: 120 },
    effect: () => '+2 Living Alloy Miner capacity; +150 Living Alloy storage',
    req: () => tech('livingAlloy'), desc: 'a shaft sunk beneath the World Anvil, where the metal still remembers being made' },

  { id: 'heartwoodGrove', name: 'Heartwood Grove', max: Infinity, scale: 2.0,
    cost: { steel: 260, machinery: 160, aether: 80, goods: 100 },
    effect: () => '+2 Heartwood Cutter capacity; +150 Heartwood storage',
    req: () => tech('heartwood'), desc: 'a cultivated wound in the Conservatory, where impossible timber grows on command' },

  { id: 'starLens', name: 'Star Glass Lensworks', max: Infinity, scale: 2.0,
    cost: { steel: 320, machinery: 190, aether: 120, goods: 130 },
    effect: () => '+2 Star Glass Cutter capacity; +150 Star Glass storage',
    req: () => tech('starGlass'), desc: 'a cutting hall beneath the Orrery, where the reflected sky can be harvested' },

  { id: 'deepStore', name: 'Deep Store', max: 12, scale: 2.0,
    cost: { wood: 400, stone: 300, tools: 25 },
    effect: () => '+250 iron, +100 copper, +300 coal, +100 steel capacity',
    req: () => tech('deepMining'), desc: 'sealed shafts that keep ore dry and safe' },

  { id: 'coalSeam', name: 'Coal Seam', max: 1, scale: 1,
    cost: { stone: 320, wood: 160 },
    effect: () => 'unlocks Coal and Coal Diggers',
    req: () => tech('seamMining'), desc: 'stone that burns' },

  { id: 'forge', name: 'Forge', max: Infinity, scale: 1.8,
    cost: { stone: 380, iron: 90, tools: 25, currency: 40 },
    effect: () => `smelts ${fmt(0.04 * bld('forge'))} Steel/s; consumes ${fmt(0.6 * bld('forge'))} Iron/s and ${fmt(0.4 * bld('forge'))} Coal/s`,
    req: () => tech('metallurgy'), desc: 'iron and carbon, disciplined by fire' },

  { id: 'aqueduct', name: 'Aqueduct', max: 2, scale: 1.8,
    cost: { stone: 520, wood: 220, tools: 15 },
    effect: () => '+20% food production, +4 population cap',
    req: () => tech('hydraulics'), desc: 'clean water, fat fields' },

  { id: 'moneyLender', name: 'Money Lender', max: Infinity, scale: 1.8,
    cost: { wood: 220, stone: 220, currency: 30 },
    effect: () => '+1 Banker capacity; +0.001 Currency/s per population',
    req: () => tech('banking'), desc: 'local lending brings currency into every household' },

  { id: 'shrine', name: 'Shrine', max: 5, scale: 1.8,
    cost: { wood: 220, stone: 220, currency: 30 },
    effect: () => '+5% all production',
    req: () => era() >= 3, desc: 'for whatever watches over Emberhold. Each Shrine adds +5% to all production. Having at least one Shrine adds +0.012 morale/s while morale is below 75; additional Shrines do not increase this morale bonus.' },

  { id: 'amphitheatre', name: 'Amphitheatre', max: 1, scale: 1,
    cost: { wood: 260, stone: 340, currency: 60 },
    effect: () => 'unlocks Performers, who raise morale over time',
    req: () => tech('civics'), desc: 'a stage where the people remember how to be glad' },

  { id: 'workshop', name: 'Workshop', max: 1, scale: 1,
    cost: { iron: 260, tools: 60, currency: 80 },
    effect: () => 'unlocks crafting of Machinery',
    req: () => tech('machineryTech'), desc: 'devices that make devices' },

  { id: 'steamPlant', name: 'Steam Plant', max: 3, scale: 1.8,
    cost: { steel: 60, coal: 100, tools: 25, currency: 50 },
    effect: () => `+${POWER_PER_STEAM_PLANT + (wonderChoice('emberplain', 'silence') ? 1 : 0)} Power capacity, consumes 0.8 Coal/s`,
    req: () => tech('metallurgy'), desc: 'boilers and turbines make a new kind of work possible' },

  { id: 'solarArray', name: 'Solar Array', max: Infinity, scale: 1.9,
    cost: { steel: 140, copper: 180, machinery: 35, goods: 30 },
    effect: () => `+${POWER_PER_SOLAR_ARRAY} Power capacity, no fuel required`,
    req: () => solarPowerAvailable(), desc: 'mirrors and collectors pointed at the sun, carrying on an ancient habit' },

  { id: 'dynamo', name: 'Dynamo', max: 1, scale: 1,
    cost: { copper: 140, steel: 50, machinery: 25, tools: 60, currency: 120, goods: 25 },
    effect: () => '+15% all production',
    req: () => tech('electricalEngineering'), desc: 'copper coils turn motion into possibility' },

  { id: 'vault', name: 'Vault', max: 12, scale: 2.0,
    cost: { steel: 100, tools: 80, currency: 100, goods: 30 },
    effect: () => '+50 machinery and aether capacity',
    req: () => tech('machineryTech'), desc: 'a quiet room where delicate things wait' },

  { id: 'factory', name: 'Factory', max: Infinity, scale: 1.8,
    cost: { steel: 70, tools: 55, currency: 90 },
    effect: () => '+10% all production; selectable powered production in the Village',
    req: () => (trialActive('industrialization') || perm('factory')) && tech('metallurgy'), desc: 'the drumbeat of the new age' },

  { id: 'livingBlock', name: 'Living Block', max: Infinity, scale: 2.5,
    cost: { steel: 40, stone: 80, wood: 30 },
    effect: () => `+5 population cap; requires ${LIVING_BLOCK_POWER_REQUIREMENT} Power; −0.1 morale/s`,
    req: () => tech('machineryTech'), desc: 'five people packed tightly together; miserable, but it is a roof' },

  { id: 'instrumentHall', name: 'Instrument Hall', max: Infinity, scale: 1.8,
    cost: { steel: 180, goods: 80, copper: 300 },
    effect: () => `supports ${bld('instrumentHall')} Experimentalist${bld('instrumentHall') === 1 ? '' : 's'}`,
    req: () => tech('advancedScience'), desc: 'precision instruments and costly parts turn questions into discoveries' },

  { id: 'windDevice', name: 'Wind Device', max: Infinity, scale: 2.2,
    cost: { goods: 120, steel: 220, stone: 500 },
    effect: () => `+${POWER_PER_WIND_DEVICE} Power capacity, no fuel required`,
    req: () => tech('windHarness'), desc: 'capture a small bit of the wind\'s gusting power' },

  { id: 'observatory', name: 'Observatory', max: 1, scale: 1,
    cost: { steel: 130, machinery: 20, tools: 60, currency: 150, goods: 60 },
    effect: () => 'unlocks Aether and Astronomers',
    req: () => tech('astronomy') && expDone('sunkenRuins'),
    desc: 'the ruins held a lens; the sky holds more' },

  { id: 'beacon', name: 'The Beacon', max: 1, scale: 1,
    cost: { steel: 650, machinery: 260, aether: 130, knowledge: 4000, currency: 300, goods: 200 },
    effect: () => 'a light that will outlive the village',
    req: () => tech('optics'), desc: 'the end of the chronicle, or its beginning' },
];

// --- research ---
const TECHS = [
  { id: 'aphrodisiac', name: 'Fertility Rites', cost: 50,
    desc: 'Old hearth rites make room for another generation. Reduces population growth time by 25%. Stacks with Hospitals.' },
  { id: 'hospital', name: 'Hospital', cost: 150, materials: { wood: 80, tools: 10 },
    desc: 'A clean ward is a small rebellion against the old world’s cruelties. Unlocks Hospitals; each level reduces Guard healing and population growth time by 10%, compounding.',
    req: () => tech('stoneWorking') && tech('craftsmanship') },
  { id: 'stoneWorking', name: 'Stone Working', cost: 15,
    desc: 'The first walls are laid where the ash-grass gives way to rock. Unlocks the Quarry. Enters the Age of Stone. Your people have noticed an odd green mineral. Let\'s gather it for now until we know better what to do with it.' },
  { id: 'currency', name: 'Currency', cost: 100,
    desc: 'A shared measure lets strangers trust a promise made on the old roads. Unlocks trade with neighboring tribes and the Currency resource.',
    req: () => tech('stoneWorking') },
  { id: 'guards', name: 'Guards', cost: 100,
    desc: 'Someone must stand awake beyond the last warm window. Unlocks Barracks and automatically recruited Guards, separate from the population, who hunt while keeping watch.',
    req: () => tech('stoneWorking') },
  { id: 'trainingYard', name: 'Training Yard', cost: 250, materials: { wood: 120, stone: 80, tools: 20 },
    desc: 'Drill turns frightened recruits into the line between Emberhold and the dark. Unlocks Training Yards; each level reduces replacement Guard recruitment time by 10%, compounding without a cap.',
    req: () => tech('guards') },
  { id: 'leatherArmor', name: 'Leather Armor', cost: 180,
    desc: 'Hides are boiled, hardened, and taught to remember the shape of a shield. Guards gain protection against raids.',
    req: () => tech('guards') },
  { id: 'copperProspecting', name: 'Copper Prospecting', cost: 120, materials: { stone: 60, tools: 8 },
    desc: 'Green stains in the stone become a promise rather than a curiosity. Increases trace Copper extraction and unlocks Copper Diggers.',
    req: () => tech('stoneWorking') },
  { id: 'craftsmanship', name: 'Craftsmanship', cost: 40, materials: { wood: 40 },
    desc: 'The hand learns that a tool can outlast its maker. Unlocks the Workbench (Tools) and Lumber Yards.' },
  { id: 'writing', name: 'Writing', cost: 80,
    desc: 'Marks are set down against the forgetting that swallowed the Before Times. +25% Knowledge production. The chronicle begins.' },
  { id: 'masonry', name: 'Masonry', cost: 150, materials: { stone: 120, tools: 12 },
    desc: 'Rubble becomes shelter when every stone knows its place. Unlocks Stone Works.',
    req: () => tech('craftsmanship') },
  { id: 'hydraulics', name: 'Hydraulics', cost: 260, materials: { stone: 180, tools: 20, copper: 10 },
    desc: 'Water is persuaded to serve the living before it returns to the ruins. Unlocks the Aqueduct.',
    req: () => tech('masonry') },
  { id: 'treeHusbandry', name: 'Tree Husbandry', cost: 340, materials: { wood: 120, tools: 15 },
    desc: 'The animals can tend themselves, but plants need gentle hands. The ancients knew this. We remember. Wood income increases by 20%.',
    req: () => bld('aqueduct') > 0 },
  { id: 'deepMining', name: 'Deep Mining', cost: 320, materials: { stone: 220, tools: 25 },
    desc: 'Below the familiar rock lie red seams and older silences. Unlocks the Deep Mine (Iron).',
    req: () => tech('craftsmanship') },
  { id: 'seamMining', name: 'Seam Surveying', cost: 450, materials: { stone: 300, wood: 120, tools: 35 },
    desc: 'The earth’s buried fire is measured, mapped, and asked to burn for people again. Unlocks the Coal Seam.',
    req: () => tech('deepMining') },
  { id: 'metallurgy', name: 'Metallurgy', cost: 600, materials: { iron: 180, coal: 120, tools: 30 },
    desc: 'Fire disciplines iron into a material fit for rebuilding a broken age. Unlocks the Forge and Steel. Enters the Age of Iron.',
    req: () => tech('seamMining') },
  { id: 'chainmail', name: 'Chainmail', cost: 450, materials: { steel: 60, tools: 30 },
    desc: 'Steel rings interlock into a patient defense. Guards gain a second level of protection against raids.',
    req: () => tech('guards') && tech('metallurgy') },
  { id: 'ironMites', name: 'Iron Mites', cost: 900,
    desc: 'The little rust-eaters were sleeping in old slag heaps, and wake hungry. They increase Iron Miner efficiency by 30%.',
    req: () => bld('forge') > 0 },
  { id: 'weaponry', name: 'Weaponry', cost: 300, materials: { iron: 120, steel: 30, tools: 20 },
    desc: 'The watch inherits better answers to teeth, hunger, and raiders. Guards hunt 50% more food and gain strength against raids.',
    req: () => tech('guards') && tech('metallurgy') },
  { id: 'machineryTech', name: 'Mechanism', cost: 1000, materials: { iron: 200, steel: 100, tools: 50 },
    desc: 'Gears begin to turn with a purpose the old ruins seem to recognize. Unlocks the Workshop (Machinery). Enters the Age of Steam.',
    req: () => tech('metallurgy') },
  { id: 'lightningMetal', name: 'Lightning Metal', cost: 1200, materials: { steel: 120, machinery: 40, copper: 80 },
    desc: 'The ancients called down lightning to temper their steel. We will humbly follow in their great steps. Steel created in factories is increased by 50%, both income and cost.',
    req: () => bld('factory') > 0 && tech('machineryTech') },
  { id: 'livingAlloy', name: 'Living Alloy', cost: 6000, materials: { steel: 300, machinery: 180, aether: 100, tools: 80 },
    desc: 'The World Anvil’s restored rhythm has left a door open in the old records. Unlocks the Living Alloy Mine after the Beacon has been understood.',
    req: () => wonderUnlock('livingAlloy') && tech('optics') },
  { id: 'heartwood', name: 'Heartwood', cost: 5600, materials: { steel: 240, machinery: 140, aether: 80, tools: 70 },
    desc: 'The restored Conservatory remembers how to cultivate material for an Ancient world. Unlocks the Heartwood Grove after the Beacon has been understood.',
    req: () => wonderUnlock('heartwood') && tech('optics') },
  { id: 'starGlass', name: 'Star Glass', cost: 6400, materials: { steel: 300, machinery: 180, aether: 130, tools: 90 },
    desc: 'The restored Orrery teaches the settlement to cut material from reflected heavens. Unlocks Star Glass Lensworks after the Beacon has been understood.',
    req: () => wonderUnlock('starGlass') && tech('optics') },
  { id: 'basinTempering', name: 'Basin Tempering', cost: 6800, materials: { steel: 350, machinery: 220, aether: 120, tools: 90 },
    desc: 'The Renewal Basin can be taught to finish steel without wasting the shape of its first making. Forges and Factories produce 35% more Steel.',
    req: () => wonderUnlock('basinTempering') && tech('optics') },
  { id: 'understandingHome', name: 'Understanding Home', cost: 1300, materials: { machinery: 25, tools: 30 },
    desc: 'We have learned the whispers of this place, and they speak clearly once you care to listen. Trait tooltips reveal their direct effects on the current location.',
    req: () => tech('machineryTech') && currentPlaceTraits().length > 0 },
  { id: 'awakenAncients', name: 'Awaken Ancients', cost: 1500, materials: { steel: 50, machinery: 60 },
    desc: 'Old diggers stir beneath the works, carrying out orders no living foreman remembers giving. Quarries, Deep Mines, and Coal Seams can each use 0.2 Power for +10% production per powered building. Adjust their supply in the Village or Construction.',
    req: () => tech('machineryTech') },
  { id: 'advancedScience', name: 'Advanced Science', cost: 2200, materials: { copper: 180, steel: 100, machinery: 40 },
    desc: 'Questions become dangerous once they can be measured precisely. Unlocks the uncapped Instrument Hall and Experimentalists, whose work advances Knowledge beyond the Thinkers.',
    req: () => tech('machineryTech') && tech('writing') },
  { id: 'windHarness', name: 'Wind Harness', cost: 3000, materials: { steel: 180, machinery: 60, tools: 40 },
    desc: 'The restless sky is made to labor without ever being consumed. Unlocks the uncapped Wind Device, which produces 1.0 Power without fuel.',
    req: () => tech('advancedScience') },
  { id: 'banking', name: 'Banking', cost: 900,
    desc: 'Debt, like memory, survives a village’s death and follows the roads onward. Unlocks Money Lenders and Bankers; each Money Lender supports one Banker and produces 0.001 Currency per population per second.',
    req: () => tech('metallurgy') && tech('currency') },
  { id: 'diplomacy', name: 'Diplomacy', cost: 800,
    desc: 'The peoples of the world have endured too much to trust a stranger quickly. Unlocks Diplomats, who improve relations with contacted tribes. Requires the Age of Iron.',
    req: () => era() >= 3 && tech('currency') },
  { id: 'spies', name: 'Spies', cost: 1400,
    desc: 'Every town has cracks in its walls, and some are made of secrets. Unlocks target-specific spy training: one spy reveals Military strength; two reveal Economic strength, though spies may be caught.',
    req: () => era() >= 3 && tech('diplomacy') },
  { id: 'espionage', name: 'Espionage', cost: 2400,
    desc: 'A quiet knife can change a war before the banners ever rise. Spies can spend 20 minutes attempting to weaken a town\'s Military strength; each attempt has a 60% chance of success.',
    req: () => era() >= 4 && tech('spies') },
  { id: 'civics', name: 'Civic Law', cost: 650,
    desc: 'A settlement becomes a polity when its rules are stronger than its loudest voice. Unlocks the Civic Hall and a governing policy.',
    req: () => tech('writing') && era() >= 3 },
  { id: 'council', name: 'The Council', cost: 1100,
    desc: 'No one person should carry a whole settlement’s future alone. Unlocks a Governor and two Council seats whose talents shape each Emberhold.',
    req: () => tech('civics') && tech('diplomacy') },
  { id: 'commonality', name: 'Commonality', cost: 2400,
    desc: 'Conquest is easy to name; belonging must be built after the smoke clears. Unlocks the Commonality government, ending conquered-realm morale pressure and strengthening ally income.',
    req: () => tech('civics') && tech('council') && conqueredRealm() },
  { id: 'festivals', name: 'Civic Festivals', cost: 1400,
    desc: 'For one night, the dead roads lead somewhere joyful. Raises maximum Morale by 15.',
    req: () => tech('civics') && bld('amphitheatre') > 0 },
  { id: 'civicHarmony', name: 'Civic Harmony', cost: 2600,
    desc: 'Many peoples learn the difficult music of sharing one future. Raises maximum Morale by another 20.',
    req: () => tech('festivals') && tech('astronomy') },
  { id: 'workplaceEthics', name: 'Workplace Ethics', cost: 3000,
    desc: 'There\'s no time for personal squabbles. The community needs you all at once. The Ancients will not save us from ourselves. All miners and diggers can accommodate one extra person. Any such job with a full complement of people is 10% more effective, but has a −0.15 morale/s penalty.',
    req: () => tech('civicHarmony') },
  { id: 'weaponEfficiency', name: 'Weapon Efficiency', cost: 1200, materials: { steel: 80, tools: 30 },
    desc: 'A well-kept weapon wastes less effort, less meat, and fewer lives. Guards hunt 75% more food through disciplined use of weapons.',
    req: () => tech('weaponry') && tech('machineryTech') },
  { id: 'electricalEngineering', name: 'Electrical Engineering', cost: 1600, materials: { copper: 220, steel: 80, machinery: 40 },
    desc: 'Copper carries a captured storm through wire and coil. Improves Copper extraction and unlocks the Dynamo.',
    req: () => tech('machineryTech') },
  { id: 'astronomy', name: 'Astronomy', cost: 1800, materials: { stone: 200, tools: 40, machinery: 30 },
    desc: 'Above the ruins, the stars keep records older than any surviving archive. Unlocks the Observatory — requires the Sunken Ruins expedition. Enters the Age of Light.',
    req: () => tech('machineryTech') },
  { id: 'optics', name: 'Optics', cost: 3000, materials: { copper: 300, steel: 200, machinery: 80, aether: 50 },
    desc: 'A lens gives the world one more reason to remember Emberhold. Unlocks the Beacon.',
    req: () => tech('astronomy') },
];

// --- civics and council: one policy plus a governor and two advisors per run ---
const CIVICS = [
  { id: 'commons', name: 'Common Granaries', mods: { food: 1.15 }, storage: 1.20,
    desc: '+15% food production, +20% storage ceilings.' },
  { id: 'charter', name: 'Merchant Charter', mods: { currency: 1.25 }, cost: 0.90,
    desc: '+25% Currency, −10% building costs.' },
  { id: 'guilds', name: 'Craft Guilds', mods: { tools: 1.20, steel: 1.15, goods: 1.15 },
    desc: '+20% Tools and +15% Steel and Industrial Goods.' },
  { id: 'academy', name: 'Open Academy', mods: { knowledge: 1.20, aether: 1.10 },
    desc: '+20% Knowledge and +10% Aether.' },
  { id: 'warCouncil', name: 'War Council', defense: 1.30, mods: { food: 0.95 },
    desc: '+30% raid strength; −5% food production.' },
  { id: 'commonality', name: 'Commonality', req: () => tech('commonality'),
    desc: 'Conquered peoples are represented within the realm: occupation morale pressure is removed and the ally bonus becomes +7.5% to all village incomes.' },
];

const GOVERNORS = [
  { id: 'quartermaster', name: 'Maela, the Quartermaster', storage: 1.15,
    desc: '+15% storage ceilings.' },
  { id: 'marshal', name: 'Orren, the Marshal', defense: 1.25,
    desc: '+25% raid strength.' },
  { id: 'archivist', name: 'Sera, the Archivist', mods: { knowledge: 1.20 },
    desc: '+20% Knowledge.' },
];

const COUNCILORS = [
  { id: 'granaryKeeper', name: 'Tovin, Keeper of Granaries', mods: { food: 1.10 }, desc: '+10% food production.' },
  { id: 'builder', name: 'Nera, Master Builder', cost: 0.90, desc: '−10% building costs.' },
  { id: 'envoy', name: 'Ilyan, Trade Envoy', mods: { currency: 1.20 }, desc: '+20% Currency.' },
  { id: 'forgeSpeaker', name: 'Brakka, Forge Speaker', mods: { tools: 1.15, steel: 1.15, goods: 1.15 }, desc: '+15% Tools, Steel, and Industrial Goods.' },
  { id: 'fieldWarden', name: 'Vey, Field Warden', defense: 1.12, mods: { food: 1.05 }, desc: '+12% raid strength, +5% food production.' },
];

// --- unscheduled happenings: mostly troublesome, occasionally heartening ---
const FARM_ANIMALS = ['chickens', 'ducks', 'goats', 'sheep', 'pigs'];
const RANDOM_EVENTS = [
  { text: 'A goose has claimed the council table. No one can explain how it got there.', delta: [1, 4] },
  { text: 'A traveling puppeteer performs for the children. The adults pretend not to enjoy it.', delta: [2, 6] },
  { text: 'A barrel of winter apples is found behind the old palisade.', delta: [2, 5], food: [10, 25], timeReward: [10, 20] },
  { text: 'A rumor spreads that the moon is watching the village.', delta: [-2, -7] },
  { text: 'The communal stew turns sour before anyone notices.', delta: [-3, -9], food: [-15, -5] },
  { text: 'A cart axle breaks in the mud, delaying half the morning\'s work.', delta: [-2, -6] },
  { text: 'A child releases all the carefully penned {animal}.', delta: [-1, -5] },
  { text: 'The night watch hears wolves beyond the fields.', delta: [-3, -10] },
  { text: 'A roof gives way under wet snow. The repairs will be embarrassing.', delta: [-4, -12], wood: [-30, -10] },
  { text: 'A visiting merchant cheats three villagers with a remarkably obvious shell game.', delta: [-2, -8], currency: [-8, -2] },
  { text: 'A song from the old country is remembered, verse by verse.', delta: [2, 7] },
  { text: 'Someone has painted a heroic portrait of the village dog.', delta: [1, 5] },
];

// Each lineage has a purely atmospheric scene and a small consequential event.
// Resource effects only apply to resources the settlement has discovered.
const LINEAGE_EVENTS = {
  human: [
    { text: 'An Emberborn child asks why every new village has the same name. Three elders offer four different answers.' },
    { text: 'Emberborn neighbors hold a mending day, rescuing useful timber from abandoned furniture.', wood: [8, 18], timeReward: [10, 20] },
  ],
  stonekin: [
    { text: 'Two Stonekin spend the afternoon debating whether a pebble resembles an ancestor. The pebble declines to comment.' },
    { text: 'A Stonekin mason hears a promising note beneath the chisel and splits a clean block from the rubble.', stone: [8, 18], timeReward: [10, 20] },
  ],
  marshfolk: [
    { text: 'Marshfolk children launch reed boats bearing solemn messages to frogs on the opposite bank.' },
    { text: 'Marshfolk gardeners uncover a forgotten bed of edible roots beneath the reeds.', food: [10, 22], timeReward: [10, 20] },
  ],
  skyborn: [
    { text: 'A Skyborn elder names every cloud above the village. One is apparently an old rival.' },
    { text: 'Skyborn kite watchers compare their wind charts and settle a longstanding question.', knowledge: [5, 12], timeReward: [10, 20] },
  ],
  mephit: [
    { text: 'The Mephits hold a perfume contest. The judges insist that everyone else is missing the subtle notes.' },
    { text: 'A Mephit scent brewer uncorks a festival blend too enthusiastically. The square empties in seconds.', delta: [-4, -2] },
  ],
  dunewalkers: [
    { text: 'Dunewalker storytellers arrange their cushions like a caravan and argue over who gets to play the stubborn camel.' },
    { text: 'A Dunewalker merchant spots an error in an old tally and returns the overpayment to the village.', currency: [3, 8], timeReward: [10, 20] },
  ],
  cinderforged: [
    { text: 'Cinderforged smiths tap their supper bowls in the rhythm of a forging song. The cook demands a quieter encore.' },
    { text: 'A Cinderforged apprentice leaves the fuel hatch open through a long story. Some coal burns to ash.', coal: [-8, -3] },
  ],
  thornkin: [
    { text: 'A Thornkin doorway blooms overnight. Its residents politely ask visitors to knock on the other branch.' },
    { text: 'Thornkin pruners guide an overgrown arbor back into shape and share the straight fallen branches.', wood: [10, 20], timeReward: [10, 20] },
  ],
  clocklings: [
    { text: 'Every Clockling alarm rings at once, except the official village clock, which appears deeply embarrassed.' },
    { text: 'Clockling tinkerers assemble several useful implements from a box labeled probably spare parts.', tools: [1, 3], timeReward: [10, 20] },
  ],
  glimmerfolk: [
    { text: 'Glimmerfolk singers rehearse a lullaby for a crystal that refuses to stop glowing after bedtime.' },
    { text: 'A Glimmerfolk choir finds a clear new harmony that leaves the whole village quietly smiling.', delta: [2, 5] },
  ],
  otterfolk: [
    { text: 'Otterfolk float hand in hand through an evening storytelling circle. The youngest keeps drifting ahead to the ending.' },
    { text: 'An Otterfolk diving crew follows a silver shoal into the shallows and returns with a shared catch.', food: [10, 22], timeReward: [10, 20] },
  ],
  beaverkin: [
    { text: 'A Beaverkin inspector declares a decorative footbridge structurally excellent but insufficiently chewy.' },
    { text: 'Beaverkin builders dismantle an obsolete spillway and recover its seasoned beams.', wood: [12, 24], timeReward: [10, 20] },
  ],
  turtlefolk: [
    { text: 'The Turtlefolk annual walking race reaches its first bend. Spectators settle in for a pleasant afternoon.' },
    { text: 'A Turtlefolk elder traces a lake memory on a slate, completing a map begun generations ago.', knowledge: [5, 12], timeReward: [10, 20], survey: true },
  ],
  axolotlkin: [
    { text: 'Axolotlkin students practice looking solemn during a submerged lecture. Their waving gills betray their laughter.' },
    { text: 'Axolotlkin pond keepers observe an unfamiliar glow and carefully record its changing rhythm.', knowledge: [6, 14], timeReward: [10, 20] },
  ],
  carpfolk: [
    { text: 'Carpfolk decorate the underwater lanes with smooth stones, then politely debate which direction counts as upstreet.' },
    { text: 'A silt cloud settles over a Carpfolk growing terrace, spoiling part of the gathered water greens.', food: [-12, -5] },
  ],
  frogfolk: [
    { text: 'A Frogfolk evening chorus pauses while one singer retrieves a particularly interesting moth.' },
    { text: 'Frogfolk singers answer the first warm rain with a chorus that draws smiles from every doorway.', delta: [2, 5] },
  ],
  heronkin: [
    { text: 'A Heronkin fishing teacher demonstrates perfect stillness. The pupils wonder whether class has actually started.' },
    { text: 'Heronkin fishers spot a crowded backwater and bring home enough to share beyond their stilt houses.', food: [8, 20], timeReward: [10, 20] },
  ],
  foxfolk: [
    { text: 'A Foxfolk storyteller sells the same joke with three different endings. All three audiences insist theirs was the original.' },
    { text: 'A Foxfolk trader negotiates a small rebate by remembering exactly what was promised last spring.', currency: [3, 8], timeReward: [10, 20] },
  ],
  wolfkin: [
    { text: 'Wolfkin pups rehearse a moon greeting. An elder gently explains that volume is only half the tradition.' },
    { text: 'A Wolfkin hunting pack returns early and lays an unexpected catch before the communal hearth.', food: [10, 22], timeReward: [10, 20] },
  ],
  bearfolk: [
    { text: 'A Bearfolk carpenter falls asleep testing a new chair. The workshop accepts this as a favorable review.' },
    { text: 'Bearfolk gatherers discover a honey tree and insist on sharing before anyone starts counting portions.', food: [8, 16], delta: [1, 3], timeReward: [10, 20] },
  ],
  deerkin: [
    { text: 'Deerkin dancers weave ribbons between their antlers for a procession that requires very careful doorways.' },
    { text: 'A Deerkin orchard walk finds an overlooked stand of ripe fruit at the edge of the commons.', food: [10, 20], timeReward: [10, 20] },
  ],
  rabbitfolk: [
    { text: 'Rabbitfolk children give every warren junction a new name. The adults request a map before supper.' },
    { text: 'A Rabbitfolk seed store proves damp behind the lowest shelves. A few provisions must be discarded.', food: [-10, -4] },
  ],
  bisonkin: [
    { text: 'Bisonkin elders braid bright threads into their winter coats, each knot recalling a different journey.' },
    { text: 'Bisonkin families gather for a low humming song that can be felt through the floor of the great house.', delta: [2, 5] },
  ],
  squirrelfolk: [
    { text: 'A Squirrelfolk archivist files a nut under important historical objects and refuses to explain further.' },
    { text: 'A Squirrelfolk child remembers a forgotten cache while telling an unrelated story. Supper improves immediately.', food: [8, 18], timeReward: [10, 20] },
  ],
  owlkin: [
    { text: 'An Owlkin reading circle observes a respectful silence so complete that nobody notices the meeting has ended.' },
    { text: 'Owlkin observers compare marginal notes and resolve a puzzle that had kept several scholars awake.', knowledge: [6, 14], timeReward: [10, 20] },
  ],
  lynxfolk: [
    { text: 'A Lynxfolk tracker reconstructs an elaborate mystery from footprints. The culprit was carrying the laundry.' },
    { text: 'Lynxfolk scouts follow green stains along a ledge and collect a handful of loose copper nodules.', copper: [2, 5], timeReward: [10, 20] },
  ],
  ibexkin: [
    { text: 'Ibexkin youngsters choose the least convenient ledge for a picnic and rate the view unanimously excellent.' },
    { text: 'An Ibexkin hauling team clears a cliff path and brings the sound stone back to the builders.', stone: [10, 22], timeReward: [10, 20] },
  ],
  eaglefolk: [
    { text: 'An Eaglefolk messenger circles the aerie twice to finish a particularly satisfying story before landing.' },
    { text: 'Eaglefolk sky watchers sketch a rare pattern of high clouds before the mountain wind scatters it.', knowledge: [5, 12], timeReward: [10, 20] },
  ],
  molekin: [
    { text: 'Molekin neighbors exchange tapping greetings through their walls. One household requests slower gossip.' },
    { text: 'Molekin tunnelers shore up a slumping side passage, using a few beams from the village store.', wood: [-10, -4] },
  ],
  raccoonfolk: [
    { text: 'A Raccoonfolk collector unveils a magnificent display of shiny objects, none of which anyone can identify.' },
    { text: 'Raccoonfolk salvagers restore a box of bent implements with patient fingers and questionable confidence.', tools: [1, 3], timeReward: [10, 20] },
  ],
};

// Shared factory production line; rates and inputs are per factory per second.
const FACTORY_RECIPES = [
  { id: 'goods', name: 'Industrial Goods', rate: 0.08, inputs: {}, tech: null, unlock: 'Always available' },
  { id: 'tools', name: 'Tools', rate: 0.08, inputs: { wood: 3.2 }, tech: 'craftsmanship', unlock: 'Craftsmanship' },
  { id: 'steel', name: 'Steel', rate: 0.04, inputs: { iron: 0.6, coal: 0.4 }, tech: 'metallurgy', unlock: 'Metallurgy' },
  { id: 'machinery', name: 'Machinery', rate: 0.02, inputs: { steel: 0.1, coal: 0.4 }, tech: 'machineryTech', unlock: 'Mechanism' },
];

// --- crafting (instant conversions) ---
const CRAFTS = [
  { id: 'tools',     name: 'Tools',     give: { tools: 1 },     cost: { wood: 40 },
    req: () => bld('workbench') > 0, desc: 'carved and fire-hardened' },
  { id: 'machinery', name: 'Machinery', give: { machinery: 1 }, cost: { steel: 5, coal: 20 },
    req: () => bld('workshop') > 0, desc: 'gears, springs, patience' },
];

// --- trials: challenge modes. repeat = 0 means once-only. ---
const TRIALS = [
  { id: 'scarcity', name: 'Trial of Scarcity', repeat: 5,
    text: 'The ancestors remember the years when the storehouse was an empty promise. Take the oath, and every meal must be earned twice.',
    mod: 'Food production is halved.',
    goal: 'Keep the village fed for 240 days. If the food ever runs out, the trial fails.',
    reward: '+10% food production, permanently, for each completion.' },

  { id: 'frugality', name: 'Trial of Frugality', repeat: 3,
    text: 'A foundation is a promise made in stone. Swear that no promise will be made cheaply, and raise twelve buildings while every mistake costs more.',
    mod: 'All building costs are raised by 50%.',
    goal: 'Complete 12 constructions while the trial is active.',
    reward: 'All building costs reduced 10%, permanently, for each completion.' },

  { id: 'overflow', name: 'Trial of the Overflow', repeat: 3,
    text: 'The old vaults were built to hold the end of the world. Fill every store to its lip, and prove that Emberhold can keep what it has gathered.',
    mod: 'No new storage or storage bonuses may be used while the oath stands.',
    goal: 'Have every store you have discovered filled to its ceiling at the same moment.',
    reward: 'All storage ceilings +20%, permanently, for each completion.',
    req: () => bld('storehouse') > 0 },

  { id: 'tinkering', name: 'Trial of Tinkering', repeat: 0,
    text: 'Let the Workbench speak for itself. For a year, no hand may shape a Tool by the old method; give the machine a patient keeper and see what it learns.',
    mod: 'Tools may not be crafted by hand while the oath stands.',
    goal: 'Assign at least one Tinkerer and keep the Workbench running for 240 days without manually crafting Tools.',
    reward: 'Tinkerers: unlocks a job that steadily assembles Tools from wood and stone.',
    req: () => bld('workbench') > 0 },

  { id: 'wayfinding', name: 'Trial of Wayfinding', repeat: 0,
    text: 'The hearth is not the world. Follow the wolf-trails beyond the fields, and return with a road the village can believe in.',
    mod: 'The village must spend time and supplies to learn the roads beyond its hearth.',
    goal: 'Complete the Old Forest expedition while the oath stands.',
    reward: 'Explorers: unlocks a worker who slowly earns Survey points for future migrations.',
    req: () => era() >= 2 && bld('quarry') > 0 },

  { id: 'silence', name: 'Trial of Silence', repeat: 0,
    text: 'Put away the questions. Let the old books close and the thinkers fall quiet while the forges attempt what no one can explain to them.',
    mod: 'Knowledge production is stopped entirely.',
    goal: 'Produce 100 Steel after researching Metallurgy, spending only what was hoarded before the silence.',
    reward: 'Oral Tradition: Thinkers produce +50% knowledge, permanently.',
    req: () => era() >= 2 },

  { id: 'longnight', name: 'Trial of the Long Night', repeat: 0,
    text: 'Some winters do not end when the calendar says they should. Keep the fires alive for ten years, and teach the village that darkness is not the same as death.',
    mod: 'The entire trial is winter, with food production x0.25.',
    goal: 'Survive ten full years under the trial (2,000 days).',
    reward: 'Everwarm: winter food penalty halved (x0.75) and +5% to all production, permanently.' },

  { id: 'solitude', name: 'Trial of Solitude', repeat: 0,
    text: 'Ten voices in the dark are enough, if they refuse to waste a word. Build a store of knowledge with no more minds than the first villages possessed.',
    mod: 'The village is capped at 10 villagers. No children are born past ten.',
    goal: 'Stockpile 800 knowledge with only ten minds.',
    reward: 'Twin Souls: every Hut grants +2 extra population cap, permanently.' },

  { id: 'haste', name: 'Trial of Haste', repeat: 0,
    text: 'The ruins are patient. Emberhold cannot be. Drive the ages forward before the road behind you disappears.',
    mod: 'All production reduced by 30%.',
    goal: 'Reach the Age of Light within 20,000 days of starting the trial.',
    reward: 'Blueprints: all building costs reduced 15%, permanently.',
    req: () => era() >= 3 },

  { id: 'industrialization', name: 'Trial of Industrialization', repeat: 0,
    text: 'The mine will give less, the people will grumble, and the machines will demand their due. Build the first Factory anyway, and make a hundred things the old world once took for granted.',
    mod: 'Coal emerges at 20% of its usual rate. Below 40 morale, the village may riot and lose stored coal.',
    goal: 'Build a Factory and produce 100 Industrial Goods. There is no deadline.',
    reward: 'Industrialization: Factories remain available in every future Emberhold.',
    req: () => tech('metallurgy') && bld('coalSeam') > 0 && state.res.coal > 0 },
  { id: 'expansion', name: 'Trial of Expansion', repeat: 0,
    text: 'The Monument asks what a growing village is for. Answer with foundations: eight of them, each one made ready for the people who come after.',
    mod: 'The village must prove it can grow without wasting a foundation.',
    goal: 'Complete 8 constructions while the trial is active.',
    reward: 'Master Builders: unlocks one additional construction queue slot, permanently.',
    req: () => bld('monument') > 0 },
  { id: 'scholarship', name: 'Trial of Scholarship', repeat: 0,
    text: 'Knowledge is not a treasure if it never leaves the shelf. Spend five hard-won questions on the future, and make room for another voice in the archive.',
    mod: 'The village must invest its knowledge before it can claim another voice in the archive.',
    goal: 'Complete 5 research projects while the trial is active.',
    reward: 'Grand Archive: unlocks one additional research queue slot, permanently.',
    req: () => bld('monument') > 0 },

  { id: 'conquest', name: 'Trial of Conquest', repeat: 0,
    text: 'Three nations meet Emberhold at the edge of the old roads, and hatred is the only greeting they share. Why they hate you, only the Ancients know for certain. But learning how to use force has its place.',
    mod: 'Three nearby nations begin at 0 relations, and their relations cannot change while the oath stands.',
    goal: 'Conquer all three nations.',
    reward: 'Conquest: Guard recruitment speed increases by 10%, permanently.',
    req: () => conquestTrialAvailable() },
];

// --- landings: where the migration ends up. Modifiers multiply production
// of that resource (passive income included). The road decides, for now.
const CLIMATES = {
  emberplain: { name: 'Sunlit plains', offset: 2, weights: [55, 25, 15, 5], text: 'Warmer, sunnier days; storms are uncommon.' },
  greenfold: { name: 'Rain-fed woodland', offset: 0, weights: [25, 30, 35, 10], text: 'Frequent rain nourishes food production.' },
  grayrocks: { name: 'Stormbound heights', offset: -8, weights: [20, 25, 20, 35], text: 'Colder days and frequent storms; frost can hinder food production.' },
  floodmeadows: { name: 'Misty riverlands', offset: 1, weights: [25, 20, 35, 10, 10], text: 'Rain is common; occasional fog slows trade income.' },
  ashfen: { name: 'Warm veiled marsh', offset: 5, weights: [15, 30, 20, 15, 20], text: 'Warmer, cloudier days with frequent fog that slows trade income.' },
  windmere: { name: 'Aurora waters', offset: -3, weights: [30, 20, 15, 20, 5, 10], text: 'Cool and changeable; occasional auroras lift morale and aid knowledge and aether production.' },
};
// A landing is never just its broad climate. Each scout report is marked with
// two local traits, drawn from this catalogue when it is discovered. Climate
// restrictions make a bog feel unlike a high pass even when their basic
// landing modifiers happen to overlap.
const PLACE_TRAITS = [
  { id: 'relicLittered', name: 'Relic Littered', mods: { knowledge: 1.10 }, vanishChance: 0.001, desc: 'The bones of the old world are thick here. Investigating them may bring delights, or horrors.' },
  { id: 'oldRoads', name: 'Old Roads', mods: { currency: 1.12, goods: 1.08 }, desc: 'Cracked causeways still lead, improbably, where people need to go.' },
  { id: 'richTopsoil', name: 'Rich Topsoil', mods: { food: 1.14 }, desc: 'Dark earth rewards patient hands and remembered seeds.' },
  { id: 'flintRidges', name: 'Flint Ridges', mods: { stone: 1.14, tools: 1.06 }, desc: 'Sharp stone lies close to the surface in long, workable seams.' },
  { id: 'quietHollows', name: 'Quiet Hollows', morale: 0.008, desc: 'The wind barely reaches the sheltered folds of this country.' },
  { id: 'restlessGround', name: 'Restless Ground', morale: -0.009, desc: 'Small tremors keep cups rattling and sleep shallow.' },
  { id: 'clearSprings', name: 'Clear Springs', mods: { food: 1.07 }, morale: 0.006, desc: 'Cold, clean water rises from the ground without asking a price.' },
  { id: 'buriedWorkshops', name: 'Buried Workshops', mods: { tools: 1.15, knowledge: 1.05 }, desc: 'Collapsed workrooms offer patterns, parts, and dangerous examples.' },
  { id: 'watchfulStones', name: 'Watchful Stones', mods: { stone: 1.08 }, guardRecruitment: 1.10, desc: 'Standing stones make good landmarks, and better watch posts.' },
  { id: 'wildOrchards', name: 'Wild Orchards', mods: { food: 1.12 }, growth: 0.94, desc: 'Half-tamed fruit trees return each year without being asked.' },
  { id: 'echoingCaves', name: 'Echoing Caves', mods: { stone: 1.10, aether: 1.10 }, morale: -0.004, desc: 'Voices travel too far underground, and sometimes return changed.' },
  { id: 'tradingCrossroads', name: 'Trading Crossroads', mods: { currency: 1.18 }, survey: 1.10, desc: 'Paths converge here; news and small necessities do as well.' },
  { id: 'sunkenArchives', name: 'Sunken Archives', mods: { knowledge: 1.16 }, desc: 'Waterlogged shelves still keep fragments of a more orderly age.' },
  { id: 'copperBloom', name: 'Copper Bloom', mods: { copper: 1.18 }, desc: 'Green stains on the rocks point to shallow, generous ore.' },
  { id: 'boneFields', name: 'Bone Fields', mods: { food: 1.05 }, morale: -0.010, desc: 'Old battles fed the soil, but never quite left it.' },
  { id: 'fireflyGroves', name: 'Firefly Groves', mods: { aether: 1.14 }, morale: 0.005, desc: 'At dusk, living lights gather between the trunks.' },
  { id: 'airOfRage', name: 'Air of Rage', rage: true, desc: 'Even the anger of the Ancient Ones gathers here. Unspent fury deepens into a morale penalty; an attack turns it into a fading morale bonus before the anger slowly returns.' },
  { id: 'atavisticAura', name: 'Atavistic Aura', atavistic: true, lineageLevelBonus: 1, desc: 'The pull of cruder things yanks at those who live here. Every lineage trait gains one level.' },
  { id: 'blackSoil', name: 'Black Soil', climates: ['emberplain', 'ashfen'], mods: { food: 1.12, coal: 1.06 }, desc: 'Ash and loam have argued here for generations, to the farmer\'s benefit.' },
  { id: 'glassWastes', name: 'Glass Wastes', climates: ['emberplain', 'ashfen'], mods: { aether: 1.16 }, morale: -0.006, desc: 'Fused earth catches the sun in sheets too bright to look at long.' },
  { id: 'smokingVents', name: 'Smoking Vents', climates: ['ashfen'], mods: { coal: 1.20, iron: 1.08 }, morale: -0.008, desc: 'Warm breath rises from below, carrying sulfur and opportunity.' },
  { id: 'reedLabyrinth', name: 'Reed Labyrinth', climates: ['floodmeadows', 'ashfen', 'windmere'], mods: { food: 1.10, aether: 1.07 }, survey: 0.90, desc: 'The channels feed the village and hide the way through.' },
  { id: 'mistShrines', name: 'Mist Shrines', climates: ['floodmeadows', 'ashfen'], morale: 0.012, mods: { knowledge: 1.06 }, desc: 'Offerings disappear into the mist; comfort does not.' },
  { id: 'floodedRuins', name: 'Flooded Ruins', climates: ['floodmeadows', 'windmere'], mods: { knowledge: 1.12, food: 1.05 }, vanishChance: 0.0003, desc: 'Streets lie beneath still water, with doors opening where no house remains.' },
  { id: 'rainwardCanopy', name: 'Rainward Canopy', climates: ['greenfold'], mods: { wood: 1.18, food: 1.06 }, desc: 'The oldest boughs turn hard rain aside before it reaches the ground.' },
  { id: 'mossboundStones', name: 'Mossbound Stones', climates: ['greenfold'], mods: { stone: 1.10, aether: 1.08 }, desc: 'Green-covered markers make the forest feel curated by patient hands.' },
  { id: 'whisperingPines', name: 'Whispering Pines', climates: ['greenfold'], mods: { knowledge: 1.08, wood: 1.08 }, morale: 0.004, desc: 'The trees make a language of the wind, if anyone can bear to listen.' },
  { id: 'highPasses', name: 'High Passes', climates: ['grayrocks'], mods: { stone: 1.16, iron: 1.12 }, survey: 1.15, desc: 'A hard climb buys a view of the roads, valleys, and threats beyond.' },
  { id: 'frostveins', name: 'Frostveins', climates: ['grayrocks'], mods: { aether: 1.16, iron: 1.07 }, morale: -0.006, desc: 'Blue ice threads the rock and sings when struck.' },
  { id: 'eaglesRest', name: 'Eagle\'s Rest', climates: ['grayrocks'], guardRecruitment: 1.18, morale: 0.005, desc: 'From this height, no approach is truly unseen.' },
  { id: 'mirrorLake', name: 'Mirror Lake', climates: ['windmere'], mods: { knowledge: 1.12, aether: 1.12 }, desc: 'The water reflects stars that no longer have names.' },
  { id: 'auroraReeds', name: 'Aurora Reeds', climates: ['windmere'], mods: { aether: 1.18 }, morale: 0.008, desc: 'Pale lights collect in the reeds even on nights without an aurora.' },
  { id: 'tidalGardens', name: 'Tidal Gardens', climates: ['windmere', 'floodmeadows'], mods: { food: 1.13, goods: 1.06 }, growth: 0.95, desc: 'The water leaves fertile beds behind, then returns to collect its due.' },
  { id: 'stormScoured', name: 'Storm-Scoured', climates: ['grayrocks', 'windmere'], mods: { stone: 1.07, aether: 1.10 }, morale: -0.005, desc: 'Nothing loose survives the weather; what remains is strong.' },
];
// Weights follow this order. Effects multiply positive production, never consumption.
const WEATHER = [
  { id: 'clear', name: 'Clear', morale: 0.025, mods: {} },
  { id: 'cloudy', name: 'Cloudy', morale: 0, mods: {} },
  { id: 'rain', name: 'Rainy', morale: 0, mods: { food: 1.10 } },
  { id: 'storm', name: 'Stormy', morale: -0.06, mods: { food: 0.90 } },
  { id: 'fog', name: 'Foggy', morale: 0, mods: { currency: 0.90 } },
  { id: 'aurora', name: 'Aurora', morale: 0.015, mods: { knowledge: 1.10, aether: 1.15 } },
];
const LANDINGS = [
  { id: 'emberplain', name: 'The Emberplain', habitats: ['plains'], mods: {},
    text: 'A wide plain of ash-grass and old roads. Nothing comes easy; nothing is denied.' },
  { id: 'greenfold', name: 'The Greenfold', habitats: ['forest'], mods: { wood: 1.25, stone: 0.8, iron: 0.8 },
    text: 'Old oak country. Timber for the taking — but the ground hoards its stone and iron.' },
  { id: 'grayrocks', name: 'The Grayrocks', habitats: ['mountain'], mods: { stone: 1.3, iron: 1.25, food: 0.8 },
    text: 'High, thin-soiled country. Stone and ore in abundance; the fields are poor.' },
  { id: 'floodmeadows', name: 'The Floodmeadows', habitats: ['water', 'wetland', 'plains'], mods: { food: 1.25, wood: 0.85 },
    text: 'A river\'s patience made this ground rich. Trees are few and far between.' },
  { id: 'ashfen', name: 'The Ashfen', habitats: ['wetland'], mods: { coal: 1.35, food: 0.85 },
    text: 'The ground smokes gently here. Coal for the digging, but little cares to grow.' },
  { id: 'windmere', name: 'The Windmere', habitats: ['water', 'wetland'], mods: { knowledge: 1.2, aether: 1.15, food: 0.9 },
    text: 'Still water under open sky. Minds are clear here; bellies less so.' },
];

// Habitat lists match any listed habitat; omitted lists allow every landing.
// Shared definitions keep animal neighbors and inherited lineages in sync.
const ANIMAL_LINEAGES = [
  { id: 'otterfolk', name: 'Otterfolk', habitats: ['water'], mods: { food: 1.22, currency: 1.15, iron: 0.90 },
    desc: 'Otter raft families fish the deep channels and ferry goods between floating markets.' },
  { id: 'beaverkin', name: 'Beaverkin', habitats: ['water'], mods: { wood: 1.25, tools: 1.15, aether: 0.88 },
    desc: 'Beaver engineers raise timber lodges and waterworks along broad rivers and lakes.' },
  { id: 'turtlefolk', name: 'Turtlefolk', habitats: ['water'], mods: { food: 1.18, knowledge: 1.20, machinery: 0.88 },
    desc: 'Freshwater turtle elders tend floating gardens and preserve generations of careful observations.' },
  { id: 'axolotlkin', name: 'Axolotlkin', habitats: ['water'], mods: { knowledge: 1.25, aether: 1.15, coal: 0.85 },
    desc: 'Feathery-gilled lake dwellers study luminous pools from submerged libraries.' },
  { id: 'carpfolk', name: 'Carpfolk', habitats: ['water'], mods: { food: 1.30, currency: 1.10, tools: 0.88 },
    desc: 'Carp communities cultivate underwater terraces and exchange harvests at shore markets.' },
  { id: 'frogfolk', name: 'Frogfolk', habitats: ['wetland'], mods: { food: 1.20, aether: 1.20, steel: 0.88 },
    desc: 'Frog reed singers cultivate marsh insects and read the weather in ripples and chorus.' },
  { id: 'heronkin', name: 'Heronkin', habitats: ['wetland'], mods: { knowledge: 1.22, food: 1.12, wood: 0.90 },
    desc: 'Heron stilt villages practice patient fishing and chart the changing wetland seasons.' },
  { id: 'foxfolk', name: 'Foxfolk', mods: { currency: 1.25, knowledge: 1.12, stone: 0.90 },
    desc: 'Fox traveling merchants adapt to any country, collecting stories and negotiating clever bargains.' },
  { id: 'wolfkin', name: 'Wolfkin', mods: { food: 1.22, tools: 1.12, currency: 0.90 },
    desc: 'Wolf packs share the hunt and maintain dependable tools, valuing communal stores above coin.' },
  { id: 'bearfolk', name: 'Bearfolk', habitats: ['forest', 'mountain'], mods: { wood: 1.20, stone: 1.20, currency: 0.88 },
    desc: 'Bear clans build stout woodland and mountain homes, hauling heavy materials with ease.' },
  { id: 'deerkin', name: 'Deerkin', habitats: ['forest', 'plains'], mods: { food: 1.20, wood: 1.15, iron: 0.88 },
    desc: 'Deer orchard keepers follow the edges of woodland and meadow, tending broad green commons.' },
  { id: 'rabbitfolk', name: 'Rabbitfolk', habitats: ['plains'], growthTime: 0.5, mods: { food: 1.28, goods: 1.10, coal: 0.85 },
    desc: 'Rabbit warrens spread beneath open fields, linking productive gardens with busy cottage workshops.' },
  { id: 'bisonkin', name: 'Bisonkin', habitats: ['plains'], mods: { food: 1.15, goods: 1.25, aether: 0.88 },
    desc: 'Bison herds settle the grasslands in great communal houses supplied by mills and grazing fields.' },
  { id: 'squirrelfolk', name: 'Squirrelfolk', habitats: ['forest'], mods: { wood: 1.28, tools: 1.15, steel: 0.85 },
    desc: 'Squirrel canopy towns connect timber workshops with ropeways and carefully stocked nut stores.' },
  { id: 'owlkin', name: 'Owlkin', habitats: ['forest'], mods: { knowledge: 1.28, aether: 1.12, goods: 0.88 },
    desc: 'Owl scholars keep quiet observatories in old trees, recording the night beneath living roofs.' },
  { id: 'lynxfolk', name: 'Lynxfolk', habitats: ['forest', 'mountain'], mods: { food: 1.18, copper: 1.22, currency: 0.88 },
    desc: 'Lynx trackers explore wooded slopes, finding game trails and overlooked copper seams.' },
  { id: 'ibexkin', name: 'Ibexkin', habitats: ['mountain'], mods: { stone: 1.25, iron: 1.18, wood: 0.88 },
    desc: 'Ibex cliff builders carry stone and ore along paths too steep for ordinary caravans.' },
  { id: 'eaglefolk', name: 'Eaglefolk', habitats: ['mountain'], mods: { aether: 1.25, knowledge: 1.18, food: 0.88 },
    desc: 'Eagle aerie watchers survey the high peaks and harvest insights from clear mountain skies.' },
  { id: 'molekin', name: 'Molekin', mods: { stone: 1.22, coal: 1.22, aether: 0.85 },
    desc: 'Mole tunnel crews establish deep workshops wherever they settle, following stone and fuel underground.' },
  { id: 'raccoonfolk', name: 'Raccoonfolk', mods: { tools: 1.22, machinery: 1.18, food: 0.90 },
    desc: 'Raccoon salvagers thrive wherever there is work, turning discarded parts into ingenious machines.' },
].map(l => ({ ...l, effect: Object.entries(l.mods).map(([res, mod]) => {
  const pct = Math.round((mod - 1) * 100);
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% ${RESOURCE_NAMES.get(res) || res}`;
}).concat(l.growthTime && l.growthTime !== 1
  ? [`${Math.round(Math.abs(l.growthTime - 1) * 100)}% ${l.growthTime < 1 ? 'less' : 'more'} time for population growth`]
  : []).join(', ') }));

// --- attack stages ---
// Eight stages give six meaningful choices between a basic raid and a siege.
// The final three add an uncommon loot roll; the actual contents are filtered
// by the technologies available in the current settlement.
const RAID_STAGES = [
  { id: 'raid', name: 'Raid', difficulty: 1, cost: { food: 30, tools: 2 }, rolls: 1, loot: 1 },
  { id: 'foray', name: 'Foray', difficulty: 1.25, cost: { food: 40, tools: 2 }, rolls: 1, loot: 1.1 },
  { id: 'skirmish', name: 'Skirmish', difficulty: 1.55, cost: { food: 50, tools: 3 }, rolls: 2, loot: 1.2 },
  { id: 'assault', name: 'Assault', difficulty: 1.9, cost: { food: 65, tools: 3 }, rolls: 2, loot: 1.3 },
  { id: 'offensive', name: 'Offensive', difficulty: 2.3, cost: { food: 80, tools: 4 }, rolls: 3, loot: 1.45 },
  { id: 'breakthrough', name: 'Breakthrough', difficulty: 2.75, cost: { food: 100, tools: 5 }, rolls: 3, loot: 1.6, uncommon: 1 },
  { id: 'breach', name: 'Breach', difficulty: 3.25, cost: { food: 125, tools: 6 }, rolls: 4, loot: 1.8, uncommon: 1 },
  { id: 'siege', name: 'Siege', difficulty: 3.8, cost: { food: 160, tools: 8 }, rolls: 5, loot: 2, uncommon: 2 },
];

// Taking and holding a town requires a substantial occupation train in
// addition to the Guards committed to garrison it.
const CONQUEST_COST = { food: 200, tools: 10 };

// --- neighboring tribes ---
// Humans are the default people of Emberhold. After each migration, there is
// a chance that a different tribe is encountered as a trading partner.
const TRIBES = [
  { id: 'human', name: 'Human caravans', text: 'Familiar traders follow the old roads.' },
  { id: 'stonekin', name: 'Stonekin', text: 'The Stonekin arrive with mineral goods and careful ledgers.' },
  { id: 'marshfolk', name: 'Marshfolk', text: 'The Marshfolk pole their cargo through the reeds.' },
  { id: 'skyborn', name: 'Skyborn', text: 'The Skyborn descend from the high passes with bright metal.' },
  { id: 'mephit', name: 'Mephit enclaves', text: 'The Mephits arrive in masks and sealed wagons. Their customs are pungent, but their walls are formidable.' },
  { id: 'dunewalkers', name: 'Dunewalker caravans', requests: ['food', 'wood'], loot: ['currency', 'copper', 'tools'],
    text: 'Under indigo awnings, desert merchants weigh every promise. Their caravans seek food and timber to carry between distant markets.' },
  { id: 'cinderforged', name: 'Cinderforged clans', requests: ['wood', 'coal'], loot: ['iron', 'coal', 'steel'],
    text: 'Hammer songs ring from soot-dark wagons. These volcanic smiths prize fuel above finery and settle agreements beside the furnace.' },
  { id: 'thornkin', name: 'Thornkin groves', requests: ['stone', 'tools'], loot: ['food', 'wood', 'tools'],
    text: 'Their homes are woven from living branches. Thornkin trade orchard harvests for stone and tools, but distrust the smoke of heavy industry.' },
  { id: 'clocklings', name: 'Clockling workshops', requests: ['copper', 'iron', 'stone'], loot: ['tools', 'machinery', 'copper'],
    text: 'Tiny brass bells announce each meticulously timed visit. These tireless inventors collect metal and stone for machines that almost never explode.' },
  { id: 'glimmerfolk', name: 'Glimmerfolk choirs', requests: ['food', 'tools'], loot: ['aether', 'knowledge', 'copper'],
    text: 'Lantern-lit travelers sing to crystals until they answer. They exchange fragments of star lore for the provisions their secluded observatories cannot make.' },
  ...ANIMAL_LINEAGES.map(l => ({ id: l.id, name: l.name, text: l.desc, habitats: l.habitats,
    requests: Object.keys(l.mods).filter(r => l.mods[r] < 1),
    loot: Object.keys(l.mods).filter(r => l.mods[r] > 1) })),
];

// --- lineages ---
// A founding choice inspired by Evolve's species specialization, but kept
// complements Emberhold's landing and Echo systems.
const LINEAGES = [
  { id: 'human', name: 'Emberborn', effect: '+20% Industrial Goods production', mods: { goods: 1.20 },
    desc: 'Adaptable survivors who make something useful from almost anything — especially in a factory.' },
  { id: 'stonekin', name: 'Stonekin', effect: '+18% stone and iron, −8% food', mods: { stone: 1.18, iron: 1.18, food: 0.92 },
    desc: 'Broad-shouldered miners who remember the shape of every seam.' },
  { id: 'marshfolk', name: 'Marshfolk', effect: '+18% food and wood, −8% stone', mods: { food: 1.18, wood: 1.18, stone: 0.92 },
    desc: 'Patient growers who turn wet ground and tangled roots into abundance.' },
  { id: 'skyborn', name: 'Skyborn', effect: '+22% knowledge and aether, −10% food', mods: { knowledge: 1.22, aether: 1.22, food: 0.90 },
    desc: 'Clear-eyed wanderers whose maps begin where the clouds end.' },
  { id: 'mephit', name: 'Mephit', effect: '+35% raid defense; raids arrive 120 seconds slower; attackers suffer more injuries', mods: {},
    desc: 'Their settlements stink of sulfur and strange alchemy. Invaders learn to respect the smell.' },
  { id: 'dunewalkers', name: 'Dunewalkers', effect: '+30% currency and +15% copper, −12% wood', mods: { currency: 1.30, copper: 1.15, wood: 0.88 },
    desc: 'A settlement of bustling markets and shaded courtyards. Trade pays for expansion, but scarce timber demands careful planning.' },
  { id: 'cinderforged', name: 'Cinderforged', effect: '+20% iron, coal, and steel, −12% knowledge', mods: { iron: 1.20, coal: 1.20, steel: 1.20, knowledge: 0.88 },
    desc: 'Furnaces are the heart of every home. Rich metalworking supports an industrial rush, while scholars struggle to be heard over the hammers.' },
  { id: 'thornkin', name: 'Thornkin', effect: '+25% wood and +15% food, −15% steel and Industrial Goods', mods: { wood: 1.25, food: 1.15, steel: 0.85, goods: 0.85 },
    desc: 'Living villages spread beneath a generous canopy. Fast early growth comes naturally; bringing heavy industry into the grove takes patience.' },
  { id: 'clocklings', name: 'Clocklings', effect: '+20% tools and +25% machinery, −12% food', mods: { tools: 1.20, machinery: 1.25, food: 0.88 },
    desc: 'Every workshop is an experiment and every tool a prototype. Precision manufacturing flourishes, provided someone remembers to tend the fields.' },
  { id: 'glimmerfolk', name: 'Glimmerfolk', effect: '+30% aether and +15% knowledge, −15% stone and iron', mods: { aether: 1.30, knowledge: 1.15, stone: 0.85, iron: 0.85 },
    desc: 'Crystal gardens illuminate nights spent charting the heavens. Discovery leads the way, but the weight of ordinary construction slows their ascent.' },
  ...ANIMAL_LINEAGES,
];

// A lineage is a small collection of inherited practices rather than a single
// opaque bonus.  Traits are deliberately shared where two peoples arrive at a
// similar advantage by the same means; the lineage's `mods` above remain the
// mechanical source of truth for saves and production.
const LINEAGE_TRAITS = [
  { id: 'adaptable', name: 'Adaptable', group: 'Way of life', effect: 'Can settle in any habitat', desc: 'They make a home from whatever a new country offers.' },
  { id: 'industrialCraft', name: 'Industrial Craft', group: 'Craft', effect: '+20% Industrial Goods', desc: 'Factories and workshops turn hard-won materials into useful goods.' },
  { id: 'mineralLore', name: 'Mineral Lore', group: 'Craft', effect: '+18% Stone and Iron', desc: 'A practiced eye finds the useful shape inside a seam.' },
  { id: 'leanFields', name: 'Lean Fields', group: 'Trade-off', effect: '−8% Food', desc: 'The ground is read for ore before it is read for crops.' },
  { id: 'wetlandCultivation', name: 'Wetland Cultivation', group: 'Way of life', effect: '+18% Food and Wood', desc: 'Roots, reeds, and wet soil are tended as carefully as fields.' },
  { id: 'softStone', name: 'Soft Stone', group: 'Trade-off', effect: '−8% Stone', desc: 'Marsh ground gives less reliable stone than a dry ridge.' },
  { id: 'highLore', name: 'High Lore', group: 'Learning', effect: '+22% Knowledge and Aether', desc: 'Clear air and long sightlines foster thought beyond the horizon.' },
  { id: 'lightAppetite', name: 'Light Appetite', group: 'Trade-off', effect: '−10% Food', desc: 'High wandering leaves little time for the patient work of feeding a town.' },
  { id: 'sulfurWalls', name: 'Sulfur Walls', group: 'Defense', effect: '+35% raid defense', desc: 'Strange alchemy makes their settlements fiercely difficult to storm.' },
  { id: 'slowProvocation', name: 'Slow Provocation', group: 'Defense', effect: 'Raids arrive 120 seconds slower', desc: 'Invaders approach their reeking wards with unusual caution.' },
  { id: 'cruelReprisals', name: 'Cruel Reprisals', group: 'Defense', effect: 'Attackers suffer more injuries', desc: 'Those who press an assault remember the cost.' },
  { id: 'caravanMarkets', name: 'Caravan Markets', group: 'Trade', effect: '+30% Currency', desc: 'Every courtyard knows the value of a well-timed bargain.' },
  { id: 'copperBargaining', name: 'Copper Bargaining', group: 'Trade', effect: '+15% Copper', desc: 'Traders recognize a good vein and a good price.' },
  { id: 'scantTimber', name: 'Scant Timber', group: 'Trade-off', effect: '−12% Wood', desc: 'Fine timber is too scarce to waste.' },
  { id: 'furnaceMastery', name: 'Furnace Mastery', group: 'Craft', effect: '+20% Iron, Coal, and Steel', desc: 'Fuel, metal, and heat are the rhythm of daily life.' },
  { id: 'noisyScholarship', name: 'Noisy Scholarship', group: 'Trade-off', effect: '−12% Knowledge', desc: 'It is hard to hear a lecture over the hammer-song.' },
  { id: 'livingCanopy', name: 'Living Canopy', group: 'Way of life', effect: '+25% Wood and +15% Food', desc: 'Their homes and gardens grow together.' },
  { id: 'rootsAgainstSteel', name: 'Roots Against Steel', group: 'Trade-off', effect: '−15% Steel and Industrial Goods', desc: 'Heavy industry is an awkward guest in a living grove.' },
  { id: 'precisionWorks', name: 'Precision Works', group: 'Craft', effect: '+20% Tools and +25% Machinery', desc: 'Every device is a prototype worth improving.' },
  { id: 'neglectedFields', name: 'Neglected Fields', group: 'Trade-off', effect: '−12% Food', desc: 'A careful gear still cannot tend a field by itself.' },
  { id: 'crystalLore', name: 'Crystal Lore', group: 'Learning', effect: '+30% Aether and +15% Knowledge', desc: 'Crystal gardens turn starlight into insight.' },
  { id: 'fragileFoundations', name: 'Fragile Foundations', group: 'Trade-off', effect: '−15% Stone and Iron', desc: 'Ordinary building materials yield reluctantly to delicate hands.' },
  { id: 'waterHome', name: 'Water Home', group: 'Habitat', effect: 'Requires water habitats', desc: 'Their settlements are made for broad channels, lakes, and shorelines.' },
  { id: 'wetlandHome', name: 'Wetland Home', group: 'Habitat', effect: 'Requires wetland habitats', desc: 'They thrive among reeds, shallows, and saturated ground.' },
  { id: 'plainsHome', name: 'Open-Country Home', group: 'Habitat', effect: 'Requires plains habitats', desc: 'Open fields and broad skies are part of their way of life.' },
  { id: 'forestHome', name: 'Forest Home', group: 'Habitat', effect: 'Requires forest habitats', desc: 'They build and forage beneath a living canopy.' },
  { id: 'mountainHome', name: 'Highland Home', group: 'Habitat', effect: 'Requires mountain habitats', desc: 'Steep ground and thin air feel familiar.' },
  { id: 'riverBounty', name: 'River Bounty', group: 'Way of life', effect: '+22% Food and +15% Currency', desc: 'Fishing and ferry trade keep raft families prosperous.' },
  { id: 'shallowVeins', name: 'Shallow Veins', group: 'Trade-off', effect: '−10% Iron', desc: 'Deep mining is poorly suited to a life on the water.' },
  { id: 'waterworks', name: 'Waterworks', group: 'Craft', effect: '+25% Wood and +15% Tools', desc: 'Dams, lodges, and careful joinery put every log to work.' },
  { id: 'dimAether', name: 'Dim Aether', group: 'Trade-off', effect: '−12% Aether', desc: 'Practical labor leaves little patience for subtler currents.' },
  { id: 'lakeMemory', name: 'Lake Memory', group: 'Learning', effect: '+18% Food and +20% Knowledge', desc: 'Floating gardens and patient records preserve what generations learn.' },
  { id: 'machineShy', name: 'Machine Shy', group: 'Trade-off', effect: '−12% Machinery', desc: 'New mechanisms earn trust slowly.' },
  { id: 'submergedArchives', name: 'Submerged Archives', group: 'Learning', effect: '+25% Knowledge and +15% Aether', desc: 'Luminous pools and drowned libraries reward long study.' },
  { id: 'coalAverse', name: 'Coal Averse', group: 'Trade-off', effect: '−15% Coal', desc: 'Smoke and soot have no place in a delicate home.' },
  { id: 'terraceGardens', name: 'Terrace Gardens', group: 'Way of life', effect: '+30% Food', desc: 'Underwater beds produce a generous, steady harvest.' },
  { id: 'shoreMarkets', name: 'Shore Markets', group: 'Trade', effect: '+10% Currency', desc: 'Harvests move easily from water to shore.' },
  { id: 'delicateTools', name: 'Delicate Tools', group: 'Trade-off', effect: '−12% Tools', desc: 'Submerged work wears ordinary implements quickly.' },
  { id: 'chorusGardens', name: 'Chorus Gardens', group: 'Way of life', effect: '+20% Food and Aether', desc: 'Marsh insects, weather, and song are cultivated together.' },
  { id: 'softSteel', name: 'Soft Steel', group: 'Trade-off', effect: '−12% Steel', desc: 'The marsh provides little appetite for hard, heavy work.' },
  { id: 'seasonalLore', name: 'Seasonal Lore', group: 'Learning', effect: '+22% Knowledge and +12% Food', desc: 'Patient observation turns each changing season into a lesson.' },
  { id: 'sparseTimber', name: 'Sparse Timber', group: 'Trade-off', effect: '−10% Wood', desc: 'Stilt villages conserve every straight trunk.' },
  { id: 'barterTales', name: 'Barter Tales', group: 'Trade', effect: '+25% Currency and +12% Knowledge', desc: 'A good story opens a market as readily as a coin.' },
  { id: 'poorStone', name: 'Poor Stone', group: 'Trade-off', effect: '−10% Stone', desc: 'Travelers carry what they need instead of quarrying it.' },
  { id: 'cooperativeHunt', name: 'Cooperative Hunt', group: 'Way of life', effect: '+22% Food and +12% Tools', desc: 'Pack discipline feeds the village and keeps its kit dependable.' },
  { id: 'coinIndifference', name: 'Coin Indifference', group: 'Trade-off', effect: '−10% Currency', desc: 'Shared stores matter more than a private purse.' },
  { id: 'heavyHaulers', name: 'Heavy Haulers', group: 'Craft', effect: '+20% Wood and Stone', desc: 'Great strength makes difficult materials easier to move.' },
  { id: 'littleCoin', name: 'Little Coin', group: 'Trade-off', effect: '−12% Currency', desc: 'Remote, sturdy homes have little use for trade finery.' },
  { id: 'commonGardens', name: 'Common Gardens', group: 'Way of life', effect: '+20% Food and +15% Wood', desc: 'Orchards and woodland edges are kept as shared ground.' },
  { id: 'scantIron', name: 'Scant Iron', group: 'Trade-off', effect: '−12% Iron', desc: 'Their green commons hide few useful metal seams.' },
  { id: 'warrenGardens', name: 'Warren Gardens', group: 'Way of life', effect: '+28% Food and +10% Industrial Goods', desc: 'Busy gardens and cottage workshops spread through the warrens.' },
  { id: 'quickLitters', name: 'Quick Litters', group: 'Growth', effect: '50% less population-growth time', desc: 'New families grow quickly wherever the warrens are secure.' },
  { id: 'grasslandMills', name: 'Grassland Mills', group: 'Way of life', effect: '+15% Food and +25% Industrial Goods', desc: 'Communal houses keep mills, grazing, and production close together.' },
  { id: 'canopyWorkshops', name: 'Canopy Workshops', group: 'Craft', effect: '+28% Wood and +15% Tools', desc: 'Ropeways link well-stocked stores to nimble workshops.' },
  { id: 'delicateSteel', name: 'Delicate Steel', group: 'Trade-off', effect: '−15% Steel', desc: 'High-work tools and fine mechanisms do not favor heavy steel.' },
  { id: 'nightStudy', name: 'Night Study', group: 'Learning', effect: '+28% Knowledge and +12% Aether', desc: 'Quiet observatories make a school of the night sky.' },
  { id: 'poorGoods', name: 'Sparse Manufacture', group: 'Trade-off', effect: '−12% Industrial Goods', desc: 'Scholarship leaves fewer hands for factory work.' },
  { id: 'trackersEye', name: "Tracker's Eye", group: 'Way of life', effect: '+18% Food and +22% Copper', desc: 'Game trails and overlooked copper seams reveal themselves to patient trackers.' },
  { id: 'poorCurrency', name: 'Poor Currency', group: 'Trade-off', effect: '−12% Currency', desc: 'The best paths do not always pass a market.' },
  { id: 'cliffWorks', name: 'Cliff Works', group: 'Craft', effect: '+25% Stone and +18% Iron', desc: 'Steep paths and sure footing make high seams usable.' },
  { id: 'thinHarvest', name: 'Thin Harvest', group: 'Trade-off', effect: '−12% Food', desc: 'Aeries stand above much of the country that could feed them.' },
  { id: 'highWatchers', name: 'High Watchers', group: 'Learning', effect: '+25% Aether and +18% Knowledge', desc: 'Clear mountain skies offer both warning and inspiration.' },
  { id: 'deepCrews', name: 'Deep Crews', group: 'Craft', effect: '+22% Stone and Coal', desc: 'Tunnel crews follow useful rock wherever it leads.' },
  { id: 'salvageCraft', name: 'Salvage Craft', group: 'Craft', effect: '+22% Tools and +18% Machinery', desc: 'Discarded parts become clever machines in practiced hands.' },
  { id: 'irregularPantry', name: 'Irregular Pantry', group: 'Trade-off', effect: '−10% Food', desc: 'A salvager’s eye is not always on the pantry.' },
  { id: 'practicalImprovisation', name: 'Practical Improvisation', group: 'Way of life', effect: 'Queued work completes 10% faster', desc: 'Emberborn turn whatever is at hand into a workable next step.' },
  { id: 'stoneSentinels', name: 'Stone Sentinels', group: 'Defense', effect: '+20% Guard recruitment rate', desc: 'Stonekin raise watch posts before they raise monuments.' },
  { id: 'floodwise', name: 'Floodwise', group: 'Way of life', effect: '+15% Food production during rain and fog', desc: 'Marshfolk know exactly when the wet country is ready to give.' },
  { id: 'farSight', name: 'Far Sight', group: 'Exploration', effect: '+25% Survey gain', desc: 'Skyborn read distant landmarks as easily as nearby paths.' },
  { id: 'bankedHeat', name: 'Banked Heat', group: 'Craft', effect: '+15% Forge output', desc: 'Cinderforged furnaces hold their heat through every shift.' },
  { id: 'livingRenewal', name: 'Living Renewal', group: 'Growth', effect: '15% less population-growth time', desc: 'Thornkin homes put down new roots whenever the village needs them.' },
  { id: 'exactSchedules', name: 'Exact Schedules', group: 'Way of life', effect: 'Queued work completes 15% faster', desc: 'Clocklings waste neither a motion nor a moment between tasks.' },
  { id: 'resonantOmens', name: 'Resonant Omens', group: 'Learning', effect: '+20% resources from lineage happenings', desc: 'Glimmerfolk hear useful possibilities in every strange vibration.' },
];

const LINEAGE_TRAIT_IDS = {
  human: ['adaptable', 'industrialCraft', 'practicalImprovisation'], stonekin: ['mineralLore', 'leanFields', 'stoneSentinels'],
  marshfolk: ['wetlandCultivation', 'softStone', 'floodwise'], skyborn: ['highLore', 'lightAppetite', 'farSight'],
  mephit: ['sulfurWalls', 'slowProvocation', 'cruelReprisals'],
  dunewalkers: ['adaptable', 'caravanMarkets', 'copperBargaining', 'scantTimber'],
  cinderforged: ['furnaceMastery', 'noisyScholarship', 'bankedHeat'], thornkin: ['livingCanopy', 'rootsAgainstSteel', 'livingRenewal'],
  clocklings: ['precisionWorks', 'neglectedFields', 'exactSchedules'], glimmerfolk: ['crystalLore', 'fragileFoundations', 'resonantOmens'],
  otterfolk: ['waterHome', 'riverBounty', 'shallowVeins'], beaverkin: ['waterHome', 'waterworks', 'dimAether'],
  turtlefolk: ['waterHome', 'lakeMemory', 'machineShy'], axolotlkin: ['waterHome', 'submergedArchives', 'coalAverse'],
  carpfolk: ['waterHome', 'terraceGardens', 'shoreMarkets', 'delicateTools'], frogfolk: ['wetlandHome', 'chorusGardens', 'softSteel'],
  heronkin: ['wetlandHome', 'seasonalLore', 'sparseTimber'], foxfolk: ['adaptable', 'barterTales', 'poorStone'],
  wolfkin: ['adaptable', 'cooperativeHunt', 'coinIndifference'], bearfolk: ['forestHome', 'mountainHome', 'heavyHaulers', 'littleCoin'],
  deerkin: ['forestHome', 'plainsHome', 'commonGardens', 'scantIron'], rabbitfolk: ['plainsHome', 'warrenGardens', 'quickLitters', 'coalAverse'],
  bisonkin: ['plainsHome', 'grasslandMills', 'dimAether'], squirrelfolk: ['forestHome', 'canopyWorkshops', 'delicateSteel'],
  owlkin: ['forestHome', 'nightStudy', 'poorGoods'], lynxfolk: ['forestHome', 'mountainHome', 'trackersEye', 'poorCurrency'],
  ibexkin: ['mountainHome', 'cliffWorks', 'scantTimber'], eaglefolk: ['mountainHome', 'highWatchers', 'thinHarvest'],
  molekin: ['adaptable', 'deepCrews', 'dimAether'], raccoonfolk: ['adaptable', 'salvageCraft', 'irregularPantry'],
};

// Which trait owns each existing mechanical modifier. Keeping this mapping
// explicit means a future effect can raise one trait without accidentally
// raising every bonus that the lineage happens to have.
const LINEAGE_TRAIT_EFFECTS = {
  human: { goods: 'industrialCraft' }, stonekin: { stone: 'mineralLore', iron: 'mineralLore', food: 'leanFields' },
  marshfolk: { food: 'wetlandCultivation', wood: 'wetlandCultivation', stone: 'softStone' }, skyborn: { knowledge: 'highLore', aether: 'highLore', food: 'lightAppetite' },
  dunewalkers: { currency: 'caravanMarkets', copper: 'copperBargaining', wood: 'scantTimber' }, cinderforged: { iron: 'furnaceMastery', coal: 'furnaceMastery', steel: 'furnaceMastery', knowledge: 'noisyScholarship' },
  thornkin: { wood: 'livingCanopy', food: 'livingCanopy', steel: 'rootsAgainstSteel', goods: 'rootsAgainstSteel' }, clocklings: { tools: 'precisionWorks', machinery: 'precisionWorks', food: 'neglectedFields' }, glimmerfolk: { aether: 'crystalLore', knowledge: 'crystalLore', stone: 'fragileFoundations', iron: 'fragileFoundations' },
  otterfolk: { food: 'riverBounty', currency: 'riverBounty', iron: 'shallowVeins' }, beaverkin: { wood: 'waterworks', tools: 'waterworks', aether: 'dimAether' }, turtlefolk: { food: 'lakeMemory', knowledge: 'lakeMemory', machinery: 'machineShy' }, axolotlkin: { knowledge: 'submergedArchives', aether: 'submergedArchives', coal: 'coalAverse' }, carpfolk: { food: 'terraceGardens', currency: 'shoreMarkets', tools: 'delicateTools' },
  frogfolk: { food: 'chorusGardens', aether: 'chorusGardens', steel: 'softSteel' }, heronkin: { knowledge: 'seasonalLore', food: 'seasonalLore', wood: 'sparseTimber' }, foxfolk: { currency: 'barterTales', knowledge: 'barterTales', stone: 'poorStone' }, wolfkin: { food: 'cooperativeHunt', tools: 'cooperativeHunt', currency: 'coinIndifference' }, bearfolk: { wood: 'heavyHaulers', stone: 'heavyHaulers', currency: 'littleCoin' }, deerkin: { food: 'commonGardens', wood: 'commonGardens', iron: 'scantIron' }, rabbitfolk: { food: 'warrenGardens', goods: 'warrenGardens', coal: 'coalAverse' }, bisonkin: { food: 'grasslandMills', goods: 'grasslandMills', aether: 'dimAether' }, squirrelfolk: { wood: 'canopyWorkshops', tools: 'canopyWorkshops', steel: 'delicateSteel' }, owlkin: { knowledge: 'nightStudy', aether: 'nightStudy', goods: 'poorGoods' }, lynxfolk: { food: 'trackersEye', copper: 'trackersEye', currency: 'poorCurrency' }, ibexkin: { stone: 'cliffWorks', iron: 'cliffWorks', wood: 'scantTimber' }, eaglefolk: { aether: 'highWatchers', knowledge: 'highWatchers', food: 'thinHarvest' }, molekin: { stone: 'deepCrews', coal: 'deepCrews', aether: 'dimAether' }, raccoonfolk: { tools: 'salvageCraft', machinery: 'salvageCraft', food: 'irregularPantry' },
};
const LINEAGE_GROWTH_TRAITS = { rabbitfolk: 'quickLitters' };
const LINEAGE_SPECIALS = {
  human: { practicalImprovisation: { key: 'queueTime', value: 0.90 } },
  stonekin: { stoneSentinels: { key: 'guardRecruitment', value: 1.20 } },
  marshfolk: { floodwise: { key: 'weatherFood', value: 1.15 } },
  skyborn: { farSight: { key: 'survey', value: 1.25 } },
  cinderforged: { bankedHeat: { key: 'forgeOutput', value: 1.15 } },
  thornkin: { livingRenewal: { key: 'growthTime', value: 0.85 } },
  clocklings: { exactSchedules: { key: 'queueTime', value: 0.85 } },
  glimmerfolk: { resonantOmens: { key: 'eventReward', value: 1.20 } },
};

for (const lineage of LINEAGES) lineage.traits = LINEAGE_TRAIT_IDS[lineage.id] || [];
for (const lineage of LINEAGES) {
  lineage.traitEffects = LINEAGE_TRAIT_EFFECTS[lineage.id] || {};
  lineage.specials = LINEAGE_SPECIALS[lineage.id] || {};
  if (LINEAGE_GROWTH_TRAITS[lineage.id]) lineage.growthTrait = LINEAGE_GROWTH_TRAITS[lineage.id];
}

// --- migration (loop) rewards: Echoes, spent in the ancestral shop.
// Earned on declaring a migration: floor((pop - 10)^2 / 100).
const UPGRADES = [
  { id: 'deepRoots', name: 'Deep Roots', max: 5, costs: [2, 4, 8, 16, 32],
    effect: '+5% to all production, per level',
    desc: 'the village remembers how to flourish' },
  { id: 'wanderers', name: 'Wandering Kin', max: 5, costs: [1, 2, 4, 8, 16],
    effect: '+2 starting villagers and +2 population cap, per level',
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
  { id: 'buildingQueue', name: 'Master Builders', max: 1, costs: [8],
    effect: '+1 construction queue slot',
    desc: 'more hands can raise foundations at once' },
  { id: 'researchQueue', name: 'Grand Archive', max: 1, costs: [8],
    effect: '+1 research queue slot',
    desc: 'more minds can pursue old questions at once' },
  { id: 'farHorizons', name: 'Far Horizons', max: 1, costs: [125],
    effect: 'lineages may settle in any habitat',
    desc: 'the old boundaries between people and place no longer hold' },
  { id: 'fearOfTheConqueror', name: 'Fear of the Conqueror', max: 1, costs: [300],
    effect: 'victories erode enemy Military strength by the battle stage',
    desc: 'every defeat teaches the conquered to fear the next standard' },
  { id: 'practicedMigrator', name: 'Practiced Migrator', max: 1, costs: [250],
    effect: 'start in the Age of Stone with Stone Working researched, +5 villagers, and +5 population cap',
    desc: 'the road has become familiar enough to carry the first hard-won lessons forward' },
  { id: 'journalOfOldTimes', name: 'Journal of Old Times', max: 1, costs: [500],
    effect: '+0.2 Knowledge/s permanently',
    desc: 'scribblings of the Before Times with untold clues into the nature of things' },
  { id: 'animalHusbandry', name: 'Animal Husbandry', max: 1, costs: [750],
    effect: 'unlocks Ranches, which produce Food and Fur and improve morale',
    desc: 'The Worldroot is silent, but the people remember how to care for living things without asking an Ancient machine to do it.' },
];

// --- expeditions: one-time, expand the playing field permanently ---
const EXPEDITIONS = [
  { id: 'emberRoads', name: 'The First Roads', landing: 'emberplain', reqPop: 18,
    cost: { food: 500, stone: 300, tools: 20 }, mods: { food: 1.10 },
    effect: '+10% food production forever',
    text: 'The old roads are still there beneath the ash-grass, running from one abandoned field to the next. Clear them, and the Emberplain may feed more than one village at a time.' },
  { id: 'greenfoldGrove', name: 'The Heartwood Grove', landing: 'greenfold', reqPop: 18,
    cost: { wood: 600, tools: 30 }, mods: { wood: 1.10 },
    effect: '+10% wood production forever',
    text: 'The oldest trees grow in a ring no axe has breached. Walk their shade, mark the seasons, and learn how the forest keeps making room for life.' },
  { id: 'grayrocksQuarries', name: 'The High Quarries', landing: 'grayrocks', reqPop: 18,
    cost: { stone: 600, iron: 100, tools: 20 }, mods: { stone: 1.10, iron: 1.05 },
    effect: '+10% stone and +5% iron production forever',
    text: 'The Grayrocks keep their richest seams above the cloud line. Cut a road that will not kill the haulers, then bring the mountain down a little at a time.' },
  { id: 'floodmeadowsChannels', name: 'The Living Channels', landing: 'floodmeadows', reqPop: 18,
    cost: { food: 700, wood: 250, tools: 20 }, mods: { food: 1.10 },
    effect: '+10% food production forever',
    text: 'Every flood redraws the meadows, leaving good soil in places no farmer can reach. Give the water channels to follow, and it may leave something behind.' },
  { id: 'ashfenFires', name: 'The Sleeping Fires', landing: 'ashfen', reqPop: 18,
    cost: { coal: 400, stone: 300, tools: 25 }, mods: { coal: 1.10 },
    effect: '+10% coal production forever',
    text: 'The marsh breathes through cracks in the earth, warm even under winter frost. Send a camp into the fog and find which fires can be carried home.' },
  { id: 'windmereSky', name: 'The Mirrored Sky', landing: 'windmere', reqPop: 18,
    cost: { knowledge: 700, wood: 250, tools: 25 }, mods: { knowledge: 1.10, aether: 1.05 },
    effect: '+10% knowledge and +5% aether production forever',
    text: 'On still nights, the Windmere holds the sky twice: once above, and once below. Build a camp on its shore and write down what the water remembers.' },

  { id: 'oldForest', name: 'The Old Forest', reqPop: 12,
    cost: { wood: 400, tools: 10 },
    effect: '+1.5 wood/s gathered passively, +15% wood production',
    text: 'Beyond the fields stands a forest no axe has named. The scouts return with timber like ironwood, scratches on their packs, and stories of wolves that watch from the trees.' },

  { id: 'foothills', name: 'The Foothills', reqPop: 15,
    cost: { wood: 350, stone: 550 },
    effect: '+1 stone/s quarried passively, +15% stone production',
    text: 'Where the land lifts, stone lies close to the surface. The first climbers find old cairns beside the trail—some marking safe ground, some marking the last safe ground.' },

  { id: 'sunkenRuins', name: 'The Sunken Ruins', reqPop: 20,
    cost: { knowledge: 1200, tools: 80 },
    effect: '+0.3 knowledge/s, +15% knowledge production, and the lens needed for the Observatory',
    text: 'Half-drowned towers rise from a basin that was once a city. The shelves are full of mud, but the pages that survive still have questions worth asking.' },

  { id: 'emberVein', name: 'The Ember Vein', reqPop: 25,
    cost: { steel: 160, coal: 320 },
    effect: '+0.5 coal/s gathered passively, +10% iron production',
    text: 'The mountain is warm to the touch. Somewhere beneath it, a seam of coal burns without fuel or flame, waiting for hands brave enough to make use of it.' },

  { id: 'glacialPeaks', name: 'The Glacial Peaks', reqPop: 35,
    cost: { machinery: 90, aether: 30 },
    effect: '+0.1 aether/s gathered passively, +10% to all production',
    text: 'Above the cloud line, the air is thin enough to hurt and clear enough to see forever. The stars hang close above the ice, as if the old world left them there for whoever climbs high enough.' },
];

// --- Wonders: the dangerous second reset layer. A Wonder belongs to one
// landing, is rediscovered through a costly Survey expedition, and is explored
// section by section. The content here deliberately carries the narrative,
// while the simulation in game.js supplies the shared danger rules.
const WONDERS = [
  { id: 'emberplain', name: 'The Sunwell', short: 'A buried mouth that drinks the sun',
    findCost: { survey: 320, steel: 220, machinery: 90, food: 1200 },
    findText: 'Beyond the ash-grass, the old roads converge on a bowl of black glass. At its center, something beneath the sand opens one mirrored eyelid toward the sun.',
    calamity: { resource: 'power', name: 'The Sunwell draws power away', values: [0.5, 1.2, 2.3, 4.0, 6.5],
      text: 'The buried collectors wake hungry. Every deeper chamber draws more of Emberhold’s power into the sand.' },
    sections: [
      ['The Mirror Gate', 'A ring of mirrored stone descends beneath the dunes. Your lamps appear in its surface before anyone has lit them.'],
      ['The Helioform Galleries', 'Hall after hall turns with the sun overhead, though no opening admits daylight. The walls are warm enough to blister a hand.'],
      ['The Black Reservoir', 'Light has pooled here for centuries, heavy as water. The expedition walks beneath a false noon that casts shadows upward.'],
      ['The Furnace of Noon', 'A lattice wider than a city hums above a depth without floor. Something in the mechanism notices every living body below it.'],
      ['The Crown Aperture', 'At the heart of the Sunwell, a small star hangs behind sealed glass, patient and impossibly old.'],
    ],
    researches: [
      { name: 'Shade Calculations', cost: { knowledge: 1800, tools: 50 }, effect: 'Progress inside the Sunwell is 25% faster.', progress: 1.25 },
      { name: 'The Sunblind Oath', cost: { knowledge: 3800, machinery: 45, citizens: 1 }, effect: 'Sunwell danger is reduced by 20%.', danger: 0.8 },
      { name: 'Borrowed Reflections', cost: { knowledge: 7000, aether: 35, citizens: 2 }, effect: 'The Sunwell’s power drain is reduced by 30%.', calamity: 0.7 },
    ],
    expeditions: [
      { name: 'Follow the Cooling Veins', cost: { steel: 100, tools: 45 }, effect: 'Sunwell danger is reduced by 15%.', danger: 0.85 },
      { name: 'The Ashen Observatory', cost: { knowledge: 2400, machinery: 30 }, effect: 'Progress inside the Sunwell is 20% faster.', progress: 1.2 },
    ],
    decisionText: 'The small star turns behind the glass. It has waited for an instruction longer than anyone can measure.',
    aftermath: {
      restore: 'The Sunwell opens to the sky and begins drinking light again. The heat over the Emberplain softens, and every clear morning feels watched.',
      silence: 'The mirrors go dark one by one. You turn your back on the Ancient answer and begin building a power of your own.',
      become: 'Your leader steps into the light. When the chamber speaks again, it is with a voice that knows your name but no longer uses it quite right.',
    },
  },
  { id: 'greenfold', name: 'The Worldroot Conservatory', short: 'A forest grown around a buried intelligence',
    findCost: { survey: 320, wood: 1500, tools: 100, knowledge: 1800 },
    findText: 'The oldest trees of the Greenfold grow in a perfect ring. Beneath their roots lies a door of living bark, breathing slowly in time with the forest.',
    calamity: { resource: 'food', name: 'The roots grow hungry', values: [0.18, 0.4, 0.75, 1.2, 1.8],
      text: 'As the Conservatory wakes, roots seek the settlement’s stores. The forest remembers feeding something much larger than a village.' },
    sections: [
      ['The Breathing Door', 'The bark parts around the expedition like lips around a remembered word. Sap runs upward along the walls, against gravity.'],
      ['The Seed Vaults', 'Millions of seeds sleep in glass cells, each large as a house. Some have names. Some have only instructions.'],
      ['The Canopy Engine', 'Branches form gears above a void full of green light. They turn only when no one is looking directly at them.'],
      ['The Orchard of Unmade Things', 'Fruit hangs from silver boughs, each one containing the outline of an animal that was never allowed to be born.'],
      ['The Root Heart', 'A heart of wood and amber beats beneath the entire Greenfold. Its roots vanish into every horizon.'],
    ],
    researches: [
      { name: 'Graft-Language', cost: { knowledge: 1600, wood: 220 }, effect: 'Conservatory progress is 25% faster.', progress: 1.25 },
      { name: 'Mercy Pruning', cost: { knowledge: 3600, tools: 60, citizens: 1 }, effect: 'Conservatory danger is reduced by 20%.', danger: 0.8 },
      { name: 'The Root Census', cost: { knowledge: 6600, aether: 30, citizens: 2 }, effect: 'The root hunger is reduced by 30%.', calamity: 0.7 },
    ],
    expeditions: [
      { name: 'Map the Mycelial Roads', cost: { food: 550, tools: 40 }, effect: 'Conservatory danger is reduced by 15%.', danger: 0.85 },
      { name: 'Recover the Pollinators', cost: { wood: 500, knowledge: 1800 }, effect: 'Conservatory progress is 20% faster.', progress: 1.2 },
    ],
    decisionText: 'The Root Heart waits with a patience older than soil. It can be given a keeper, a purpose, or an ending.',
    aftermath: {
      restore: 'The Conservatory exhales, and the Greenfold’s canopy shifts as if making room for a future it once cultivated.',
      silence: 'The roots loosen their hold. The forest becomes merely a forest again, vast and alive and answerable to no buried will.',
      become: 'Your leader enters the amber heart. Leaves all across the Greenfold turn toward the same invisible point.',
    },
  },
  { id: 'grayrocks', name: 'The World Anvil', short: 'A forge sunk into the bones of a mountain',
    findCost: { survey: 320, stone: 1600, steel: 240, tools: 110 },
    findText: 'High above the last pass, the mountain face bears a seam too straight to be natural. When struck, it opens like a forge door and breathes out a wind of iron.',
    calamity: { resource: 'stone', name: 'The mountain demands stone', values: [3, 6.75, 12.75, 21, 31.5],
      text: 'The Anvil shifts under the Grayrocks. Supporting rock fractures, and the settlement feeds its braces with stone.' },
    sections: [
      ['The Haulway', 'A chain thicker than a road rises into the mountain, carrying empty hooks toward a ceiling lost in smoke.'],
      ['The Pattern Mills', 'Metal plates stamp themselves into shapes that fit no human hand. The discarded failures whisper as they cool.'],
      ['The Suspended Foundry', 'An entire forge hangs over magma on chains of blue metal. Every hammer blow lands a moment before it is struck.'],
      ['The Measure of Iron', 'The walls display every alloy the Ancients ever named, including several that have begun to crawl away from their labels.'],
      ['The Anvil Face', 'At the summit chamber rests an anvil the size of a town square, waiting beneath a hammer that has not fallen in an age.'],
    ],
    researches: [
      { name: 'Load-Bearing Cant', cost: { knowledge: 1800, stone: 260 }, effect: 'Anvil progress is 25% faster.', progress: 1.25 },
      { name: 'Cold-Hammer Doctrine', cost: { knowledge: 4000, steel: 70, citizens: 1 }, effect: 'Anvil danger is reduced by 20%.', danger: 0.8 },
      { name: 'The Weight of Names', cost: { knowledge: 7200, machinery: 50, citizens: 2 }, effect: 'The stone demand is reduced by 30%.', calamity: 0.7 },
    ],
    expeditions: [
      { name: 'Secure the Counterweights', cost: { stone: 700, steel: 80 }, effect: 'Anvil danger is reduced by 15%.', danger: 0.85 },
      { name: 'Trace the Old Crane', cost: { machinery: 45, tools: 45 }, effect: 'Anvil progress is 20% faster.', progress: 1.2 },
    ],
    decisionText: 'The hammer waits over the Anvil Face. Its next strike could make a servant, a legacy, or a ruin.',
    aftermath: {
      restore: 'The World Anvil strikes once. The sound travels through every peak, and the mountain begins its old work.',
      silence: 'The hammer is lowered and wedged in place. For the first time in an age, the Grayrocks are allowed to be still.',
      become: 'Your leader takes the place beneath the hammer. The forge’s fire adopts a new rhythm, disturbingly close to a pulse.',
    },
  },
  { id: 'floodmeadows', name: 'The River Crown', short: 'A drowned machine that once told water where to go',
    findCost: { survey: 320, food: 1700, wood: 700, tools: 100 },
    findText: 'When the Floodmeadows recede, a circle of black towers rises from the mud. Their doors open only during the brief hour when the river holds its breath.',
    calamity: { resource: 'wood', name: 'The flood takes the timber', values: [0.16, 0.35, 0.65, 1.0, 1.5],
      text: 'The River Crown calls water through forgotten channels. Flooding swells at the edges of Emberhold and carries timber away.' },
    sections: [
      ['The Low Gate', 'Water climbs the stairs ahead of the expedition, then pauses at each landing as though waiting to be introduced.'],
      ['The Sluice Choir', 'Thousands of valves sing beneath the current. Their voices combine into a language that sounds almost like weather.'],
      ['The Drowned Map Room', 'Rivers of light flow across the ceiling, redrawing the world as it might have been before people gave names to its banks.'],
      ['The Tide Engine', 'A wheel the width of a valley turns in total silence. Each spoke carries a sea that never reaches the floor.'],
      ['The Crown Chamber', 'At the center of the flood, a small dry room holds the lever that once decided where every river should go.'],
    ],
    researches: [
      { name: 'River Grammar', cost: { knowledge: 1700, wood: 200 }, effect: 'River Crown progress is 25% faster.', progress: 1.25 },
      { name: 'Drowning Protocol', cost: { knowledge: 3600, tools: 65, citizens: 1 }, effect: 'River Crown danger is reduced by 20%.', danger: 0.8 },
      { name: 'The Levee Compact', cost: { knowledge: 6800, stone: 420, citizens: 2 }, effect: 'The timber loss is reduced by 30%.', calamity: 0.7 },
    ],
    expeditions: [
      { name: 'Sound the Silent Locks', cost: { food: 600, tools: 40 }, effect: 'River Crown danger is reduced by 15%.', danger: 0.85 },
      { name: 'Chart the Returning Water', cost: { knowledge: 2200, wood: 350 }, effect: 'River Crown progress is 20% faster.', progress: 1.2 },
    ],
    decisionText: 'The lever waits above the waterline. The Crown offers to remember every shore, if someone will tell it what a shore is for.',
    aftermath: {
      restore: 'The River Crown turns, and the floodwaters withdraw into ordered paths. The meadows breathe easier beneath an old command.',
      silence: 'The lever breaks under your hands. But you can pull more than wood from the land. Your people are rising, so too can what sustains them. Let us all rise as one, animal and plant. A small thing, the smallest, but so vital.',
      become: 'Your leader wades into the map of light. Every channel in the Floodmeadows begins carrying a second reflection.',
    },
  },
  { id: 'ashfen', name: 'The Renewal Basin', short: 'A marsh reactor that makes life from what is discarded',
    findCost: { survey: 320, coal: 900, stone: 900, steel: 160 },
    findText: 'The Ashfen exhales around a basin of pale ceramic, broad enough to swallow a village. Warm mist rises from its cracks, carrying the scent of rain on old graves.',
    calamity: { resource: 'tools', name: 'The fen corrodes every tool', values: [0.04, 0.09, 0.16, 0.26, 0.4],
      text: 'The Basin breathes a salt vapor through the marsh. Metal pits, leather softens, and every repair takes more tools.' },
    sections: [
      ['The Filter Marsh', 'Reeds of white glass bend around the expedition. They drink foul water and exhale a sweetness that makes the lungs ache.'],
      ['The Compost Vaults', 'Whole forests have been reduced to orderly layers beneath transparent floors. Something below is still deciding what should grow next.'],
      ['The Skin Forges', 'Membranes pulse in warm frames, knitting waste, mineral, and light into forms too clean to have been born.'],
      ['The Living Crucible', 'A lake of green fire separates into cells whenever someone speaks. Each cell briefly shows a face from the expedition.'],
      ['The Renewal Seat', 'A single chair waits at the lip of the basin, surrounded by pipes that carry death in and possibility out.'],
    ],
    researches: [
      { name: 'Marsh Sterility', cost: { knowledge: 1700, tools: 45 }, effect: 'Renewal Basin progress is 25% faster.', progress: 1.25 },
      { name: 'The Clean-Hand Vow', cost: { knowledge: 3800, steel: 65, citizens: 1 }, effect: 'Renewal Basin danger is reduced by 20%.', danger: 0.8 },
      { name: 'Accounting for Rot', cost: { knowledge: 7000, aether: 35, citizens: 2 }, effect: 'The corrosion is reduced by 30%.', calamity: 0.7 },
    ],
    expeditions: [
      { name: 'Harvest the White Reeds', cost: { food: 500, tools: 45 }, effect: 'Renewal Basin danger is reduced by 15%.', danger: 0.85 },
      { name: 'Recover the Sterile Masks', cost: { steel: 90, machinery: 25 }, effect: 'Renewal Basin progress is 20% faster.', progress: 1.2 },
    ],
    decisionText: 'The Basin has prepared a place for a caretaker. Around it, discarded matter waits to learn whether it is still allowed to become.',
    aftermath: {
      restore: 'The Basin begins its ancient work again. The Ashfen’s breath changes from rot to rain, though nobody can say where the old waste has gone.',
      silence: 'The valves close forever. The marsh keeps its decay, its danger, and its right to be imperfectly alive.',
      become: 'Your leader enters the Renewal Seat. The basin accepts them gently, and the mist begins carrying their voice.',
    },
  },
  { id: 'windmere', name: 'The Mirrored Orrery', short: 'A lakebound observatory that turns the sky beneath the water',
    findCost: { survey: 320, knowledge: 3200, aether: 90, machinery: 70 },
    findText: 'On a windless night, the stars below Windmere rearrange themselves into a door. The lake opens without rippling, and a stairway descends into reflected sky.',
    calamity: { resource: 'knowledge', name: 'The false sky consumes thought', values: [0.18, 0.4, 0.75, 1.2, 1.9],
      text: 'The Orrery’s reflected constellations pull at every unfinished thought. Knowledge drains away into the water as the expedition goes deeper.' },
    sections: [
      ['The Reflected Stair', 'The stair descends beneath the lake while the surface remains overhead. Fish drift through constellations that do not belong to the sky.'],
      ['The Moon Libraries', 'Books orbit a black pool in slow rings. Each opens to a page describing the reader’s next mistake.'],
      ['The Lens Sea', 'A sea of polished lenses extends beyond sight. Every step shows a different world standing where yours should be.'],
      ['The Astral Gearwork', 'Planets no larger than carts turn between brass teeth. Their moons are engraved with names your researchers refuse to repeat.'],
      ['The Unnamed Zenith', 'At the Orrery’s center, a dark star hangs beneath the water, waiting for someone to decide which sky deserves to be real.'],
    ],
    researches: [
      { name: 'Refraction Discipline', cost: { knowledge: 2200, aether: 25 }, effect: 'Mirrored Orrery progress is 25% faster.', progress: 1.25 },
      { name: 'The Closed Eye Method', cost: { knowledge: 4600, machinery: 40, citizens: 1 }, effect: 'Mirrored Orrery danger is reduced by 20%.', danger: 0.8 },
      { name: 'A Map That Refuses Us', cost: { knowledge: 8000, aether: 55, citizens: 2 }, effect: 'The knowledge drain is reduced by 30%.', calamity: 0.7 },
    ],
    expeditions: [
      { name: 'Anchor the Moon Libraries', cost: { knowledge: 2600, tools: 55 }, effect: 'Mirrored Orrery danger is reduced by 15%.', danger: 0.85 },
      { name: 'Measure the Black Star', cost: { machinery: 40, aether: 30 }, effect: 'Mirrored Orrery progress is 20% faster.', progress: 1.2 },
    ],
    decisionText: 'The dark star waits below the water. The reflected heavens have room for a new mind, an old instruction, or a merciful silence.',
    aftermath: {
      restore: 'The Orrery resumes its turning. Above Windmere, the true stars seem briefly uncertain of their places.',
      silence: 'The reflected constellations fade. The lake gives back a simple, honest darkness.',
      become: 'Your leader steps beneath the dark star. For a moment, everyone near Windmere sees two horizons looking back.',
    },
  },
];

const WONDER_UNLOCKS = [
  { id: 'livingAlloy', name: 'The Anvil’s Living Alloy', cost: 4,
    effect: 'Makes Living Alloy research available in future settlements.',
    req: () => wonderChoice('grayrocks', 'restore'),
    desc: 'Hope preserves the World Anvil’s instructions between migrations. The mine itself must still be researched and built.' },
  { id: 'heartwood', name: 'The Conservatory’s Heartwood', cost: 3,
    effect: 'Makes Heartwood research available in future settlements.',
    req: () => wonderChoice('greenfold', 'restore'),
    desc: 'Hope preserves the Worldroot’s cultivation instructions between migrations. The grove still has to be researched and built.' },
  { id: 'starGlass', name: 'The Orrery’s Star Glass', cost: 5,
    effect: 'Makes Star Glass research available in future settlements.',
    req: () => wonderChoice('windmere', 'restore'),
    desc: 'Hope preserves the Orrery’s cutting instructions between migrations. The lensworks still has to be researched and built.' },
  { id: 'basinTempering', name: 'The Basin’s Tempering', cost: 4,
    effect: 'Makes Basin Tempering research available in future settlements.',
    req: () => wonderChoice('ashfen', 'restore'),
    desc: 'Hope preserves the Renewal Basin’s method for finishing steel. The research still has to be completed in a later settlement.' },
];

// --- season food multipliers ---
const SEASONS = [
  { name: 'Spring', mult: 1.0 },
  { name: 'Summer', mult: 1.05 },
  { name: 'Autumn', mult: 0.9 },
  { name: 'Winter', mult: 0.5 }, // 0.75 with Everwarm, 0.25 during Long Night
];
