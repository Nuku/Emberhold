# Lineage balance audit

**Historical audit, before the fixes below.** The implementation now replaces queue perks with building discounts (Emberborn 10%, Clocklings 15%), reduces Rabbitfolk's growth-time perk to 25%, improves Eaglefolk to +22% knowledge/−5% food, and softens Thornkin/Glimmerfolk double penalties to 10%. It also fixes Glimmerfolk resource events, inherited growth/Mephit traits, and lineage scaling of job input costs. See `CHANGELOG.md` for the implemented behavior; the tables and calculations below describe the original findings.

Validation of the initial balance fixes: 233 tests run, 225 passed. All six added regression tests passed. The eight remaining failures also occurred when running the original HEAD sources and tests; they cover existing queue/storage, migration, hospital, and research issues. The migration failure varied between runs. `git diff --check` passed. The subsequent thematic signature pass is documented in `LINEAGE_SIGNATURES.md`.

Reviewed 2026-10-08. This is a source-based assessment, not a measured ranking of full playthroughs. No gameplay values have been changed. Per the requested balance perspective, habitat restrictions carry little weight because Far Horizons bypasses them. Landing combinations below illustrate optional stacking risks and opportunities, not the main case for changing a lineage.

Percentages below are native level-1 modifiers relative to neutral production, not relative to Emberborn. Goods means Industrial Goods. Habitat limits apply until Far Horizons; unrestricted lineages can use every landing. Events are additional advantages or setbacks, not included in the headline production percentages.

## Every lineage

| Lineage | Production bonuses | Production penalties | Other effects and constraints | Assessment |
|---|---|---|---|---|
| Emberborn | Goods +20% | None | Any landing; advertised queue time −10% is inactive; wood reward event | Safe industrial baseline, but missing its advertised general-purpose perk. |
| Stonekin | Stone, iron +18% | Food −8% | Any landing; Guard recruitment rate +20%; stone reward event | Useful construction/defense package; food penalty costs workers throughout the run. |
| Marshfolk | Food, wood +18% | Stone −8% | Any landing despite its name; food +15% during rain/fog; food reward event | Strong and flexible early economy, with a relatively mild single-material penalty. |
| Skyborn | Knowledge, aether +22% | Food −10% | Any landing; survey gain +25%; knowledge reward event | Strong research/exploration specialist; substantially more flexible than Eaglefolk. |
| Mephit | None | None | Any landing; raid defense +35%; diplomacy timer delayed 120s after a raid; advertised attacker injuries are an NPC-target rule; morale setback event | Narrow defensive value; little economic benefit when raids are avoided. Its three traits overstate the playable package. |
| Dunewalkers | Currency +30%, copper +15% | Wood −12% | Any landing; currency reward event | Useful trade specialist; wood penalty hurts founding before currency income matures. |
| Cinderforged | Iron, coal, steel +20% | Knowledge −12% | Any landing; forge steel output additionally +15%; coal setback event | Strong industrial specialist: native forge output is +38%, supported by better inputs. Research is a meaningful cost. |
| Thornkin | Wood +25%, food +15% | Steel, goods −15% | Any landing; population-growth time −15%; wood reward event | Strong founding, heavy late industrial burden; two important penalties for a smaller growth perk than Rabbitfolk. |
| Clocklings | Tools +20%, machinery +25% | Food −12% | Any landing; advertised queue time −15% is inactive; tools reward event | Good manufacturing, but its missing signature perk leaves a persistent food cost less justified. |
| Glimmerfolk | Aether +30%, knowledge +15% | Stone, iron −15% | Any landing; advertised lineage-event resources +20% has no eligible native event; morale reward event | Two construction/input penalties and an ineffective signature bonus make this package particularly questionable. |
| Otterfolk | Food +22%, currency +15% | Iron −10% | Water: Floodmeadows/Windmere; food reward event | Comfortable river economy, though iron hurts industrial development. |
| Beaverkin | Wood +25%, tools +15% | Aether −12% | Water; wood reward event | Strong builder with a delayed penalty; Floodmeadows wood penalty reduces the apparent wood advantage. |
| Turtlefolk | Food +18%, knowledge +20% | Machinery −12% | Water; knowledge reward event can also grant survey with Explorers | Coherent growth/research package, with a meaningful later manufacturing cost. |
| Axolotlkin | Knowledge +25%, aether +15% | Coal −15% | Water; knowledge reward event | Strong research identity, but coal is fuel for several production chains, not a minor late penalty. |
| Carpfolk | Food +30%, currency +10% | Tools −12% | Water; food setback event | Excellent food surplus, paid for through a broadly useful crafted resource and occasional food loss. |
| Frogfolk | Food, aether +20% | Steel −12% | Wetland: Floodmeadows/Ashfen/Windmere; morale reward event | Reasonable specialist; Ashfen and Windmere reduce its food advantage. |
| Heronkin | Knowledge +22%, food +12% | Wood −10% | Wetland; food reward event | Less generous headline package; Floodmeadows compounds its wood weakness. |
| Foxfolk | Currency +25%, knowledge +12% | Stone −10% | Any landing; currency reward event | Flexible trade/research choice with a manageable but early construction penalty. |
| Wolfkin | Food +22%, tools +12% | Currency −10% | Any landing; food reward event | Strong practical early economy; currency cost arrives later. |
| Bearfolk | Wood, stone +20% | Currency −12% | Forest/mountain: Greenfold/Grayrocks; food and morale reward event | Good builders, but each allowed landing undermines another essential resource. |
| Deerkin | Food +20%, wood +15% | Iron −12% | Forest/plains: Greenfold/Emberplain/Floodmeadows; food reward event | Good founding; Greenfold compounds iron penalty to −29.6%. |
| Rabbitfolk | Food +28%, goods +10% | Coal −15% | Plains: Emberplain/Floodmeadows; population-growth time −50%; food setback event | Standout growth package: twice the uncapped growth rate with food to support it. Coal matters, but arrives after much of that advantage. |
| Bisonkin | Food +15%, goods +25% | Aether −12% | Plains; morale reward event | Strong economic package with a delayed research penalty; more goods than Emberborn plus food. |
| Squirrelfolk | Wood +28%, tools +15% | Steel −15% | Forest: Greenfold only; food reward event | Wood reaches +60%, but Greenfold also cuts stone/iron 20%; steel weakness adds another industrial constraint. |
| Owlkin | Knowledge +28%, aether +12% | Goods −12% | Forest: Greenfold only; knowledge reward event | Research strength is paid for with goods plus forced stone/iron shortages. Less flexible than Skyborn. |
| Lynxfolk | Food +18%, copper +22% | Currency −12% | Forest/mountain; copper reward event | Useful mixed package, constrained by landings: Grayrocks leaves food at −5.6% overall. |
| Ibexkin | Stone +25%, iron +18% | Wood −12% | Mountain: Grayrocks only; stone reward event | Stone +62.5%, iron +47.5%, but forced food −20% and wood −12% complicate expansion. |
| Eaglefolk | Aether +25%, knowledge +18% | Food −12% | Mountain until bypassed; knowledge reward event | Even ignoring habitat, trades Skyborn's +25% survey, 4 points of knowledge, and 2 points of food for only 3 extra points of aether. Weak differentiation and payoff. |
| Molekin | Stone, coal +22% | Aether −15% | Any landing; wood setback event | Flexible extraction specialist; aether penalty matters for later progression. |
| Raccoonfolk | Tools +22%, machinery +18% | Food −10% | Any landing; tools reward event | Close to Clocklings: more tools and less food penalty, less machinery; Clocklings' intended differentiator currently does nothing. |
| Custom | Chosen resource gifts +15% each | Chosen frailties −15% each | Prism Womb points; escalating trait cost; selectable signature perks; no habitat restriction in its definition | Needs a separate point-budget assessment. The inactive queue perk is also sold here for points; resource gifts/frailties do not have equal practical value. |

