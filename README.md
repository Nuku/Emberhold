# Emberhold

A text-only incremental game in the spirit of Kittens Game and Evolve Idle.
Everything produces over time; nothing needs rapid clicking. Open `index.html`
in a browser (or serve the folder and visit it) and leave it running — the
village plays on while you're away.

## Running it

- Double-click `index.html`, or
- `python -m http.server 8419` in this folder, then open <http://localhost:8419/>

Saves go to `localStorage` (autosave every 15 s) with Export/Import strings
for backups. Time away is banked for double-speed play, capped at
24 hours. The timer above Updates spends one banked second per real second of play.

Imports are validated before replacing the stored chronicle. If a manual save
fails (for example, because browser storage is full), the Chronicle reports it;
use Export to keep a backup. Loading older saves repairs worker assignments to
match the current population, job unlocks, and guard capacity.

## Development checks

Run `npm test` with Node.js. The dependency-free engine regression
suite covers starvation, specialist assignments, guard limits, older saves,
invalid imports, storage failures, and offline time accounting.

## How it plays

- **Flow over time.** Villagers are assigned to jobs (forager, woodcutter,
  miner, thinker, tinkerer…). Every villager eats. Population grows on a food surplus
  and starves when the store runs dry.
  Fertility Rites research (50 Knowledge) cuts growth time by 25%. Hospital research
  (150 Knowledge, after Stone Working and Craftsmanship) unlocks Hospitals:
  each of up to 10 levels multiplies population growth and Guard healing timers
  by 0.9, stacking with Fertility Rites for growth.
- **Seasons.** A year is 200 in-game days (~100 real seconds). Autumn slows
  the fields and **winter halves them** — keep a store.
- **Morale.** The settlement's 0–100 morale rises when food is secure and falls
  during shortages and winter. It ranges from −30% to +13% production, with
  the Shrine improving recovery; diplomacy and successful raids can hearten the
  people while defeats shake them. The Amphitheatre unlocks Performers, who
  occupy villagers but steadily lift the settlement's spirits. Civic Festivals
  and Civic Harmony later raise Morale's ceiling beyond 100.
- **Happenings.** Unscheduled events appear in the Chronicle: most are small
  setbacks to morale, but occasional performances, discoveries, and ridiculous
  goose-related incidents give the village something to celebrate.
  Half of happenings draw from the current lineage's own stories: every lineage
  has one purely atmospheric scene and one with small potential effects. Chronicle
  entries report actual changes after storage and morale limits; undiscovered
  resources are never awarded or revealed by these events.
- **Eras.** Research moves Emberhold through Age of Ember → Stone → Iron →
  Steam → Light. Each era unlocks new resources (stone, copper, tools, iron,
  coal, steel, machinery, aether) and buildings. Copper appears in trace
  amounts during the Age of Stone, then grows richer through prospecting,
  metallurgy, and electrical engineering.
- **Neighbors and trade.** Humans are Emberhold's default tribe. After a
  migration, one tribe appears nearby, subject to habitat. An Explorer discovers
  a second trading partner at 1,000 Survey points, and the Age of Iron brings a
  third; later contacts tend to have stronger militaries and economies. Currency
  makes trade with each local contact possible, while Banking unlocks Money Lenders
  and Bankers. Each Money Lender supports one Banker and produces Currency based on
  the settlement's population.
  Steel-age buildings and later require Currency as well as materials.
- **Lineages.** Emberborn are always available and produce Industrial Goods more
  efficiently. Stonekin, Marshfolk, Skyborn, and Mephit lineages are earned by
  migrating while the matching tribe is allied (disposition 80+), then can be
  chosen freely during future migration preparations. Mephits specialize in
  defense: their settlements repel raids more effectively, recover longer before
  another raid, and leave attackers especially injured if they break through.
  Five further tribes offer their own requests, raid loot, and unlockable lineages:
  - **Dunewalkers:** desert merchants; +30% Currency, +15% Copper, −12% Wood.
  - **Cinderforged:** volcanic smiths; +20% Iron, Coal, and Steel, −12% Knowledge.
  - **Thornkin:** living forest villages; +25% Wood, +15% Food, −15% Steel and Industrial Goods.
  - **Clocklings:** precision inventors; +20% Tools, +25% Machinery, −12% Food.
  - **Glimmerfolk:** crystal astronomers; +30% Aether, +15% Knowledge, −15% Stone and Iron.
  Their diplomatic requests favor supplies suited to their culture, falling back
  to discovered resources when those supplies are unavailable. Diplomacy shows
  each tribe's story and lineage traits before you commit to an alliance.
