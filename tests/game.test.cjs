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
