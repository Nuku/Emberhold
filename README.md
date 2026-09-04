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

## How it plays

- **Flow over time.** Villagers are assigned to jobs (forager, woodcutter,
  miner, thinker, tinkerer…). Every villager eats. Population grows on a food surplus
  and starves when the store runs dry.
- **Seasons.** A year is 200 in-game days (~100 real seconds). Autumn slows
  the fields and **winter halves them** — keep a store.
- **Eras.** Research moves Emberhold through Age of Ember → Stone → Iron →
  Steam → Light. Each era unlocks new resources (stone, copper, tools, iron,
  coal, steel, machinery, aether) and buildings. Copper appears in trace
  amounts during the Age of Stone, then grows richer through prospecting,
  metallurgy, and electrical engineering.
- **Neighbors and trade.** Humans are Emberhold's default tribe. After a
  migration, Stonekin, Marshfolk, or Skyborn may appear nearby. Currency makes
  trade possible, while Banking unlocks Bankers who increase incoming funds;
  Steel-age buildings and later require Currency as well as materials.
- **Industry.** The Trial of Industrialization unlocks the Factory for its
  duration; build it and produce 100 Industrial Goods before the deadline.
  Steam Plants and Dynamos generate Power, while factories consume it without
  needing workers. Completing the trial makes factories permanent.
- **Diplomacy.** Contacted tribes have dispositions, make requests in tones
  ranging from pleas to demands, and may improve when their requests are met.
  Age-of-Iron Diplomacy unlocks Diplomats, who can be assigned to individual
  tribes; random diplomatic events can help or harm relations.
- **Guards.** Guards hunt while keeping watch, producing Food even in winter,
  though each one has a Food upkeep. Barracks determine how many can serve;
  Weaponry and Weapon Efficiency improve their hunting yield.
- **Expanding the field.** One-time **Expeditions** (Old Forest, Foothills,
  Sunken Ruins, Ember Vein, Glacial Peaks) permanently add passive income and
  are prerequisites for late buildings like the Observatory.
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

What endures: research, trials and their rewards, expeditions, Echoes, and
anything bought in the **Ancestral Shop**. What resets: villagers, all
resources, all buildings.

While the migration is being prepared (and only then), shop points can be
**bought and refunded freely** — a full respec each loop, ideal for tuning
before swearing a trial. "Call it off" restores the exact prior state; "Set
out" locks it in and founds the new Emberhold.

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
