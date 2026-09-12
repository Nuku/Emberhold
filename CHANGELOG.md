# Changelog

All notable changes to Emberhold are recorded here, with the newest changes first.

## 2026-09-12

- Moved reset actions into an opt-in Settings control: Soft Reset starts a reward-free migration, while Hard Reset now requires two explicit confirmations and clearly warns that the chronicle cannot be recovered.
- Removed the always-visible reset button from the header and kept reset controls disabled when loading a save.
- Updated Soft Reset so it preserves the migration choices but makes the road ready immediately, with no provisioning delay or rewards.

## 2026-09-11

- Fixed the Nothing Manual challenge so a new settlement starts with one Tinkerer and can assign additional Tinkerers without a Workbench.
- Fixed allied-tribe production bonuses so conquered allies receive the Commonality bonus correctly and each active ally displays its actual bonus.
- Reworked The Beacon into a 100-stage construction project; each stage commits one set of materials, shows persistent progress, and can continue through the construction queue until the Beacon burns.
- Added Great Migration self-challenges: Dry Ground, Bad Ancestry, Nothing Manual, and Forgotten Truths; active challenges raise achievement ratings and visibly mark the settlement.
- Reworked achievement completion bonuses to use challenge ratings, including scaled Steel Hearted bonuses and the new challenge-specific production and crafting penalties.
- Fixed the Trial of Tinkering deadline so a Tinkerer must still be assigned when day 240 ends; the trial no longer completes early merely because one was assigned at some point.
- Increased Living Block construction costs to also require Copper, Machinery, and Industrial Goods.
- Fixed challenge rating colors so they apply to the settlement location label without leaking into unrelated challenge markers.

## 2026-09-10

- Fixed Research so the same technology cannot be queued more than once, including duplicate entries in loaded saves.
- Reworked the Trial of Scarcity: while active, weather is always Stormy, Wood production is reduced alongside Food, and mining workers can be lost at increasing rates with each completion.
- Updated the Scarcity trial UI text and README guidance to describe its storm, production, and mining-worker penalties.
- Rebalanced Great Migration preparations: Caravan provisions now require 60,000 Food and Caravan frames require 40,000 Wood.
- Added staged Great Migration preparations: food, caravan timber, stone roadwork, and departure tools can now be committed one percent at a time before setting out.
- Added the uncapped Clever Storage Ancestral Shop upgrade: each level adds 1% to all storage, with costs starting at 1 Echo and doubling per level.
- Conquest now requires 15 healthy Guards plus 200 Food and 10 Tools; the diplomacy UI shows the cost and marks conquered realms clearly.
- Exposed the current conquest cost through the automation API and included it in successful conquest results.
- Fixed the desktop Stores panel so it fills the available height and keeps scrolling contained within its own panel.
- Restored Wonder outcomes now carry their old purposes into future settlements: the Worldroot boosts Wood, the River Crown boosts Food, the Renewal Basin boosts Tools and Coal, and the Mirrored Orrery boosts Knowledge and Aether.
- Added four Hope-bound Wonder discoveries: Heartwood, Star Glass, Basin Tempering, and the associated Heartwood Grove and Star Glass Lensworks buildings; Basin Tempering increases Steel production.
- Added the Animal Husbandry Ancestral Shop upgrade, unlocked by silencing the Worldroot, with Ranches, Ranchers, Fur production, expanded Fur storage, and a morale bonus.
- Silencing the River Crown turns Foragers into morale-boosting Farmers, while silencing the Mirrored Orrery lets Explorers document discoveries for Knowledge.
- Silencing the World Anvil lets Tinkerers run the selected factory recipe at half speed without Power, including recipe-aware rates, inputs, and production tooltips.
- Silencing the Renewal Basin returns 10% of factory-material construction costs, and Wonder obstacle costs now receive the same reclamation refund.
- Every Wonder fate now grants the normal migration Echoes, including forced migrations after a Wonder is completed.
- Updated Wonder unlock costs and migrated the new reset-layer state safely between settlements.

