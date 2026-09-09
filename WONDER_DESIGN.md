# Wonder Expeditions

## Premise

After at least one beacon has been lit, beacon signals begin pointing toward
the grand remains of the Ancient Ones. Their works were built on a scale that
was trivial to them and incomprehensible to us. Humanity can only gather the
scattered crumbs and try to coax one of these Wonders back to life.

## First step: Find the Wonder

- A new expedition becomes available after Optics has been researched, a beacon
  has been lit at the current landing, and the settlement has migrated away and
  returned. The first lighting marks the horizon; only the return reveals the
  deeper signal.
- The expedition is specific to the current landing. The people find the
  Wonder appropriate to the place where the expedition is launched.
- Finding the Wonder is a distinct first step. It does not restore or activate
  the Wonder.
- The expedition is exploration-heavy and also consumes ordinary supplies.
- It must never feel cheap.

## Beacon-scaled cost

The expedition cost depends on the number of distinct places where the player
has lit at least one beacon. More beacon-lit places represent a broader map
and more reliable hints toward the Wonder.

- One lit place: 10× the base cost.
- Each additional distinct lit place reduces the multiplier by 1.5×.
- All six current landings lit: 2.5× the base cost.
- The expedition remains a significant undertaking even with every beacon lit.

The count is based on distinct beacon-lit places, not the total number of
beacons or the number of times a place was visited.

## Current places and Wonder families

The current world supports five habitat types:

- Forest
- Plains
- Mountain
- Water
- Wetland

The initial Wonder set contains six Wonders, one specific to each named
landing. Wonders are tied to the landing, not merely to a generic habitat
type. A landing with multiple habitats still has its own distinct Wonder.

Additional landings and Wonders may be added later.

## Provisional Wonders

- **Forest: The Worldroot Conservatory**. A buried ecological engine whose
  roots thread through the forest. The Ancient Ones used it to cultivate
  living materials and regulate biodiversity.
- **Plains: The Horizon Engine**. A structure spanning the horizon that once
  shaped weather, redirected rivers, and maintained continental fertility.
- **Mountain: The World Anvil**. A forge built into the roots of a mountain
  range, used to manufacture tools, machines, and perhaps artificial life.
- **Water: The Tide Crown**. A chain of towers extending from the shore into
  open water, built to control tides, currents, and coastal climates.
- **Wetland: The Renewal Basin**. A biochemical system beneath the marsh that
  purified water and transformed dead matter into new life.

These names and descriptions are provisional. The Wonder found should be
specific to the current place. The five habitat-based entries above are
starting concepts to adapt into the six landing-specific Wonders, rather than
a final one-per-habitat roster.

## Second step: Rapture

Finding the Wonder reveals that it will not awaken passively. People must be
assigned to work directly on it. This is a new, dangerous job, currently
called **Rapture**.

- Rapture workers are assigned to the Wonder rather than to an ordinary
  production building.
- The work is dangerous enough that workers can die during an incident.
- Guards can be assigned to protect the workers.
- A guard can protect only as long as there is an eligible guard available.

### Guard defense

Whenever a Rapture worker would die and a guard can intervene, the guard has a
60% chance to save the worker. If the rescue succeeds, the guard then has one
of three outcomes:

- 40% chance of injury
- 40% chance of death
- 20% chance of becoming a hero, preventing the incident's losses and getting
  everyone out safely

If the defense fails, the worker dies. The exact guard consequence on a failed
defense is not yet specified.

### Injured guards

Injured guards may continue defending the Wonder workers, but if only injured
guards remain, the guard-outcome odds become more dangerous. Doubling the
death weight and renormalizing the three outcomes produces:

- 28.57% chance of injury
- 57.14% chance of death
- 14.29% chance of becoming a hero

The injury and death states, guard recovery, and whether heroes grant a
lasting benefit remain to be designed.

### Armor

Armor must count during Rapture incidents. Every point of armor pushes the
odds in the wearer’s favor by 10%, compounding rather than adding linearly.
The basic modifier is therefore `1.10 ^ armor`.

Armor should be applied to the person exposed to the relevant danger:

- Worker armor improves the chance that a worker survives the initial danger
  and reaches the guard-defense stage.
- Guard armor improves the guard's outcome after a successful rescue, pushing
  the result away from death and injury and toward survival or heroism.
- Any modified outcome table must be renormalized so all final probabilities
  still total 100%.

The exact mapping from armor to each outcome remains to be tuned. The key
rule is that armor compounds and never becomes a flat additive percentage.

### Raiding and defending bonuses

Existing bonuses to raiding or defending also apply during Rapture incidents.
They improve the odds that the endangered citizen is not killed, using a
multiplicative modifier rather than adding percentage points.

For example, a +20% relevant strength changes the base 60% citizen-survival
chance to 72% (`60% × 1.20`). The result is capped at 100%.

