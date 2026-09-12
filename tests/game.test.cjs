const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function game() {
  const storage = new Map();
  const context = vm.createContext({
    TextDecoder,
    document: { addEventListener() {} },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    window: { prompt() {} }, location: { reload() {} },
    atob: value => Buffer.from(value, 'base64').toString('binary'),
  });
  for (const file of ['data.js', 'game.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../js', file), 'utf8');
    vm.runInContext(source.replace(/\bboot\(\);\s*$/, ''), context);
  }
  const run = source => vm.runInContext(source, context);
  run('state = defaultState()');
  return { run, context };
}

test('paused real-time clock does not advance or bank time', () => {
  const { run } = game();
  run(`let now = 1000; Date.now = () => now;
    state.paused = true; lastGameAt = now; now = 6000; updateGameClock();`);
  assert.equal(run('state.day'), 0);
  assert.equal(run('state.bonusTime'), 0);
  assert.equal(run('lastGameAt'), 6000);
});

test('currency uses a 2000 base cap and does not accumulate past it', () => {
  const { run } = game();
  assert.equal(run('capacityOf("currency")'), 2000);
  run('state.jobs.banker = 2');
  assert.equal(run('capacityOf("currency")'), 2400);
  run('state.jobs.banker = 0');
  run(`state.techs.currency = true; state.seen.currency = true;
    state.res.currency = 1999; tickStep(100);`);
  assert.equal(run('state.res.currency'), 2000);
  run('tickStep(100)');
  assert.equal(run('state.res.currency'), 2000);
});

test('currency cap normalization works before the loaded state is assigned', () => {
  const { run } = game();
  run(`state = null; const save = defaultState(); save.jobs.banker = 2;
    save.res.currency = 5000; const loaded = normalizeSave(save);
    if (loaded.res.currency !== 2400) throw new Error('currency save normalization failed');`);
});

test('tutorial next-step card can be dismissed permanently', () => {
  const { run } = game();
  run('state.jobs.forager = state.pop');
  assert.match(run('renderNextStep()'), /data-action="tutorial-dismiss"/);
  run('state.tutorialDismissed = true; saveGame(true); state = loadGame()');
  assert.equal(run('renderNextStep()'), '');
  run('state.migrating = true; setOut()');
  assert.equal(run('state.tutorialDismissed'), true);
});

test('place traits are climate-aware and affect settlement behavior', () => {
  const { run } = game();
  assert.ok(run('PLACE_TRAITS.length') >= 30);
  assert.ok(run(`PLACE_TRAITS.filter(t => t.climates?.length).length`) > 0);
  run(`for (let i = 0; i < 50; i++) {
    for (const id of traitsForLanding('grayrocks')) {
      const trait = placeTraitDef(id);
      if (trait.climates) { if (!trait.climates.includes('grayrocks')) throw new Error('wrong climate trait'); }
    }
  }`);
  run(`state.placeTraits = ['relicLittered']; state.jobs.thinker = 1; state.res.food = 100;`);
  assert.ok(Math.abs(run('production(0).knowledge') - 0.132) < 1e-9);
  run(`Math.random = () => 0; tickStep(1);`);
  assert.equal(run('state.pop'), 3);
  assert.match(run('state.log.map(entry => entry.t).join("\\n")'), /simply vanishes/);
});

test('Understanding Home follows Mechanism, requires a local trait, and reveals its active effects', () => {
  const { run } = game();
  assert.equal(run(`TECH_BY_ID.get('understandingHome').req()`), false);
  run(`state.techs.machineryTech = true; state.placeTraits = ['wildOrchards'];`);
  assert.equal(run(`TECH_BY_ID.get('understandingHome').req()`), true);
  assert.match(run(`placeTraitTooltip(placeTraitDef('wildOrchards'))`), /Half-tamed fruit trees/);
  assert.doesNotMatch(run(`placeTraitTooltip(placeTraitDef('wildOrchards'))`), /Current location:/);
  run(`state.techs.understandingHome = true`);
  const tooltip = run(`placeTraitTooltip(placeTraitDef('wildOrchards'))`);
  assert.match(tooltip, /Current location:/);
  assert.match(tooltip, /\+12% Food production/);
  assert.match(tooltip, /Population growth time −6%/);
  assert.doesNotMatch(run(`placeTraitTooltip(placeTraitDef('richTopsoil'))`), /Current location:/);
});

test('Air of Rage turns accumulated anger into a fading morale bonus after an attack', () => {
  const { run } = game();
  run(`state.placeTraits = ['airOfRage']; state.traitEffects.airOfRage = -0.02;
    triggerAirOfRage();`);
  assert.equal(run('airOfRageMorale()'), 0.05);
  run('advancePlaceTraitEffects(250)');
  assert.equal(run('airOfRageMorale()'), 0);
  run('advancePlaceTraitEffects(100)');
  assert.equal(run('airOfRageMorale()'), -0.02);
});

test('Atavistic Aura raises lineage traits to level 2', () => {
  const { run } = game();
  run(`state.species = 'rabbitfolk'; state.placeTraits = ['atavisticAura'];`);
  assert.equal(run(`baseLineageMod('food')`), 1.42);
  assert.ok(Math.abs(run(`baseLineageMod('coal')`) - 0.775) < 1e-12);
  assert.equal(run(`lineageTraitLevel('warrenGardens', lineageDef('rabbitfolk'))`), 2);
  assert.equal(run(`lineageTraitScale(2)`), 1.5);
  assert.equal(run(`lineageTraitModifier(1.2, -1)`), 0.8);
  assert.ok(Math.abs(run(`lineageTraitModifier(1.2, -2)`) - 0.7) < 1e-12);
  assert.equal(run(`popGrowthNeed() / ((20 + state.pop * 4) * 0.67 / moraleMult())`), 0.25);
  run(`state.randomEventT = 60; state.randomEventNext = 60; Math.random = () => 0.7; updateRandomEvents(0);`);
  assert.match(run('state.log[0].t'), /^Rabbitfolk:/);
  run(`state.placeTraits = []; lineageDef('rabbitfolk').traitLevels = { warrenGardens: 0 };`);
  assert.equal(run(`lineageTraitLevel('warrenGardens')`), -1);
});

test('policy changes wait one real-time hour, persist through saves and trials, and reset on migration', () => {
  const { run } = game();
  run(`let now = 10000000; Date.now = () => now;
    delete state.policyChangedAt; state = normalizeSave(state);
    state.techs.civics = true;
    choosePolicy('commons'); choosePolicy('invalid');`);
  assert.equal(run('state.policyChangedAt'), 0);
  run("choosePolicy('charter')");
  assert.equal(run('policyCooldownRemaining()'), 3600);
  assert.match(run('renderGovernance()'), /60m 0s/);
  assert.match(run('renderGovernance()'), /data-id="guilds" disabled/);
  run("choosePolicy('guilds'); saveGame(true); state = loadGame()");
  assert.equal(run('state.policy'), 'charter');
  assert.equal(run('policyCooldownRemaining()'), 3600);
  run("setOut('silence'); state.techs.civics = true; now += 3599999; choosePolicy('guilds')");
  assert.equal(run('state.policy'), 'charter');
  run("now += 1; choosePolicy('guilds')");
  assert.equal(run('state.policy'), 'guilds');
  assert.equal(run('policyCooldownRemaining()'), 3600);
  run('state.migrating = true; setOut()');
  assert.equal(run('state.policy'), 'commons');
  assert.equal(run('policyCooldownRemaining()'), 0);
});

test('Workplace Ethics adds mining seats, rewards full crews, and lowers morale', () => {
  const { run } = game();
  run(`state.techs.civics = true; state.techs.civicHarmony = true; state.techs.workplaceEthics = true;
    state.bld.quarry = 1; state.bld.stoneWorks = 2; state.jobs.miner = 4; state.pop = 4;`);
  run(`state.techs.workplaceEthics = false; const withoutEthics = production(0).stone; state.techs.workplaceEthics = true;`);
  assert.equal(run('jobCapacity("miner")'), 4);
  assert.ok(Math.abs(run('production(0).stone') / run('withoutEthics') - 1.1) < 1e-9);
  assert.equal(run('workplaceEthicsMoralePenalty()'), 0.15);
  run('state.jobs.miner = 3');
  assert.equal(run('workplaceEthicsMoralePenalty()'), 0);
});

test('Banking unlocks Money Lenders that cap Bankers and generate population currency', () => {
  const { run } = game();
  assert.equal(run("BUILDINGS.find(b => b.id === 'moneyLender').req()"), false);
  run('state.techs.banking = true; state.techs.currency = true; state.pop = 20');
  assert.equal(run("BUILDINGS.find(b => b.id === 'moneyLender').req()"), true);
  assert.equal(run("jobCapacity('banker')"), 0);
  assert.equal(run("setJob('banker', 1)"), false);
  run('state.bld.moneyLender = 2');
  assert.equal(run("jobCapacity('banker')"), 2);
  assert.equal(run("setJob('banker', 3)"), false);
  run('state.jobs.banker = 5; reconcileWorkers()');
  assert.ok(run('(state.jobs.banker || 0) <= 2'));
  run('const income = {}; production(1, income)');
  assert.equal(run("income.currency.find(e => e.label.startsWith('Money Lenders:')).base"), 0.04);
  run('state.pop = 40; state.bld.moneyLender = 3; const larger = {}; production(1, larger)');
  assert.equal(run("larger.currency.find(e => e.label.startsWith('Money Lenders:')).base"), 0.12);
});

test('Awaken Ancients unlocks after Mechanism and powers each mining resource without boosting input costs', () => {
  const { run } = game();
  assert.equal(run("TECHS.find(t => t.id === 'awakenAncients').req()"), false);
  run(`state.techs.machineryTech = true; state.bld.quarry = 1; state.bld.deepMine = 1;
    state.bld.coalSeam = 1; state.bld.steamPlant = 1; state.jobs.miner = 1;
    state.jobs.ironminer = 1; state.jobs.digger = 1; state.jobs.tinkerer = 1;
    const before = {}; production(1, before)`);
  assert.equal(run("TECHS.find(t => t.id === 'awakenAncients').req()"), true);
  assert.equal(run("setBuildingPower('quarry', 1)"), false);
  run(`state.techs.awakenAncients = true;
    for (const id of Object.keys(DIG_SITE_RESOURCES)) setBuildingPower(id, 1);
    const after = {}; const poweredRates = production(1, after)`);
  for (const res of ['stone', 'iron', 'coal']) {
    assert.ok(run(`Math.abs(after.${res}.filter(e => e.base > 0).reduce((n, e) => n + e.amount, 0) -
      before.${res}.filter(e => e.base > 0).reduce((n, e) => n + e.amount, 0) * 1.1) < 1e-10`));
    assert.equal(run(`JSON.stringify(after.${res}.filter(e => e.base < 0))`), run(`JSON.stringify(before.${res}.filter(e => e.base < 0))`));
  }
  assert.ok(Math.abs(run('poweredRates.power') - 2.4) < 1e-10);
  assert.doesNotMatch(run('renderVillage()'), /Power controls/);
  run("buildFilter = 'power'");
  assert.match(run('renderBuild()'), /data-action="power-off"/);
  run('state.bld.quarry = 0; state.bld.deepMine = 0; state.bld.coalSeam = 0');
  assert.doesNotMatch(run('renderBuild()'), /data-filter="power"/);
  assert.equal(run('buildFilter'), 'incomplete');
  run(`setBuildingPower('quarry', 0); const off = {}; production(1, off)`);
  assert.equal(run('off.stone[0].amount'), run('before.stone[0].amount'));
});

test('Iron Mites unlocks after building a Forge and improves Iron Miner output', () => {
  const { run } = game();
  assert.equal(run("TECHS.find(t => t.id === 'ironMites').req()"), false);
  run(`state.bld.forge = 1; state.bld.deepMine = 1; state.jobs.ironminer = 1;
    const before = {}; production(1, before)`);
  assert.equal(run("TECHS.find(t => t.id === 'ironMites').req()"), true);
  run(`state.techs.ironMites = true; const after = {}; production(1, after)`);
  assert.ok(Math.abs(run("after.iron.find(e => e.label.startsWith('Iron Miner')).amount") -
    run("before.iron.find(e => e.label.startsWith('Iron Miner')).amount") * 1.3) < 1e-10);
});

test('Tree Husbandry unlocks after Aqueducts and improves wood income', () => {
  const { run } = game();
  assert.equal(run("TECHS.find(t => t.id === 'treeHusbandry').req()"), false);
  run('state.techs.aqueduct = true');
  assert.equal(run("TECHS.find(t => t.id === 'treeHusbandry').req()"), false);
  run('state.bld.aqueduct = 1; state.jobs.woodcutter = 1; const before = {}; production(1, before)');
  assert.equal(run("TECHS.find(t => t.id === 'treeHusbandry').req()"), true);
  run('state.techs.treeHusbandry = true; const after = {}; production(1, after)');
  assert.ok(Math.abs(run("after.wood.find(e => e.label.startsWith('Woodcutter')).amount - before.wood.find(e => e.label.startsWith('Woodcutter')).amount * 1.2") - 0) < 1e-10);
});

test('dig site power supports partial counts, shortages, save normalization, and fresh settlements', () => {
  const { run } = game();
  run(`state.techs.awakenAncients = true; state.bld.quarry = 20;
    state.bld.deepMine = 1; state.bld.dynamo = 1;
    setBuildingPower('quarry', 3); setBuildingPower('deepMine', 1)`);
  assert.equal(run('digSitePower().quarry'), 3);
  assert.equal(run('digSitePower().deepMine'), 1);
  run("setBuildingPower('quarry', 100)");
  assert.equal(run("buildingPowerCount('quarry')"), 20);
  assert.equal(run('digSitePower().quarry'), 7);
  assert.equal(run('digSitePower().deepMine'), 0);
  run('state.bld.dynamo = 0; state.res.power = 100');
  assert.equal(run('digSitePower().quarry'), 0);
  run(`setBuildingPower('quarry', -1)`);
  assert.equal(run("buildingPowerCount('quarry')"), 0);
  assert.equal(run("setBuildingPower('factory', 1)"), false);
  run(`setBuildingPower('quarry', 2); saveGame(true); state = loadGame()`);
  assert.equal(run("buildingPowerCount('quarry')"), 2);
  run(`state.buildingPower.quarry = 100; state.buildingPower.deepMine = -1;
    state = normalizeSave(JSON.parse(JSON.stringify(state)))`);
  assert.equal(run("buildingPowerCount('quarry')"), 20);
  assert.equal(run("buildingPowerCount('deepMine')"), 0);
  run('delete state.buildingPower; state = normalizeSave(JSON.parse(JSON.stringify(state)))');
  assert.equal(run("buildingPowerCount('quarry')"), 20);
  assert.equal(run("buildingPowerCount('deepMine')"), 1);
  run(`state.bld.factory = 0;
    state = normalizeSave(JSON.parse(JSON.stringify(state)));
    state.bld.factory = 1`);
  assert.equal(run("buildingPowerCount('factory')"), 1);
  assert.equal(run('Object.keys(defaultState().buildingPower).length'), 0);
});