## 2026-09-09

- Added Chainmail research after Metallurgy: Guards gain a second level of armor, reducing their death odds by an additional 8%; automation now researches it when available.
- Added live morale telemetry to the automation API, including the aggregate rate, current cap, component pressures, and marginal effects for supported jobs and settlement factors.
- Fixed Currency save normalization so Banker capacity bonuses are preserved when loading a save before the active state is assigned.
- Bankers now increase Currency capacity by 10% each, starting from the 2,000-unit base cap.
- Added a 2,000-unit base cap for Currency, including save normalization and overflow-safe production.
- Updated storage guidance throughout the game and README to reflect Currency's cap alongside material-store ceilings.
- Added Workplace Ethics after Civic Harmony: mining jobs gain one additional slot, full mining crews produce 10% more, and each full crew applies a −0.15 morale/s penalty.
- Prevented one-off buildings from being queued more than once, and cleaned duplicate or already-completed entries from loaded construction queues.
- Fixed Dynamos so their factory production bonus increases output without multiplying the factory's material consumption.
- Fixed currency losses from random events scaling with the settlement's current holdings instead of remaining at starter-size amounts.
- Fixed tooltips near the bottom of the viewport by repositioning them above their anchor and keeping Stores tooltips aligned during scrolling.
- Removed the duplicate settlement location summary from the Village panel now that the current landing is shown beneath the Emberhold title.
- Added a dedicated location line beneath the Emberhold title so the current landing remains visible while the chronicle details stay focused on era, lineage, and place traits.
- Updated the desktop layout to keep the header and utility rail fixed while the Stores, main, and side panels scroll independently; mobile layouts retain natural page scrolling.
- Increased Knowledge costs 15× for research discovered after the Stone Age so later technologies better match the game's progression curve.
- Fixed Stores production-rate tooltips so they remain visible within the viewport when hovered or focused.
- Expanded the automation API with structured combat and espionage actions, guard deployment limits, attack/siege predictions, conquerability state, and live military/espionage intel fields.
- Added the Trial of Conquest, unlocked after Hope or Ancient, which fixes three nearby nations at zero relations until all are conquered and permanently increases Guard recruitment speed by 10% on completion.
- Added Here and Known elsewhere tabs to Diplomacy so nearby and distant contacts are easier to browse.
- Limited Tinkerers to one worker plus one additional worker for every five Woodcutters.
- Fixed research completion messages being classified as combat when their research description mentioned raids, guards, or other combat terms.
- Adjusted beacon completion so the end-state banner no longer interrupts continued play.
- Added Tree Husbandry research after the Aqueduct, increasing wood income by 20%; automation now prioritizes it when available.
- Fixed factory recipe cards so production rates and material costs use the game's compact number formatting.
- Added the Steel Hearted achievement: holding 1,000 Steel grants +20% Steel production from factories and Forges.
- Added a dedicated Achievements message-log filter and display for achievement-specific effects.
- Updated the escaped-farm-animal event so each occurrence can feature chickens, ducks, goats, sheep, or pigs.
- Added Lightning Metal research, increasing factory Steel output and material costs by 50%.
- Added the Living Alloy reset-layer unlock: Grayrocks restoration can now preserve access to Living Alloy research between migrations, which unlocks the Living Alloy Mine and its dedicated miners and storage.
- Added Hope-bound discoveries to the Ancestral Shop, including persistent purchase state, save migration, automation support, and API definitions.
- Moved construction, research, and expedition queues into a persistent utility rail beside the game panels, with a responsive mobile layout.
- Added message-log filters plus Clear and Clear All controls for managing the chronicle, with automatic categories for new entries and fallback categorization for older saves.

## 2026-09-08