These bonuses affect the citizen-survival roll. They do not directly alter the
guard's injury, death, or hero outcome after a successful rescue.

## Third step: Establish a Foothold

After the Wonder has been found and the Rapture work begins, the expedition
enters the Wonder itself. The first objective inside is to establish a
foothold.

- Workers explore the interior and try to understand how to move through it
  safely.
- Foothold progress is earned through time and specific Wonder researches.
- Researches should represent discoveries made inside this particular Wonder,
  not ordinary settlement technologies.
- The foothold is a progression stage toward awakening the Wonder, not merely
  another passive production bonus.

### Interior expeditions

Establishing a foothold reveals new expeditions within the Wonder. These
expeditions uncover routes, tools, safeguards, and information that improve
the odds of continued progress.

These interior expeditions are non-enduring support. Their benefits apply to
the current Wonder attempt and are not treated like permanent world
expeditions that improve every future cycle.

## Researchers outside

Researchers remain outside the Wonder while the Rapture workers operate
inside. They are therefore mostly safe and can study the evidence, coordinate
the work, and unlock the specific researches needed to establish the
foothold.

Some researches have a price in citizens. These are not ordinary worker-slot
costs or a temporary upkeep. They represent desperate decisions made to keep
the Wonder attempt moving and protect the people still inside. A citizen-cost
research permanently consumes the stated number of citizens from the current
expedition.

The outside research layer should make the player weigh the safety of the
settlement against the lives already committed to the Wonder. Researchers are
safer than the people inside, but the attempt is not consequence-free for
them or for the settlement supporting it.

## Wonder sections

Each Wonder is divided into five sections. Progress through the interior is
organized around completing these sections.

- Completing a section marks it as open and secured.
- A marked section remains open when the player migrates away from the Wonder.
- Returning to that Wonder does not require fighting or working through that
  section again.
- Section progress persists throughout the current reset layer.
- The marked sections are cleared only when reaching the end of this reset.

This lets the player make repeated expeditions to the same Wonder without
repeating completed danger, while still making the Wonder a finite objective
for the current cycle.

### Section failure

If the number of people assigned to the active section ever falls to zero,
that section is lost. The player must restart the section from the beginning
when they return to it.

Completed sections remain open and are not lost. Only the section currently
being worked on can collapse in this way.

### Escalating lethality

Each section is 25% more deadly than the previous section, compounded
multiplicatively. Using section one as the baseline, the danger multipliers
are:

1. 1.00×
2. 1.25×
3. 1.5625×
4. 1.953125×
5. 2.44140625×

The fifth section is therefore more than twice as deadly as the first. This
modifier applies to the section's danger events and combines with the Wonder's
own escalating calamity.

### Intended pressure

Foothold progress is deliberately a long commitment. The baseline section
threshold is 240 progress, with each Rapture worker contributing 0.02 progress
per second before research and interior-expedition modifiers. A single worker
therefore needs 200 minutes for one section, and a complete five-section push
would take 1,000 minutes before bonuses.

Wonder-specific research costs are multiplied by five. Base Wonder incident
danger is 0.0024 per worker-second before section, research, expedition, armor,
and guard modifiers.

### Obstructions

Each section contains five physical obstructions. The expedition encounters one
roughly every fifth of the section. When the expedition reaches one,
foothold progress stops, but danger continues once the player resumes the
chronicle. The first discovery pauses the game and marks the obstruction in the
Wonders tab so the player can build the required charge, key, anchor, device,
or seal. These are one-time costs for the current Wonder attempt and remain
cleared if the settlement migrates and returns. If supplies are not currently
available, the obstruction can be placed in the ordinary Construction queue;
doing so resumes the chronicle while the settlement gathers the materials.

Without adequate guards, Rapture workers are effectively facing certain death
over the course of a full Wonder attempt. The expedition should be survivable
through preparation, strong defenses, armor, and careful use of the available
support expeditions, but never casual.

Guards are the central counterweight to the Wonder's lethality. Injured and
dead guards reduce that protection, so a push that begins safely can become a
slow-motion collapse if the player continues without rebuilding their defense.

## Wonder tab

Wonders have a dedicated tab for the active Wonder attempt. The tab remains
hidden until the player assigns the first person to the Wonder.

Once revealed, it is the central place to follow the struggle inside. It shows
the current section and progress, assigned Rapture workers, guards and their
condition, deaths and injuries, the active calamity, Wonder-specific
researches, interior expeditions, and any other items or decisions belonging
to that Wonder.

The tab should make the danger legible at a glance. The player should be able
to see both how close they are to completing the current section and how close
the operation is to losing its foothold.

## Wonder descriptions

Each Wonder should reveal itself through increasingly grand descriptions as
the expedition advances. Every section has its own account of the alien place
the people are entering, with the scale and strangeness rising as they move
deeper.

- Section one introduces the impossible threshold and the first signs of the
  Wonder's true scale.