test('power API exposes live capacity, controllable buildings, and action events', () => {
  const { run } = game();
  run(`render = () => {}; const events = []; window.emberhold.subscribe(event => events.push(event));
    state.bld.steamPlant = 1; state.bld.livingBlock = 1; state.bld.quarry = 20;
    state.res.power = 999`);
  assert.equal(run('window.emberhold.getPower().available'), 2);
  assert.equal(run('Object.keys(window.emberhold.getPower().buildings).length'), 1);
  assert.equal(run("window.emberhold.actions.setBuildingPower('quarry', 1)"), false);
  run('state.techs.awakenAncients = true');
  assert.equal(run("window.emberhold.actions.setBuildingPower('quarry', 3)"), true);
  assert.ok(Math.abs(run('window.emberhold.getState().power.used') - 1.6) < 1e-10);
  assert.ok(Math.abs(run('window.emberhold.getPower().available') - 1.4) < 1e-10);
  assert.equal(run('events.at(-1).action'), 'setBuildingPower');
  assert.equal(run('events.at(-1).state.power.buildings.quarry.enabled'), 3);
  run(`const detached = window.emberhold.getPower(); detached.buildings.quarry.enabled = 0`);
  assert.equal(run('window.emberhold.getPower().buildings.quarry.enabled'), 3);
  assert.equal(run("window.emberhold.action('setBuildingPower', 'quarry', 20)"), true);
  assert.equal(run('window.emberhold.getPower().buildings.quarry.active'), 10);
  assert.equal(run('window.emberhold.getPower().requested'), 5);
  assert.equal(run('window.emberhold.getPower().shortfall'), 2);
  assert.equal(run('window.emberhold.getPower().available'), 0);
  run("window.emberhold.actions.setBuildingPower('quarry', 0)");
  assert.equal(run('window.emberhold.getPower().available'), 2);
  assert.equal(run("window.emberhold.actions.setBuildingPower('quarry', NaN)"), false);
  assert.equal(run("window.emberhold.actions.setBuildingPower('factory', 1)"), false);
});

test('weather survives save/load, lasts 15–30 days, and varies by climate and season', () => {
  const { run } = game();
  run('state.day = 194528.1; const today = JSON.stringify(dailyWeather())');
  assert.equal(run('JSON.stringify(dailyWeather(194528.9))'), run('today'));
  run('state = normalizeSave(JSON.parse(JSON.stringify(state)))');
  assert.equal(run('JSON.stringify(dailyWeather())'), run('today'));
  assert.ok(run(`new Set(Array.from({length: 1000}, (_, day) => dailyWeather(day).id)).size >= 4`));
  assert.ok(run(`Array.from({length: 1000}, (_, day) => dailyWeather(day * 45, 'emberplain')).filter(w => w.id === 'clear').length > 450`));
  assert.ok(run(`Array.from({length: 1000}, (_, day) => dailyWeather(day * 45, 'grayrocks')).filter(w => w.id === 'storm').length > 280`));
  assert.ok(run(`dailyWeather(90, 'emberplain').temperature > dailyWeather(180, 'grayrocks').temperature`));
  assert.ok(run(`LANDINGS.every(landing => {
    for (let day = 194500; day < 195000;) {
      const weather = dailyWeather(day, landing.id);
      const duration = weather.endsAt - weather.startsAt;
      if (duration < 15 || duration > 30) return false;
      if (JSON.stringify(weather) !== JSON.stringify(dailyWeather(weather.endsAt - 0.01, landing.id))) return false;
      if (dailyWeather(weather.endsAt, landing.id).startsAt !== weather.endsAt) return false;
      day = weather.endsAt;
    }
    return true;
  })`));
});

test('season changes are logged as events rather than progress', () => {
  const { run } = game();
  for (const message of ['Spring returns. The fields wake.', 'High summer. Provisions come easy.', 'Autumn. The harvest slows.', 'Winter has come. Food grows scarce.']) {
    assert.equal(run(`logCategory(${JSON.stringify(message)})`), 'events');
  }
});

test('achievement messages have their own log category', () => {
  const { run } = game();
  assert.equal(run('logCategory("Achievement completed: Many Hands.")'), 'achievements');
});

test('clear skies lift morale, storms depress it, and weather production appears in breakdowns', () => {
  const { run } = game();
  run(`state.res.food = 10;
    const findDay = id => Array.from({length: 10000}, (_, day) => day).find(day => day % DAYS_PER_YEAR < DAYS_PER_SEASON && dailyWeather(day).id === id);
    state.day = findDay('clear'); updateMorale(10, 0)`);
  assert.equal(run('state.morale'), 70.25);
  run(`state.morale = 70; state.day = findDay('storm'); updateMorale(10, 0)`);
  assert.equal(run('state.morale'), 69.4);
  run(`state.jobs.forager = 4; state.day = findDay('rain'); const weatherDetail = {}; production(0.25, weatherDetail)`);
  assert.match(run('JSON.stringify(weatherDetail.food)'), /Weather/);
  assert.match(run('weatherSummary()'), /^Rainy,/i);
  assert.doesNotMatch(run('weatherSummary()'), /food production/i);
  assert.match(run('moraleTooltip()'), /Rainy weather/);
  run(`state.bld.monument = 1; state.migrating = true; state.pendingLandings = LANDINGS.map(l => ({id: l.id}))`);
  assert.match(run('renderMigration()'), /Stormbound heights/);
  assert.match(run('renderVillage()'), /Sunlit plains/);
});

test('ticks crossing midnight apply each day’s weather for its own duration', () => {
  const { run } = game();
  run(`state.day = 0.75; const weatherSteps = [];
    updateMorale = dt => weatherSteps.push([Math.floor(state.day), dt]); tick(0.5)`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(weatherSteps)')), [[0, 0.125], [1, 0.375]]);
  assert.equal(run('state.day'), 1.75);
});

test('every queue item lists the resources it needs', () => {
  const { run } = game();
  run(`state.queues.build = [{ type: 'build', id: 'hut' }];
    state.queues.research = [{ type: 'research', id: 'writing' }];
    state.queues.expedition = [{ type: 'expedition', id: 'oldForest' }];`);
  for (const type of ['build', 'research', 'expedition']) {
    assert.match(run(`renderQueue('${type}')`), /queue-(needs|ready|waiting)/);
    assert.match(run(`renderQueue('${type}')`), /needs |ready|waiting/);
  }
});

test('physical research requires its material inputs in addition to Knowledge', () => {
  const { run } = game();
  assert.deepEqual(JSON.parse(run("JSON.stringify(researchCost(TECHS.find(t => t.id === 'metallurgy')))")),
    { knowledge: 9000, iron: 180, coal: 120, tools: 30 });
  assert.equal(run("researchCost(TECHS.find(t => t.id === 'stoneWorking')).knowledge"), 15);
  run(`state.techs.seamMining = true; state.res.knowledge = 9000;
    state.res.iron = 180; state.res.coal = 119; state.res.tools = 30;
    attemptResearch('metallurgy');`);
  assert.equal(run('state.techs.metallurgy'), undefined);
  assert.equal(run('state.queues.research[0].id'), 'metallurgy');
  run('state.res.coal = 120; updateQueues()');
  assert.equal(run('state.techs.metallurgy'), true);
  assert.equal(run('state.res.knowledge'), 0);
  assert.equal(run('state.res.iron'), 0);
  assert.equal(run('state.res.coal'), 0);
  assert.equal(run('state.res.tools'), 0);
});

test('research cannot be queued more than once and stale duplicates are removed', () => {
  const { run } = game();
  run(`state.trialDone.scholarship = 1; state.res.knowledge = 0;
    attemptResearch('writing'); attemptResearch('writing');`);
  assert.equal(run('state.queues.research.filter(entry => entry.id === "writing").length'), 1);
  run(`state.queues.research.push({ type: 'research', id: 'writing' });
    state = normalizeSave(JSON.parse(JSON.stringify(state)))`);
  assert.equal(run('state.queues.research.filter(entry => entry.id === "writing").length'), 1);
});

test('queued actions keep their displayed cost when price modifiers change', () => {
  const { run } = game();
  run(`state.trial = { id: 'frugality', buildings: 0 }; state.res.wood = 0;
    attemptBuild('hut'); state.trial = null; state.res.wood = 30;
    updateQueues();`);
  assert.equal(run("bld('hut')"), 0);
  assert.equal(run('state.queues.build.length'), 1);
  assert.equal(run('state.queues.build[0].cost.wood'), 45);
});

test('one-off buildings cannot be queued more than once and stale duplicates are removed', () => {
  const { run } = game();
  run(`state.trialDone.expansion = 1; state.res.copper = 0; state.res.steel = 0;
    state.res.machinery = 0; state.res.tools = 0; state.res.currency = 0; state.res.goods = 0;
    state.techs.electricalEngineering = true; attemptBuild('dynamo'); attemptBuild('dynamo');`);
  assert.equal(run('state.queues.build.filter(entry => entry.id === "dynamo").length'), 1);
  run(`state.queues.build.push({ type: 'build', id: 'dynamo' });
    state = normalizeSave(JSON.parse(JSON.stringify(state)))`);
  assert.equal(run('state.queues.build.filter(entry => entry.id === "dynamo").length'), 1);
  run(`state.bld.dynamo = 1; state = normalizeSave(JSON.parse(JSON.stringify(state)))`);
  assert.equal(run('state.queues.build.filter(entry => entry.id === "dynamo").length'), 0);
});

test('stores display Survey after Explorers are unlocked', () => {
  const { run } = game();
  run(`state.trialDone.wayfinding = 1; state.surveyPoints = 12.5; state.jobs.explorer = 2`);
  const stores = run('renderStores()');
  assert.match(stores, /Survey/);
  assert.match(stores, /12\.5/);
  assert.match(stores, /0\.05\/s/);
});

test('queue items show each missing resource with its own estimate', () => {
  const { run } = game();
  run(`state.queues.build = [{ type: 'build', id: 'stoneWorks' }, { type: 'build', id: 'lumberYard' }];
    state.res.wood = 0; state.res.stone = 0;`);
  const html = run("renderQueue('build')");
  assert.equal((html.match(/queue-waiting-item/g) || []).length, 4);
  assert.match(html, /queue-waiting-item[\s\S]*queue-time/);
  assert.match(html, /lumberCamp|Lumber/);
  assert.equal((html.match(/queue-needs/g) || []).length, 0);
});

test('queue items can be reordered before or after another item', () => {
  const { run } = game();
  run(`state.queues.build = [{ type: 'build', id: 'hut' }, { type: 'build', id: 'lumberYard' }, { type: 'build', id: 'stoneWorks' }];
    reorderQueue('build', 0, 2, true);`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.queues.build.map(entry => entry.id))')),
    ['lumberYard', 'stoneWorks', 'hut']);
  run("reorderQueue('build', 2, 0)");
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.queues.build.map(entry => entry.id))')),
    ['hut', 'lumberYard', 'stoneWorks']);
  assert.match(run("renderQueue('build')"), /draggable="true"/);
});

test('queue order defaults to parallel and can be switched to strict first-to-last processing', () => {
  const { run } = game();
  run(`state.techs.craftsmanship = true;
    state.res.wood = 100; state.res.tools = 10;
    state.queues.build = [{ type: 'build', id: 'hut' }, { type: 'build', id: 'lumberYard' }];
    updateQueues()`);
  assert.equal(run('state.bld.hut'), 1);
  assert.equal(run('state.bld.lumberYard'), 1);
  assert.equal(run('state.queues.build.length'), 0);

  run(`state.bld = {}; state.res.wood = 100; state.res.tools = 10;
    state.settings.strictQueueOrder = true;
    state.queues.build = [{ type: 'build', id: 'hut' }, { type: 'build', id: 'lumberYard' }];
    updateQueues()`);
  assert.equal(run('state.bld.hut'), 1);
  assert.equal(run("bld('lumberYard')"), 0);
  assert.equal(run('state.queues.build.length'), 1);
  run('updateQueues()');
  assert.equal(run('state.bld.lumberYard'), 1);
  assert.equal(run('state.queues.build.length'), 0);
});

test('affordable actions start immediately even when their queue is full', () => {
  const { run } = game();
  run(`state.techs.craftsmanship = true;
    state.res.wood = 100; state.res.tools = 10;
    state.queues.build = [{ type: 'build', id: 'hut' }];
    attemptBuild('lumberYard');`);
  assert.equal(run('state.bld.lumberYard'), 1);
  assert.equal(run('state.queues.build.length'), 1);
  assert.equal(run('state.queues.build[0].id'), 'hut');
});

test('neutral tribes do not raid, while hostile tribes still can', () => {
  const { run } = game();
  run(`ensureDiplomacyEntry('human'); let raids = 0;
    resolveTribeRaid = () => { raids++; }; Math.random = () => 0;
    state.diplomacy.human.disposition = 0; updateDiplomacy(180)`);
  assert.equal(run('raids'), 0);
  assert.equal(run('state.diplomacy.human.disposition'), 5);
  run('state.diplomacy.human.disposition = -1; updateDiplomacy(180)');
  assert.equal(run('raids'), 1);
});

test('Far Horizons is gated, expensive, permanent, and bypasses lineage habitat limits', () => {
  const { run } = game();
  run("state.migrating = true; state.pendingLanding = 'emberplain'; state.echoes = 125");
  assert.equal(run("renderShop().includes('Far Horizons')"), false);
  assert.equal(run("lineageSelectable('otterfolk', 'emberplain')"), false);

  run("state.lineagesUnlocked.otterfolk = true");
  assert.equal(run("renderShop().includes('Far Horizons')"), true);
  run("migrationBuy('farHorizons')");
  assert.equal(run("state.upgrades.farHorizons"), 1);
  assert.equal(run("state.echoes"), 0);
  assert.equal(run("lineageSelectable('otterfolk', 'emberplain')"), true);

  run("state.migrating = false; state.migrating = true; state.echoes = 125; migrationBuy('farHorizons')");
  assert.equal(run("state.upgrades.farHorizons"), 1);
  assert.equal(run("state.echoes"), 125);
});

test('Fear of the Conqueror requires ten Commonality lineages and erodes victorious targets by stage', () => {
  const { run } = game();
  run(`state.migrating = true; state.echoes = 300; state.diplomacy.human = { conquered: true, disposition: 0, militaryStrength: 100, economicStrength: 100 };
    state.commonalityLineages = Object.fromEntries(LINEAGES.filter(l => l.id !== 'human').slice(0, 10).map(l => [l.id, true]));`);
  assert.equal(run("renderShop().includes('Fear of the Conqueror')"), true);
  run("migrationBuy('fearOfTheConqueror')");
  assert.equal(run("state.upgrades.fearOfTheConqueror"), 1);
  assert.equal(run("state.echoes"), 0);

  run(`state.tradePartner = 'clocklings'; state.tradePartners = ['clocklings'];
    state.diplomacy.clocklings = { conquered: false, disposition: 0, militaryStrength: 100, economicStrength: 100 };
    state.techs.guards = true; state.jobs.guard = 100; state.res.food = 1000; state.res.tools = 100;
    Math.random = () => 0.5; doRaid('clocklings', 'raid')`);
  assert.equal(run("state.diplomacy.clocklings.militaryStrength"), 99);
  run("state.diplomacy.clocklings.militaryStrength = 100; state.res.food = 1000; state.res.tools = 100; doRaid('clocklings', 'siege')");
  assert.equal(run("state.diplomacy.clocklings.militaryStrength"), 92);
});

test('Practiced Migrator requires all area expeditions and starts future settlements in Stone', () => {
  const { run } = game();
  run('state.migrating = true; state.echoes = 250');
  assert.equal(run("renderShop().includes('Practiced Migrator')"), false);

  run("for (const expedition of EXPEDITIONS.filter(e => e.landing)) state.expeditions[expedition.id] = true");
  assert.equal(run("renderShop().includes('Practiced Migrator')"), true);
  run("migrationBuy('practicedMigrator')");
  assert.equal(run("state.upgrades.practicedMigrator"), 1);
  assert.equal(run("state.echoes"), 0);

  run("state.pendingLanding = 'greenfold'; state.pendingSpecies = 'human'; state.pendingLandings = [{ id: 'greenfold' }]; setOut()");
  assert.equal(run('state.era'), 2);
  assert.equal(run('state.techs.stoneWorking'), true);
  assert.equal(run('state.pop'), 9);
  assert.equal(run('popCap()'), 11);
});