- Wonder obstacle construction can now be queued when materials are not yet available, and queued obstacles resume safely after loading.
- Exposed Wonder research, obstacle, and expedition actions through the automation API.
- Fixed Wonder obstacles so each of the five sections tracks its own obstruction sequence and older obstacle state remains safely normalized.
- Rebalanced the Grayrocks calamity costs to match the sustained Wonder pacing.
- Clarified the Rapture assignment display with the two-workers-per-Guard capacity limit.
- Added five escalating Wonder obstacles that halt section progress until their material costs are paid, with persistent obstacle state and save migration.
- Limited Rapture workers to two per assigned Guard; excess workers now flee back to town with a temporary morale penalty when Guard coverage falls short.
- Added repeatable hold controls for assigning and removing Rapture workers, and clarified Wonder progress, capacity, and obstacle status in the interface.
- Rebalanced Wonders into sustained expeditions: section work now takes substantially longer and danger is higher; research discovered inside a Wonder now costs five times its base amount.
- Clarified the Wonder guard outcome text so it accurately describes the outcome where both the citizen and guard survive.
- Added the Wonder reset layer: beacon-guided, landing-specific Wonder expeditions; five dangerous interior sections; persistent section progress; outside research; temporary interior expeditions; escalating calamities; guard rescues; and a dedicated Wonders tab.
- Added six starting Wonders for Emberplain, Greenfold, Grayrocks, Floodmeadows, Ashfen, and Windmere, each with its own five-section narrative, calamity, research, expeditions, and ending text.
- Completing a Wonder now forces migration, grants Hope, and records one of three repeatable outcomes. The Sunwell outcomes add Solar Arrays and milder hot days, improved Steam Plant output, or Ancient points.
- Wonder hints now require Optics, a lit beacon at the current landing, and a return visit to that landing; older Beacon completions are migrated into the first hint.
- Updated every queued construction, research, and expedition item to show its own missing resources and estimated wait time in parallel queue mode.
- Added atmospheric narrative descriptions to every trial and expedition, shown directly in their cards, including after an expedition has been established.
- Expanded expedition and trial flavor text to better describe the risks, places, and promises behind each undertaking.
- Reworked lineage effects into named, grouped traits shared across cultures; diplomacy and migration now show each lineage's trait set, including trait tooltips and special effects.
- Changed Atavistic Aura to raise the current lineage's traits by one level, scaling positive and negative effects by 1.5× and increasing lineage-happening frequency by the same factor.
- Added Understanding Home research after Mechanism; settlements with local traits can learn their exact current effects through trait tooltips.
- Added a population-growth timing tooltip that breaks down settlement, fertility, hospital, lineage, morale, and place-trait modifiers.
- Fixed queued construction, research, and expedition actions retaining the cost shown when they were added, even if a temporary price modifier changes later.
- Expanded the Stone Working description with guidance about gathering the newly noticed green mineral.
- Fixed neighboring-tribe requests so they never ask for generated Power capacity, and repaired legacy saves containing Power requests.
- Added a persistent option to dismiss the front-page tutorial card; the choice is saved and carried into migrated settlements.
- Added Air of Rage and Atavistic Aura place traits: rage becomes a fading morale bonus after attacks and a growing penalty when unspent, while Atavistic Aura raises lineage traits by one level.
- Added an optional Tooltips setting for players who prefer a cleaner interface without hover details.
- Added climate-aware place traits to migration choices and settlements; traits now modify production, morale, growth, exploration, guard recruitment, and occasional population loss.
- Added Buy and Purchased tabs to the Ancestral Shop so fully learned upgrades are separated from current choices.
- Preserved partial power allocations when adding a new controllable building; new copies join automatically only when all existing copies were enabled.
- Exposed factory recipe definitions through the automation API, including recipe inputs, rates, and research requirements.
- Improved background-tab timekeeping with a dedicated worker clock, while preserving safe delayed-time banking for suspended or sleeping sessions.
- Improved game and automation performance by indexing immutable definitions and caching repeated lookups.
- Hardened automation settings loading, cached production-rate checks, and refreshed its status panel after each step; userscript v1.25.8.
- Removed the construction cap on Factories, allowing additional factories to be built as long as their costs and Power capacity are available.
- Added physical material costs to research alongside Knowledge; the game and automation now wait for and pay all required research inputs (userscript v1.25.7).
- Added Wind Harness research and uncapped Wind Devices, which provide 1 Power capacity each without fuel; automation now researches and builds them when available (userscript v1.25.6).
- Added Iron Mites research, which unlocks after building a Forge and increases Iron Miner production by 30%; automation now researches it when available (userscript v1.25.5).
- Fixed affordable construction, research, and expedition actions starting immediately even when their queue is full; unaffordable actions continue to use the available queue space.
- Added drag-and-drop reordering for construction, research, and expedition queues; click still cancels an item.
- Added an optional Strict queue order setting that processes construction, research, and expedition queues one item at a time from first to last; the default remains parallel processing.
- The front page now keeps the active trial's goal and progress visible, with a direct link to the Trials panel.
- Resource-bearing random and lineage events now grant at least their listed reward and can also add 10–20 seconds of the settlement's current production.
- Extended the Trial of the Long Night from one year to ten full years (2,000 days).
- Fixed controllable buildings loading disabled when their saved toggle was missing; owned buildings now start enabled by default while explicit off settings are preserved.

