# What Would Make DP Noise a 10/10 Teaching Lab

## Executive judgment

This is already an unusually strong and technically honest differential privacy lab. The mechanisms are real, the central definition is visualized rather than merely quoted, learners can run attacks themselves, and the page consistently connects formal guarantees to attacker belief. The exact samplers, explicit limitations, deployment provenance, fail-closed budget, prediction prompts, and extensive tests put it well above a typical educational demo.

**Current teaching score: about 8.8/10.**

The remaining gap is not correctness or subject coverage. It is instructional control. The page contains enough material for a short advanced workshop, but presents it as one long, equally weighted journey. A motivated newcomer can learn a great deal, yet the page does not reliably establish what they understood, adapt when they are confused, or make the minimum essential path unmistakable.

A 10/10 version should optimize for one durable outcome:

> A learner can explain that differential privacy limits how much one person's presence changes the distribution of outputs; that epsilon controls this limit rather than directly naming an amount of noise; that sensitivity determines the noise required; and that repeated releases consume a finite privacy budget.

Everything else should either build that model or sit behind deliberate progressive disclosure.

## What is already gold-standard

### 1. It starts with a real failure

Exhibit 1 does not ask learners to care about an abstract inequality. It lets them recover Alice's exact salary from two harmless-looking totals, then shows why k-anonymity does not repair the underlying problem. This is excellent problem-first teaching.

### 2. It shows the definition

Exhibit 2 is the strongest part of the lab. The neighboring databases, paired output distributions, and pointwise log-likelihood ratio turn the definition into a visible object. Showing the Laplace ratio touch the epsilon rails, and the Gaussian ratio cross them, communicates both pure DP and the reason delta exists.

### 3. It makes the learner the attacker

The world-guessing game, differencing attack, homogeneity attack, and averaging attack turn claims into actions. Comparing sampled distinguishability against the theoretical optimum is especially strong because it links experiment and theorem without pretending a short simulation proves the theorem.

### 4. It teaches consequences, not just notation

The repeated conversion of epsilon into a worst-case posterior belief is excellent. "An even prior can move to X" is much more meaningful than an isolated epsilon value. The deployment panel also distinguishes published, measured, and derived parameters instead of presenting incomparable numbers as equivalent facts.

### 5. It is unusually honest

The lab clearly distinguishes DP from cryptography, global from local DP, continuous calibration from the discrete mechanism, proof from finite computation, and teaching code from production systems. The lattice approximation and declared sensitivity are disclosed instead of hidden.

### 6. The implementation supports the lesson

Exact rational sampling, cryptographic randomness, fail-closed accounting, computed PMFs, independent cross-checks, and 180 tests mean the page's conclusions are embodied in the code. The accessibility suite also drives dynamic states in both themes rather than scanning only the initial page.

## The changes that would earn 10/10

### Priority 1: Create an unmistakable core learning path

The page currently gives the intro, six exhibits, a recap, and a large scoping section nearly equal visual weight. That is excellent as a reference, but cognitively expensive as a first lesson.

Add a compact progress navigator immediately after the intro with four required ideas:

1. **Why aggregates fail** — run the differencing attack.
2. **What epsilon promises** — move the neighboring-world distributions.
3. **Why sensitivity matters** — compare headcount and payroll at the same epsilon.
4. **Why privacy is a budget** — average repeated answers, then observe refusal.

Mark each idea complete only after its essential interaction occurs. Give learners two explicit routes:

- **Guided lesson:** the four core ideas, approximately 12-15 minutes.
- **Explore everything:** Gaussian delta, k-anonymity, the guessing experiment, deployment accounting, sampler caveats, and full scoping.

This should not be a modal tutorial or a tour that blocks the interface. It should be persistent orientation: where the learner is, what action matters, and what concept that action establishes.

**Acceptance test:** a first-time learner can identify the next meaningful action without reading the whole section, and can finish the core lesson without interacting with expert-only material.

### Priority 2: State objectives first and test transfer at the end

The four prediction checks are good formative assessment, and their wrong-answer feedback is specific. What is missing is a visible contract at the beginning and a transfer task at the end.

Add a short "By the end, you can..." block:

- distinguish a guarantee about a mechanism from anonymization of a table;
- interpret epsilon as a bound on changed output probabilities;
- predict how epsilon and sensitivity affect utility;
- explain why repeated queries must be composed and eventually refused.