## Why stacking changes the comparison

**Food changes available labor, not just a resource total.** Villagers eat a fixed 0.12 food/s after production modifiers. If gross production is 12 and upkeep is 10, a −10% output modifier reduces surplus from 2 to 0.8: a 60% surplus loss. Food bonuses release workers for every other job; food penalties take workers away. Adding percentages across resources would hide this.

**Landing combinations amplify the chosen package.** Eaglefolk's 0.88 food × Grayrocks' 0.80 = 0.704. Ordinary winter multiplies seasonal food output by another 0.50, giving 0.352 before other factors. With habitat bypassed, Eaglefolk can instead choose Floodmeadows and reach 1.10, versus Skyborn's 1.125 on that same landing. The main comparison is then their native bonuses and signature effects, with landing choice treated as a player-controlled combination. Guard hunting is winterproof.

**Atavistic Aura magnifies tradeoffs as well as gifts.** Level 2 multiplies deviation from 1 by 1.5. Rabbitfolk become +42% food, +15% goods, −22.5% coal, and growth time ×0.25: four times the neutral growth rate while food/housing permit. Eaglefolk become −18% native food; Grayrocks leaves 0.656, or 0.328 for seasonal food in ordinary winter. Equal trait levels do not imply equal economic benefit.

**Production paths do not apply modifiers uniformly.** Ordinary settlement factors also multiply outgoing job inputs in the main production pass. For example, a wood bonus can increase Tinkerer wood consumption. Forge, factory, and manual-craft recipe costs are handled separately and stay fixed under these resource modifiers. Cinderforged steel ×1.20 and forge output ×1.15 yield ×1.38 forge output before other modifiers; factories and manual steel crafting receive the steel bonus but not Banked Heat. The bonuses cannot be evaluated purely from their names.