- **Animal lineages.** Twenty animal tribes use the same disposition 80+ migration
  unlock. Each has production bonuses and tradeoffs shown in Diplomacy and migration:
  - **Rivers and lakes (Floodmeadows, Windmere):** Otterfolk, Beaverkin, Turtlefolk,
    Axolotlkin, Carpfolk.
  - **Wetlands (Floodmeadows, Ashfen, Windmere):** Frogfolk, Heronkin.
  - **Forests (Greenfold):** Squirrelfolk, Owlkin.
  - **Mountains (Grayrocks):** Ibexkin, Eaglefolk.
  - **Forests or mountains:** Bearfolk, Lynxfolk.
  - **Plains (Emberplain, Floodmeadows):** Rabbitfolk, Bisonkin.
  - **Forests or plains:** Deerkin.
  - **Any landing:** Foxfolk, Wolfkin, Molekin, Raccoonfolk.
  Habitat specialists only enter the random neighbor pool in suitable places and,
  once unlocked, remain visible but greyed out for unsuitable destinations.
  Incompatible destinations are also disabled for the chosen lineage. Choices are
  never automatically replaced; departure is blocked until the combination is valid.
  Unlocks and established diplomatic contacts persist; trials retain the current
  location and lineage. Ashfen has marsh habitat but lacks the abundant open water
  required by the fully aquatic lineages.
- **Industry.** The Trial of Industrialization unlocks the Factory for its
  duration; build it and produce 100 Industrial Goods. During the trial, coal
  emerges at 20% of its usual rate, and morale below 40 can trigger a riot that
  destroys part of the stored coal.
  Steam Plants and Dynamos provide Power capacity, while factories use that
  capacity without draining a Power store or needing workers. Factories run
  when enough capacity is available and shut off when it is not. Completing the trial makes factories permanent.
  In the Village, switch all factories between Industrial Goods (the default),
  Tools (Craftsmanship), Steel (Metallurgy), and Machinery (Mechanism).
  Each Steam Plant provides 3 Power capacity, each Wind Device provides 1 Power capacity without fuel, and each factory requires 1.5 Power capacity.
  Tools use Wood, Steel uses Iron and Coal,
  and Machinery uses Steel and Coal. Steel is smelted automatically by scalable
  Forges; it is no longer a hand-crafted item. Recipe cards show output and input rates. Lineage and governance
  bonuses affect output, while input costs stay fixed. Production slows when
  supplies run short and pauses when storage fills. Your selection is saved;
  a new settlement starts with Industrial Goods selected.
- **Industrial Goods are the backbone of late construction.** Dynamos, Vaults,
  Observatories, and the Beacon all require Factory output in addition to their
  other materials.
- **Diplomacy.** Contacted tribes have dispositions, make requests in tones
  ranging from pleas to demands, and gain 15 relations when their requests are met.
  Age-of-Iron Diplomacy unlocks Diplomats, who can be assigned to individual
  tribes, each adding 3 relations per minute. Random diplomatic events grant
  5–10 relations or lose 2–4; only hostile tribes (below 0) may raid the village.
- **Governance.** Civic Law unlocks five mutually exclusive settlement policies
  such as Common Granaries, Merchant Charter, and War Council. Each policy change
  starts a one-hour cooldown that continues offline and resets on migration.
  The Council adds
  one Governor and two paid advisor seats; their bonuses reset when a new
  Emberhold is founded, keeping each migration a fresh political build.
