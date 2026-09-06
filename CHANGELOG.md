# Changelog

All notable changes to Emberhold are recorded here, with the newest changes first.

## 2026-09-06

- Fixed Forge input costs being incorrectly scaled by expedition bonuses to Iron or Coal; expeditions can now affect Forges only through an explicit Forge modifier.
- Increased population growth speed by 33%.

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