test('Journal of Old Times costs 500 Echoes and permanently adds Knowledge', () => {
  const { run } = game();
  run(`state.migrating = true; state.echoes = 500; state.res.knowledge = 0;
    migrationBuy('journalOfOldTimes'); const rates = production(1)`);
  assert.equal(run('state.upgrades.journalOfOldTimes'), 1);
  assert.equal(run('state.echoes'), 0);
  assert.ok(Math.abs(run('rates.knowledge') - 0.2) < 1e-6);
  run("state.shopTab = 'purchased'");
  assert.match(run('renderShop()'), /Journal of Old Times/);
  run('migrationRefund("journalOfOldTimes"); const refundedRates = production(1)');
  assert.equal(run('state.upgrades.journalOfOldTimes || 0'), 0);
  assert.equal(run('state.echoes'), 500);
  assert.equal(run('refundedRates.knowledge'), 0);
});

test('migration shop hides upgrades above total echoes including spent echoes', () => {
  const { run } = game();
  run('state.migrating = true; state.echoes = 437; state.upgrades = { deepRoots: 5 };');
  assert.equal(run("renderShop().includes('Journal of Old Times')"), false);

  run('state.echoes = 438');
  assert.equal(run("renderShop().includes('Journal of Old Times')"), true);
});

test('migration shop separates available upgrades from fully purchased ones', () => {
  const { run } = game();
  run("state.upgrades = { deepRoots: 5, wanderers: 2 }; state.shopTab = 'buy';");
  assert.match(run('renderShop()'), /data-shop-tab="buy"/);
  assert.doesNotMatch(run('renderShop()'), /Deep Roots/);
  assert.match(run('renderShop()'), /Wandering Kin/);
  run("state.shopTab = 'purchased'");
  assert.match(run('renderShop()'), /Deep Roots/);
  assert.doesNotMatch(run('renderShop()'), /Wandering Kin/);
});

test('Clever Storage is an uncapped, increasingly expensive Echo upgrade', () => {
  const { run } = game();
  run(`state.migrating = true; state.echoes = 3; state.res.currency = 0;
    migrationBuy('cleverStorage'); migrationBuy('cleverStorage'); migrationBuy('cleverStorage');`);
  assert.equal(run("upg('cleverStorage')"), 2, 'the first two levels cost 1 and 2 Echoes');
  assert.equal(run('state.echoes'), 0);
  assert.equal(run('capacityOf("food")'), 204);
  assert.equal(run('capacityOf("currency")'), 2040);
  run('state.echoes = 4');
  assert.match(run('renderShop()'), /Clever Storage/);
  run('migrationBuy("cleverStorage")');
  assert.equal(run("upg('cleverStorage')"), 3, 'the next level costs 4 Echoes');
  run('migrationRefund("cleverStorage")');
  assert.equal(run('state.echoes'), 4);
  assert.equal(run("upg('cleverStorage')"), 2);
});

test('multiple local tribes can be active at once', () => {
  const { run } = game();
  run(`state.techs = { currency: true, diplomacy: true };
    state.tradePartners = ['human', 'clocklings']; state.tradePartner = 'human';
    ensureDiplomacyEntry('human'); ensureDiplomacyEntry('clocklings');
    state.diplomacy.human.disposition = 80; state.diplomacy.clocklings.disposition = 80;
    state.diplomats.human = 1; state.diplomats.clocklings = 1; updateDiplomacy(60)`);
  assert.equal(run('localTribeIds().length'), 2);
  assert.equal(run('alliedTribes()'), 2);
  assert.equal(run('state.diplomacy.human.disposition'), 83);
  assert.equal(run('state.diplomacy.clocklings.disposition'), 83);
});

test('Survey and the Iron Age unlock stronger additional contacts', () => {
  const { run } = game();
  run(`Math.random = () => 0.999; state.surveyPoints = 1000; state.jobs.explorer = 1;
    discoverTradePartners()`);
  assert.equal(run('state.tradePartners.length'), 2);
  assert.ok(run('state.diplomacy[state.tradePartners[1]].militaryStrength') >= 110);
  assert.ok(run('state.diplomacy[state.tradePartners[1]].economicStrength') >= 110);
  run('state.era = 3; discoverTradePartners()');
  assert.equal(run('state.tradePartners.length'), 3);
  assert.ok(run('state.diplomacy[state.tradePartners[2]].militaryStrength') >= 150);
  assert.ok(run('state.diplomacy[state.tradePartners[2]].economicStrength') >= 150);
});

test('incoming raids are less destructive and staffed raids are reliable', () => {
  const { run } = game();
  run(`state.techs.guards = true; state.jobs.guard = 4; state.res.food = 500;
    state.res.tools = 20; ensureDiplomacyEntry('human');
    state.diplomacy.human.disposition = -50; state.diplomacy.human.militaryStrength = 100; Math.random = () => 0;
    resolveTribeRaid('human')`);
  assert.equal(run('state.jobs.guard'), 4);

  run(`state.res.food = 500; state.res.tools = 20; state.jobs.guard = 4;
    state.guardInjuries = 0; state.diplomacy.human.disposition = 0;
    Math.random = () => 0.5; doRaid('human')`);
  assert.equal(run('state.res.food'), 470);
  assert.ok(run('state.diplomacy.human.disposition') < 0);
});

test('attack stages scale difficulty and unlock uncommon loot rolls', () => {
  const { run } = game();
  assert.equal(run('RAID_STAGES.length'), 8);
  assert.deepEqual(JSON.parse(run('JSON.stringify(RAID_STAGES.slice(-3).map(s => s.uncommon))')), [1, 1, 2]);
  run(`state.techs = { guards: true, currency: true, craftsmanship: true, metallurgy: true };
    state.jobs.guard = 100; state.res.food = 1000; state.res.tools = 10;
    ensureDiplomacyEntry('human'); state.diplomacy.human.disposition = 0;
    Math.random = () => 0; doRaid('human', 'siege')`);
  assert.ok(run('state.res.tools') > 10);
  assert.equal(run("raidUncommonLoot().includes('steel')"), true);
  assert.ok(run("raidStage('siege').difficulty > raidStage('raid').difficulty"));
  assert.ok(run("raidStage('siege').rolls > raidStage('raid').rolls"));
});

test('encountered towns receive separate military and economic strengths', () => {
  const { run } = game();
  run(`Math.random = () => 0; ensureDiplomacyEntry('human')`);
  assert.equal(run('state.diplomacy.human.militaryStrength'), 70);
  assert.equal(run('state.diplomacy.human.economicStrength'), 70);
  run(`state.diplomacy = {}; Math.random = () => 0.999; ensureDiplomacyEntry('clocklings')`);
  assert.equal(run('state.diplomacy.clocklings.militaryStrength'), 220);
  assert.equal(run('state.diplomacy.clocklings.economicStrength'), 220);
  assert.ok(run('militaryStrength(state.diplomacy.clocklings) > militaryStrength(state.diplomacy.human)'));
});