- **Guards.** Guards hunt while keeping watch, producing Food even in winter,
  though each one has a Food upkeep. They are separate from villagers and do
  not use worker slots or population capacity. One Guard recruits automatically
  every 120 seconds, including replacements for losses, up to Barracks capacity.
  Training Yard research unlocks Training Yards, each reducing replacement time
  by 10% compounding with no cap.
  Weaponry and Weapon Efficiency improve their hunting yield.
- **Expanding the field.** One-time **Expeditions** (Old Forest, Foothills,
  Sunken Ruins, Ember Vein, Glacial Peaks) permanently add passive income and
  are prerequisites for late buildings like the Observatory.
- **Wayfinding.** A Stone-age Trial of Wayfinding, exposed after the Quarry,
  unlocks Explorers once the Old Forest is mapped. Explorers generate Survey
  points; each migration spends 3, then 9, then 27 points to reveal up to four
  possible landings instead of accepting a single unknown destination.
- **Compounding back-path ease.** Tools, Tinkerers, Shrines, Factories and stored
  Machinery all raise production everywhere; Frugality/Blueprints cut
  building costs.
- **Capped stores.** Every store except Knowledge and Power has a ceiling;
  Currency starts with a 2,000-unit cap and each Banker raises it by 10%.
  Material stores have ceilings raised
  by buildings and upgrades, and surplus
  flowing into a full store is wasted. The **Storehouse** (wood, costs that
  multiply ×2.1 each) raises food/wood/stone/tools capacity; the **Deep
  Store** (Age of Iron) covers iron/coal/steel; the **Vault** (Age of Steam)
  covers machinery/aether. The repeatable Trial of the Overflow and the
  Blueprints reward are the main help in affording them.
- **Endgame.** Research Optics and build **The Beacon** to finish the
  chronicle — then keep playing.

## Automation power API

Factory production lines are available at
`window.emberhold.definitions.FACTORY_RECIPES`. Each recipe provides its `id`,
`name`, output `rate` per factory per second, material `inputs`, required
`tech` (or `null`), and display `unlock` text. Filter entries using the
technology IDs in `api.getState().techs`, then select an unlocked line with
`api.actions.chooseFactoryRecipe(recipeId)`.

`window.emberhold.getPower()` returns live power capacity, also included as
`window.emberhold.getState().power` and in subscription event snapshots:

- `generated`: capacity supplied by generators.
- `used`: capacity charged to active Living Blocks, dig sites, and factories.
- `available`: remaining capacity, clamped to zero.
- `requested`: demand from all enabled power buildings, including unsupplied buildings.
- `shortfall`: requested capacity beyond generation, clamped to zero.
- `buildings`: owned buildings with unlocked power controls, keyed by building ID.
  Each entry provides `built`, `enabled`, `active`, `powerPerBuilding`,
  `requested`, `used`, `resource`, and `productionBonus` (a fraction: `0.1` = +10%).

Power controls are available for Living Blocks and Factories as well as Awaken
Ancients dig sites. Existing saves keep those buildings enabled by default.

```js
const api = window.emberhold;
const power = api.getPower();
api.actions.setBuildingPower('quarry', 1); // Enable one owned Quarry.
api.action('setBuildingPower', 'quarry', 0); // Turn its power off.
```

The action accepts a finite numeric count, floors it, and clamps it from zero
to the owned building count. It returns `true` for supported, unlocked controls,
or `false` for an unsupported building, locked research, or invalid count.
Changes refresh the UI and emit the standard action event. Enabled counts are
saved; active counts reflect current supply. Returned snapshots are detached
from game state and are calculated immediately, without waiting for a tick.

### Morale telemetry API

`window.emberhold.helpers.morale()` returns the live morale value, ceiling,
current rate in morale per second, and detached component values:

```js
const morale = window.emberhold.helpers.morale();
// { value, max, rate, pressures: [{ id, label, count?, rate }] }
```

`moraleRate()` and `moraleBreakdown()` provide the aggregate and component
values directly. `marginalMorale('performer')` returns the current per-unit
effect of adding one performer. These values remain available when morale is
clamped at zero and describe ongoing rates only; one-time event changes are
reported through the normal event log and action state updates.

