# Teaching with DP Noise

A guide for running this page as a lesson rather than leaving it as a reference. It assumes you have read the page yourself once and want to put it in front of other people.

**Live page:** https://systemslibrarian.github.io/crypto-lab-dp-noise/

---

## The one outcome to aim at

Everything below is in service of a single durable result. A learner who has finished should be able to say, unprompted:

> Differential privacy limits how much one person's presence changes the *distribution* of outputs. ε controls that limit — it is not an amount of noise and not a probability of re-identification. Sensitivity determines how much noise a given ε requires. Repeated releases spend a finite budget, and the correct end of that budget is a refusal.

If a session produces that and nothing else, it worked. If it produces the Balle–Wang calibration and not that, it did not.

## Prerequisites

- **Required:** what a probability distribution is; that a distribution can be more or less spread out; comfort reading a chart with two curves on it.
- **Helpful, not required:** knowing what a likelihood ratio is; having met Bayes' rule; any prior exposure to anonymisation or GDPR-style de-identification.
- **Not required at any point:** calculus, measure theory, cryptography, or any programming. Nothing in the core path asks a learner to read code.

The one thing worth checking in advance is whether the group already believes "anonymised means safe". If they do, Exhibit 1 will do more work than anything else on the page, and you should give it more time than the schedule below allows.

## Before the session

0. **Know where the lesson lives.** The navigator after the intro is the spine: four ideas, the interaction that establishes each, and the exit question that tests each. Exactly one step is tagged **Start here** — the first not yet done — so if you lose your place mid-session, that tag is the answer. Steps tick over only when the learner runs the interaction themselves; dragging a linked ε in a different exhibit deliberately does not count.
1. **Open the page and pick a route.** It opens on the **guided route**, which removes the expert panels (k-anonymity, the guessing experiment, the composition-rule chart, post-processing, and the deployments panel). That is the right setting for the 15- and 30-minute routes. Switch to **Explore everything** for the 60-minute route.
2. **Turn on classroom mode** if you are demonstrating rather than letting people drive. It is the checkbox at the foot of the intro section. Every sampled panel then draws from a generator seeded at a fixed value, so the run you rehearse is the run you get. The mechanisms and samplers are unchanged; only the sequence of draws is fixed, and every seeded panel says so on screen. Leave it **off** if learners are working on their own machines — an unrepeatable run is the honest default, and the label would otherwise be a distraction.
3. **Decide whether you are driving.** The four core interactions take about a minute each to run live. The averaging attack at n = 2,000 takes noticeably longer than at n = 200, and the point lands at either.

## Lesson routes

### 15 minutes — the core path only

Guided route. Four interactions, no detours. This is the minimum that produces the outcome above.

| Time | What | Where |
|---|---|---|
| 0–3 | **Why aggregates fail.** Run the differencing attack in exact mode. Let them see Alice's exact salary. Then switch the same attack to ε = 1 and run it again. | Exhibit 1 |
| 3–7 | **What ε promises.** Drag ε from 1 down to 0.1 and back. Watch the two curves slide together, then read the ratio chart against its rails. | Exhibit 2 |
| 7–11 | **Why sensitivity matters.** Hold ε fixed. Switch the query from the headcount to the total payroll. Read the noise scale before and after. | Exhibit 4 |
| 11–15 | **Why privacy is a budget.** Run the averaging attack. Then ask the ledger for four payroll queries and watch the fourth be refused. | Exhibit 5 |

Skip the exit challenge if you are genuinely at fifteen minutes; hand it out as follow-up instead.

### 30 minutes — the core path, defended

Guided route, plus the two things that make the core path stick.

- **0–15:** as above.
- **15–22:** **The sensitivity exercise** (Exhibit 4b). This is the highest-value seven minutes on the page for anyone who will ever build one of these systems. Let them pick a bound, then meet Mara Kowalski at $480,000 and choose what happens to her. Do not tell them which option is wrong — let someone pick "raise the bound" and read the refusal.
- **22–30:** **The exit challenge.** Four scenarios that appear nowhere else on the page. Have them answer individually before discussing. The result names concepts to revisit rather than a score.

### 60 minutes — everything

