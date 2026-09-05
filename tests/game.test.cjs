const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function game() {
  const storage = new Map();
  const context = vm.createContext({
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

test('Aphrodisiac and Hospitals unlock, compound timers, and persist through saves', () => {
  const { run } = game();
  assert.equal(run('popGrowthNeed()'), 36);
  assert.equal(run('guardHealingNeed()'), 90);
  run("state.res.knowledge = 1000; doResearch('hospital'); doBuild('hospital')");
  assert.equal(run("tech('hospital')"), false);
  assert.equal(run("bld('hospital')"), 0);
  run("doResearch('aphrodisiac')");
  assert.equal(run('popGrowthNeed()'), 27);
  assert.equal(run('guardHealingNeed()'), 90);
  run(`doResearch('stoneWorking'); doResearch('craftsmanship'); doResearch('hospital');
    state.res.wood = 10000; state.res.stone = 10000; state.res.tools = 1000`);
  for (let level = 1; level <= 5; level++) {
    run("doBuild('hospital')");
    assert.equal(run("bld('hospital')"), level);
    assert.ok(Math.abs(run('popGrowthNeed()') - 27 * 0.9 ** level) < 1e-10);
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

test('resource breakdown reconciles income and costs with scoped modifiers', () => {
  const { run } = game();
  run(`state.jobs = { forager: 3, guard: 2, tinkerer: 1, woodcutter: 2 };
    state.guardInjuries = 1; state.morale = 50; state.day = DAYS_PER_SEASON * 3;
    state.bld.shrine = 2; state.bld.foragerLodge = 1; state.techs.weaponry = true;
    state.techs.civics = true; state.policy = 'warCouncil'; state.council = ['granaryKeeper'];
    state.expeditions.oldForest = true; state.res.wood = 100; state.res.stone = 100;
    const detail = {}; const rates = production(0.25, detail)`);
  const expected = run(`((3 * JOBS.forager.base * allMult() * seasonMult() * 1.1
    + ableGuards() * JOBS.guard.base * allMult() * 1.5 - 2 * JOBS.guard.upkeep)
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
  assert.ok(run('detail.power[0].amount === 0'));
  run(`state.techs.machineryTech = true; chooseFactoryRecipe('machinery');
    state.res.power = 10; state.res.machinery = capacityOf('machinery'); production(0.25, detail)`);
  assert.ok(run(`detail.machinery[0].factors.some(([label, factor]) => label.includes('storage space') && factor === 0)`));
  run(`state.jobs.woodcutter = 1; state.res.wood = capacityOf('wood'); const fullRates = production(0.25, detail)`);
  assert.ok(run(`resourceRateTooltip(RESOURCES.find(r => r.id === 'wood'), fullRates.wood, detail.wood).includes('excess net income is wasted')`));
  assert.ok(run(`renderStores().includes('tabindex="0" data-tooltip=')`));
  run('state.jobs = {}');
  assert.ok(run(`renderStores().includes('>0/s</span>')`));
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
  run('saveGame(true)');
  const before = run('localStorage.getItem(SAVE_KEY)');
  for (const mutation of ['s.res = null', 's.jobs = []', 's.pop = -1', 's.res.food = "bad"', 's.log = [null]', 's.diplomacy.human = null', 's.trial = { id: "missing" }']) {
    const bad = run(`JSON.stringify((() => { const s = defaultState(); ${mutation}; return s; })())`);
    context.window.prompt = () => Buffer.from(bad).toString('base64');
    run('importSave()');
    assert.equal(run('localStorage.getItem(SAVE_KEY)'), before, mutation);
  }
});

test('save failure is visible and does not change the last save timestamp', () => {
  const { run, context } = game();
  run('state.savedAt = 123');
  context.localStorage.setItem = () => { throw new Error('quota'); };
  assert.equal(run('saveGame(false)'), false);
  assert.equal(run('state.savedAt'), 123);
  assert.match(run('state.log[0].t'), /could not be saved/);
});

test('offline simulation uses the elapsed interval at real time', () => {
  const { run } = game();
  run('Date.now = () => 100000; state.savedAt = 39000; offlineProgress()');
  assert.equal(run('state.day'), 122);
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
    assert.match(run('renderDiplomacy()'), new RegExp(run(`lineageDef('${id}').effect`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Great Migration resets research and research-derived armor', () => {
  const { run } = game();
  run(`state.techs.weaponry = true; state.techs.leatherArmor = true;
    state.armor = 3; state.migrating = true; setOut()`);
  assert.equal(run('Object.keys(state.techs).length'), 0);
  assert.equal(run('state.armor'), 0);
  assert.equal(run('state.era'), 1);
});

test('tribal requests use discovered cultural preferences and renew after supplying', () => {
  const { run } = game();
  run(`Math.random = () => 0; state.seen = { food: true };
    ensureDiplomacyEntry('clocklings')`);
  assert.equal(run('state.diplomacy.clocklings.request.res'), 'food');
  run(`state.techs.currency = true; state.res.food = 200; state.seen.copper = true;
    supplyDiplomacyRequest('clocklings')`);
  assert.equal(run('state.diplomacy.clocklings.request.res'), 'copper');
  assert.ok(run('state.diplomacy.clocklings.request.amount <= capacityOf("copper")'));
  assert.equal(run('raidLoot("clocklings").includes("machinery")'), true);
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
      state.bld.workbench = 1; state.bld.factory = 1; state.res.power = 10;
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

test('lineage crafting yields honor bonuses, penalties, costs, and storage limits', () => {
  for (const [species, recipe, expected] of [
    ['clocklings', 'tools', 1.20], ['clocklings', 'machinery', 1.25],
    ['cinderforged', 'steel', 1.20], ['thornkin', 'steel', 0.85],
  ]) {
    const { run } = game();
    run(`state.species = '${species}'; state.bld = { workbench: 1, foundry: 1, workshop: 1 };
      state.res.wood = 100; state.res.iron = 100; state.res.coal = 100; state.res.steel = 25;
      state.res['${recipe}'] = 0; doCraft('${recipe}')`);
    assert.equal(run(`state.res['${recipe}']`), expected);
    assert.equal(run(recipe === 'tools' ? 'state.res.wood' : 'state.res.coal'), recipe === 'tools' ? 60 : recipe === 'steel' ? 90 : 80);
    run(`state.res['${recipe}'] = capacityOf('${recipe}') - 0.1; doCraft('${recipe}')`);
    assert.equal(run(`state.res['${recipe}']`), run(`capacityOf('${recipe}')`));
  }
});

test('factory lines unlock through research, persist in saves, and default safely', () => {
  const { run } = game();
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

test('factories switch outputs and consume recipe materials without multiplying costs', () => {
  for (const [id, research, output, input, cost] of [
    ['goods', null, 0.08 * 1.2, null, 0],
    ['tools', 'craftsmanship', 0.08, 'wood', 3.2],
    ['steel', 'metallurgy', 0.04, 'iron', 0.6],
    ['machinery', 'machineryTech', 0.02, 'steel', 0.1],
  ]) {
    const { run } = game();
    run(`state.bld.factory = 1; state.res.power = 10;
      state.res.wood = 100; state.res.iron = 100; state.res.coal = 100; state.res.steel = 10;
      state.techs['${research}'] = true; chooseFactoryRecipe('${id}'); const rates = production(1)`);
    assert.ok(Math.abs(run(`rates['${id}']`) - output) < 1e-10);
    assert.equal(run('rates.power'), -0.35);
    if (input) assert.equal(run(`rates['${input}']`), -cost);
    if (id !== 'goods') assert.equal(run('rates.goods'), 0);
  }
});

test('factories throttle to available materials and storage and stop without power', () => {
  const { run } = game();
  run(`state.bld.factory = 3; state.techs.machineryTech = true; chooseFactoryRecipe('machinery');
    state.res.steel = 0.01; state.res.coal = 10; state.res.power = 10;
    const limited = production(5)`);
  assert.ok(Math.abs(run('limited.machinery * 5') - 0.002) < 1e-10);
  assert.ok(Math.abs(run('limited.steel * 5') + 0.01) < 1e-10);
  run(`state.res.steel = 10; state.res.machinery = capacityOf('machinery'); const full = production(5)`);
  assert.equal(run('full.machinery'), 0);
  assert.equal(run('full.power'), 0);
  run(`state.res.machinery = 0; state.res.power = 0; const unpowered = production(5)`);
  assert.equal(run('unpowered.machinery'), 0);
  assert.equal(run('unpowered.steel'), 0);
});