- Sections two through four reveal progressively larger spaces, systems, and
  implications.
- Section five presents the full approach to the Wonder's heart.
- Reaching the decision receives a final culmination description before the
  player chooses its fate.
- After the choice, the Wonder receives a separate aftermath description that
  depends on the selected ending.

The descriptions should make the Wonder feel like an alien place being
understood piece by piece, not a sequence of identical rooms or generic
progress messages.

## Wonder calamities

Each type of Wonder has its own horrible calamity. The calamity is part of the
Wonder's identity and worsens as the expedition presses through its five
sections.

- Every completed section increases the severity of that Wonder's calamity.
- The calamity should create a worsening operational pressure, not just deal
  generic damage.
- The final section should feel like an approach to collapse, with success
  possible but the settlement operating under extreme strain.
- Calamities persist as part of the current Wonder attempt and are relieved or
  cleared when the larger reset ends.

### Desert example: draining the power away

The desert Wonder begins drawing power from the settlement as it wakes. Each
section increases the drain. By the fifth section, the settlement is barely
running on fumes, with power income largely consumed by the Wonder's demand.

The intended shape is a steadily worsening power crisis:

1. noticeable but manageable power drain
2. meaningful pressure on normal operations
3. power reserves begin to disappear
4. most surplus power is consumed
5. the settlement is nearly running on fumes

The desert biome is not part of the current five-biome set yet, so this is a
future Wonder example rather than an immediate implementation target.

## Reaching the end

If the expedition survives the fifth section, the Wonder reaches a state where
it can finally be decided. The player chooses its fate:

1. **Become One with the Wonder**. Send the settlement's leader into the
   Wonder to serve as its living will, guide, or consciousness. The leader is
   lost as an ordinary person, but the Wonder may respond in ways no other
   choice allows.
2. **Restore Its Old Purpose**. Turn the Wonder on and let it perform the job
   for which the Ancient Ones built it. This may provide the most direct or
   powerful benefit, but the settlement accepts whatever that original purpose
   was.
3. **Silence the Wonder**. Shut it down permanently so it can trouble nobody
   ever again. This gives up its power, but ends its calamity and prevents the
   danger from returning.

The exact benefits, costs, and narrative consequences are Wonder-specific.
The choice is the conclusion of that Wonder for the current reset.

## After the choice: Hope

Regardless of which fate the player chooses, the Wonder attempt ends in a
migration. This migration is automatic. Once the Wonder has been decided, the
player does not choose whether to leave.

The player receives a new persistent resource: **Hope**. The people have been
touched by the Wonder and carry something of that contact forward, whether it
became a living companion, resumed its ancient purpose, or was silenced.

Hope functions like Echoes. It can be spent on permanent unlocks and other
lasting improvements that remain available beyond the current migration. The
amount and exact uses of Hope may vary by Wonder and by the ending chosen.

## Returning to a Wonder

Choosing one ending does not permanently close the other possibilities. In a
later attempt, the player can find the same Wonder again, survive its five
sections again, and choose a different fate.

With enough time and patience, a player can eventually complete all three
outcomes for a Wonder:

- become one with it
- restore its ancient purpose
- silence it forever

The game should track these outcomes separately as part of the Wonder's
long-term history. Completing one outcome does not prevent the other outcomes
from being pursued in future attempts.

### Desert Wonder: Restore Its Old Purpose

Turning the Wonder on and letting go restores its ancient function. It absorbs
light as it once did, drawing the desert Wonder back into operation beneath
the sun.

Permanent effects:

- **Hot days are 50% less likely.**
- **Solar power** becomes permanently available as soon as the settlement has
  any energy-giving or energy-requiring buildings.
- Solar power is a high-scaling power source that requires no input. It only
  needs to be pointed at the sun.

Ancients be praised.

### Desert Wonder: Silence the Wonder

Turning off the desert Wonder means turning away from the Ancient Ones’
answers. Humanity gives up whatever power the old machine might have offered
and chooses to light its own way forward.

Permanent effect: **Steam power sources produce 1 additional Energy forever.**

This is the desert Wonder's Silence outcome. It should be useful and
meaningful, but clearly express independence rather than inheritance.

### Desert Wonder: Become One

Sending the leader into the desert Wonder makes them the power that drives it.
They are no longer entirely human. Something Ancient now looks out through
them, and the settlement can only hope that what returned is still on their
side.

Permanent effect: gain **Ancient points**, a new long-term resource like Hope
and Echoes.

This outcome grants no additional practical production bonus or other direct
benefit. Its reward is knowledge and access to Ancient points, while the loss
of the leader and the alien nature of the transformation remain the true
cost.

The existing named places are Emberplain, Greenfold, Grayrocks, Floodmeadows,
Ashfen, and Windmere. The first implementation gives each one its own Wonder.
Additional terrain and Wonder types can come later.
