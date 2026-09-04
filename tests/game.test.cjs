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

test('old saves receive new resources and researched armor', () => {
  const { run } = game();
  run('delete state.res.goods; delete state.armor; delete state.diplomats; state.techs.leatherArmor = true; state = normalizeSave(state)');
  assert.equal(run('state.res.goods'), 0);
  assert.equal(run('state.armor'), 1);
  assert.equal(run('totalDiplomats()'), 0);
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

test('offline simulation uses only the elapsed half-speed interval', () => {
  const { run } = game();
  run('Date.now = () => 100000; state.savedAt = 39000; offlineProgress()');
  assert.equal(run('state.day'), 61);
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
      const index = TRIBES.filter(t => t.id !== 'human').findIndex(t => t.id === target);
      let rolls = [0, (index + 0.5) / (TRIBES.length - 1)];
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