## 2026-09-07

- Updated the Trial of the Long Night so the entire trial remains winter, keeping its food production penalty active throughout the trial.
- Fixed the Trial of Expansion failing to count completed buildings toward its construction goal.
- Updated Power displays to distinguish generator capacity, building allocation, and remaining capacity, including factory allocation in the Stores tooltip.
- Fixed expedition production bonuses incorrectly scaling outgoing resource costs; only explicitly defined outgoing modifiers now apply to costs.
- Added Forge controls to the Power subtab. Forges can now be disabled without consuming Iron or Coal, and older Foundry saves migrate before power assignments are normalized.
- Added a Pause/Resume control. New chronicles start paused, paused saves stay paused across reloads and offline time, and older saves continue running normally until paused.
- Returning to a previously visited landing now grants an Ancestral Blessing: +0.33 Knowledge/s in the new settlement, including when migration begins through a trial.
- Reworked the Trial of Industrialization: coal production is reduced to 20% during the trial, low morale can trigger riots that destroy stored coal, and the trial no longer has a deadline.
- Moved Power allocation controls into a dedicated Power subtab under Construction, keeping the Village panel focused on settlement status and automatically returning to Incomplete when no controllable power buildings remain.
- Expanded Power allocation controls to Living Blocks and Factories, with enabled buildings consuming capacity in priority order and factories stopping cleanly when capacity is unavailable.
- Offline time now banks up to 24 hours of double-speed play, with a real-time countdown above Updates. Remaining time persists through saves and migration.
- Added a one-hour real-time cooldown when changing governance policies; the cooldown persists through saves and offline progress and resets on migration.
- Added Money Lenders to Banking: each supports one Banker and produces 0.001 Currency per population per second.
- Added Awaken Ancients research, which lets Quarries, Deep Mines, and Coal Seams use Power for +10% production per powered building.
- Added controls and saved state for powering individual dig sites, with Living Blocks receiving priority when capacity is limited.
- Exposed live power capacity and dig-site controls through the automation API.
- Expanded Shrine descriptions with their low-morale bonus.
- Updated morale so its production modifier also speeds or slows population growth by the same percentage.
- Added population-growth timing modifiers to lineage descriptions.
- Fixed migrated saves carrying stale Power discovery into settlements without current Power buildings; Power is now hidden and reset until the settlement has a Power building.
- Updated the Turtlefolk lake-memory event to grant time-scaled Knowledge and Explorer-based Survey points.
- Added Survey to the Stores panel once Explorers are unlocked, including its current total and generation rate.
- Renamed Aphrodisiac research to Fertility Rites and updated its related guidance and tests.
- Limited Copper Diggers to the larger of the Miner or Iron Miner capacity, so copper assignments scale with the settlement's available mining infrastructure.
- Added Advanced Science research, the uncapped Instrument Hall, and Experimentalists, who extend Knowledge production beyond Thinkers.
- Updated automation to research Advanced Science, build Instrument Halls, and assign Experimentalists as they become available.
- Limited Miners to one worker per Stone Works plus one, and Iron Miners to three workers per Deep Store plus three, with loaded settlements and assignment controls enforcing both caps.
- Limited Thinkers to one worker per Library plus one, with loaded settlements and assignment controls enforcing the same cap.
- Hardened the worker assignment APIs so bulk assignments reject invalid, over-capacity, and over-population requests without partially changing the settlement.
- Simplified the weather summary beside the chronicle date so it stays readable at a glance while preserving the detailed production effects in the relevant tooltips.
- Added a focusable morale tooltip that explains the settlement's current positive and negative morale pressures, including weather, food stores, seasons, buildings, Performers, Living Blocks, and conquered towns.
- Added a stacking morale penalty of −0.01 morale/s for each villager beyond 20.
- Reduced Huts' base population capacity from +3 to +1.