test('spies reveal town strengths and espionage can weaken the military', () => {
  const { run } = game();
  run(`state.techs = { spies: true }; state.tradePartner = 'human';
    state.res.currency = 300; state.res.tools = 20; ensureDiplomacyEntry('human');
    state.diplomacy.human.militaryStrength = 100; state.diplomacy.human.economicStrength = 120;
    Math.random = () => 0.5; hireSpy('human')`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(spyTrainingCost("human"))')), { currency: 120, tools: 6 });
  assert.equal(run('state.res.currency'), 180);
  assert.equal(run('state.res.tools'), 14);
  run('updateSpies(180)');
  assert.equal(run('spyCount("human")'), 1);
  assert.equal(run('state.diplomacy.human.militaryKnown'), true);
  assert.equal(run('state.diplomacy.human.economicKnown'), undefined);

  assert.deepEqual(JSON.parse(run('JSON.stringify(spyTrainingCost("human"))')), { currency: 180, tools: 9 });
  run(`state.res.currency = 200; state.res.tools = 10; hireSpy('human'); updateSpies(180);
    state.techs.espionage = true; beginEspionage('human'); updateSpies(1200)`);
  assert.equal(run('spyCount("human")'), 2);
  assert.equal(run('state.diplomacy.human.economicKnown'), true);
  assert.equal(run('state.diplomacy.human.militaryStrength'), 90);

  run(`state.diplomacy.human.militaryStrength = 61; beginEspionage('human'); updateSpies(1200)`);
  assert.equal(run('state.diplomacy.human.militaryStrength'), 60);
  run("beginEspionage('human')");
  assert.equal(run('state.diplomacy.human.espionageT || 0'), 0);
});

test('a killed spy can betray the operation and damage relations', () => {
  const { run } = game();
  run(`ensureDiplomacyEntry('human'); state.diplomacy.human.disposition = 10;
    Math.random = () => 0; spyKilled('human')`);
  assert.equal(run('state.diplomacy.human.disposition'), 7);
  assert.match(run('state.log[0].t'), /betrays Emberhold/);
});

test('successful sieges unlock conquest and conquered realms become allies', () => {
  const { run } = game();
  run(`state.techs.guards = true; state.jobs.guard = 20; state.res.food = 250; state.res.tools = 20; ensureDiplomacyEntry('human');
    state.diplomacy.human.siegeReady = true; state.diplomacy.human.disposition = -40;
    conquerTown('human')`);
  assert.equal(run('state.jobs.guard'), 5);
  assert.equal(run('state.res.food'), 50);
  assert.equal(run('state.res.tools'), 10);
  assert.equal(run('state.diplomacy.human.conquered'), true);
  assert.equal(run('state.diplomacy.human.siegeReady'), false);
  assert.equal(run('state.morale'), 70);
  run('state.res.food = 10; updateMorale(1, 0)');
  assert.equal(run('state.morale'), run('69 + dailyWeather().morale'));
  assert.equal(run('alliedTribes()'), 1);
  const diplomacy = run('renderDiplomacy()');
  assert.match(diplomacy, /CONQUERED/);
  assert.doesNotMatch(diplomacy, /Relations are strained/);
  assert.doesNotMatch(diplomacy, /Spies stationed/);
  assert.doesNotMatch(diplomacy, /Assign Diplomat/);

  run(`state.tradePartner = 'clocklings'; ensureDiplomacyEntry('clocklings');
    state.diplomacy.clocklings.disposition = -50; state.diplomacy.clocklings.conquered = true;
    state.migrating = true; state.pendingLanding = 'emberplain'; state.pendingSpecies = 'human';
    state.pendingLandings = [{ id: 'emberplain' }]; setOut()`);
  assert.equal(run("state.lineagesUnlocked.clocklings"), true);
});

test('Commonality appears after conquest and replaces the occupation penalty', () => {
  const { run } = game();
  run(`state.techs = { civics: true, council: true }; state.res.knowledge = 2400;
    ensureDiplomacyEntry('human')`);
  assert.equal(run("renderResearch().includes('Commonality')"), false);
  run("state.diplomacy.human.conquered = true; state.tradePartner = 'human'");
  assert.equal(run("renderResearch().includes('Commonality')"), true);
  run(`doResearch('commonality'); choosePolicy('commonality'); state.res.food = 10;
    state.morale = 70; updateMorale(1, 0)`);
  assert.equal(run("tech('commonality')"), true);
  assert.equal(run("state.policy"), 'commonality');
  assert.equal(run('state.morale'), run('70 + dailyWeather().morale'));
  assert.equal(run('alliedIncomeBonus()'), 0.075);
  assert.equal(run('alliedTribes()'), 1);

  run(`state.tradePartner = 'clocklings'; state.diplomacy.clocklings = { disposition: -40, conquered: true };
  state.species = 'human'`);
  assert.equal(run("lineageMod('tools')"), 1.1);
  assert.equal(run("state.commonalityLineages.clocklings"), true);
  assert.equal(run("lineageMod('food')"), 1);
  run("state.policy = 'commons'");
  assert.equal(run("lineageMod('tools')"), 1);
});

test('migration combat achievements record deaths and peaceful departures', () => {
  const losses = game();
  losses.run(`state.pop = 10; state.migrationGuardDeaths = 25; state.migrationRaids = 1;
    state.migrating = true; state.pendingLanding = 'emberplain'; state.pendingSpecies = 'human';
    state.pendingLandings = [{ id: 'emberplain' }]; setOut()`);
  assert.equal(losses.run("state.achievements.butchersBill"), true);

  const peaceful = game();
  peaceful.run(`state.migrating = true; state.pendingLanding = 'emberplain'; state.pendingSpecies = 'human';
    state.pendingLandings = [{ id: 'emberplain' }]; setOut()`);
  assert.equal(peaceful.run('state.achievements.peacefulMigration'), true);
});

test('one diplomat makes progress even through repeated worst diplomatic slights', () => {
  const { run } = game();
  run(`ensureDiplomacyEntry('human'); state.diplomacy.human.disposition = 0;
    state.techs.diplomacy = true; state.diplomats.human = 1;
    Math.random = () => 0.999;
    for (let i = 0; i < 16; i++) updateDiplomacy(180)`);
  assert.equal(run('state.diplomacy.human.disposition'), 80);
  run('state.diplomacy.human.disposition = 99; updateDiplomacy(60)');
  assert.equal(run('state.diplomacy.human.disposition'), 100);
});

test('fulfilling requests gives meaningful recovery and caps relations at 100', () => {
  const { run } = game();
  run(`ensureDiplomacyEntry('human'); state.techs.currency = true;
    state.diplomacy.human.disposition = -10;
    state.diplomacy.human.request = { res: 'wood', amount: 100, age: 1 };
    state.res.wood = 200; supplyDiplomacyRequest('human')`);
  assert.equal(run('state.diplomacy.human.disposition'), 5);
  assert.equal(run('state.res.wood'), 100);
  run(`state.diplomacy.human.disposition = 95;
    state.diplomacy.human.request = { res: 'wood', amount: 100, age: 1 };
    supplyDiplomacyRequest('human')`);
  assert.equal(run('state.diplomacy.human.disposition'), 100);
});

test('expedition tab hides other landing expeditions, including completed ones', () => {
  const { run } = game();
  const sites = JSON.parse(run('JSON.stringify(EXPEDITIONS.filter(e => e.landing))'));
  for (const completed of [false, true]) {
    run(`for (const e of EXPEDITIONS) state.expeditions[e.id] = ${completed}`);
    for (const site of sites) {
      run(`state.landing = '${site.landing}'`);
      const html = run('renderExpeditions()');
      for (const e of sites) assert.equal(html.includes(e.name), e.landing === site.landing, `${e.id} at ${site.landing}, completed=${completed}`);
      assert.ok(!html.includes('migrate here to explore'));
    }
  }
});

test('site expeditions require local settlement, charge once, and retain rewards across migrations', () => {
  const { run } = game();
  const sites = JSON.parse(run('JSON.stringify(EXPEDITIONS.filter(e => e.landing))'));
  assert.equal(sites.length, run('LANDINGS.length'));
  assert.equal(new Set(sites.map(e => e.landing)).size, sites.length);
  assert.match(run('renderExpeditions()'), /0\/6 established/);
  for (const e of sites) {
    run(`state.pop = 30; for (const r of RESOURCES) state.res[r.id] = 10000;
      state.landing = LANDINGS.find(l => l.id !== '${e.landing}').id;
      doExpedition('${e.id}')`);
    assert.equal(run(`expDone('${e.id}')`), false, 'wrong landing');
    run(`state.landing = '${e.landing}'; state.pop = 4; doExpedition('${e.id}')`);
    assert.equal(run(`expDone('${e.id}')`), false, 'arrival alone is insufficient');
    const resource = Object.keys(e.cost)[0];
    run(`state.pop = 18; state.res.${resource} = 0; doExpedition('${e.id}')`);
    assert.equal(run(`expDone('${e.id}')`), false, 'requires supplies');
    run(`state.res.${resource} = 10000; state.upgrades.oldMaps = 1; doExpedition('${e.id}')`);
    assert.equal(run(`expDone('${e.id}')`), true);
    assert.equal(run(`state.res.${resource}`), 10000 - e.cost[resource] * 0.75);
    run(`doExpedition('${e.id}')`);
    assert.equal(run(`state.res.${resource}`), 10000 - e.cost[resource] * 0.75, 'cannot pay twice');
  }
  assert.equal(run('siteExpeditionsComplete()'), true);
  assert.equal(run("globalProductionFactors().find(([label]) => label === 'All six sites explored')[1]"), 1.05);
  run(`saveGame(true); state = loadGame(); state.migrating = true;
    state.pendingLanding = 'greenfold'; state.pendingSpecies = 'human'; setOut()`);
  assert.equal(run('siteExpeditionsComplete()'), true);
  assert.equal(run("settlementProductionFactors('food').filter(([label]) => ['The First Roads', 'The Living Channels'].includes(label)).reduce((m, [, value]) => m * value, 1)"), 1.1 * 1.1);
  run('state.jobs.woodcutter = 1; const siteDetail = {}; const siteRates = production(0.25, siteDetail)');
  assert.ok(run("siteDetail.wood.some(e => e.factors.some(([label]) => label === 'The Heartwood Grove'))"));
  assert.ok(run('RESOURCES.every(r => Math.abs(siteDetail[r.id].reduce((sum, e) => sum + e.amount, 0) - siteRates[r.id]) < 1e-10)'));
  assert.match(run('renderExpeditions()'), /6\/6 established/);
});

test('Fertility Rites and Hospitals unlock, compound timers, and persist through saves', () => {
  const { run } = game();
  assert.equal(run('popGrowthNeed()'), 24.12);
  assert.equal(run('guardHealingNeed()'), 90);
  run("state.res.knowledge = 1000; doResearch('hospital'); doBuild('hospital')");
  assert.equal(run("tech('hospital')"), false);
  assert.equal(run("bld('hospital')"), 0);
  run("doResearch('aphrodisiac')");
  assert.equal(run('popGrowthNeed()'), 18.09);
  assert.equal(run('guardHealingNeed()'), 90);
  run(`state.res.wood = 10000; state.res.stone = 10000; state.res.tools = 1000;
    doResearch('stoneWorking'); doResearch('craftsmanship'); doResearch('hospital');`);
  for (let level = 1; level <= 5; level++) {
    run("doBuild('hospital')");
    assert.equal(run("bld('hospital')"), level);
    assert.ok(Math.abs(run('popGrowthNeed()') - 18.09 * 0.9 ** level) < 1e-10);
    assert.ok(Math.abs(run('guardHealingNeed()') - 90 * 0.9 ** level) < 1e-10);
  }
  run('saveGame(true); state = loadGame()');
  assert.equal(run("bld('hospital')"), 5);
  assert.equal(run("tech('aphrodisiac')"), true);
  run('state.guardInjuries = 2; updateDiplomacy(guardHealingNeed())');
  assert.equal(run('state.guardInjuries'), 1);
  run('updateDiplomacy(guardHealingNeed() * 2)');
  assert.equal(run('state.guardInjuries'), 0);
  run('state.growthT = popGrowthNeed() - 0.1; tick(0.05)');
  assert.equal(run('state.pop'), 4);
  run('tick(0.1)');
  assert.equal(run('state.pop'), 5);
});

test('research completion messages stay in the research log category', () => {
  const { run } = game();
  assert.equal(run("logCategory(`Research complete: ${TECH_BY_ID.get('hospital').name}. ${TECH_BY_ID.get('hospital').desc}`)"), 'research');
  assert.equal(run("logCategory(`Research complete: ${TECH_BY_ID.get('trainingYard').name}. ${TECH_BY_ID.get('trainingYard').desc}`)"), 'research');
});

test('morale speeds or slows population growth and stacks with fertility bonuses', () => {
  const { run } = game();
  const neutral = run('popGrowthNeed()');
  run('state.morale = 0');
  assert.ok(Math.abs(run('popGrowthNeed()') - neutral / 0.7) < 1e-10);
  run('state.morale = 100');
  const happy = run('popGrowthNeed()');
  assert.ok(happy < neutral);
  assert.ok(Math.abs(neutral / happy - run("globalProductionFactors()[0][1]")) < 1e-10);
  run("state.species = 'rabbitfolk'; state.techs.aphrodisiac = true; state.bld.hospital = 2");
  assert.ok(Math.abs(run('popGrowthNeed()') - happy * 0.5 * 0.75 * 0.9 ** 2) < 1e-10);
  assert.match(run('renderVillage()'), /Population growth:/);
});

test('population growth timing tooltip explains every active modifier', () => {
  const { run } = game();
  run(`state.pop = 12; state.morale = 80; state.techs.aphrodisiac = true;
    state.bld.hospital = 2; state.species = 'rabbitfolk'; state.placeTraits = ['wildOrchards'];`);
  const tooltip = run('populationGrowthTooltip()');
  for (const label of ['Base:', 'Settlement pace:', 'Fertility Rites:', 'Hospitals (2):', 'Rabbitfolk:', 'Morale growth speed:', 'Wild Orchards:']) assert.ok(tooltip.includes(label), label);
  assert.ok(Math.abs(run('populationGrowthTime() - popGrowthNeed() * 0.94') < 1e-10));
  assert.match(run('renderVillage()'), /has-tooltip[^>]*Population growth|Population growth: <span class="has-tooltip"/);
});

test('Rabbitfolk population growth takes half the usual time', () => {
  const { run } = game();
  const humanGrowth = run('popGrowthNeed()');
  run("state.species = 'rabbitfolk'");
  assert.equal(run('popGrowthNeed()'), humanGrowth * 0.5);
});

test('20 animal lineages have reachable habitats and matching encounter and selection rules', () => {
  const { run } = game();
  const habitats = {
    otterfolk: ['floodmeadows', 'windmere'], beaverkin: ['floodmeadows', 'windmere'],
    turtlefolk: ['floodmeadows', 'windmere'], axolotlkin: ['floodmeadows', 'windmere'],
    carpfolk: ['floodmeadows', 'windmere'], frogfolk: ['floodmeadows', 'ashfen', 'windmere'],
    heronkin: ['floodmeadows', 'ashfen', 'windmere'], foxfolk: null, wolfkin: null,
    bearfolk: ['greenfold', 'grayrocks'], deerkin: ['emberplain', 'greenfold', 'floodmeadows'],
    rabbitfolk: ['emberplain', 'floodmeadows'], bisonkin: ['emberplain', 'floodmeadows'],
    squirrelfolk: ['greenfold'], owlkin: ['greenfold'], lynxfolk: ['greenfold', 'grayrocks'],
    ibexkin: ['grayrocks'], eaglefolk: ['grayrocks'], molekin: null, raccoonfolk: null,
  };
  assert.equal(run('ANIMAL_LINEAGES.length'), 20);
  assert.equal(run('new Set(LINEAGES.map(l => l.id)).size'), 30);
  assert.equal(run('new Set(TRIBES.map(t => t.id)).size'), 30);
  run('state.bld.monument = 1');
  for (const landing of JSON.parse(run('JSON.stringify(LANDINGS.map(l => l.id))'))) {
    const encountered = new Set();
    run(`state.landing = '${landing}'; state.pendingLanding = '${landing}'; state.migrating = true`);
    const count = run('TRIBES.filter(t => t.id !== "human" && habitatAllows(t, state.landing)).length');
    for (let i = 0; i < count; i++) {
      run(`{ let rolls = [0, ${(i + 0.5) / count}]; Math.random = () => rolls.length ? rolls.shift() : 0; rollTradePartner(); }`);
      encountered.add(run('state.tradePartner'));
    }
    for (const [id, places] of Object.entries(habitats)) {
      const allowed = !places || places.includes(landing);
      assert.equal(encountered.has(id), allowed, `${id} encounter at ${landing}`);
      run(`state.pendingSpecies = 'human'; state.lineagesUnlocked['${id}'] = false; chooseLineage('${id}')`);
      assert.equal(run('state.pendingSpecies'), 'human', 'habitat does not bypass alliance unlock');
      run(`state.lineagesUnlocked['${id}'] = true; chooseLineage('${id}')`);
      assert.equal(run('state.pendingSpecies'), allowed ? id : 'human', `${id} choice at ${landing}`);
      run("state.pendingSpecies = 'human'");
      const button = run('renderMigration()').match(new RegExp(`<button data-action="lineage" data-id="${id}"[^>]*>`));
      assert.ok(button, 'unlocked lineages remain visible');
      assert.equal(button[0].includes('disabled'), !allowed);
    }
  }
});

test('every animal lineage unlocks through alliances and survives founding and save/load', () => {
  const { run } = game();
  for (const id of JSON.parse(run('JSON.stringify(ANIMAL_LINEAGES.map(l => l.id))'))) {
    run(`state = defaultState(); ensureDiplomacyEntry('${id}');
      state.diplomacy['${id}'].disposition = 80; state.migrating = true; setOut();
      state.migrating = true;
      state.pendingLanding = LANDINGS.find(l => habitatAllows(lineageDef('${id}'), l.id)).id;
      chooseLineage('${id}'); setOut(); saveGame(true); state = loadGame()`);
    assert.equal(run('state.species'), id);
    assert.equal(run(`lineageUnlocked('${id}')`), true);
    assert.match(run('renderDiplomacy()'), /Habitat:/);
  }
});

test('migration changes and stale saves cannot found an aquatic lineage on dry land', () => {
  const { run } = game();
  run(`state.lineagesUnlocked.otterfolk = true; state.species = 'otterfolk';
    state.landing = 'floodmeadows'; state.pop = 20; state.bld.monument = 1;
    Math.random = () => 0; beginMigration()`);
  assert.equal(run('state.migrating'), true);
  assert.equal(run('state.pendingLanding'), 'emberplain');
  assert.equal(run('state.pendingSpecies'), 'otterfolk');
  assert.match(run('renderMigration()'), /data-action="migration-out" disabled/);
  const before = run('JSON.stringify(state)');
  run('setOut()');
  assert.equal(run('JSON.stringify(state)'), before, 'invalid departure leaves the village intact');
  run(`state.pendingLandings = LANDINGS; chooseLanding('windmere'); chooseLineage('otterfolk');
    chooseLanding('grayrocks')`);
  assert.equal(run('state.pendingSpecies'), 'otterfolk');
  assert.equal(run('state.pendingLanding'), 'windmere');
  assert.match(run('renderMigration()'), /data-action="landing" data-id="grayrocks" disabled/);
  assert.equal(run('lineageUnlocked("otterfolk")'), true);
  run(`chooseLanding('windmere'); chooseLineage('otterfolk'); saveGame(true); state = loadGame()`);
  assert.equal(run('state.pendingSpecies'), 'otterfolk');
  run(`state.pendingLanding = 'greenfold'; saveGame(true); state = loadGame(); setOut()`);
  assert.equal(run('state.species'), 'otterfolk');
  assert.equal(run('state.pendingSpecies'), 'otterfolk');
  assert.equal(run('state.migrating'), true);
  assert.equal(run('state.landing'), 'floodmeadows');
  run(`chooseLineage('human'); chooseLanding('grayrocks'); setOut()`);
  assert.equal(run('state.species'), 'human');
  assert.equal(run('state.landing'), 'grayrocks');
  run(`state.species = 'otterfolk'; state.landing = 'windmere'; setOut('scarcity')`);
  assert.equal(run('state.species'), 'otterfolk');
  assert.equal(run('state.landing'), 'windmere');
});

test('animal lineage bonuses and tradeoffs affect production and crafting', () => {
  const { run } = game();
  run(`state.jobs.forager = 2; state.species = 'human'; const foodBefore = production().food + state.pop * FOOD_PER_POP;
    state.species = 'carpfolk'`);
  assert.ok(Math.abs(run('production().food + state.pop * FOOD_PER_POP') - run('foodBefore') * 1.30) < 1e-10);
  run(`state.bld.workbench = 1; state.res.wood = 100; state.res.tools = 0; doCraft('tools')`);
  assert.equal(run('state.res.tools'), 0.88);
  run(`state.species = 'raccoonfolk'; state.res.tools = 0; doCraft('tools')`);
  assert.equal(run('state.res.tools'), 1.22);
});

test('every lineage has unique flavor and consequential events that appear in the Chronicle', () => {
  const { run } = game();
  const ids = JSON.parse(run('JSON.stringify(LINEAGES.map(l => l.id))'));
  assert.equal(run('Object.keys(LINEAGE_EVENTS).length'), ids.length);
  assert.equal(run('new Set(Object.values(LINEAGE_EVENTS).flat().map(e => e.text)).size'), ids.length * 2);
  for (const id of ids) {
    run(`state = defaultState(); state.species = '${id}'; state.morale = 50;
      for (const r of RESOURCES) { state.seen[r.id] = true; state.res[r.id] = 20; }
      Math.random = () => 0`);
    const before = run('JSON.stringify([state.res, state.morale, state.seen])');
    run('updateRandomEvents(60)');
    assert.equal(run('JSON.stringify([state.res, state.morale, state.seen])'), before, `${id}: flavor has no effect`);
    assert.equal(run('state.log[0].t'), run(`lineageDef('${id}').name + ': ' + LINEAGE_EVENTS['${id}'][0].text`));
    run(`{ let rolls = [0, 0, 0.99]; Math.random = () => rolls.length ? rolls.shift() : 0; updateRandomEvents(130); }`);
    assert.notEqual(run('JSON.stringify([state.res, state.morale, state.seen])'), before, `${id}: consequential event changes state`);
    assert.ok(run('state.log[0].t').includes(run(`LINEAGE_EVENTS['${id}'][1].text`)));
    assert.match(run('state.log[0].t'), /[+-]\d/);
    assert.equal(run('state.log.length'), 2);
  }
});

test('lineage happenings respect timing, storage, morale, discovery and save/load', () => {
  const { run } = game();
  function effect() {
    run(`{ let rolls = [0, 0, 0.99]; Math.random = () => rolls.length ? rolls.shift() : 0; updateRandomEvents(130); }`);
  }
  run(`state.species = 'clocklings'; updateRandomEvents(30); saveGame(true); state = loadGame()`);
  assert.equal(run('state.randomEventT'), 30);
  assert.equal(run('state.species'), 'clocklings');
  assert.equal(run('state.log.length'), 0);
  effect();
  assert.equal(run('state.res.tools'), 0);
  assert.equal(run('!!state.seen.tools'), false);
  assert.doesNotMatch(run('state.log[0].t'), /Tools \+/);
  run('state.seen.tools = true; state.res.tools = capacityOf("tools") - 0.5');
  effect();
  assert.equal(run('state.res.tools'), run('capacityOf("tools")'));
  assert.match(run('state.log[0].t'), /Tools \+0\.5/);
  run('state.res.tools = capacityOf("tools") + 10');
  effect();
  assert.equal(run('state.res.tools'), run('capacityOf("tools") + 10'));
  assert.doesNotMatch(run('state.log[0].t'), /Tools \+/);
  run(`state.species = 'carpfolk'; state.res.food = 2`);
  effect();
  assert.equal(run('state.res.food'), 0);
  assert.match(run('state.log[0].t'), /Food -2/);
  run(`state.species = 'glimmerfolk'; state.morale = moraleCap()`);
  effect();
  assert.equal(run('state.morale'), run('moraleCap()'));
  assert.doesNotMatch(run('state.log[0].t'), /Morale/);
  run(`{ let rolls = [0, 0.9, 0]; Math.random = () => rolls.length ? rolls.shift() : 0; updateRandomEvents(130); }`);
  assert.ok(run('state.log[0].t').includes(run('RANDOM_EVENTS[0].text')), 'general happenings remain available');
});

test('currency losses from random events scale with current holdings', () => {
  const { run } = game();
  run(`state.randomEventT = 60; state.randomEventNext = 60; state.seen.currency = true;
    state.res.currency = 100; Math.random = () => 0.75; updateRandomEvents(0);`);
  assert.equal(run('state.res.currency'), 97);

  run(`state.randomEventT = 60; state.randomEventNext = 60; state.res.currency = 1000;
    Math.random = () => 0.75; updateRandomEvents(0);`);
  assert.equal(run('state.res.currency'), 970);
});

test('resource happenings scale with the affected resource storage capacity', () => {
  const { run } = game();
  run(`state.species = 'human'; state.seen.wood = true; state.res.wood = 0;
    Math.random = () => 0.5; updateRandomEvents(60)`);
  const baseGain = run('state.res.wood');
  run(`state.res.wood = 0; state.bld.storehouse = 1; state.randomEventT = 60;
    Math.random = () => 0.5; updateRandomEvents(60)`);
  assert.equal(run('state.res.wood'), baseGain * 3);
});

test('Turtlefolk lake memories grant time-scaled knowledge and survey', () => {
  const { run } = game();
  run(`state.species = 'turtlefolk'; state.seen.knowledge = true; state.res.knowledge = 0;
    state.trialDone.wayfinding = 1; state.jobs.thinker = 1; state.jobs.explorer = 2;
    Math.random = (() => { const rolls = [0, 0, 0.99, 0.5, 0]; return () => rolls.shift() ?? 0; })();
    updateRandomEvents(60)`);
  assert.equal(run('state.res.knowledge'), 5);
  assert.equal(run('state.surveyPoints'), 0.75);
  assert.match(run('state.log[0].t'), /Survey \+0\.75; Knowledge \+5/);
});

test('Skyborn wind charts grant time-scaled knowledge', () => {
  const { run } = game();
  run(`state.species = 'skyborn'; state.seen.knowledge = true; state.res.knowledge = 0;
    state.trialDone.wayfinding = 1; state.jobs.thinker = 1;
    Math.random = (() => { const rolls = [0, 0, 0.99, 0.5, 0]; return () => rolls.shift() ?? 0; })();
    updateRandomEvents(60)`);
  assert.equal(run('state.res.knowledge'), 5);
  assert.match(run('state.log[0].t'), /Knowledge \+5/);
});

test('resource breakdown reconciles income and costs with scoped modifiers', () => {
  const { run } = game();
  run(`state.jobs = { forager: 3, guard: 2, tinkerer: 1, woodcutter: 2 };
    state.guardInjuries = 1; state.morale = 50; state.day = DAYS_PER_SEASON * 3;
    state.bld.shrine = 2; state.bld.foragerLodge = 1; state.techs.weaponry = true;
    state.techs.civics = true; state.policy = 'warCouncil'; state.council = ['granaryKeeper'];
    state.expeditions.oldForest = true; state.res.wood = 100; state.res.stone = 100;
    const detail = {}; const rates = production(0.25, detail)`);
  const expected = run(`(((3 * JOBS.forager.base * allMult() * seasonMult() * 1.1
    + ableGuards() * JOBS.guard.base * allMult() * 1.5) * (dailyWeather().mods.food || 1) - 2 * JOBS.guard.upkeep)
    * landingMod('food') * lineageMod('food') * 0.95 * 1.1) - state.pop * FOOD_PER_POP`);
  assert.ok(Math.abs(run('rates.food') - expected) < 1e-10);
  assert.ok(run(`RESOURCES.every(r => Math.abs(detail[r.id].reduce((sum, e) => sum + e.amount, 0) - rates[r.id]) < 1e-10)`));
  assert.equal(run(`detail.food.find(e => e.label.startsWith('Villager upkeep')).factors.length`), 0);
  assert.equal(run(`detail.food.find(e => e.label.includes('hunting')).factors.some(([label]) => label.includes('Winter'))`), false);
  const tooltip = run(`resourceRateTooltip(RESOURCES.find(r => r.id === 'food'), rates.food, detail.food)`);
  for (const label of ['Income:', 'Outgoing:', 'Morale', 'Winter', 'War Council', 'Tovin', 'Villager upkeep', '1/2 able']) assert.ok(tooltip.includes(label), label);
  assert.ok(run(`detail.wood.some(e => e.label.includes('inputs') && e.amount < 0)`));
});

test('resource breakdown explains stopped jobs, factory shortages, full stores and zero rates', () => {
  const { run } = game();
  run(`state.jobs = { tinkerer: 1 }; state.res.wood = 0;
    state.bld.factory = 1; state.res.power = 0;
    const detail = {}; const rates = production(0.25, detail)`);
  assert.ok(run(`detail.tools[0].factors.some(([label, factor]) => label === 'Missing wood or stone' && factor === 0)`));
  assert.ok(run(`detail.goods[0].factors.some(([label, factor]) => label === 'Power shortage' && factor === 0)`));
  assert.equal(run('rates.power'), 0);
  run(`state.techs.machineryTech = true; chooseFactoryRecipe('machinery');
    state.bld.steamPlant = 1; state.res.coal = 100; state.res.machinery = capacityOf('machinery'); production(0.25, detail)`);
  assert.ok(run(`detail.machinery[0].factors.some(([label, factor]) => label.includes('storage space') && factor === 0)`));
  run(`state.jobs.woodcutter = 1; state.res.wood = capacityOf('wood'); const fullRates = production(0.25, detail)`);
  assert.ok(run(`resourceRateTooltip(RESOURCES.find(r => r.id === 'wood'), fullRates.wood, detail.wood).includes('excess net income is wasted')`));
  assert.ok(run(`renderStores().includes('tabindex="0" data-tooltip=')`));
  run('state.jobs = {}');
  assert.ok(run(`renderStores().includes('>0/s</span>')`));
});

test('stores hide resources until they are discovered', () => {
  const { run } = game();
  run(`state.seen = { food: true, wood: true }; state.res.food = 10; state.res.coal = 10`);
  assert.ok(run("renderStores().includes('>Food<')"));
  assert.equal(run("renderStores().includes('>Coal<')"), false);
  run("state.seen.coal = true");
  assert.ok(run("renderStores().includes('>Coal<')"));
});

test('job production exposes zeroed multipliers to automation', () => {
  const { run } = game();
  run(`state.bld.library = 1; state.jobs.thinker = 1`);
  assert.ok(run("jobProduction('thinker')") > 0);
  run("state.trial = { id: 'silence' }");
  assert.equal(run("jobProduction('thinker')"), 0);
});

test('thinkers are limited to one more than the number of libraries', () => {
  const { run } = game();
  run('state.bld.library = 1; state.pop = 10; state.jobs.thinker = 8; reconcileWorkers()');
  assert.equal(run('state.jobs.thinker'), 2);
  assert.equal(run('jobCapacity("thinker")'), 2);
  assert.match(run('renderVillage()'), /class="job-assign">2\/2<\/span>/);
  assert.equal(run('doAssign("thinker", 1)'), false);
  assert.equal(run('state.jobs.thinker'), 2);
  assert.equal(run('setJob("thinker", 3)'), false);
  run('state.bld.library = 3; doAssign("thinker", 1)');
  assert.equal(run('state.jobs.thinker'), 3);
});

test('tinkerers are limited to one plus one per five woodcutters', () => {
  const { run } = game();
  run("state.trial = { id: 'tinkering' }; state.bld.workbench = 1; state.pop = 20");
  assert.equal(run('jobCapacity("tinkerer")'), 1);
  run('state.jobs.woodcutter = 4');
  assert.equal(run('jobCapacity("tinkerer")'), 1);
  run('state.jobs.woodcutter = 5');
  assert.equal(run('jobCapacity("tinkerer")'), 2);
  run('state.jobs.tinkerer = 20; reconcileWorkers()');
  assert.equal(run('state.jobs.tinkerer'), 2);
  run('state.jobs.woodcutter = 10; doAssign("tinkerer", 1)');
  assert.equal(run('state.jobs.tinkerer'), 3);
});

test('advanced science unlocks uncapped instrument halls and hall-limited experimentalists', () => {
  const { run } = game();
  run(`state.techs.machineryTech = true; state.techs.writing = true; state.res.knowledge = 2200;
    state.res.copper = 180; state.res.steel = 100; state.res.machinery = 40;
    doResearch('advancedScience')`);
  assert.equal(run('tech("advancedScience")'), true);
  assert.equal(run('BUILDINGS.find(b => b.id === "instrumentHall").max'), Infinity);
  assert.deepEqual(JSON.parse(run('JSON.stringify(BUILDINGS.find(b => b.id === "instrumentHall").cost)')),
    { steel: 180, goods: 80, copper: 300 });
  assert.equal(run('JOBS.experimentalist.base'), 0.6);
  assert.equal(run('jobCapacity("experimentalist")'), 0);
  run('state.bld.instrumentHall = 2; state.pop = 10; state.jobs.experimentalist = 10; reconcileWorkers()');
  assert.equal(run('jobCapacity("experimentalist")'), 2);
  assert.equal(run('state.jobs.experimentalist'), 2);
  assert.equal(run('setJob("experimentalist", 3)'), false);
});

test('job API rejects bulk assignments beyond population or job capacity', () => {
  const { run } = game();
  run('state.pop = 3');
  assert.equal(run('doAssign("forager", 4)'), false);
  assert.equal(run('setJob("forager", 4)'), false);
  assert.equal(run('state.jobs.forager || 0'), 0);
});

test('miner capacities scale with their supporting buildings', () => {
  const { run } = game();
  run('state.bld.quarry = 1; state.bld.deepMine = 1; state.pop = 20');
  assert.equal(run('jobCapacity("miner")'), 1);
  assert.equal(run('jobCapacity("ironminer")'), 3);
  run('state.techs.copperProspecting = true');
  assert.equal(run('jobCapacity("copperminer")'), 3);
  assert.equal(run('setJob("miner", 2)'), false);
  assert.equal(run('setJob("ironminer", 4)'), false);
  assert.equal(run('setJob("copperminer", 4)'), false);
  run('state.bld.stoneWorks = 2; state.bld.deepStore = 2; reconcileWorkers()');
  assert.equal(run('jobCapacity("miner")'), 3);
  assert.equal(run('jobCapacity("ironminer")'), 5);
  assert.equal(run('jobCapacity("copperminer")'), 5);
});

test('repeatable trials grow harder after rewards and retain difficulty on failure and load', () => {
  const { run } = game();
  for (const id of ['scarcity', 'frugality', 'overflow']) {
    run(`state = defaultState(); state.upgrades.oathkeepers = 1; state.jobs.forager = 2;
      state.trial = { id: '${id}', daysActive: 0, buildings: 0 }`);
    const measure = id === 'scarcity' ? 'production().food' :
      id === 'frugality' ? 'buildingCost(BUILDINGS.find(b => b.id === "hut")).wood' : 'capacityOf("food")';
    let previous = run(measure);
    const max = run(`trialMax(TRIALS.find(t => t.id === '${id}'))`);
    for (let completed = 1; completed < max; completed++) {
      run(`state.trialDone['${id}'] = ${completed}`);
      const current = run(measure);
      assert.ok(id === 'scarcity' ? current < previous : current > previous, `${id} run ${completed + 1}`);
      previous = current;
    }
    const difficulty = run(`trialDifficulty('${id}')`);
    run('saveGame(true); state = loadGame(); endTrial(false)');
    assert.equal(run(`trialDifficulty('${id}')`), difficulty);
  }
});

test('construction trials count completed buildings for Frugality and Expansion', () => {
  const { run } = game();
  run(`state.res.food = 1000; state.res.wood = 1000;
    state.trial = { id: 'frugality', daysActive: 0, buildings: 0 };
    doBuild('hut')`);
  assert.equal(run('state.trial.buildings'), 1);

  run(`state.trial = { id: 'expansion', daysActive: 0, buildings: 0 };
    doBuild('hut')`);
  assert.equal(run('state.trial.buildings'), 1);
});

test('Expansion and Scholarship trials unlock their extra queue slots', () => {
  const { run } = game();
  assert.equal(run("queueCapacity('build')"), 1);
  assert.equal(run("queueCapacity('research')"), 1);
  run('state.trialDone.expansion = 1; state.trialDone.scholarship = 1');
  assert.equal(run("queueCapacity('build')"), 2);
  assert.equal(run("queueCapacity('research')"), 2);
});

test('Long Night keeps the whole trial in winter', () => {
  const { run } = game();
  run(`state.day = DAYS_PER_SEASON + 1;
    state.trial = { id: 'longnight', daysActive: 0, buildings: 0 }`);
  assert.equal(run('seasonIndex()'), 3);
  assert.equal(run('seasonMult()'), 0.25);
  const winterTemperature = run('dailyWeather().temperature');
  run('state.trial = null');
  assert.ok(winterTemperature < run('dailyWeather().temperature'));
  assert.match(run('weatherSummary()'), /freezing|cold|mild/i);
  assert.equal(run('seasonIndex()'), 1);
});

test('Long Night lasts ten full years', () => {
  const { run } = game();
  run(`state.trial = { id: 'longnight', daysActive: LONG_NIGHT_DURATION - 1, buildings: 0 }`);
  run('updateTrial(0)');
  assert.equal(run('state.trial.id'), 'longnight');
  assert.match(run('renderTrials()'), /1999 \/ 2000 days endured/);
  run('state.trial.daysActive = LONG_NIGHT_DURATION; updateTrial(0)');
  assert.equal(run('state.trial'), null);
});

test('Tinkering fails at 240 days without a Tinkerer', () => {
  const { run } = game();
  run(`state.trial = { id: 'tinkering', daysActive: 239, buildings: 0 }; updateTrial(1)`);
  assert.equal(run('state.trial'), null);
  assert.equal(run('trialCount("tinkering")'), 0);

  run(`state.trial = { id: 'tinkering', daysActive: 239, buildings: 0 };
    state.jobs.tinkerer = 1; updateTrial(1)`);
  assert.equal(run('state.trial'), null);
  assert.equal(run('state.trialDone.tinkering'), 1);
});

test('Overflow uses raised ceilings for progress and completion', () => {
  const { run } = game();
  run(`state.trialDone.overflow = 1; state.seen = { food: true };
    state.res.food = capacityOf('food');
    state.trial = { id: 'overflow', daysActive: 0, buildings: 0 }; updateTrial(0)`);
  assert.equal(run('state.trial.id'), 'overflow');
  assert.match(run('trialProgressText()'), /80% full/);
  assert.match(run('renderTrials()'), /Storage ceilings are multiplied by 1.25/);
  run(`state.res.food = capacityOf('food'); updateTrial(0)`);
  assert.equal(run('state.trial'), null);
  assert.equal(run('trialCount("overflow")'), 2);
});

test('front page shows the active trial goal and progress', () => {
  const { run } = game();
  run(`state.trial = { id: 'overflow', daysActive: 0, buildings: 0 };
    state.trialDone.overflow = 1; state.seen = { food: true }; state.res.food = 240;`);
  const village = run('renderVillage()');
  assert.match(village, /Trial of the Overflow/);
  assert.match(village, /Goal:<\/strong> Have every store you have discovered filled to its ceiling at the same moment/);
  assert.match(village, /Progress:<\/strong> emptiest store: 80% full/);
});

test('active trials remain visible before the Monument is built', () => {
  const { run } = game();
  assert.equal(run('tabUnlocked("trials")'), false);
  run(`state.trial = { id: 'overflow', daysActive: 0, buildings: 0 }`);
  assert.equal(run('tabUnlocked("trials")'), true);
  assert.match(run('renderTrials()'), /Trial of the Overflow/);
});

test('starting a trial enables every difficulty option until it ends', () => {
  const { run } = game();
  run(`confirm = () => true;
    state.bld.storehouse = 1;
    state.migrationChallenges = ['dryGround'];
    startTrial('overflow')`);
  assert.equal(JSON.stringify(run('state.migrationChallenges')), JSON.stringify(['dryGround', 'badAncestry', 'nothingManual', 'forgottenTruths']));
  assert.ok(run('state.badAncestry'));

  run('endTrial(false)');
  assert.equal(JSON.stringify(run('state.migrationChallenges')), '[]');
  assert.equal(run('state.badAncestry'), null);
});

test('Overflow suppresses non-trial storage bonuses while sworn', () => {
  const { run } = game();
  run(`state.trialDone.overflow = 1; state.upgrades.deepCellars = 3; state.techs.civics = true; state.governor = 'quartermaster';
    state.trial = { id: 'overflow', daysActive: 0, buildings: 0 }`);
  assert.equal(run('capacityOf("food")'), 300);
  run('state.trial = null');
  assert.equal(run('capacityOf("food")'), 481);
});

test('starvation trims total assignments to surviving population', () => {
  const { run } = game();
  run('state.pop = 4; state.jobs = { forager: 1, woodcutter: 3 }; state.res.food = 0; state.starveT = 20; state.day = 150; tick(0.25)');
  assert.equal(run('state.pop'), 3);
  assert.equal(run('assignedWorkers()'), 3);
  assert.equal(run('state.jobs.forager'), 1);
});

test('specialists share the population limit and invalid jobs are removed', () => {
  const { run } = game();
  run(`state.pop = 4; state.techs.diplomacy = true; state.bld.amphitheatre = 1;
    state.jobs = { forager: 2, performer: 2, ghost: 9 };
    state.diplomacy.human = { disposition: 50 }; state.diplomats.human = 3;
    reconcileWorkers()`);
  assert.equal(run('assignedWorkers()'), 4);
  assert.equal(run('totalDiplomats()'), 0);
  assert.equal(run('state.jobs.ghost'), undefined);
});

test('guard cap and injuries are repaired on load', () => {
  const { run } = game();
  run('state.pop = 10; state.techs.guards = true; state.bld.barracks = 1; state.jobs.guard = 8; state.guardInjuries = 7; reconcileWorkers()');
  assert.equal(run('state.jobs.guard'), 2);
  assert.equal(run('state.guardInjuries'), 2);
});

test('guard section is hidden until guards have capacity', () => {
  const { run } = game();
  run('state.techs.guards = true');
  assert.equal(run("renderVillage().includes('Guards — independent watch')"), false);
  run('state.bld.barracks = 1');
  assert.equal(run("renderVillage().includes('Guards — independent watch')"), true);
});

test('old saves receive new resources and researched armor', () => {
  const { run } = game();
  run('delete state.res.goods; delete state.armor; delete state.diplomats; state.techs.leatherArmor = true; state = normalizeSave(state)');
  assert.equal(run('state.res.goods'), 0);
  assert.equal(run('state.armor'), 1);
  assert.equal(run('totalDiplomats()'), 0);
});

test('Chainmail unlocks after Metallurgy and raises armor to level two', () => {
  const { run } = game();
  const chainmail = run("TECHS.find(t => t.id === 'chainmail')");
  assert.deepEqual(JSON.parse(run("JSON.stringify({ cost: TECHS.find(t => t.id === 'chainmail').cost, materials: TECHS.find(t => t.id === 'chainmail').materials })")),
    { cost: 450, materials: { steel: 60, tools: 30 } });
  run('state.techs.guards = true; state.techs.metallurgy = true');
  assert.equal(run("TECHS.find(t => t.id === 'chainmail').req()"), true);
  run('state.techs.chainmail = true; state.armor = 0; state = normalizeSave(state)');
  assert.equal(run('state.armor'), 2);
});

test('guards remain separate from a fully assigned population and cannot be assigned manually', () => {
  const { run } = game();
  run(`state.pop = 2; state.jobs = { forager: 2, guard: 4 };
    state.techs.guards = true; state.bld.barracks = 2; reconcileWorkers()`);
  assert.equal(run('state.jobs.guard'), 4);
  assert.equal(run('unassigned()'), 0);
  run('doAssign("guard", -1); doAssign("guard", 1); state.pop = 1; reconcileWorkers()');
  assert.equal(run('state.jobs.guard'), 4);
  assert.equal(run('assignedWorkers()'), 1);
});

test('guards recruit slowly through ticks, cap without banking recruits, and replace losses', () => {
  const { run } = game();
  run('updateGuardRecruitment(120)');
  assert.equal(run('state.jobs.guard || 0'), 0);
  run(`state.techs.guards = true; state.bld.barracks = 1;
    state.pop = popCap(); state.jobs.forager = state.pop; updateGuardRecruitment(119)`);
  assert.equal(run('state.jobs.guard'), 0);
  run('tick(1)');
  assert.equal(run('state.jobs.guard'), 1);
  assert.equal(run('state.pop'), run('popCap()'));
  assert.equal(run('unassigned()'), 0);
  run('updateGuardRecruitment(1000)');
  assert.equal(run('state.jobs.guard'), 2);
  assert.equal(run('state.guardRecruitment'), 0);
  run('applyRaidCasualties(1, 0); updateGuardRecruitment(119)');
  assert.equal(run('state.jobs.guard'), 1);
  run('updateGuardRecruitment(1)');
  assert.equal(run('state.jobs.guard'), 2);
});

test('Conquest trial unlocks after Hope, fixes three enemies at zero relations, and rewards recruitment speed', () => {
  const { run } = game();
  assert.equal(run("TRIAL_BY_ID.get('conquest').req()"), false);
  run('state.hope = 1; state.bld.monument = 1; state.landing = "emberplain"; state.migrating = true; state.pendingLandings = [{ id: "emberplain" }]; state.pendingLanding = "emberplain"; state.pendingSpecies = "human"; setOut("conquest")');
  assert.equal(run('state.trial.targets.length'), 3);
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.trial.targets.map(id => state.diplomacy[id].disposition))')), [0, 0, 0]);
  run('state.techs.diplomacy = true; state.diplomats[state.trial.targets[0]] = 3; updateDiplomacy(600)');
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.trial.targets.map(id => state.diplomacy[id].disposition))')), [0, 0, 0]);
  assert.ok(Math.abs(run('guardRecruitmentRate()') / (1 / 120) - 1) < 1e-12);
  run('for (const id of state.trial.targets) state.diplomacy[id].conquered = true; updateTrial(0)');
  assert.equal(run('state.trial'), null);
  assert.equal(run('trialCount("conquest")'), 1);
  assert.ok(Math.abs(run('guardRecruitmentRate()') / (1 / 120) - 1.1) < 1e-12);
});