Explore route. Add, in roughly this order:

- **k-anonymity and the homogeneity attack** (Exhibit 1, second card). The natural follow-up to "so what should they have done instead?"
- **The guessing game** (Exhibit 3). Best done as a competition. Let someone play twenty rounds at ε = 5, then twenty at ε = 0.1, and put both scores next to the theoretical ceiling.
- **The Gaussian and δ** (Exhibit 2, mechanism selector). Switch mechanisms and watch the ratio line sail straight through the rails.
- **The composition rules** (Exhibit 5, chart card). Basic versus advanced, and the crossover.
- **Post-processing is free** (Exhibit 4). Two releases, one division, no extra cost.
- **ε in the wild** (Exhibit 6). Ends the session on provenance: published, measured, derived — three different kinds of claim, and the Census's own ρ converting to three defensible ε.

## Discussion prompts

Ordered roughly by where they fit.

1. After the differencing attack: *"The system's rule was 'only aggregates, never an individual'. Was that rule badly written, or is the whole idea broken?"* (Broken. No aggregate-selection policy survives subtraction.)
2. After Exhibit 2: *"If ε = 1 lets an attacker's belief move from 50% to 73%, is that a lot?"* (There is no answer. That is the point — the number has to be argued for in context, and the page refuses to supply a "good" ε.)
3. After the sensitivity comparison: *"Two companies both say 'we use ε = 1'. What do you still need to know?"* (The query, its sensitivity, how the bound was chosen, how many releases, and the trust model.)
4. During the sensitivity exercise: *"Who at your organisation would sign off on the salary bound, and what would they base it on?"* (This is usually the moment the room realises the hard part is organisational.)
5. After the averaging attack: *"Every one of those answers was correctly differentially private. What failed?"* (Nothing in the mechanism. The accounting around it.)
6. After the refusal: *"Your dashboard is out of budget at 9am. What do you actually do?"* (There is no good answer, and finding that uncomfortable is the correct reaction. Options are: stop answering, serve cached prior releases, raise the budget and say so publicly, or re-scope the release. Note that "add more noise" is not among them.)
7. Closing, if you reached Exhibit 6: *"The Census published ε = 17.14. e^17 is about 24 million. Is that privacy?"*

## Expected misconceptions

These are the four the page is built to dislodge, with the evidence that dislodges each. Each also has a prediction check on the page that names it explicitly.

| Misconception | Why it is appealing | What to show |
|---|---|---|
| **"ε is how much noise you add."** | It is almost true — noise is Δ/ε — and it survives every example where Δ = 1. | Exhibit 4: hold ε fixed, switch the query, watch the noise move by five orders of magnitude. |
| **"ε is the probability of being re-identified."** | It is a small number attached to a privacy claim. | ε is not bounded by 1; deployments ship ε = 16 and 17. Show the deployments panel, or just point at the ladder's top end. |
| **"If we anonymise hard enough, we're fine."** | It is what most regulation still assumes. | Exhibit 1's k-anonymity card: generalise to k = 6 and watch every class stay unanimous. |
| **"Each answer is private, so all the answers are private."** | Each answer genuinely *is* private. The claim is locally true and globally false. | Exhibit 5's averaging attack. Two thousand private answers, one true payroll. |

A fifth, less common but worth watching for: **"a small ε means the attacker learns nothing."** It means they learn little about *any one person*. Population-level conclusions are what the release is *for*. The last card in the recap says this; say it out loud too.

## Which interactions are stochastic

Anything below will differ from run to run unless classroom mode is on. Plan around them, and never promise a specific number in advance.

- **Exhibit 1, the differencing attack in DP mode** — five runs, five different recovered values. The exact-mode attack is deterministic and always recovers $142,000.
- **Exhibit 3, the sampled histograms** — 2,000 draws per world; the measured guess rate lands within about a point of the prediction.
- **Exhibit 3, the guessing game** — a cryptographic coin picks the world. A short run can beat the theoretical ceiling by luck, and the page says so once someone does.
- **Exhibit 4, releasing answers** — six independent draws. At small ε these can come back negative; that is not a bug and the page explains it when it happens.
- **Exhibit 5, the averaging attack** — the error curve wanders around the 1/√n prediction rather than sitting on it. A run that tracked the theory exactly would be the suspicious one.