## 2026-09-06

- Fixed migration Ancestral Shop visibility so upgrades only appear when their total Echoes cost, including already-spent Echoes, is affordable.
- Slowed weather changes to every 15–30 game days, keeping skies, temperature, and weather effects steady throughout each pattern, including across season boundaries and reloads.
- Added the early-Steam Living Block: an uncapped housing building for five villagers, built from Steel, Stone, and Wood, with steep escalating costs, 1 Power capacity required per block, and −0.1 morale/s from cramped living.
- Added the Journal of Old Times Ancestral Shop upgrade for 500 Echoes. It permanently provides +0.2 Knowledge/s, and refunded Echo purchases now remove their bonuses immediately.
- Added +0.006 morale/s during summer to match winter's −0.006 morale/s. Seasonal pressure stacks with daily weather; spring and autumn are neutral.
- Added a mild +0.01 morale/s hospital pressure while morale is below 50; having multiple hospitals does not increase this bonus.
- Added daily skies and seasonal temperatures beside the chronicle date. Clear skies lift morale, storms lower it, and rain, frost, heat, fog, and auroras affect production. Each migration destination now has a visible local climate; weather remains consistent across saving and offline progress.
- Changed Power from a draining resource store into generator capacity. Steam Plants provide 3 capacity each, factories require 1.5 capacity each, and factories stop when capacity is insufficient.
- Updated Power displays, tooltips, factory recipe cards, README guidance, and regression tests to describe capacity rather than storage.
- Removed the generic next-step card after all guided milestones are complete.
- Updated panels in place to prevent refresh blinking and preserve controls; focused dropdowns stay open during game and automation updates.
- Replaced the long list of attack buttons with an attack-type dropdown and a single Attack button for each neighboring town.
- Added progressive tab unlocking and a guided next-step card so new settlements reveal systems as their prerequisites become available.
- Improved automation diagnostics: the userscript now reports connection, unavailable-action, and runtime-error states instead of failing silently. The userscript version is now 1.25.4.
- Fixed early-start migrations carrying stale resource-discovery flags from the previous settlement, which could expose materials before they were unlocked.
- Updated construction, research, and expedition queue entries to list the resources each item needs to finish.
- Updated the top item in each queue to show every missing resource on its own line with a separate time estimate.
- Added three late-game Ancestral Shop upgrades: Far Horizons (125 Echoes) allows unlocked lineages to settle in any habitat; Fear of the Conqueror (300 Echoes), unlocked after conquest and Commonality with 10 other lineages, erodes an enemy's Military strength by the stage number after each victorious battle; and Practiced Migrator (250 Echoes), unlocked by completing every area-specific expedition, starts future settlements in the Age of Stone with Stone Working researched and +5 villagers and population capacity.
- Hidden undiscovered resources from the Stores panel to keep progression information clear and prevent confusion during the Trial of Overflow.
- Added multiple simultaneous local trading partners: Explorers reveal a second contact at 1,000 Survey, and the Age of Iron reveals a third; each contributes trade, diplomacy, and alliance benefits, while later contacts bring stronger military and economic strengths.
- Updated the automation userscript to prioritize Training Yards and Hospitals, and to respect the game's build-availability helper when choosing construction targets.
- Updated automation to support both the current action API and the legacy action map, verify worker assignments after each change, and keep diplomats and guards out of ordinary worker availability calculations. The userscript version is now 1.24.0.
- Added eight attack stages from Raids through Sieges, with escalating costs and difficulty, additional loot rolls, and uncommon loot in the final three stages; Tools, Steel, and Currency appear when unlocked.
- Added persistent Military and Economic strength rolls to encountered towns; Military scales attack difficulty, while Economic scales successful loot quantities.
- Added late-Iron Spies research and later Espionage research: target-specific spy training reveals Military strength with one spy and Economic strength with two, while Espionage enables 20-minute attempts to weaken military power.
- Spy training costs now scale with the target town's Economic strength and the number of active spies there; captured spies reduce the surcharge.
- Espionage now bottoms out at Military strength 60 on the town scale and stops being offered once that floor is reached.
- A spy killed in the field now has a 50% chance to betray Emberhold, with the betrayal noted and relations falling by 3–5.
- Tuned combat so incoming raids are less destructive and staffed outgoing attacks are more reliable.
- Added post-Siege conquest: commit 15 healthy Guards to take a neighboring town, gaining the ally income bonus while applying a steady −1.0 morale pressure and suppressing that realm's diplomatic events.
- Added Commonality research and government. It removes conquered-realm morale pressure, raises the ally bonus from +5% to +7.5%, and quietly records the lineages with which Commonality has been achieved.
- Commonality now grants half-strength positive production benefits from the conquered lineage while active; lineage penalties do not transfer, and the effect ends when the government or settlement changes.
- Added The Butcher's Bill achievement for losing 25 Guards in one migration and The Quiet Road for completing a migration without launching a raid.
- Added Training Yard research and buildings; each Training Yard reduces replacement Guard recruitment time by 10%, compounding without a cap.
- Increased Steam Plant coal consumption tenfold, from 0.08 to 0.8 Coal/s per plant.
- Fixed Forge input costs being incorrectly scaled by expedition bonuses to Iron or Coal; expeditions can now affect Forges only through an explicit Forge modifier.
- Updated the Trial of Overflow to suppress Deep Cellars, storage-focused governance bonuses, and new storage construction while sworn; permanent Overflow rewards still apply.
- Shortened the time between new villagers by 33%.