test('Training Yards compound replacement Guard recruitment time without a cap', () => {
  const { run } = game();
  run(`state.techs.guards = true; state.bld.barracks = 1;
    state.res.knowledge = 1000; state.res.wood = 10000; state.res.stone = 10000; state.res.tools = 10000;
    doResearch('trainingYard')`);
  assert.equal(run("tech('trainingYard')"), true);
  assert.equal(run("bld('trainingYard')"), 0);
  assert.equal(run('1 / guardRecruitmentRate()'), 120);
  for (let level = 1; level <= 5; level++) {
    run("doBuild('trainingYard')");
    assert.equal(run("bld('trainingYard')"), level);
    assert.ok(Math.abs(run('1 / guardRecruitmentRate()') - 120 * 0.9 ** level) < 1e-10);
  }
  run('state.jobs.guard = 1; state.guardRecruitment = 0; updateGuardRecruitment(120 * 0.9 ** 5)');
  assert.equal(run('state.jobs.guard'), 2);
});

test('guard recruitment progress survives saves and older saves default to zero', () => {
  const { run } = game();
  run(`state.techs.guards = true; state.bld.barracks = 1;
    updateGuardRecruitment(60); saveGame(true); state = loadGame()`);
  assert.equal(run('state.guardRecruitment'), 0.5);
  run('delete state.guardRecruitment; state = normalizeSave(state)');
  assert.equal(run('state.guardRecruitment'), 0);
});