### Combat and espionage API

The diplomacy records in `api.getState().diplomacy[id]` include the saved fields
`disposition`, `conquered`, `siegeReady`, `militaryStrength`,
`militaryBaseStrength`, `militaryKnown`, `economicStrength`, `economicKnown`,
`espionageT`, and `spies`. The stable derived fields are:

- `hostile`: `disposition < 0`; `conquered`: the nation has been taken.
- `conquerable`: `siegeReady && !conquered`.
- `enemyAttack` and `enemyDefense`: the current military strength used by the
  combat model. `knownEnemyAttack`/`knownEnemyDefense` are that value when
  `militaryKnown` is true, otherwise `null`.
- `siegeDefense` and `fortification`: current military strength × the Siege
  stage difficulty (3.8).
- `espionageReduction` and `espionageReductionLevel`: base military strength
  minus current strength; `maximumEspionageReduction` and
  `maximumEspionageReductionLevel`: base strength minus the floor (60).

The public action names and signatures are:

```js
api.actions.sendSpy(nationId)                 // train and assign one spy
api.actions.startEspionage(nationId)          // begin a 20-minute attempt
api.actions.attack(nationId, stageId='raid', guardCount=api.helpers.guardLimits().healthy)
api.actions.siege(nationId, guardCount=api.helpers.guardLimits().healthy)
api.actions.conquer(nationId)                 // consumes 15 healthy Guards, 200 Food, 10 Tools
```

`raid`, `spyHire`, and `espionage` remain compatibility aliases. `stageId` is
one of `raid`, `foray`, `skirmish`, `assault`, `offensive`, `breakthrough`,
`breach`, or `siege`. An attack returns `{ ok, action, target, stage,
succeeded, deployedGuards, force, difficulty, chance, deaths, injuries, cost }`;
failed validation returns `{ ok:false, reason }`. Siege is the same attack
action with `stageId: 'siege'`; a successful siege sets `siegeReady`, and
conquest returns `{ ok:true, action:'conquer', target, deployedGuards:15,
cost:{food:200,tools:10} }`. `api.helpers.conquestCost()` returns the current
one-time resource cost before attempting conquest.

`guardCount` is the number of healthy Guards committed, from
`api.helpers.guardLimits()` (`minimum`, `maximum`, and `healthy`). Combat
planning helpers are `guardAttackPower(count)`, `guardSiegePower(count)`,
`predictAttack(nationId, stageId, count)`, `predictSiege(nationId, count)`,
`canWinAttack(nationId, stageId, count)`, and `canWinSiege(nationId, count)`.
Predictions expose `{ chance, likelyWin, force, difficulty, deployedGuards }`;
`likelyWin` means the modeled chance is at least 50%, not a guarantee.

```js
const api = window.emberhold;
const id = 'stonekin';
const plan = api.helpers.predictSiege(id, api.helpers.guardLimits().healthy);
if (plan.likelyWin) {
  const result = api.actions.siege(id, plan.deployedGuards);
  console.log(result.deployedGuards, result.succeeded, result.chance);
}
api.actions.sendSpy(id);
api.actions.startEspionage(id);
```

## The Great Migration (the loop)

Once the Monument stands, the village may be abandoned and founded anew.
Declaring a migration grants **Echoes** based on the population left behind —
`floor((villagers − 10)² ÷ 100)` (pop 20 → 1, pop 40 → 9, pop 80 → 49).
Leaving more people behind is the incentive to grow wide before starting over.

What endures: trials and their rewards, expeditions, Echoes, and anything
bought in the **Ancestral Shop**. What resets: research, villagers, all
resources, and all buildings.

Declaring the migration is one-way: the scout reports are rolled and locked
immediately, but the village must still prepare the road before it can leave.
Four preparations—food, caravan timber, stone roadwork, and departure tools—
are each filled from 0% to 100% in one-percent commitments. Each commitment
spends only its small share of the total cost, letting the village gather and
pack the required resources over time. Only after all four reach 100% can
"Set out" found the new Emberhold. While this preparation is underway (and
only then), shop points can be **bought and refunded freely** — a full respec
each loop, ideal for tuning before swearing a trial.

