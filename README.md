# Emberhold

A text-only incremental game in the spirit of Kittens Game and Evolve Idle.
Everything produces over time; nothing needs rapid clicking. Open `index.html`
in a browser (or serve the folder and visit it) and leave it running — the
village plays on while you're away.

## Running it

- Double-click `index.html`, or
- `python -m http.server 8419` in this folder, then open <http://localhost:8419/>

Saves go to `localStorage` (autosave every 15 s) with Export/Import strings
for backups. On return, offline progress is simulated at half speed, capped at
8 hours.

Imports are validated before replacing the stored chronicle. If a manual save
fails (for example, because browser storage is full), the Chronicle reports it;
use Export to keep a backup. Loading older saves repairs worker assignments to
match the current population, job unlocks, and guard capacity.

## Development checks

Run `node tests/game.test.cjs` with Node.js. The dependency-free engine regression
suite covers starvation, specialist assignments, guard limits, older saves,
invalid imports, storage failures, and offline time accounting.

## How it plays

- **Flow over time.** Villagers are assigned to jobs (forager, woodcutter,
  miner, thinker, tinkerer…). Every villager eats. Population grows on a food surplus
  and starves when the store runs dry.
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
- **Eras.** Research moves Emberhold through Age of Ember → Stone → Iron →
  Steam → Light. Each era unlocks new resources (stone, copper, tools, iron,
  coal, steel, machinery, aether) and buildings. Copper appears in trace
  amounts during the Age of Stone, then grows richer through prospecting,
  metallurgy, and electrical engineering.
- **Neighbors and trade.** Humans are Emberhold's default tribe. After a
  migration, one of nine nonhuman tribes may appear nearby. Currency makes
  trade possible, while Banking unlocks Bankers who increase incoming funds.
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
- **Industry.** The Trial of Industrialization unlocks the Factory for its
  duration; build it and produce 100 Industrial Goods before the deadline.
  Steam Plants and Dynamos generate Power, while factories consume it without
  needing workers. Completing the trial makes factories permanent.
  In the Village, switch all factories between Industrial Goods (the default),
  Tools (Craftsmanship), Steel (Metallurgy), and Machinery (Mechanism).
  Each factory consumes 0.35 Power/s. Tools use Wood, Steel uses Iron and Coal,
  and Machinery uses Steel and Coal, at the same base material ratios as hand
  crafting. Recipe cards show output and input rates. Lineage and governance
  bonuses affect output, while input costs stay fixed. Production slows when
  supplies run short and pauses when storage fills. Your selection is saved;
  a new settlement starts with Industrial Goods selected.
- **Industrial Goods are the backbone of late construction.** Dynamos, Vaults,
  Observatories, and the Beacon all require Factory output in addition to their
  other materials.
- **Diplomacy.** Contacted tribes have dispositions, make requests in tones
  ranging from pleas to demands, and may improve when their requests are met.
  Age-of-Iron Diplomacy unlocks Diplomats, who can be assigned to individual
  tribes; random diplomatic events can help or harm relations.
- **Governance.** Civic Law unlocks five mutually exclusive settlement policies
  such as Common Granaries, Merchant Charter, and War Council. The Council adds
  one Governor and two paid advisor seats; their bonuses reset when a new
  Emberhold is founded, keeping each migration a fresh political build.
- **Guards.** Guards hunt while keeping watch, producing Food even in winter,
  though each one has a Food upkeep. They are separate from villagers and do
  not use worker slots or population capacity. One Guard recruits automatically
  every 120 seconds, including replacements for losses, up to Barracks capacity.
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
- **Capped stores.** Every store except Knowledge, Currency, Power, and
  Industrial Goods has a ceiling; surplus
  flowing into a full store is wasted. The **Storehouse** (wood, costs that
  multiply ×2.1 each) raises food/wood/stone/tools capacity; the **Deep
  Store** (Age of Iron) covers iron/coal/steel; the **Vault** (Age of Steam)
  covers machinery/aether. The repeatable Trial of the Overflow and the
  Blueprints reward are the main help in affording them.
- **Endgame.** Research Optics and build **The Beacon** to finish the
  chronicle — then keep playing.

## The Great Migration (the loop)

Once the Monument stands, the village may be abandoned and founded anew.
Declaring a migration grants **Echoes** based on the population left behind —
`floor((villagers − 10)² ÷ 100)` (pop 20 → 1, pop 40 → 9, pop 80 → 49).
Leaving more people behind is the incentive to grow wide before starting over.

What endures: trials and their rewards, expeditions, Echoes, and anything
bought in the **Ancestral Shop**. What resets: research, villagers, all
resources, and all buildings.

While the migration is being prepared (and only then), shop points can be
**bought and refunded freely** — a full respec each loop, ideal for tuning
before swearing a trial. Declaring the migration is one-way: the scout reports
are rolled and locked immediately, then "Set out" founds the new Emberhold.

Shop upgrades: Deep Roots (+5% all production ×5), Wandering Kin (+2 starting
villagers ×5), Grand Designs (+1 Hut cap ×3), Deep Cellars (+15% storage ×3),
Lorekeepers (start with Library + Knowledge), Pack Caravans (start with
supplies), Oathkeepers (repeatable trials +1 use each), Old Maps (expeditions
−25% cost).

## Landings

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
| Scarcity | ×5 | food −50% | stay fed 240 days | +10% food each |
| Frugality | ×3 | building costs +50% | 12 constructions | −10% building costs each |
| Overflow | ×3 | no new storage may be built | every discovered store full at once | +20% storage ceilings each |
| Tinkering | once | no manual Tool crafting | endure 240 days with a Workbench | unlocks Tinkerers, who steadily assemble Tools from wood and stone |
| Silence | once | no knowledge production | research Metallurgy | Thinkers +50% |
| Long Night | once | winter food ×0.25 | survive a year | Everwarm (mild winters, +5% all) |
| Solitude | once | population capped at 10 | stockpile 800 knowledge | Huts grant +2 cap each |
| Haste | once | all production −30% | reach Age of Light in 1200 days | Blueprints (−15% building costs) |
| Industrialization | once | factories require Power | produce 100 Industrial Goods in 1200 days | factories remain available permanently |

## Files

- `index.html` — shell and layout
- `style.css` — the amber-on-dark text look
- `js/data.js` — all content and balance (resources, jobs, buildings, techs,
  crafts, trials, expeditions)
- `js/game.js` — engine (tick, production, trials, saves) and the UI renderer

Repeatable trials get harder after each success, including Oathkeepers runs: Scarcity's food multiplier is divided by 1.25, Frugality's cost multiplier increases by 50%, and Overflow's storage targets increase by 25% while sworn (in addition to permanent rewards). Trial cards show current restrictions; the table shows the first run. Failures do not increase difficulty.