test('malformed saves are rejected before storage is touched', () => {
  const { run, context } = game();
  run('render = () => {}');
  run('saveGame(true)');
  const before = run('localStorage.getItem(SAVE_KEY)');
  for (const mutation of ['s.res = null', 's.jobs = []', 's.pop = -1', 's.res.food = "bad"', 's.log = [null]', 's.diplomacy.human = null', 's.trial = { id: "missing" }']) {
    const bad = run(`JSON.stringify((() => { const s = defaultState(); ${mutation}; return s; })())`);
    context.window.prompt = () => Buffer.from(bad).toString('base64');
    run('importSave()');
    assert.equal(run('localStorage.getItem(SAVE_KEY)'), before, mutation);
  }
});

test('import replaces live state, persists through unload, and resists stale tab saves', () => {
  const { run, context } = game();
  run('render = () => {}; state.res.knowledge = 30; saveGame(true)');
  const rescue = run('JSON.stringify({ ...defaultState(), res: { ...state.res, knowledge: 1500 }, pop: 19, trial: { id: "silence", steelProduced: 0 } })');
  context.window.prompt = () => Buffer.from(rescue).toString('base64');
  context.location.reload = () => { throw new Error('Import should not reload'); };
  run('importSave()');
  assert.equal(run('state.res.knowledge'), 1500);
  assert.equal(run('state.pop'), 19);
  assert.match(run('state.log[0].t'), /Save imported successfully/);
  run('saveGame(true); state = loadGame()');
  assert.equal(run('state.res.knowledge'), 1500);
  const imported = run('localStorage.getItem(SAVE_KEY)');
  run('state.res.knowledge = 30; lastStoredSave = "outdated tab"');
  assert.equal(run('saveGame(true)'), false);
  assert.equal(run('localStorage.getItem(SAVE_KEY)'), imported);
  assert.equal(run('saveConflict'), true);
});

test('save failure is visible and does not change the last save timestamp', () => {
  const { run, context } = game();
  run('state.savedAt = 123');
  context.localStorage.setItem = () => { throw new Error('quota'); };
  assert.equal(run('saveGame(false)'), false);
  assert.equal(run('state.savedAt'), 123);
  assert.match(run('state.log[0].t'), /could not be saved/);
});

test('offline time is banked without simulation, including short absences, up to 24 hours', () => {
  const { run } = game();
  run('Date.now = () => 100000; state.savedAt = 39000; offlineProgress()');
  assert.equal(run('state.day'), 0);
  assert.equal(run('state.bonusTime'), 61);
  run('offlineProgress()');
  assert.equal(run('state.bonusTime'), 61);
  run('state.savedAt -= 1000; offlineProgress()');
  assert.equal(run('state.bonusTime'), 62);
  run('state.savedAt -= 48 * 3600 * 1000; offlineProgress()');
  assert.equal(run('state.bonusTime'), 86400);
  run('state.savedAt += 1000; offlineProgress()');
  assert.equal(run('state.bonusTime'), 86400);
});

test('bonus time doubles play and expires precisely, while suspended time is banked', () => {
  const { run } = game();
  run('state.bonusTime = 2.5; advanceRealTime(2)');
  assert.equal(run('state.day'), 8);
  assert.equal(run('state.bonusTime'), 0.5);
  run('advanceRealTime(1)');
  assert.equal(run('state.day'), 11);
  assert.equal(run('state.bonusTime'), 0);
  run('advanceRealTime(1)');
  assert.equal(run('state.day'), 13);
  run('advanceRealTime(120)');
  assert.equal(run('state.day'), 13);
  assert.equal(run('state.bonusTime'), 120);
  run('saveConflict = true; advanceRealTime(2)');
  assert.equal(run('state.bonusTime'), 120);
});

test('worker clock catches up a short background delay but banks a long suspension', () => {
  const { run } = game();
  run('advanceRealTime(30, true)');
  assert.equal(run('state.day'), 60);
  assert.equal(run('state.bonusTime'), 0);
  run('advanceRealTime(61, true)');
  assert.equal(run('state.day'), 60);
  assert.equal(run('state.bonusTime'), 61);
});

test('bonus time survives saves and migration and older saves default to zero', () => {
  const { run } = game();
  run('delete state.bonusTime; state = normalizeSave(state)');
  assert.equal(run('state.bonusTime'), 0);
  run('state.bonusTime = 123; saveGame(true); state = loadGame(); setOut()');
  assert.equal(run('state.bonusTime'), 123);
  run('state.bonusTime = 999999; state = normalizeSave(state)');
  assert.equal(run('state.bonusTime'), 86400);
  run('state.bonusTime = -1; state = normalizeSave(state)');
  assert.equal(run('state.bonusTime'), 0);
});

test('returning to a known landing grants the ancestral knowledge blessing', () => {
  const { run } = game();
  run(`state.migrating = true; state.pendingLanding = 'greenfold'; setOut()`);
  assert.equal(run('state.ancestralBlessing'), false);
  run(`state.migrating = true; state.pendingLanding = 'emberplain'; setOut()`);
  assert.equal(run('state.ancestralBlessing'), true);
  run('state.placeTraits = []');
  assert.ok(Math.abs(run('production(0).knowledge') - 0.33) < 1e-10);
  run('state.ancestralBlessing = false; setOut("scarcity")');
  assert.equal(run('state.ancestralBlessing'), true);
  assert.ok(Math.abs(run('production(0).knowledge') - 0.33) < 1e-10);
});

test('bonus timer shows remaining real time and hides when depleted', () => {
  const { run, context } = game();
  const timer = { classList: { toggle(name, hidden) { this.hidden = hidden; } } };
  context.document.getElementById = () => timer;
  run('state.bonusTime = 3661.1; renderBonusTimer()');
  assert.equal(timer.textContent, '2× speed · 01:01:02');
  assert.equal(timer.classList.hidden, false);
  run('state.bonusTime = 0; renderBonusTimer()');
  assert.equal(timer.classList.hidden, true);
});

test('a valid save round trips through storage', () => {
  const { run } = game();
  run('state.res.wood = 123; state.jobs.forager = 2; saveGame(true); state = loadGame()');
  assert.equal(run('state.res.wood'), 123);
  assert.equal(run('assignedWorkers()'), 2);
});