Shop upgrades: Deep Roots (+5% all production ×5), Wandering Kin (+2 starting
villagers and +2 population cap ×5), Grand Designs (+1 Hut cap ×3), Deep Cellars (+15% storage ×3),
Clever Storage (+1% all storage per level, with an uncapped rising Echo cost),
Lorekeepers (start with Library + Knowledge), Pack Caravans (start with
supplies), Oathkeepers (repeatable trials +1 use each), Old Maps (expeditions
−25% cost).

## Landings

Each of the six landings has a unique, one-time expedition requiring 18 villagers
and supplies from a developed settlement there. The First Roads (Emberplain)
and Living Channels (Floodmeadows) each grant +10% food; Heartwood Grove
(Greenfold) grants +10% wood; High Quarries (Grayrocks) grants +10% stone and
+5% iron; Sleeping Fires (Ashfen) grants +10% coal; Mirrored Sky (Windmere)
grants +10% knowledge and +5% aether. These rewards stack and persist through
migrations and trials, applying at every landing. Completing all six grants
another +5% to all production. The expedition list tracks progress, and scout
reports show which destination expeditions remain unexplored.

Where a migration ends up is decided by the road, not the village — revealed
only on arrival. The landing multiplies production of its resources (expedition
passive income included); food *consumption* is never modified, only growth:

| Landing | Modifiers |
|---|---|
| The Emberplain | none — the starting country |
| The Greenfold | +25% wood, −20% stone, −20% iron |
| The Grayrocks | +30% stone, +25% iron, −20% food |
| The Floodmeadows | +25% food, −15% wood |
| The Ashfen | +35% coal, −15% food |
| The Windmere | +20% knowledge, +15% aether, −10% food |

You never land in the country you just left. Where you currently stand shows
in the header and atop the Village tab. (Later design space: some control
over the destination.)

## Trials (challenge modes)

Unlocked by the **Monument** (Age of Iron). One trial at a time; failing costs
nothing but time. Rewards are permanent and the later-era balance assumes
you'll have them.

| Trial | Type | While sworn | Goal | Reward |
|---|---|---|---|---|
| Scarcity | ×5 | stormy throughout; food and wood penalties and mining-worker losses worsen with each completion | stay fed 240 days | +10% food each |
| Frugality | ×3 | building costs +50% | 12 constructions | −10% building costs each |
| Overflow | ×3 | no new storage or storage bonuses | every discovered store full at once | +20% storage ceilings each |
| Tinkering | once | no manual Tool crafting | have a Tinkerer still assigned when 240 days run out, with a Workbench | unlocks Tinkerers, who steadily assemble Tools from wood and stone |
| Silence | once | no knowledge production | research Metallurgy and produce 100 Steel | Thinkers +50% |
| Long Night | once | the entire trial is winter; food ×0.25 | survive a year | Everwarm (mild winters, +5% all) |
| Solitude | once | population capped at 10 | stockpile 800 knowledge | Huts grant +2 cap each |
| Haste | once | all production −30% | reach Age of Light in 20,000 days | Blueprints (−15% building costs) |
| Industrialization | once | coal production −80%; low morale can trigger coal riots | produce 100 Industrial Goods, no deadline | factories remain available permanently |
| Conquest | once, after Hope or Ancient | three nearby nations begin at 0 relations and cannot be reconciled | conquer all three nations | +10% Guard recruitment speed permanently |

## Files

- `index.html` — shell and layout
- `style.css` — the amber-on-dark text look
- `js/data.js` — all content and balance (resources, jobs, buildings, techs,
  crafts, trials, expeditions)
- `js/game.js` — engine (tick, production, trials, saves) and the UI renderer

Repeatable trials get harder after each success, including Oathkeepers runs: Scarcity's food multiplier is divided by 1.25, Frugality's cost multiplier increases by 50%, and Overflow's storage targets increase by 25% while sworn (in addition to permanent rewards). Trial cards show current restrictions; the table shows the first run. Failures do not increase difficulty.