**Manufactured-resource weaknesses have cascading costs.** Tools gate construction, steel feeds machinery, and stored machinery increases global production. Goods is also a baseline Emberborn advantage: Thornkin's 0.85 goods versus Emberborn's 1.20 means 29.2% less goods output under otherwise equal conditions, not merely 15% less.

**Events are another asymmetric modifier.** Most lineages have one flavor event and one reward event; Mephit, Cinderforged, Carpfolk, Rabbitfolk, and Molekin instead have a setback. Resource setbacks scale with storage (currency with holdings); timed rewards use a scaled resource floor or current positive net production. Atavistic Aura raises the probability of choosing lineage events from 50% to 75%, amplifying access to both good and bad pools. These events are not a consistent balancing budget.

**Conquest favors borrowing advantages without their costs.** Commonality grants half the first applicable conquered lineage's positive resource modifiers, with no penalties. Regional unification adopts eligible traits at half strength and excludes Trade-off/Habitat traits. Native habitat and penalty burdens therefore deserve separate consideration from how valuable a lineage is to conquer. Some acquired traits are displayed but have no corresponding mechanic: inherited Quick Litters is not read by the growth calculation, and Mephit traits are handled through native-species checks rather than the acquired-trait path.

## Implementation issues to fix before tuning

1. **Queue-speed perks are inactive.** `queueTime()` applies the special multiplier but has no callers. `updateQueues()` completes affordable work directly; the rendered wait estimates also calculate missing/rate directly. Practical Improvisation and Exact Schedules currently change neither completion nor displayed waits. Custom lineage players can spend points on the same inactive effect. A real perk requires a defined mechanic, such as a deliberate queued-cost discount, rather than merely multiplying an estimate.
2. **Glimmerfolk's signature cannot trigger for native events.** Resonant Omens multiplies resource changes only for lineage events. Their pool contains flavor and morale, with no resource fields. It may work when acquired by a different lineage whose pool includes resources, but gives native Glimmerfolk no such benefit.
3. **Mephit's injury trait misrepresents the playable benefit.** Offensive raids hard-code extra injuries when the target is Mephit. Incoming raids do not track enemy injuries; `mephitInjuryMod()` has no callers. Cruel Reprisals consequently provides no additional player-side defense outcome, nor level-scaled injury effect. The actual raid delay also postpones the shared diplomacy event timer after raids, rather than independently slowing only hostile attacks.
4. **Inherited traits and feedback need consistency.** Quick Litters and Mephit defenses need explicit support if unification promises their half-strength effects. The population-growth tooltip also omits Living Renewal's special multiplier although actual growth uses it. Headline lineage `effect` strings omit the later-added signature specials.

## Suggested balancing direction

- Repair or replace inactive perks first. Current statistics undervalue Clocklings and Glimmerfolk relative to their intended packages, so blanket percentage changes would obscure the cause.
- Give every lineage a comparable budget for production, signature abilities, event risk, and timing. Give bypassable habitat restrictions little weight. Price food/growth and early bottlenecks more heavily than a bonus to a resource unavailable until later.
- Rabbitfolk are the clearest initial tuning candidate: a tentative growth-time multiplier of 0.75–0.80 would still give a distinctive 25–33% growth-rate advantage, rather than 100%; keep food and coal under review together. This is a proposed starting range, not a tested final value.
- Eaglefolk need a clearer payoff relative to Skyborn even on the same landing: a smaller food penalty or a meaningful signature would help. Their additional 3 percentage points of aether currently cost 4 points of knowledge, 2 points of food, and Skyborn's survey bonus.
- Reassess the double penalties on Thornkin and Glimmerfolk. Evaluate Owlkin/Squirrelfolk on equal landings once habitat is bypassed; their original Greenfold combinations should not drive the overall ranking.
- Compare early, research, industrial, and conquest milestones under legal landing choices, ordinary winter, Atavistic Aura, and relevant permanent upgrades. Measure time to milestones and productive workers remaining after food needs; avoid one summed percentage score.

## Source locations

- `js/data.js:595`: lineage event pools.
- `js/data.js:906`: landings; `js/data.js:940`: animal lineages; `js/data.js:1035`: core lineages.
- `js/data.js:1138`: trait membership; `js/data.js:1169`: signature effects.
- `js/game.js:341`: trait levels/scaling; `js/game.js:359`: special-effect inheritance.
- `js/game.js:421`: native Mephit rules; `js/game.js:694`: Commonality.
- `js/game.js:1507`: unused queue estimate; `js/game.js:1759`: queue execution.
- `js/game.js:2102`: event scaling; `js/game.js:2214`: resource inheritance.
- `js/game.js:1943`: settlement factors; `js/game.js:2580`: input/output scaling and manufacturing; `js/game.js:2745`: population growth.
- `js/game.js:4178`: NPC Mephit raid handling; `js/game.js:4304`: regional trait adoption.