test('new tribes can be encountered, allied, inherited, and saved', () => {
  for (const id of ['dunewalkers', 'cinderforged', 'thornkin', 'clocklings', 'glimmerfolk']) {
    const { run } = game();
    run(`Math.random = () => 0; const target = '${id}';
      const pool = TRIBES.filter(t => t.id !== 'human' && habitatAllows(t, state.landing));
      const index = pool.findIndex(t => t.id === target);
      let rolls = [0, (index + 0.5) / pool.length];
      Math.random = () => rolls.length ? rolls.shift() : 0;
      rollTradePartner()`);
    assert.equal(run('state.tradePartner'), id);
    assert.equal(run(`lineageUnlocked('${id}')`), false);
    run(`state.diplomacy['${id}'].disposition = 80; state.migrating = true; setOut()`);
    assert.equal(run(`lineageUnlocked('${id}')`), true);
    run(`state.migrating = true; chooseLineage('${id}'); setOut(); saveGame(true); state = loadGame()`);
    assert.equal(run('state.species'), id);
    assert.match(run('renderDiplomacy()'), /lineage traits:/);
    assert.match(run('renderDiplomacy()'), new RegExp(run(`lineageTraits(lineageDef('${id}'))[0].name`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('lineages group their existing effects into two to four shared traits', () => {
  const { run } = game();
  assert.equal(run('LINEAGE_TRAITS.length'), run('new Set(LINEAGE_TRAITS.map(t => t.id)).size'));
  assert.equal(run('LINEAGES.every(l => l.traits.length >= 2 && l.traits.length <= 4)'), true);
  assert.equal(run('LINEAGES.every(l => l.traits.every(id => LINEAGE_TRAIT_BY_ID.has(id)))'), true);
  assert.equal(run('LINEAGE_TRAITS.some(t => LINEAGES.filter(l => l.traits.includes(t.id)).length > 1)'), true);
  assert.match(run("lineageTraitsHtml(lineageDef('human'))"), /Way of life:/);
  assert.match(run("lineageTraitsHtml(lineageDef('human'))"), /Adaptable/);
});

test('Great Migration resets research and research-derived armor', () => {
  const { run } = game();
  run(`state.techs.weaponry = true; state.techs.leatherArmor = true;
    state.armor = 3; state.migrating = true; setOut()`);
  assert.equal(run('Object.keys(state.techs).length'), 0);
  assert.equal(run('state.armor'), 0);
  assert.equal(run('state.era'), 1);
});

test('migration does not carry undiscovered resource visibility into an early start', () => {
  const { run } = game();
  run(`state.upgrades.practicedMigrator = 1;
    for (const r of RESOURCES) state.seen[r.id] = true;
    state.migrating = true; setOut()`);
  assert.equal(run("renderStores().includes('>Coal<')"), false);
  assert.equal(run("renderStores().includes('>Steel<')"), false);
  assert.ok(run("renderStores().includes('>Food<')"));
  assert.ok(run("renderStores().includes('>Wood<')"));
});

test('loading a stale power discovery flag hides power without power buildings', () => {
  const { run } = game();
  run(`state.seen.power = true; state.res.power = 12; state = normalizeSave(JSON.parse(JSON.stringify(state)))`);
  assert.equal(run("state.seen.power"), false);
  assert.equal(run("state.res.power"), 0);
  assert.equal(run("renderStores().includes('>Power<')"), false);
  run('state.bld.steamPlant = 1; state.seen.power = true');
  assert.equal(run("renderStores().includes('>Power<')"), true);
});

test('tribal requests use discovered cultural preferences and renew after supplying', () => {
  const { run } = game();
  run(`Math.random = () => 0; state.tradePartner = 'clocklings'; state.seen = { food: true };
    ensureDiplomacyEntry('clocklings')`);
  assert.equal(run('state.diplomacy.clocklings.request.res'), 'food');
  run(`state.techs.currency = true; state.res.food = 200; state.seen.copper = true;
    supplyDiplomacyRequest('clocklings')`);
  assert.equal(run('state.diplomacy.clocklings.request.res'), 'copper');
  assert.ok(run('state.diplomacy.clocklings.request.amount <= capacityOf("copper")'));
  assert.equal(run('raidLoot("clocklings").includes("machinery")'), true);
});

test('tribal requests never ask for Power capacity and repair legacy Power requests', () => {
  const { run } = game();
  run(`state.seen = { power: true, food: true }; Math.random = () => 0;
    state.diplomacy.human = { disposition: 0, militaryStrength: 100, economicStrength: 100,
      request: { res: 'power', amount: 10, age: era() } };
    ensureDiplomacyEntry('human')`);
  assert.equal(run('state.diplomacy.human.request.res'), 'food');
  assert.notEqual(run('randomDiplomacyRequest("human").res'), 'power');
});

test('new lineages change actual income with both bonuses and tradeoffs', () => {
  const cases = [
    ['dunewalkers', 'currency', 1.30, 'wood', 0.88],
    ['cinderforged', 'iron', 1.20, 'knowledge', 0.88],
    ['thornkin', 'wood', 1.25, 'goods', 0.85 / 1.20],
    ['clocklings', 'tools', 1.20, 'food', 0.88],
    ['glimmerfolk', 'knowledge', 1.15, 'stone', 0.85],
  ];
  for (const [id, bonus, gain, penalty, loss] of cases) {
    const { run } = game();
    run(`state.jobs = { forager: 2, woodcutter: 1, ironminer: 1, thinker: 1, miner: 1, tinkerer: 1 };
      state.res.wood = 100; state.res.stone = 100;
      state.bld.workbench = 1; state.bld.factory = 1; state.bld.steamPlant = 1; state.res.coal = 100;
      state.techs.currency = true; state.tradePartner = 'human';
      const baseline = production(); state.species = '${id}'; const actual = production()`);
    for (const [res, multiplier] of [[bonus, gain], [penalty, loss]]) {
      const upkeep = res === 'food' ? 'state.pop * FOOD_PER_POP' : '0';
      const before = run(`baseline.${res} + ${upkeep}`);
      assert.ok(before > 0, `${id}: ${res} fixture produces output`);
      assert.ok(Math.abs(run(`actual.${res} + ${upkeep}`) - before * multiplier) < 1e-10, `${id}: ${res}`);
    }
  }
});

test('lineage crafting yields honor bonuses, costs, and storage limits', () => {
  for (const [species, recipe, expected] of [
    ['clocklings', 'tools', 1.20], ['clocklings', 'machinery', 1.25],
  ]) {
    const { run } = game();
    run(`state.species = '${species}'; state.bld = { workbench: 1, workshop: 1 };
      state.res.wood = 100; state.res.iron = 100; state.res.coal = 100; state.res.steel = 25;
      state.res['${recipe}'] = 0; doCraft('${recipe}')`);
    assert.equal(run(`state.res['${recipe}']`), expected);
    assert.equal(run(recipe === 'tools' ? 'state.res.wood' : 'state.res.coal'), recipe === 'tools' ? 60 : 80);
    run(`state.res['${recipe}'] = capacityOf('${recipe}') - 0.1; doCraft('${recipe}')`);
    assert.equal(run(`state.res['${recipe}']`), run(`capacityOf('${recipe}')`));
  }
});

test('Forges automatically smelt Steel, throttle on inputs, and migrate old Foundries', () => {
  const { run } = game();
  run(`state.bld.forge = 2; state.techs.metallurgy = true;
    state.res.iron = 100; state.res.coal = 100; state.res.steel = 0;
    const rates = production(1)`);
  assert.equal(run('rates.steel'), 0.08);
  assert.equal(run('rates.iron'), -1.2);
  assert.equal(run('rates.coal'), -0.8);
  run(`state.res.iron = 0.3; state.res.coal = 100; const limited = production(1)`);
  assert.equal(run('limited.steel'), 0.02);
  assert.equal(run('limited.iron'), -0.3);
  run(`state.bld = { foundry: 1 }; state = normalizeSave(state)`);
  assert.equal(run('state.bld.forge'), 1);
  assert.equal(run('state.bld.foundry || 0'), 0);
  assert.equal(run('CRAFTS.some(c => c.id === "steel")'), false);
});

test('Forges can be disabled without consuming inputs or producing Steel', () => {
  const { run } = game();
  run(`state.bld.forge = 2; state.techs.metallurgy = true;
    state.res.iron = 100; state.res.coal = 100; state.res.steel = 0;
    setBuildingPower('forge', 0); const off = production(1)`);
  assert.equal(run('off.steel'), 0);
  assert.equal(run('off.iron'), 0);
  assert.equal(run('off.coal'), 0);
  assert.equal(run("buildingPowerCount('forge')"), 0);
  assert.match(run(`buildFilter = 'power'; renderBuild()`), /data-id="forge"/);
  run(`state = normalizeSave(JSON.parse(JSON.stringify(state))); state.bld.forge = 1`);
  assert.equal(run("buildingPowerCount('forge')"), 0);
});

test('a newly built controllable building starts enabled only when all prior copies were enabled', () => {
  const { run } = game();
  run(`state.techs.metallurgy = true; state.bld.forge = 1; state.buildingPower.forge = 1;
    state.res.stone = 10000; state.res.iron = 10000; state.res.tools = 10000; state.res.currency = 10000;
    doBuild('forge')`);
  assert.equal(run("buildingPowerCount('forge')"), 2);
  run(`setBuildingPower('forge', 1); doBuild('forge')`);
  assert.equal(run("buildingPowerCount('forge')"), 1);
});

test('Steam Plants provide persistent Power capacity and consume 0.8 Coal/s each', () => {
  const { run } = game();
  run(`state.bld.steamPlant = 2; state.res.coal = 100; const rates = production(1); tick(1)`);
  assert.equal(run('rates.power'), 6);
  assert.equal(run('rates.coal'), -1.6);
  assert.equal(run('state.res.power'), 6);
  run('tick(10)');
  assert.equal(run('state.res.power'), 6);
});

test('Living Blocks provide uncapped housing, consume Power, and lower morale', () => {
  const { run } = game();
  run(`state.techs.machineryTech = true; state.bld.livingBlock = 2;
    state.bld.steamPlant = 1; state.res.steel = 100; state.res.stone = 100; state.res.wood = 100;
    const rates = production(1); state.res.food = 100; state.morale = 50;
    state.bld.livingBlock = 0; updateMorale(1, 0); const noBlocks = state.morale;
    state.morale = 50; state.bld.livingBlock = 2; updateMorale(1, 0); const withBlocks = state.morale`);
  assert.equal(run('popCap()'), 16);
  assert.equal(run('rates.power'), 1);
  assert.ok(Math.abs(run('noBlocks - withBlocks') - 0.2) < 1e-10);
  assert.equal(run('BUILDINGS.find(b => b.id === "livingBlock").max'), Infinity);
  assert.equal(run('buildingCost(BUILDINGS.find(b => b.id === "livingBlock")).steel'), 250);
});

test('Hospitals gently support morale below 50', () => {
  const { run } = game();
  run(`state.res.food = 0; state.morale = 49; state.bld.hospital = 0; updateMorale(1, 0); const withoutHospital = state.morale;
    state.morale = 49; state.bld.hospital = 1; updateMorale(1, 0); const withHospital = state.morale;
    state.morale = 49; state.bld.hospital = 2; updateMorale(1, 0); const withTwoHospitals = state.morale;
    state.morale = 50; state.bld.hospital = 0; updateMorale(1, 0); const atThresholdWithout = state.morale;
    state.morale = 50; state.bld.hospital = 1; updateMorale(1, 0); const atThresholdWith = state.morale`);
  assert.ok(Math.abs(run('withHospital - withoutHospital') - 0.01) < 1e-10);
  assert.equal(run('withTwoHospitals'), run('withHospital'));
  assert.equal(run('atThresholdWith'), run('atThresholdWithout'));
});

test('crowding applies a stacking morale penalty beyond 20 villagers', () => {
  const { run } = game();
  run(`state.res.food = 10; state.morale = 70; state.pop = 20; updateMorale(1, 0); const atLimit = state.morale;
    state.morale = 70; state.pop = 23; updateMorale(1, 0); const crowded = state.morale`);
  assert.ok(Math.abs(run('atLimit - crowded') - 0.03) < 1e-10);
  assert.match(run('moraleTooltip()'), /3 villagers beyond 20/);
});

test('morale telemetry exposes live aggregate and component rates at the clamp', () => {
  const { run } = game();
  run(`state.morale = 0; state.res.food = 0; state.pop = 25; state.jobs.performer = 2;
    state.techs.civics = true; state.techs.civicHarmony = true; state.techs.workplaceEthics = true;
    state.bld.quarry = 1; state.jobs.miner = 2;`);
  const telemetry = run('window.emberhold.helpers.morale()');
  assert.equal(telemetry.value, 0);
  assert.equal(telemetry.max, 120);
  assert.ok(telemetry.rate < 0);
  assert.equal(telemetry.rate, run('window.emberhold.helpers.moraleRate()'));
  assert.equal(telemetry.pressures.find(p => p.id === 'population').count, 5);
  assert.equal(telemetry.pressures.find(p => p.id === 'performers').rate, 0.2);
  assert.equal(run('window.emberhold.helpers.marginalMorale("performer")'), 0.1);
  const before = telemetry.rate;
  run('state.randomEventT = 60; state.randomEventNext = 60; Math.random = () => 0; updateRandomEvents(0)');
  assert.equal(run('window.emberhold.helpers.moraleRate()'), before);
});

test('Forge input costs are not scaled by expedition production bonuses', () => {
  const { run } = game();
  run(`state.bld.forge = 1; state.techs.metallurgy = true;
    state.expeditions.grayrocksQuarries = true; state.expeditions.ashfenFires = true;
    state.res.iron = 100; state.res.coal = 100; state.res.steel = 0;
    const detail = {}; production(1, detail)`);
  assert.equal(run(`detail.iron.find(e => e.label.startsWith('Forge inputs')).amount`), -0.6);
  assert.equal(run(`detail.coal.find(e => e.label.startsWith('Forge inputs')).amount`), -0.4);
  run(`EXPEDITIONS.find(e => e.id === 'ashfenFires').mods.forge = 1.25;
    const detailWithForgeBonus = {}; production(1, detailWithForgeBonus)`);
  assert.ok(run(`detailWithForgeBonus.steel[0].factors.some(([label, factor]) => label === 'The Sleeping Fires (Forges)' && factor === 1.25)`));
});

test('expedition production bonuses do not scale outgoing amounts unless explicit', () => {
  const { run } = game();
  run(`state.expeditions.oldForest = true; state.jobs.tinkerer = 1; state.bld.workbench = 1;
    state.trialDone.tinkering = 1;
    const detail = {}; production(1, detail);
    const normalInput = detail.wood.find(e => e.label.startsWith('Tinkerer inputs')).amount`);
  assert.ok(Math.abs(run('normalInput') + 0.069) < 1e-10);
  assert.equal(run("settlementProductionFactors('wood', true).some(([label]) => label === 'The Old Forest')"), false);
  run(`EXPEDITIONS.find(e => e.id === 'oldForest').mods = { outgoing: { wood: 1.25 } };
    const explicit = {}; production(1, explicit)`);
  assert.ok(Math.abs(run("explicit.wood.find(e => e.label.startsWith('Tinkerer inputs')).amount") + 0.08625) < 1e-10);
});

test('factory lines unlock through research, persist in saves, and default safely', () => {
  const { run } = game();
  assert.equal(run("BUILDINGS.find(b => b.id === 'factory').max"), Infinity);
  run(`state.bld.factory = 1; chooseFactoryRecipe('machinery')`);
  assert.equal(run('state.factoryRecipe'), 'goods');
  run(`state.techs.machineryTech = true; chooseFactoryRecipe('machinery'); saveGame(true); state = loadGame()`);
  assert.equal(run('state.factoryRecipe'), 'machinery');
  assert.match(run('renderVillage()'), /Producing Machinery/);
  run(`delete state.factoryRecipe; state = normalizeSave(state)`);
  assert.equal(run('state.factoryRecipe'), 'goods');
  run(`state.factoryRecipe = 'missing'; state = normalizeSave(state)`);
  assert.equal(run('state.factoryRecipe'), 'goods');
});

test('automation API exposes factory recipe definitions', () => {
  const { run } = game();
  assert.equal(
    run('JSON.stringify(window.emberhold.definitions.FACTORY_RECIPES)'),
    JSON.stringify([
      { id: 'goods', name: 'Industrial Goods', rate: 0.08, inputs: {}, tech: null, unlock: 'Always available' },
      { id: 'tools', name: 'Tools', rate: 0.08, inputs: { wood: 3.2 }, tech: 'craftsmanship', unlock: 'Craftsmanship' },
      { id: 'steel', name: 'Steel', rate: 0.04, inputs: { iron: 0.6, coal: 0.4 }, tech: 'metallurgy', unlock: 'Metallurgy' },
      { id: 'machinery', name: 'Machinery', rate: 0.02, inputs: { steel: 0.1, coal: 0.4 }, tech: 'machineryTech', unlock: 'Mechanism' },
    ]),
  );
});

test('factories switch outputs and consume recipe materials without multiplying costs', () => {
  for (const [id, research, output, input, cost] of [
    ['goods', null, 0.08 * 1.2, null, 0],
    ['tools', 'craftsmanship', 0.08, 'wood', 3.2],
    ['steel', 'metallurgy', 0.04, 'iron', 0.6],
    ['machinery', 'machineryTech', 0.02, 'steel', 0.1],
  ]) {
    const { run } = game();
    run(`state.bld.factory = 1; state.bld.steamPlant = 1; state.res.power = 10;
      state.res.wood = 100; state.res.iron = 100; state.res.coal = 100; state.res.steel = 10;
      state.techs['${research}'] = true; chooseFactoryRecipe('${id}'); const rates = production(1)`);
    assert.ok(Math.abs(run(`rates['${id}']`) - output) < 1e-10);
    assert.equal(run('rates.power'), 3);
    if (input) assert.equal(run(`rates['${input}']`), -cost);
    if (id !== 'goods') assert.equal(run('rates.goods'), 0);
  }
});

test('Dynamos boost factory output without multiplying factory input costs', () => {
  const { run } = game();
  run(`state.bld.factory = 1; state.bld.dynamo = 1; state.res.iron = 100; state.res.coal = 100;
    state.res.steel = 0; state.techs.metallurgy = true; chooseFactoryRecipe('steel');
    const detail = {}; const rates = production(1, detail)`);
  assert.ok(Math.abs(run('rates.steel') - 0.046) < 1e-10);
  assert.equal(run('rates.iron'), -0.6);
  assert.equal(run('rates.coal'), -0.4);
  assert.ok(run("detail.steel.find(e => e.label.startsWith('Factories')).factors.some(([label, factor]) => label === 'Dynamos' && factor === 1.15)"));
});

test('Steel Hearted boosts every Steel output path without increasing costs', () => {
  const { run } = game();
  run(`state.bld.factory = 1; state.bld.steamPlant = 1; state.res.power = 10;
    state.res.iron = 100; state.res.coal = 100; state.res.steel = 1000;
    state.techs.metallurgy = true; chooseFactoryRecipe('steel'); updateAchievements(); state.res.steel = 0;
    const factoryDetail = {}; const factory = production(1, factoryDetail);
    state.bld.factory = 0; state.bld.forge = 1; const forgeDetail = {}; const forge = production(1, forgeDetail)`);
  assert.equal(run('state.achievements.steelHearted'), true);
  assert.ok(Math.abs(run('factory.steel') - 0.048) < 1e-10);
  assert.ok(Math.abs(run('forge.steel') - 0.048) < 1e-10);
  assert.equal(run("factoryDetail.iron.find(e => e.label.startsWith('Factory inputs')).amount"), -0.6);
  assert.equal(run("factoryDetail.coal.find(e => e.label.startsWith('Factory inputs')).amount"), -0.4);
  assert.equal(run("forgeDetail.iron.find(e => e.label.startsWith('Forge inputs')).amount"), -0.6);
  assert.equal(run("forgeDetail.coal.find(e => e.label.startsWith('Forge inputs')).amount"), -0.4);
  run('state.res.steel = 999; updateAchievements()');
  assert.equal(run('state.achievements.steelHearted'), true);
});

test('Lightning Metal boosts factory Steel output and input costs', () => {
  const { run } = game();
  run(`state.bld.factory = 1; state.bld.steamPlant = 1; state.res.power = 10;
    state.res.iron = 100; state.res.coal = 100; state.res.steel = 0;
    state.techs.metallurgy = true; state.techs.machineryTech = true;
    chooseFactoryRecipe('steel'); const before = production(1);
    state.techs.lightningMetal = true; const after = production(1)`);
  assert.equal(run('before.steel'), 0.04);
  assert.equal(run('before.iron'), -0.6);
  assert.equal(run('before.coal'), -0.4);
  assert.equal(run('after.steel'), 0.06);
  assert.equal(run('after.iron'), -0.9);
  assert.equal(run('after.coal'), -0.6);
  assert.equal(run("TECHS.find(t => t.id === 'lightningMetal').req()"), true);
});

test('Wonders require beacon hints, scale their search by distinct beacons, and expose six landing-specific definitions', () => {
  const { run } = game();
  assert.equal(run('WONDERS.length'), 6);
  assert.equal(run('new Set(WONDERS.map(w => w.id)).size'), 6);
  assert.equal(run('findWonder()'), false);
  run('state.beaconsLit = { emberplain: true };');
  assert.equal(run('findWonder()'), false);
  run(`state.techs.optics = true; state.beaconsLit = { emberplain: true }; state.beaconRevisited = { emberplain: true };
    state.surveyPoints = 10000; state.res.steel = 10000; state.res.machinery = 10000; state.res.food = 10000;`);
  const oneBeacon = run(`wonderFindCost(wonderDef()).survey`);
  assert.equal(run('wonderResearchCost(wonderDef().researches[0]).knowledge'), 9000);
  run(`state.beaconsLit = Object.fromEntries(LANDINGS.map(l => [l.id, true]));`);
  const sixBeacons = run(`wonderFindCost(wonderDef()).survey`);
  assert.equal(oneBeacon, 576);
  assert.equal(sixBeacons, 336);
  assert.ok(sixBeacons < oneBeacon);
  assert.equal(run('findWonder()'), true);
  assert.equal(run('state.wonders.emberplain.found'), true);
});

test('Rapture work opens the Wonder tab, resets only an emptied active section, and retains completed sections', () => {
  const { run } = game();
  run(`state.techs.optics = true; state.beaconsLit = { emberplain: true }; state.beaconRevisited = { emberplain: true }; state.surveyPoints = 10000;
    state.res.steel = 10000; state.res.machinery = 10000; state.res.food = 10000;
    findWonder(); state.pop = 12;`);
  assert.equal(run('assignRapture(2)'), true);
  assert.equal(run('state.rapture.tabSeen'), true);
  assert.equal(run(`tabUnlocked('wonders')`), true);
  assert.match(run('renderWonder()'), /The Sunwell/);
  assert.match(run('renderWonder()'), /The Mirror Gate/);
  run(`state.wonders.emberplain.sections[0] = true; state.wonders.emberplain.progress = 6; assignRapture(-2);`);
  assert.equal(run('state.wonders.emberplain.sections[0]'), true);
  assert.equal(run('state.wonders.emberplain.progress'), 0);
});

test('Wonder guards can save workers, wounded-only guards face doubled death weight, and fate rewards persist through forced migration', () => {
  const { run } = game();
  run(`state.techs.optics = true; state.beaconsLit = { emberplain: true }; state.beaconRevisited = { emberplain: true }; state.surveyPoints = 10000;
    state.res.steel = 10000; state.res.machinery = 10000; state.res.food = 10000;
    findWonder(); state.pop = 12; state.techs.guards = true; state.bld.barracks = 2;
    state.jobs.guard = 2; assignRapture(1); Math.random = () => 0; resolveWonderIncident();`);
  assert.equal(run('state.pop'), 12);
  assert.equal(run('state.guardInjuries'), 1);
  assert.ok(run(`resolveWonderGuardOutcome.toString().includes('weights.death *= 2')`));
  run(`state.wonders.emberplain.sections = [true, true, true, true, true]; chooseWonderFate('silence');`);
  assert.equal(run('state.hope'), 1);
  assert.equal(run(`state.wonders.emberplain.outcomes.silence`), true);
  assert.notEqual(run('state.landing'), 'emberplain');
  run(`state.bld.steamPlant = 1;`);
  assert.equal(run('production(0).power'), 4);
  run(`state.landing = 'emberplain'; state.wonders.emberplain.found = true;
    state.wonders.emberplain.sections = [true, true, true, true, true]; chooseWonderFate('become');`);
  assert.equal(run('state.ancient'), 1);
  run(`state.landing = 'emberplain'; state.wonders.emberplain.found = true;
    state.wonders.emberplain.sections = [true, true, true, true, true]; chooseWonderFate('restore');
    state.bld.steamPlant = 1;`);
  assert.equal(run('state.hope'), 3);
  assert.equal(run('solarPowerAvailable()'), true);
  assert.equal(run(`BUILDING_BY_ID.get('solarArray').req()`), true);
  assert.equal(run(`state.wonderUnlocks.livingAlloy === true`), false);
  assert.equal(run(`TECHS.find(t => t.id === 'livingAlloy').req()`), false);
  assert.equal(run(`BUILDING_BY_ID.get('alloyMine').req()`), false);
  run(`state.migrating = true; state.hope = 4; buyWonderUnlock('livingAlloy'); state.techs.optics = true;`);
  assert.equal(run('state.hope'), 0);
  assert.equal(run(`state.wonderUnlocks.livingAlloy`), true);
  assert.equal(run(`TECHS.find(t => t.id === 'livingAlloy').req()`), true);
  assert.equal(run(`BUILDING_BY_ID.get('alloyMine').req()`), false);
  run(`state.techs.livingAlloy = true`);
  assert.equal(run(`BUILDING_BY_ID.get('alloyMine').req()`), true);
});

test('every Wonder fate grants the normal migration Echoes', () => {
  for (const choice of ['silence', 'become', 'restore']) {
    const { run } = game();
    run(`state.landing = 'emberplain'; state.pop = 30;
      const record = wonderRecord(); record.found = true;
      record.sections = [true, true, true, true, true];
      chooseWonderFate('${choice}');`);
    assert.equal(run('state.echoes'), 4, choice);
  }
});

test('restored Wonders carry their old purposes into future production', () => {
  const restored = [
    ['greenfold', 'wood', 'Restored Worldroot', 1.25, 'woodcutter'],
    ['floodmeadows', 'food', 'Restored River Crown', 1.20, 'forager'],
    ['ashfen', 'tools', 'Restored Renewal Basin', 1.25, 'tinkerer'],
    ['windmere', 'knowledge', 'Restored Mirrored Orrery', 1.20, 'thinker'],
    ['windmere', 'aether', 'Restored Mirrored Orrery', 1.20, 'astronomer'],
  ];
  for (const [landing, resource, label, factor, job] of restored) {
    const { run } = game();
    run(`state.landing = '${landing}'; state.wonders.${landing} = { outcomes: { restore: true } }; state.jobs.${job} = 1;`);
    const detail = JSON.parse(run(`JSON.stringify((() => { const d = {}; production(1, d); return d; })())`));
    const entry = detail[resource].find(item => item.factors.some(([name]) => name === '${label}'));
    assert.ok(entry, `${landing} should affect ${resource}`);
    assert.equal(entry.factors.find(([name]) => name === '${label}')[1], factor, `${landing} multiplier`);
  }
});

test('selected restored Wonders can preserve a material branch with Hope', () => {
  for (const [landing, unlock, research, building] of [
    ['greenfold', 'heartwood', 'heartwood', 'heartwoodGrove'],
    ['windmere', 'starGlass', 'starGlass', 'starLens'],
    ['ashfen', 'basinTempering', 'basinTempering', null],
  ]) {
    const { run } = game();
    const cost = { heartwood: 3, starGlass: 5, basinTempering: 4 }[unlock];
    run(`state.landing = '${landing}'; state.wonders.${landing} = { outcomes: { restore: true } };
      state.migrating = true; state.hope = ${cost}; buyWonderUnlock('${unlock}'); state.techs.optics = true;`);
    assert.equal(run(`state.wonderUnlocks.${unlock}`), true, `${landing} purchase`);
    assert.equal(run(`TECHS.find(t => t.id === '${research}').req()`), true, `${landing} research`);
    if (building) assert.equal(run(`BUILDING_BY_ID.get('${building}').req()`), false, `${landing} waits for research`);
    run(`state.techs.${research} = true`);
    if (building) assert.equal(run(`BUILDING_BY_ID.get('${building}').req()`), true, `${landing} building`);
    else assert.ok(run(`settlementProductionFactors('steel').some(([name, factor]) => name === 'Basin Tempering' && factor === 1.35)`), `${landing} steel bonus`);
  }
});

test('silencing the Worldroot unlocks expensive Animal Husbandry', () => {
  const { run } = game();
  run(`state.landing = 'greenfold'; state.wonders.greenfold = { outcomes: { silence: true } };
    state.migrating = true; state.echoes = 750; migrationBuy('animalHusbandry');`);
  assert.equal(run("upg('animalHusbandry')"), 1);
  assert.equal(run("BUILDING_BY_ID.get('ranch').req()"), true);
  run(`state.bld.ranch = 1; state.jobs.rancher = 2; const detail = {}; production(1, detail);`);
  assert.equal(run("jobCapacity('rancher')"), 2);
  assert.equal(run('capacityOf(\'fur\')'), 1000);
  assert.ok(run("detail.fur.some(entry => entry.label.startsWith('Ranchers:'))"));
  assert.ok(run("moralePressures().some(entry => entry.id === 'ranch' && entry.rate === 0.008)"));
});

test('silencing the Mirrored Orrery makes Explorers document discoveries', () => {
  const { run } = game();
  run(`state.landing = 'windmere'; state.wonders.windmere = { outcomes: { silence: true } };
    state.trialDone.wayfinding = 1; state.jobs.explorer = 2; const detail = {}; production(1, detail);`);
  assert.equal(run("detail.knowledge.find(entry => entry.label.startsWith('Explorers documenting discoveries')).base"), 0.12);
  run('state.surveyPoints = 0; updateExploration(1)');
  assert.equal(run('state.surveyPoints'), 0.05);
});

test('silencing the River Crown turns Foragers into morale-boosting Farmers without extra Food', () => {
  const { run } = game();
  run(`state.landing = 'floodmeadows'; state.wonders.floodmeadows = { outcomes: { silence: true } };
    state.jobs.forager = 2; const detail = {}; production(1, detail);`);
  assert.equal(run("jobName('forager')"), 'Farmer');
  assert.equal(run("detail.food.find(entry => entry.label.startsWith('Farmer:')).base"), 1.1);
  assert.ok(run("moralePressures().some(entry => entry.id === 'farming' && entry.rate === 0.1)"));
});

test('silencing the Renewal Basin returns factory-made construction materials', () => {
  const { run } = game();
  run(`state.landing = 'ashfen'; state.wonders.ashfen = { outcomes: { silence: true } };
    state.techs.metallurgy = true; state.res.stone = 1000; state.res.iron = 100; state.res.tools = 50; state.res.currency = 100;
    doBuild('forge');`);
  assert.equal(run('state.bld.forge'), 1);
  assert.equal(run('state.res.tools'), 27.5);
});

test('silencing the World Anvil lets Tinkerers run factory recipes slowly', () => {
  const { run } = game();
  run(`state.landing = 'grayrocks'; state.wonders.grayrocks = { outcomes: { silence: true } };
    state.trial = { id: 'tinkering', startDay: 0, daysActive: 0, buildings: 0 };
    state.bld.workbench = 1; state.jobs.woodcutter = 5; state.jobs.tinkerer = 1;
    state.techs.machineryTech = true; state.res.steel = 10; state.res.coal = 100; chooseFactoryRecipe('machinery');
    const detail = {}; production(1, detail);`);
  assert.equal(run('factoryRecipe().id'), 'machinery');
  assert.equal(run("detail.machinery.find(entry => entry.label.startsWith('Tinkerers')).base"), 0.01);
  assert.equal(run("detail.steel.find(entry => entry.label.startsWith('Tinkerer inputs')).base"), -0.05);
  assert.equal(run("jobProduction('tinkerer')"), 0.01);
  run(`state.techs.craftsmanship = true; state.res.wood = 100; chooseFactoryRecipe('tools'); const toolDetail = {}; production(1, toolDetail);`);
  assert.equal(run("toolDetail.tools.find(entry => entry.label.startsWith('Tinkerers')).base"), 0.025);
  assert.equal(run("toolDetail.wood.find(entry => entry.label.startsWith('Tinkerer inputs')).base"), -0.06);
});

test('factories throttle to available materials and storage and stop without Power capacity', () => {
  const { run } = game();
  run(`state.bld.factory = 2; state.bld.steamPlant = 1; state.techs.machineryTech = true; chooseFactoryRecipe('machinery');
    state.res.steel = 0.01; state.res.coal = 10; state.res.power = 10;
    const limited = production(5)`);
  assert.ok(Math.abs(run('limited.machinery * 5') - 0.002) < 1e-10);
  assert.ok(Math.abs(run('limited.steel * 5') + 0.01) < 1e-10);
  run(`state.res.steel = 10; state.res.machinery = capacityOf('machinery'); const full = production(5)`);
  assert.equal(run('full.machinery'), 0);
  assert.equal(run('full.power'), 3);
  run(`state.res.machinery = 0; state.bld.steamPlant = 0; state.res.power = 10; const unpowered = production(5)`);
  assert.equal(run('unpowered.machinery'), 0);
  assert.equal(run('unpowered.steel'), 0);
});