Then replace or follow the prose recap with a four-question **exit challenge** that uses new scenarios rather than repeating page wording. For example:

- Two teams both use epsilon = 1, but one releases a count and one releases total revenue. Which is likely noisier, and what information is missing?
- A system gives one epsilon = 0.1 answer every minute forever. Is each answer private? Is the transcript private?
- Names are removed and every row matches nine others. What guarantee has and has not been obtained?
- A Gaussian mechanism's likelihood ratio exceeds the epsilon rail only in rare tails. Which parameter accounts for that?

Give explanation per option and a final concept-level result such as "revisit sensitivity" rather than just a numeric score.

**Acceptance test:** the exit challenge requires applying the model to unseen examples, and each wrong answer points to one exact interaction to revisit.

### Priority 3: Make epsilon, sensitivity, and composition one connected system

The page teaches these correctly, but separate exhibits maintain separate epsilon controls and state. A newcomer can experience them as several demonstrations rather than one causal model.

Add an optional **link controls** mode, on by default in the guided path:

- changing epsilon updates the definition, guessing game, and utility dial;
- the current query exposes its declared sensitivity beside the epsilon value;
- every release displays the privacy cost that would be charged to the same ledger;
- a small persistent readout says: `noise scale = sensitivity / epsilon` for Laplace, with the current values substituted.

Do not reduce epsilon to "noise amount." Keep the hierarchy explicit:

1. epsilon defines the allowable change in output probabilities;
2. sensitivity measures the worst-case change in the query;
3. the mechanism uses both to determine the needed noise;
4. composition accounts for repeated access.

This linked state would make the entire page feel like one model viewed from different angles.

**Acceptance test:** after changing one value, a learner can see its privacy, utility, attacker, and budget consequences without manually recreating the setting in multiple exhibits.

### Priority 4: Turn sensitivity into a decision the learner must defend

The lab does state that sensitivity comes from a declared clamp rather than the observed data. That is technically correct and visible in Exhibit 4, but it remains something the page tells the learner.

Add a bounded-query exercise:

- Let the learner choose a permitted salary range or clipping bound before releasing total payroll.
- Show how the choice changes sensitivity and therefore noise.
- Include one out-of-range employee and make the learner choose between clipping, rejecting, or silently expanding the bound.
- Explain the bias/privacy/domain tradeoff for each choice.
- Never permit "use the maximum in this database" as a valid private calibration; show why that makes the mechanism data-dependent.

This is the most valuable missing deployment skill. Real DP failures often occur in query definition and contribution bounding, not in sampling Laplace noise.

**Acceptance test:** a learner can explain where the payroll sensitivity came from and why calculating it from the observed maximum is unsafe.

### Priority 5: Make composition threat-first in the guided route

Exhibit 5 already contains both the attack and the defense. In the guided sequence, reverse their instructional order:

1. predict what repeated averaging will do;
2. run a short averaging attack and watch error fall approximately as $1/\sqrt{n}$;
3. reveal total epsilon spent;
4. introduce the ledger as the mechanism that prevents the transcript from accumulating unchecked;
5. attempt an over-budget query and observe that no answer is produced.

The full exhibit can retain its current detailed composition chart. The guided route should first establish that the budget is a security control, not administrative bookkeeping.

**Acceptance test:** learners encounter the averaging failure before being asked to understand composition formulas.

### Priority 6: Provide equivalent access to every important visualization

The headline ratio chart exposes a numeric table, and the page's tables and SVG labels are thoughtfully accessible. The remaining charts generally provide a concise `aria-label` but not their complete underlying values.

For every instructional chart, provide a collapsed "Data and interpretation" disclosure containing:

- a compact table of the plotted values or representative points;
- the trend in one sentence;
- the exact observation the learner is expected to make;
- for sampled charts, a clear distinction between sampled and theoretical values.

Also test keyboard-only completion of the guided path and test at narrow mobile widths, not only axe conformance. Automated WCAG checks are necessary, but they do not establish that a dense mathematical interaction is operable or comprehensible.

**Acceptance test:** every learning objective can be completed without interpreting color, pointer movement, or an SVG image.

### Priority 7: Reduce simultaneous prose without removing rigor

The writing is accurate and often excellent, but several verdicts and notes carry multiple advanced qualifications at once. The page should preserve all of that rigor while staging it.