## 2026-09-05

- Replaced the one-off Foundry Steel unlock with scalable Forges that automatically smelt Steel from Iron and Coal; existing saves migrate Foundries to Forges.
- Added Settings and Stats tabs. Stats includes Stats, Achievements, and Perks subtabs for settlement records, expected accomplishments, and permanent bragging rights.
- Added persistent Settings controls for autosave, reduced motion, compact stores, and chronicle tools.
- Added achievement progress tracking and a Completion bonus of +0.1% to all production per completed achievement. The bonus stacks additively and survives migration and reloads.
- Added a quick achievement for gaining access to each lineage, plus Many Peoples for half of all lineages and A World of Kin for every lineage.
- Changed the Trial of Silence to require producing 100 Steel after researching Metallurgy, with enough knowledge banked to complete the research before knowledge production stops.
- Increased the Silence Trial's starting Knowledge reserve to 1,700 to cover Currency and the steel setup. (`17651c4`, `e532cc6`)
- Fixed save import persistence and diagnostics, and protected imported saves from stale tabs overwriting them. (`282f3ac`, `84d6c71`)
- Improved automation job selection to avoid zero-output jobs during trials, prioritize unmet resource targets, and rebalance surplus workers more reliably.
- Exposed effective per-worker production through the controller API for automation planning.
- Added independent one-slot queues for building and research, with automatic completion when resources become available, cancellation by clicking, and estimated completion times.
- Added Echo upgrades for extra construction and research queue slots, plus one-time Expansion and Scholarship trials that each unlock another slot.
- Added an independent one-slot expedition queue with automatic launch when supplies arrive, cancellation, and completion estimates.
- Scaled resource rewards and losses from random happenings with the affected resource's storage capacity.
- Added a stable `window.emberhold` controller API for state inspection, engine actions, planning helpers, and automation events.
- Added the configurable `emberhold_automation.user.js` companion userscript with automatic jobs, research, construction, crafting, diplomacy, and expeditions.
- Made automation reserve resources required by every queued construction and research item before spending or reallocating them.
- Improved save export reliability by copying directly to the clipboard and downloading a plain-text backup, with a prompt fallback when clipboard access is unavailable.
- Kept departed tribes as historical contacts after migration; only the current local tribe can trade, receive diplomats, raid, or provide active-ally income.
- Added hold-to-repeat controls for repeatable actions. (`6992455`)
- Improved offline-progress accounting and raid-defense behavior. (`4be94f0`)

