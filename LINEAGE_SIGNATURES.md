# Lineage signatures

Each lineage has a way to change a constraint, risk, or planning decision beyond its existing resource-output modifiers. Native traits scale with Atavistic Aura; regional unification adopts eligible signatures at half strength. Fractional housing bonuses accumulate across Huts before rounding down. The 20 new signature traits are also available in the Custom lineage lab after unlocking their donor lineage.

The Custom lineage lab now offers every native signature. Base prices: **3 points** for Sulfur Wards, Quick Litters, Banked Heat, and Exact Schedules; **2 points** for every other signature in the table. Mephit's Slow Provocation and Cruel Reprisals are separate 2-point choices. The usual +1 cost per previously chosen positive trait applies, and each signature requires its donor lineage to be unlocked. Existing Custom trait IDs and prices remain valid.

| Lineage | Signature and intended playstyle |
|---|---|
| Emberborn | Practical Improvisation: buildings cost 10% less; flexible expansion. |
| Stonekin | Stone Sentinels: recruit Guards 20% faster; rebuild the watch quickly. |
| Marshfolk | Floodwise: every Hut adds 20 Food capacity; expanding housing also prepares for lean seasons. Retains its rain/fog harvest bonus. |
| Skyborn | Far Sight: Explorer Survey gain +25%; chart more choices for future migrations. |
| Mephit | Sulfur Walls, Slow Provocation, Cruel Reprisals: stronger defense, weaker incoming raids, and a respite afterward. |
| Dunewalkers | Caravan Provisions: expedition supplies cost 20% less; explore on a smaller material budget. |
| Cinderforged | Banked Heat: Forges use 25% less Coal as well as their existing output bonus; sustain more metalworking with limited fuel. |
| Thornkin | Living Renewal: population growth takes 15% less time; living villages fill their homes sooner. |
| Clocklings | Exact Schedules: two extra construction and research queue slots, alongside cheaper construction; plan longer chains of work. Inherited at half strength, this adds one slot to each queue. |
| Glimmerfolk | Resonant Omens: happenings arrive 20% sooner, including general setbacks; a more eventful settlement with stronger native resource rewards. |
| Otterfolk | River Freight: Trade Blimps move 25% more cargo per second; faster trade also needs more purchasing Currency or sale inventory. |
| Beaverkin | Fitted Timber: building Wood costs −20%; stretch forests into more infrastructure. |
| Turtlefolk | Generational Archives: Knowledge capacity +50%; bank discoveries for large research purchases. |
| Axolotlkin | Regenerative Rest: Guard injuries heal in 35% less time; recover between attacks. |
| Carpfolk | Silt Granaries: Food capacity +50%; save rich harvests for winter. |
| Frogfolk | Storm Chorus: negative weather morale pressure reduced by 75%; hold spirits steady through storms. |
| Heronkin | Patient Preparation: resource losses from happenings reduced by 50%; safer reserves, without protection against raids or other hazards. |
| Foxfolk | Remembered Favors: requested gifts grant 50% more goodwill, respecting the usual diminishing returns above 100 disposition; pursue alliances through supplies. |
| Wolfkin | Pack Tactics: +20% attack power when deploying at least five healthy Guards; commit a full pack rather than split the force. |
| Bearfolk | Great Lodges: each Hut houses an extra villager; larger homes reduce the building burden of population growth. |
| Deerkin | Shared Browsing: villagers eat 10% less while Food stores are at least half full; maintain a reserve to preserve efficient meals. Guard upkeep stays unchanged. |
| Rabbitfolk | Quick Litters: population growth takes 25% less time; fill new housing quickly while keeping food supply ahead of births. |
| Bisonkin | Communal Hearths: crowding morale loss reduced by 50%; support larger settlements with fewer entertainers. |
| Squirrelfolk | Hidden Caches: Wood and Tools capacity +40%; reserve materials for ambitious construction. |
| Owlkin | Quiet Contemplation: research Knowledge costs −15% at morale 80 or above; maintain a heartened village to study efficiently. Material costs stay unchanged. |
| Lynxfolk | Trailblazers: expedition population requirements −20%, rounded up; send smaller settlements into the field. Supplies and location requirements stay unchanged. |
| Ibexkin | Dry-Stone Masonry: building Stone costs −20%; turn quarrying into infrastructure efficiently. |
| Eaglefolk | Aerie Watch: each healthy Guard earns 0.005 Survey/s even before Explorers unlock; the military watch prepares future migration choices. |
| Molekin | Tunnel Engineering: awakened mining workers use 25% less Power; run a larger mining crew on the same generators. |
| Raccoonfolk | Scrap Assemblies: manual crafting costs −20%; active workbench crafting stays useful alongside factories. Existing manual-crafting restrictions still apply. |

Signatures do not bypass habitat restrictions, expedition locations, research prerequisites, storage checks, or challenge rules. Habitat restrictions remain a separate, bypassable consideration rather than the price of a signature.

Validation: 248 tests run; 240 passed, including all 15 signature and Custom lab regressions. Eight known failures remain in unrelated queue/storage, migration, hospital, and research tests. `git diff --check` passed. Values are an initial playable tuning pass, not a claim that every full-run strategy takes the same time.