Use a three-layer pattern consistently:

- **Observation:** one sentence describing what just changed.
- **Meaning:** one or two sentences connecting it to the learning objective.
- **Why the details matter:** a disclosure containing calibration caveats, exact formulas, sampler details, and paper references.

In particular, keep the first response after an interaction short enough to scan before the learner continues. Move specialist material such as continuous-versus-discrete Gaussian calibration, CKS20 accounting, and lattice support details into adjacent disclosures, while leaving a visible honesty label that no caveat is being concealed.

**Acceptance test:** the essential conclusion of every interaction is visible in its first two sentences; removing all disclosures still leaves a correct beginner-level lesson.

### Priority 8: Add teacher and reproducibility modes

For classroom use, add a deterministic demonstration seed as an explicit mode while keeping cryptographic randomness as the default. Label seeded output "reproducible classroom run, not live randomness." This lets an instructor prepare a result and prevents an unlucky random sequence from obscuring a point.

Add a small instructor guide to the README or a separate document:

- prerequisites;
- 15-minute, 30-minute, and 60-minute lesson routes;
- discussion prompts;
- expected misconceptions;
- which interactions are stochastic;
- suggested debrief answers;
- accessibility alternatives.

This turns a strong self-guided artifact into reusable curriculum.

**Acceptance test:** an instructor can run a 30-minute lesson without reverse-engineering the page order or relying on a particular random outcome.

## What not to add

A gold-standard revision should resist feature inflation.

- Do not add RDP, privacy amplification, federated learning, or a full local-DP implementation to the core page.
- Do not add a first-visit modal, animated tour, decorative motion, badges, or points.
- Do not turn the lab into a formula-first lecture.
- Do not hide uncertainty by forcing sampled experiments to produce a predetermined "clean" result in normal mode.
- Do not imply that a universal good epsilon exists.
- Do not present a passing empirical test as proof of DP.

The current non-goals are sound. Depth should come from better sequencing, assessment, and transfer, not a larger syllabus.

## Recommended implementation order

### Phase 1: Instructional spine

1. Add explicit learning objectives.
2. Add the four-step guided path and completion state.
3. Reorder the guided composition experience to attack before defense.
4. Add the exit transfer challenge.

This phase provides the largest gain with little change to the mathematical implementation.

### Phase 2: Connected mental model

1. Add linked epsilon state across exhibits.
2. Add the persistent epsilon/sensitivity/noise relationship readout.
3. Add the bounded-sensitivity decision exercise.
4. Make ledger cost visible from every release in guided mode.

### Phase 3: Inclusive depth and teaching support

1. Add data disclosures for every chart.
2. Add keyboard and mobile task-level Playwright tests.
3. Add reproducible classroom mode.
4. Add the instructor guide and lesson routes.
5. Conduct learner observation and revise from evidence.

## The evaluation that should decide whether it is truly 10/10

Do not call the revision gold-standard based only on tests or expert review. Run five to eight observation sessions with learners who know basic probability but have not studied DP.

Before using the lab, ask them to explain what they think epsilon means. After the guided route, ask them to solve the four transfer questions without the page. Record:

- whether they can distinguish epsilon from amount of noise;
- whether they mention sensitivity when comparing utility;
- whether they understand the neighboring-database model;
- whether they recognize repeated release as cumulative privacy loss;
- where they hesitate or scroll backward;
- which chart or interaction they cite in their explanation.

A defensible 10/10 bar would be:

- at least 80% answer all four core transfer questions correctly;
- all learners can identify the four-step path without facilitator help;
- no learner leaves believing epsilon is a re-identification probability or a direct noise quantity;
- keyboard-only and screen-reader users can complete the same objectives;
- experts find the caveats and exact accounting without those details blocking newcomers;
- unit, build, and both-theme accessibility gates remain green.

## Final verdict

The lab already has gold-standard mathematical integrity and teaching honesty. Its strongest achievement is that it repeatedly makes the learner compare two worlds, then connects that comparison to attacks, utility, and belief.

To become a 10/10 teaching artifact, it should stop behaving primarily like an excellent interactive reference and start behaving like a measured lesson: declare the outcomes, guide the minimum path, connect the controls into one causal model, require transfer to new situations, and verify the lesson with real learners. The technical depth should remain; the learner should simply encounter it at the moment it becomes useful.