## 2026-09-04

### Expeditions and progression

- Expanded settlement expeditions with additional content and outcomes. (`158cf83`)
- Restricted expedition choices to locations available from the current landing. (`f6fdc33`)
- Refined expedition availability and costs. (`50cac7a`)
- Updated expedition content alongside building progression. (`b380d25`)
- Fixed the explorer job definition. (`72e2106`)

### Population, migration, and lineages

- Added population-growth and Hospital systems. (`13e640e`)
- Updated population progression and related settlement pacing. (`b3916db`)
- Expanded lineage and migration systems. (`5bcb874`)
- Updated migration and governance copy, and refined the trial migration flow. (`85d323c`, `1ad2ea1`)
- Reset research on migration to support the new progression flow. (`e98d83c`)

### Diplomacy, tribes, and defense

- Rebalanced diplomacy and added regression tests. (`5c2542b`)
- Expanded diplomacy and factory production. (`c861cdf`)
- Added tribes, Currency, and Banking progression. (`9f472d0`)
- Added diplomacy, tribe requests, and Diplomats. (`82a58d5`)
- Scaled diplomacy requests by era and added tribal aid for high disposition. (`532e33b`, `60f31b9`)
- Added tribe raids and guard defenses. (`52daccf`)
- Added Guards, Barracks, and weapon research, then adjusted Guard food upkeep. (`a2be8d6`, `77bef3a`)
- Made guard equipment research-based and hid Guards until Barracks provide capacity. (`c843a65`, `6184565`)
- Refined the strained-relations warning. (`c23ecf7`)

### Interface and player experience

- Rebuilt the Emberhold interface and page UI. (`95fc9cb`, `622981b`, `49f5ef1`)
- Added Morale, governance, scouting, and compact tooltips. (`bc04ba0`)
- Prevented missed clicks during UI refreshes and kept hover tooltips stable. (`5127d20`, `acbd906`)

### Resources and industry

- Added Copper and Electrical Engineering. (`0fe2ff7`)
- Added the powered-industrialization trial and used Industrial Goods in late construction. (`11d8a38`, `747bab7`)
- Added the Trial of Tinkering and automated toolmaking, including Tinkerers during their trial. (`198b880`, `bf69269`)

### Maintenance and publishing

- Rebuilt the Emberhold page and published game updates. (`49f5ef1`)
- Hardened saves and workforce recovery. (`95e14e3`)
- Refreshed published asset versions and busted GitHub Pages stylesheet/script caches after updates. (`5f1fb54`, `9e03a96`, `da6ea39`, `358cb0c`)

### Foundation

- Began Emberhold as a text-only incremental settlement game. (`696e1a9`)