Everything else — the ratio chart, the belief bounds, the utility curves, the composition rules, the equivalence-class table, the sensitivity exercise — is computed exactly and will be identical on every machine.

## Debrief answers for the exit challenge

Four scenarios, none of which appears elsewhere on the page. The correct option sits in a different position in each question — first, second or third — so "it's always the first one" will not get anyone through, and so you can refer to "the second option" in debrief and have it mean the same thing for everyone in the room.

1. **Two teams, same ε, different queries.** Team B's revenue total is noisier, and they have not told you the declared bound on one contributor's revenue. Without Δ, an ε does not determine the noise, the accuracy, or whether the calibration was legitimate.
2. **A dashboard answering once a minute forever.** Each answer is private at ε = 0.1; the transcript is not private at any useful ε. A day costs 144 by basic composition, and averaging recovers the true value. Privacy is a property of what the analyst walks away with.
3. **Names removed, every row matching nine others.** Guaranteed: no unique identification from those columns. Not guaranteed: secrecy of the sensitive value, because nothing requires the ten records to disagree. That is the homogeneity attack.
4. **A Gaussian exceeding e^ε only in rare tails.** δ, which is the total probability of landing where the ε promise simply fails — not a small extra loss and not a confidence level. Raising σ does not fix it: the log-ratio of two Gaussians is a straight line and crosses any rail eventually.

## Accessibility alternatives

Every learning objective on the page can be met without interpreting colour, moving a pointer, or seeing an SVG.

- **Every chart** carries a collapsed **"Data and interpretation"** disclosure holding the plotted values as a table, the trend in one sentence, and the exact observation to make. For charts that mix simulation with theory, it also says which marks are which. If you are teaching a group where anyone is using a screen reader, open these by default and teach from the tables — they are the same findings, not summaries of them.
- **Nothing is carried by colour alone.** Every status has an icon and a word; every chart series has a distinct line style as well as a colour; the selected route and the completed steps say "selected" and "Established" in text.
- **Keyboard-only completion is tested**, not assumed: `e2e/task.spec.ts` walks the whole core path with Tab, Enter and arrow keys, and fails if any step cannot be reached.
- **Phone width is tested** at 375 × 667, including with every disclosure open, and fails on any horizontal overflow.
- **Reduced motion** is respected: with `prefers-reduced-motion` set, the sampling animations compute in one pass instead of building across frames. The result is identical.
- The **charts re-proportion** below 640px rather than letterboxing, and their type scales back up so it stays readable.

If you need a version with no interaction at all — for a slide deck, or for asynchronous reading — the data disclosures plus the recap section carry the entire argument in text.

## Running the lesson from a laptop that is offline

The page is a static build with no backend and no network calls after load. `npm run build && npm run preview` serves it locally; nothing leaves the browser and nothing is persisted. A single browser tab is the whole environment.

## What this page will not do for you

- It will not tell your learners what ε to use, and you should not either. There is no universal answer and the page deliberately refuses to imply one.
- It will not prove the definition. The ε bound is *computed* over the outputs examined, which is evidence rather than a theorem — the honest-scoping section says so, and so should you.
- It will not teach local DP, Rényi DP, federated learning, or how to use a production library. Those are out of scope by design; point people at [OpenDP](https://github.com/opendp/opendp) or [Google's libraries](https://github.com/google/differential-privacy) for the real thing.

## If you want to know whether it worked

Score the outcome, not the session. Before the lesson, ask each learner to write one sentence on what they think ε means. After it, ask them to answer the four exit-challenge scenarios from memory, and record:

- whether they distinguish ε from an amount of noise;
- whether they mention sensitivity when comparing two systems' utility;
- whether they can describe the neighbouring-database comparison;
- whether they treat repeated release as cumulative loss;
- where they hesitated, and which chart or interaction they cite when explaining.

The bar worth holding this page to is that at least four in five get all four scenarios right, that nobody leaves believing ε is a re-identification probability, and that keyboard-only and screen-reader users complete the same objectives as everyone else.
