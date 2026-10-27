# DP Noise

**Differential privacy · ε-δ · Laplace mechanism** — runs the real Laplace and Gaussian mechanisms over a twelve-person payroll so you can watch what DP actually promises about two databases that differ by one person. Not that they become impossible to tell apart: that an attacker's odds of telling them apart move by at most a factor of `e^ε`. The advantage is *bounded*, never eliminated — the optimal attacker still succeeds with probability `(1 + tanh(ε/2))/2`, and the page shows that number next to the bound. Then watch even that guarantee evaporate when the budget is spent.

**Live demo:** https://systemslibrarian.github.io/crypto-lab-dp-noise/
**Teaching with it:** [TEACHING.md](TEACHING.md) — prerequisites, 15/30/60-minute routes, discussion prompts, expected misconceptions, and which interactions are stochastic.

---

## What It Is

Differential privacy (Dwork, McSherry, Nissim & Smith, TCC 2006) is a promise about a *computation*, not about a released table: for every pair of databases differing in one person's record, and every possible output `x`,

```
Pr[M(D) = x]  ≤  e^ε · Pr[M(D′) = x]
```

Everything else follows from that inequality. Bayes turns it into a bound on belief — an observer who thought it an even chance you were in the data cannot end up more than `e^ε/(1+e^ε)` sure — and that is the sentence ε actually buys.

This page implements the mechanisms rather than describing them:

- **The discrete Laplace mechanism**, sampled exactly as the difference of two Geometric(1 − e^−γ) draws, using only rational Bernoulli comparisons (Canonne–Kamath–Steinke 2020).
- **The discrete Gaussian mechanism**, sampled by CKS20's rejection algorithm, with σ calibrated by the **analytic Gaussian mechanism** (Balle & Wang, ICML 2018) rather than the loose textbook bound.
- **The textbook continuous Laplace**, offered and labelled — sampling `b·ln(u)` over a double is what nearly every tutorial does, and it is what Mironov (CCS 2012) turned into a recovery attack.
- **Basic and advanced composition** (DMNS; Dwork–Rothblum–Vadhan, in Kairouz–Oh–Viswanath's heterogeneous form), both computed on every request, with the cheaper one billed.
- **k-anonymity** (Sweeney 2002) and the **homogeneity attack** (Machanavajjhala et al. 2007), for the contrast — then **distinct ℓ-diversity** and **ordered t-closeness** (Li, Li & Venkatasubramanian, ICDE 2007), computed as exact BigInt fractions, and a **two-release intersection attack** (Ganta, Kasiviswanathan & Smith, KDD 2008) that defeats both.
- **zCDP → (ε, δ) conversion**, so the 2020 Census's published ε can be re-derived from the ρ the Bureau actually budgeted in.
- **Geo-indistinguishability on a local Euclidean plane**, with the ideal planar Laplace density, an attained ε-times-distance likelihood-ratio bound, sampled radial and nearest-service utility, a finite-grid boundary counterexample, and repeated-release transcript accounting (Andrés et al., CCS 2013, §§3–5.3).

All live randomness comes from `crypto.getRandomValues`. The payroll mechanisms use exact rational ε and exact rational Bernoulli comparisons. The geo exhibit is intentionally different and says so wherever it runs: it samples the ideal planar density with 53-bit IEEE-754 uniforms, so it is a bounded teaching implementation, not the paper's finite-precision digital mechanism and not an exact discrete sampler.

The location lesson was checked against Andrés, Bordenabe, Chatzikokolakis and Palamidessi, [*Geo-Indistinguishability: Differential Privacy for Location-Based Systems*](https://arxiv.org/abs/1212.1984), CCS 2013 / arXiv:1212.1984: Definition 3.1 and §§3–5.3. The ideal planar mechanism comes from §§4.1–4.2; the radial utility calculation follows Observation 5.1 and Proposition 5.2; the repeated/correlated-location limits follow §§3.3 and 5.3. The 7 × 7 normalised exponential grid is this lab's separate bounded counterexample/control, not a reproduction of the paper's finite-precision calibration.

**Security model:** a *statistical* guarantee against an adversary with unlimited computing power and unlimited side knowledge, bounding what can be concluded about **any one individual**. It is not a cryptographic primitive; nothing here is encrypted. **This is not production code** — it is a teaching demo.

## How the Page Is Structured

The page is a lesson with a reference inside it, and it opens as the lesson.

- **One curriculum table** (`src/ui/curriculum.ts`) drives three things that used to be three parallel lists able to drift apart: the objectives stated up front, the core path's four steps, and the exit challenge's four questions. An objective with no interaction behind it, or an interaction nothing tests, is now not expressible.
- **Learning objectives** are stated up front, before any exhibit.
- **A core path** of four ideas sits immediately after the intro: why aggregates fail, what ε promises, why sensitivity matters, why privacy is a budget. Each names the one interaction that establishes it, the exit question that tests it, and is marked *Established* only once that interaction has actually run — not by scrolling past it, and **not by a linked ε arriving from another exhibit**. Exactly one step carries a *Start here* tag: the first not yet established.
- **Two routes.** The **guided route** is the default and removes the expert panels (k-anonymity, the ℓ-diversity/t-closeness card and its intersection attack, the guessing experiment, the composition-rule chart, post-processing, the deployments panel and geo-indistinguishability), naming in plain text what it has set aside. **Explore everything** restores them. The honest-scoping section is never hidden on either route.
- **Linked ε.** On the guided route one ε drives Exhibits 2, 3 and 4 together, with a readout beside every control showing `b = Δ/ε` at the current values, what an attacker's belief could reach, and what one release would cost the session ledger. Unlink it to park two exhibits at different ε.
- **Attack before defence.** On the guided route Exhibit 5 reorders so the averaging attack runs before the ledger appears — the budget arrives as the answer to a problem you have already watched happen. The swap moves DOM nodes rather than setting CSS `order`, so reading and focus order stay in step with the visual order.
- **An exit challenge** of four scenarios that appear nowhere else on the page, reported as concepts to revisit rather than as a score. Each wrong answer links to the exact interaction that re-establishes the idea — and where that interaction is one the guided route sets aside, the link widens the route on the way and says so.
- **Every release quotes its price.** The dial, the guessing game and the DP-mode differencing attack all name what they would cost the same session ledger. They quote rather than charge, because being locked out of a teaching panel teaches nothing — but no release on the page is allowed to look free.
- **Classroom mode** swaps the samplers onto a fixed seed so a lesson can be rehearsed and repeated. It is never the default, it selects and retries nothing, and every seeded panel says so on screen.

See [TEACHING.md](TEACHING.md) for lesson routes and debrief answers.

## Exhibits

1. **Two harmless totals, one person's salary** — the whole twelve-record database, printed, and then the **differencing attack** run against it: "total payroll" minus "total payroll excluding Alice" is Alice's exact salary, to the dollar, from two queries that never name a person. Switch the same two queries to ε = 1 and the attack still runs and stops meaning anything. Beside it, the obvious alternative: generalise the quasi-identifiers until the table is k-anonymous. The page **measures** k at each generalisation (1 → 1 → 3 → 6) and then runs the **homogeneity attack** — at k = 3 and again at k = 6, every equivalence class is unanimous about the sensitive attribute, so the k guarantee holds fully intact and the salary band falls out anyway. A second expert card then runs the two repairs that history actually proposed — ℓ-diversity and t-closeness — and breaks both of them. See *The release criteria* below.
2. **The definition, drawn** — the headline mechanism. Two worlds, one with Alice and one without, both asked "how many people earn more than $100,000?" (true answers 6 and 5). The first chart is the two output distributions; the second is the **log of their pointwise likelihood ratio, between rails at ±ε**. Drag ε from 0.01 to 10 and watch that line step from one rail straight to the other and sit there — the bound is *attained at every output*, not merely respected, which is what a tight ε looks like. Switch to the Gaussian and the same line becomes a straight diagonal through both rails: a Gaussian tail is too light for any pure ε, and the page computes the **exact δ** — `Σₓ (Pr[M(D)=x] − e^ε·Pr[M(D′)=x])₊` — that the failure costs. The panel also prints two numbers that turn out to be identical, and explains why: the total variation distance between two discrete Laplace distributions one step apart is exactly `tanh(ε/2)`, so the optimal attacker's success rate `(1 + tanh(ε/2))/2` is exactly the belief bound `e^ε/(1 + e^ε)`. The mechanism is tight in both senses at once, and the suite asserts the equality at every stop on the ladder.
3. **Can you tell which world you are in?** — the break-it-yourself panel. Draw 2,000 real releases from each world and watch the histograms build across animation frames, overlaid on the exact PMF; the panel then measures the total variation distance off the histograms and compares it with the closed-form prediction. Then the game: a cryptographic coin picks a world, the real mechanism releases one answer, and you guess. Your running score sits next to the best score *any* attacker could achieve at that ε — a theorem, not a comment on your attention span.
4. **The dial: what ε costs in usefulness** — pick a query, an ε and a mechanism, and read both sides at once: how far an attacker's belief can move, and how wrong the answer is. The typical error and the 95% interval are summed off the mechanism's own PMF. Switching from the headcount to the total payroll changes the noise by five orders of magnitude at the same ε, because **sensitivity**, not ε alone, sets the scale — and the panel shows where Δ came from (a declared clamp, never the observed data). A second panel releases the payroll and the headcount and divides them, because **post-processing is free**.
4b. **Where does Δ come from? You have to answer** — the deployment skill the rest of the page only describes. Declare a bound on one person's salary *before* looking at the data, and read what it costs on both sides: raise it and the noise rises in proportion, lower it and every record above it is clipped, so the answer is biased by an amount no averaging will remove. Then a thirteenth person is hired at $480,000, above the bound that was already published, and you choose: clip her, drop her record, or quietly raise the bound to fit. The third is offered because it is the one a well-meaning engineer picks, and it is then **refused** — Δ read off the observed maximum makes the *noise scale* a function of the data, so two neighbouring databases produce releases with different scale parameters and an attacker reads the top salary off the noise itself.
5. **Composition: ε is a budget, not a setting** — a working, fail-closed ledger. Ask questions, watch the budget deplete, and watch a query that would overdraw get **refused** rather than answered. Both composition rules are plotted as functions of k with the crossover computed. Then the attack the ledger exists to prevent: ask the same ε = 0.5 question a few hundred times and average, and the running error falls as 1/√n straight onto the predicted `b√2/√n` curve until the true payroll is recovered — from answers that were each, individually, differentially private.
6. **ε in the wild** — Apple, Google's RAPPOR, and the 2020 US Census, each ε put through the same belief calculation the rest of the page uses so the numbers can be compared rather than admired. The column that matters is **provenance**: published by the operator, measured by outside researchers from a shipping binary, or derived here from some other published parameter. The Census entry re-derives its own ε from ρ = 2.63, landing on 18.19 by the standard conversion and 17.43 by the Rényi-optimised one against the Bureau's published 17.14 — one mechanism, three defensible labels.
7. **A privacy budget measured per kilometre** — instantiate geo-indistinguishability on a declared local Euclidean plane. The exhibit computes two normalised planar densities and a collinear output that attains `ε·distance`; samples the polar mechanism and compares current-run error with the exact radial CDF and mean; measures whether a noisy point still selects the nearest service; and lets an observer compare two candidate paths from the released transcript alone. A separate 7 × 7 grid shows that directly truncating and renormalising `exp(−εd)` at a border can exceed the requested bound, while a half-rate control stays within it. That grid is a separate teaching construction, not the finite-precision mechanism of the paper.

## The release criteria: ℓ-diversity, t-closeness, and what they still leak

A second expert card in Exhibit 1 implements the two repairs to k-anonymity and then defeats them. It is on the **Explore everything** route only; the guided route and the four core steps are unchanged by it, and nothing on it marks a core step established.

### Which definitions, exactly

Both terms name a family, and this page implements one member of each and says so everywhere it appears.

| Implemented here | Stated as | NOT implemented |
| --- | --- | --- |
| **distinct ℓ-diversity** — every equivalence class contains at least ℓ distinct sensitive values | Li, Li & Venkatasubramanian, ICDE 2007, §2, item 1, attributed there to Machanavajjhala et al. | entropy ℓ-diversity (Machanavajjhala et al. Definition 4.1) and recursive (c, ℓ)-diversity (Definition 4.2), both strictly stronger |
| **ordered t-closeness** — every class's distribution is within Earth Mover distance t of the whole released table's, under the ordered ground distance `\|i − j\|/(m − 1)` | Li et al. Definition 2 (the t-closeness principle) with §5.1 (numerical attributes) | the equal and hierarchical ground distances of §5.2, and every other distance the principle admits |

A note on attribution that matters: the **ICDE 2006** ℓ-diversity paper this lab read does **not** define "distinct ℓ-diversity" as a definition of its own. It states the ℓ-diversity *principle* ("at least ℓ well-represented values") and instantiates it as entropy and recursive diversity, observing only that entropy ℓ-diversity implies at least ℓ distinct values. The name "distinct ℓ-diversity" is Li et al.'s, in §2, where it arrives with its own warning: *"Distinct ℓ-diversity does not prevent probabilistic inference attacks."* This page uses that name and that warning.

Primary texts checked: [Machanavajjhala et al., ICDE 2006](https://www.cs.cornell.edu/johannes/papers/2006/2006-icde-publishing.pdf), [Li et al., ICDE 2007](https://www.cs.purdue.edu/homes/ninghui/papers/t_closeness_icde07.pdf), and [Ganta et al., KDD 2008](https://www.shivakasiviswanathan.com/KDD08.pdf).

### The arithmetic, in exact integers

Li et al. §5.1 derive, for `r_i = p_i − q_i`:

```
D[P, Q] = (1/(m − 1)) · ( |r₁| + |r₁+r₂| + … + |r₁+…+r_{m−1}| )
```

Their second form sums i from 1 to m; the two agree because the final partial sum is zero. This lab sums all m terms and **asserts the final term is zero at every class of every release**, so the identity is checked rather than assumed.

Nothing is computed in floating point. With `c_i` the cumulative count in the class, `C` the class size, `g_i` the cumulative count in the table and `N` the table size:

```
D = ( Σᵢ |N·c_i − C·g_i| ) / ( (m−1)·C·N )
```

— a BigInt numerator over a BigInt denominator. The verdict `D ≤ t` is a **cross-multiplication**, `numerator · t.d ≤ t.n · denominator`, so no rounding can decide a pass. The declared `t = 9/64` is exactly the largest class distance in all three releases that pass, which puts the "no more than t" boundary on screen instead of in a sentence.

### The table, and the five releases

Sixteen synthetic records, one per (ZIP prefix, age decade) cell, with an ordered five-band sensitive domain. Its b3/b4 edge matches the lab's integer-dollar query exactly: b3 includes $100,000 and b4 begins at $100,001, because the query asks for salaries **more than** $100,000. Global distribution `(4, 3, 3, 4, 2)/16`.

| Release | k | distinct ℓ | max class EMD | Meets k ≥ 4, ℓ ≥ 3, t = 9/64 |
| --- | --- | --- | --- | --- |
| ZIP to 3 digits + age to 20-year bands | 2 | **1** | 29/64 | no — one class is unanimous (b1 twice): the homogeneity attack |
| Age to 10-year bands | 4 | 3 | **17/64** | no — the 30–39 class holds {b1, b2, b3}, three distinct bands all below $100,000: the **similarity attack** |
| ZIP to 3 digits | 4 | 3 | **9/64** | yes, at equality |
| Age split at 30 | 4 | 3 | **9/64** | yes, at equality — the independently compliant age release used below |
| Age to 20-year bands | 8 | 4 | **9/64** | yes, at equality — the repaired release |

Every one of those numbers is recomputed from the rendered rows by a browser claim test that implements the EMD itself and never reads a verdict label.

### What it cost

The utility metric is one declared query, not a score: *"how many people are in their thirties?"* A record is **certain** when its published age range lies entirely inside the question and merely **possible** when the ranges overlap without containment, so a release answers with an interval and the number reported is its width.

- The release that **fails** t (age decades) answers exactly: `[4, 4]`, ambiguity **0**.
- The release that **passes** t (twenty-year bands) answers `[0, 8]`, ambiguity **8**, against a true answer of 4.

That is the trade, derived from the rows of each release. Li et al. say the same thing about their own criterion: t-closeness "limits the amount of useful information that is released, as it limits information about the correlation between quasi-identifier attributes and sensitive attributes. However, this is precisely what one needs to limit."

### Two compliant releases, one disclosed band

The attack is the intersection attack of Ganta, Kasiviswanathan and Smith, KDD 2008 (arXiv:0803.0032), §1.1.1, which needs exactly the two properties they name and which hold here by construction: **exact sensitive value disclosure** ("the sensitive value corresponding to each member of the group is published exactly") and **locatability** ("given any individual's non-sensitive values ... one can locate the group in which individual has been put in").

In this bounded adaptation the declared sensitive value is the **salary band**, not the raw dollar salary. Each published class exposes its exact band multiset (the counts shown above), from which the attacker obtains the candidate-band set. The result below therefore establishes disclosure of one exact published band; it does not claim recovery of the underlying salary.

Two releases of the same sixteen people, published independently, each meeting the full declared policy — **4-anonymous, distinct 3-diverse and 9/64-close**:

- by ZIP prefix → the target's class admits bands `{b2, b3, b4}`;
- by whether age is under 30 → the target's class admits bands `{b1, b4, b5}`.

This is a bounded constructed counterexample. The unequal age partition (four records under 30, twelve records 30 and over) is declared up front and chosen to make both individual releases satisfy the policy; it is not presented as output from Mondrian, Incognito or an optimisation algorithm. What the run establishes is existence: satisfying these three single-table criteria does not make this pair compose safely.

Neither discloses on its own: each candidate set straddles the $100,000 boundary. Intersected, they leave `{b4}` — the exact band, and with it the same secret the counting query in Exhibit 2 exists to protect.

The raw registry printed on the page is explicitly labelled **omniscient teaching ground truth**, not an attacker-visible release. Before the attack runs, `publishRelease` removes record ids, names, exact ages and salaries. The attacker receives only the two published class views plus explicit background observations — ZIP prefix `981**` and “under 30” — and is never passed the target record or real band. The truth is compared with the result afterwards; tests assert that the public projection contains no target identity or salary and move the target between bands to confirm the attack follows the published values rather than retained truth.

**This is residual disclosure, not unique identification** — the attacker never learns which row is the target — and **one constructed counterexample is not a composition theorem**. The cited paper measured the effect across two census datasets; that is a different claim and is not reproduced here.

### And none of it is differential privacy

The repaired release is a **deterministic** function of the table. Take the output event *"the serialised release equals the exact string produced on the database that contains the record"*. On the registry that event has probability 1; on the neighbouring registry with the target removed, the serialisation differs, so it has probability 0. ε-DP would require `1 ≤ e^ε · 0`, and no finite ε satisfies that. The two serialisations are computed and compared on every run; the flag is `withTarget !== withoutTarget` and both branches of that comparison are tested.

The scope is kept narrow, on the page and here:

- it is about **this deterministic release and this event**, and is **not** a claim that a k, ℓ or t transformation could never appear inside some differentially private mechanism;
- it says nothing about whether ℓ-diversity or t-closeness succeed on their own terms;
- and ε does not rescue what the criteria miss: DP does not stop a release teaching true things about a population, and promises nothing about any particular sensitive value — only that the released answer would have looked much the same had one person never been in the table.

### Distinctions the card keeps visible

k-anonymity vs distinct ℓ-diversity · distinct vs entropy vs recursive ℓ-diversity · similarity and skewness attacks vs homogeneity · class distribution vs whole-table distribution · a release criterion vs a randomised neighbouring-world mechanism · one release vs linked repeated releases · what record linkage assumes vs what the table shows outright · residual disclosure vs unique identification · synthetic teaching data vs production de-identification.

Increasing k, raising ℓ or tightening t does **not** buy a monotonically increasing amount of privacy, and the page shows why rather than saying so: raising k above leaves the homogeneity disclosure untouched, a distinct 3-diverse class still discloses which end of the scale someone is on, and both of the releases that meet every criterion are still defeated by publishing the other one. Li et al. say of their own measure that "the relationship between the value t and information gain is unclear", and quote the pair (0.01, 0.99) vs (0.11, 0.89) sitting at the same EMD as (0.4, 0.6) vs (0.5, 0.5).

### Why a second table

The twelve-person payroll could not carry this lesson, and the reason is recorded rather than papered over. Salary tracks department there almost exactly, so every generalisation that separates the target from the low-paid support staff leaves *them* a unanimous class, and every generalisation that does not leaves the target's candidate set unchanged. No pair of independent releases of those twelve rows both satisfies a stated k/ℓ/t policy *and* intersects to something new about one person. Rather than weaken a release until an attack appeared, this exhibit declares a second sixteen-row synthetic registry built for the job. **Nothing in `src/dp/database.ts` is touched**, and a unit test asserts the payroll's k, its homogeneity leak and its record count are exactly what they were.

### Claim → code → test

| Claim on the page | Code | Test |
| --- | --- | --- |
| every record is in exactly one class, at every release | `describeRelease` via `analyse` in `kanon.ts` | *partitions the registry at every release* |
| measured k and distinct ℓ per release | `describeRelease`, `distinctBands` | *%s is %s-anonymous and distinct %s-diverse* |
| the class and whole-table band counts | `countBands` | *computes the exact counts the README prints*; *uses the WHOLE table as the reference distribution* |
| the exact EMD and its normalisation | `orderedEmd` | hand calculations on two- and three-point domains; *has a final cumulative term of exactly zero*; *normalises by (m−1)·C·N* |
| the t verdict, including equality | `meetsThreshold` | *passes below t, passes AT t, and fails above it*; *is met at equality by all three passing releases* |
| distinct ℓ passes where t fails | `ClassReport.noneAboveThreshold` | *finds a distinct 3-diverse class whose values are all below the threshold* |
| the repaired release meets all three | `describeRelease` | *is repaired by a release that meets k, ℓ and t together* |
| the utility interval and its width | `answerAgeQuery` | *derives the truth from the actual rows, at every release* |
| each release meets its stated criteria alone | `describeRelease` | *publishes two releases that each satisfy the stated k, ℓ and t on their own* |
| the attacker gets no hidden record state | `publishRelease` | *removes identities and raw salaries before the attacker runs* |
| the intersection, from attacker-visible rows only | `intersectReleases` | *narrows five bands to one, and the one is right*; *reads the published rows, and tracks them when they change*; *follows the target's own band when that band changes* |
| this event rules out finite ε for the deterministic release | `neighbourContrast`, `separatesWorlds` | *computes the two neighbouring releases rather than asserting the conclusion*; *distinguishes a separating event from an event that establishes nothing* |
| the payroll results are unchanged | — | *leaves the payroll table and every result computed from it untouched* |

Malformed inputs fail explicitly rather than returning a number: an empty class, an empty table, a mismatched or one-value domain, negative/fractional/inconsistent counts, a zero denominator or negative value in either side of the threshold comparison, an unreadable published age range, a backwards query range, missing or ambiguous attacker observations, an unknown release id, and a neighbouring-world request for a record that is not in the table.


## When to Use It

- **Use differential privacy** when you must publish statistics computed over people's data and cannot enumerate in advance what an attacker already knows. That last clause is the whole point: every pre-DP approach fails against side information, and DP is the first definition that quantifies over it.
- **Use the Gaussian mechanism** when you compose many queries, or when the query is vector-valued and its ℓ₂ sensitivity is much smaller than its ℓ₁ — and you can accept a δ.
- **Use the Laplace mechanism** when you want pure ε with no failure probability at all.
- **Do NOT use it to protect inputs.** DP protects the *output* of a computation from revealing an individual. If the problem is that no one should see the raw inputs at all, that is secure multi-party computation — see [crypto-lab-silent-tally](https://systemslibrarian.github.io/crypto-lab-silent-tally/). The two are complementary and neither substitutes for the other.
- **Do NOT use it as a re-identification shield for a released microdata table.** DP is not anonymisation; a DP release of a dataset is not "the dataset with the names removed", and treating it that way is how deployments get their utility and their privacy both wrong.
- **Do NOT use this code.** It is a teaching implementation. Use [Google's differential privacy libraries](https://github.com/google/differential-privacy) or [OpenDP](https://github.com/opendp/opendp).

## What Can Go Wrong

- **A float sampler.** `b·ln(u)` over a double-precision uniform does not have the Laplace distribution — it has one with gaps and duplicated masses whose low-order bits depend on the true answer. Mironov (CCS 2012) recovers the answer from them. Exhibit 4 offers this mode, labelled; the page's default draws only exact rational Bernoullis.
- **A lattice mismatch.** Releasing on a coarse grid without first rounding the true answer onto that grid gives the two neighbouring databases *disjoint supports*, an infinite likelihood ratio, and no privacy — from a step that looks like a rendering detail. This page rounds first, and pays one extra step of sensitivity for it (`ε/(gridSteps + 1)`, not `ε/gridSteps`).
- **Sensitivity read off the data.** Δ must come from a declared bound. A Δ computed from the observed maximum salary is itself a function of the data and leaks it.
- **No composition accounting.** Exhibit 5 runs the averaging attack: individually private answers, averaged, give the true value. Privacy that is displayed but never charged is not privacy.
- **A budget that warns instead of refusing.** A release cannot be un-released. The only fail-closed response to an exhausted budget is to stop answering, which is what `Ledger.request` does — it returns `null`, and the caller is required to treat that as "no answer exists".
- **Quoting an ε without its provenance or its conversion.** Exhibit 6 shows the same Census mechanism carrying three defensible ε a full unit apart, depending only on which accountant converted ρ.
- **Quoting a location ε without a metric or unit.** `ε = 0.5` in Exhibit 7 means `0.5 km⁻¹` on a local Euclidean plane. Changing kilometres to metres without changing ε changes the guarantee by a factor of one thousand.
- **Cropping and renormalising at a map boundary.** A finite output set gives different normalising constants to inputs near its border. The executable grid control shows the naive rate-ε shortcut violating an εd bound; deterministic post-processing of an already-private ideal draw and defining a new renormalised grid mechanism are not the same operation.
- **Treating one protected point as a protected path.** Independent releases compose, and correlated trajectories require an explicit model. The path panel pays the sum of the per-point bounds and labels its two-candidate example rather than claiming general trajectory privacy.
- **Treating ℓ-diversity or t-closeness as a privacy guarantee.** They are criteria on one published table. Two tables that each satisfy them, published independently, can still disclose an individual's sensitive value exactly — the card in Exhibit 1 does it with two releases of the same sixteen people. Neither criterion quantifies over what else has been released, which is the gap differential privacy was defined to close.
- **Expecting DP to protect a group.** ε bounds what can be learned about *one person*. Conclusions about a population — that this company pays engineers well — are exactly what the release is for, and DP neither prevents them nor claims to.

## Live Demo

https://systemslibrarian.github.io/crypto-lab-dp-noise/

Run the differencing attack and recover a salary. Drag ε and watch two distributions merge. Declare a salary bound, then meet the person who does not fit it. Run the averaging attack and take the true payroll back, then spend a budget until the mechanism refuses to answer. Four ideas, about fifteen minutes, and a navigator that tells you which one you are on.

Then switch to **Explore everything** for the rest: play twelve rounds of the guessing game, watch the Gaussian sail through the ±ε rails, compare deployed ε values, and run the planar location mechanism through its exact metric bound, sampled utility, finite-map failure and repeated-release transcript.

## Real-World Usage

| Deployment | Model | ε | Provenance |
| --- | --- | --- | --- |
| Apple — keyboard and emoji telemetry | Local | ≈ 16/day | Measured by outside researchers ([Tang et al. 2017](https://arxiv.org/abs/1709.02753)) |
| Google RAPPOR — Chrome telemetry | Local | ε∞ ≈ 2.04 | Derived from the Chrome parameters in the paper's §5.4, f = 0.75 with h = 2 hash functions ([Erlingsson et al. 2014](https://arxiv.org/abs/1407.6981)) |
| US Census 2020 — redistricting file | Global | 17.14 at δ = 10⁻¹⁰ | Published; budgeted as ρ = 2.63 in zCDP |

The 2020 Census is the largest deployment of differential privacy ever attempted and the one with the most at stake — the PL 94-171 file draws voting districts.

## How to Run Locally

```bash
npm install
npm run dev        # http://localhost:5173/crypto-lab-dp-noise/
npm test           # current unit suite; prints the live test/file totals
npm run build      # typecheck + production build
npm run test:a11y  # accessibility/reflow gates in the pinned dark theme (needs a build first)
npm run test:mutations # clean baseline, then 22 focused source mutations (8 geo, 14 release-criteria)
```

`npm run test:a11y` runs two suites. `e2e/a11y.spec.ts` is the axe conformance sweep — every exhibit driven through its states on both routes, in the lab's pinned dark theme at desktop and phone width. `e2e/task.spec.ts` is the one that asks whether the lesson can actually be *completed*: the whole core path with a keyboard alone, the same path at 375 × 667 asserting no horizontal overflow with every disclosure open, and every core conclusion read out of the data tables with the SVGs removed from the document. Automated WCAG checks are necessary and they do not establish that a dense mathematical interaction is operable.

## Related Demos

- [crypto-lab-silent-tally](https://systemslibrarian.github.io/crypto-lab-silent-tally/) — secure multi-party computation. MPC protects the inputs; DP protects the output. The natural pair.
- [crypto-lab-blind-oracle](https://systemslibrarian.github.io/crypto-lab-blind-oracle/) — oblivious pseudorandom functions, another way of computing on data you are not allowed to see.
- [crypto-lab-ckks-lab](https://systemslibrarian.github.io/crypto-lab-ckks-lab/) — homomorphic encryption, where the noise is the ciphertext's rather than the privacy's.

## Build & Verify

The **current Vitest suite** is executed in CI before deploy; `npm test` prints its live test and file totals. What it actually pins down:

- **Sampler correctness.** `bernoulliExpNeg` is checked against `e^−γ` at five values of γ — the CKS20 parity is easy to transcribe inverted, which silently yields `Bernoulli(1 − e^−γ)`, a sampler that looks right and is exactly wrong. `uniformBelow` is χ²-tested for modulo bias. The discrete Laplace's sampled PMF, mean and variance are checked against the closed form; the discrete Gaussian's mean and variance against σ.
- **The ε bound itself**, asserted at **every stop on the ε ladder** and end-to-end on the real database: the largest likelihood ratio between the two neighbouring payrolls equals `e^ε` to six digits — attained, not merely respected — and needs a δ below 1e-12. Asserted twice: once over a comfortable range, and once over **the range Exhibit 2 actually examines**, which is about fifteen times wider. That second assertion exists because the first one passed while the page disagreed with it — out past roughly 75 lattice steps both PMFs underflow to zero in a double, so a ratio taken as the quotient `a/b` returned `Infinity` and the bound was reported as broken at ε = 7 and ε = 10 for a mechanism that meets it exactly. The ratio is now taken from the closed-form log ratio, which never underflows.
- **The verdicts are wired to the computations they describe.** Exhibit 2's "the rails hold" banner branches on the measured maximum ratio against `e^ε`, not on which mechanism is selected; Exhibit 4b's refusal branches on `isPrivateCalibration` applied to where that choice's Δ came from, not on the option's name; and Exhibit 1 derives "recovered exactly" from `recovered === truth`. A banner that cannot come out the other way establishes nothing, so none of these is written as a literal.
- **RAPPOR's ε∞ carries its `h`.** Theorem 1 of Erlingsson et al. is `ε∞ = 2h·ln((1 − f/2)/(f/2))`, where `h` is the number of Bloom-filter hash functions — an easy factor to drop, because it sits outside the logarithm, and dropping it reports a guarantee twice as strong as the paper proves for Chrome's `h = 2`. A test asserts the linear scaling in `h` and pins the Chrome parameters (`f = 0.75`, `h = 2`, §5.4) to ε∞ ≈ 2.043.
- **Reference values.** Φ to twelve digits at nine points plus a relative-error check at Φ(−8) ≈ 6.22e-16, where an absolute-error test would pass for an implementation that returned zero. Laplace closed forms (95% interval = 2.9957·b, 75th percentile = b·ln2). The 2020 Census zCDP conversions.
- **Cross-checks between independent routes.** The δ summed pointwise off the *discrete* Gaussian's PMF agrees within 10% with Balle & Wang's closed form for the *continuous* Gaussian at the same σ. The analytic calibration is verified to beat the textbook one everywhere the textbook one is claimed to hold, and the textbook σ is verified to actually satisfy its target δ.
- **The attacks.** The differencing attack recovers the target's salary to the dollar under exact answers and fails under DP; the averaging attack converges within 4 standard deviations of the predicted `b√2/√n`. k is measured at every generalisation level, and the homogeneity leak is asserted at k = 3 and k = 6.
- **The fail-closed ledger.** An over-budget request returns null *and leaves the ledger unchanged* — the second half is the part worth testing. The session ledger the exhibits share is tested separately: a quote must predict a refusal without spending anything, and one panel's spending has to be visible to another's quote.
- **Contribution bounding.** Δ comes from the declared bound and not from the database: the same bound over two databases with different maxima must give the same Δ and the same noise scale, while `expand` — the option the page refuses — is asserted to give *different* sensitivities for neighbouring databases, which is the leak stated as a test. The bias/noise trade is asserted to run in opposite directions across the offered bounds, and the best bound is asserted to depend on ε rather than on the data alone, because an exercise whose answer never changes is not a decision.
- **The instructional state.** Completion is idempotent and never notifies twice for the same step, `update` never touches the completion set, and the store opens on the guided route with cryptographic randomness — a default that silently flipped to seeded would make every "this is the real mechanism" claim on the page false.
- **The curriculum's own integrity.** Every core step has exactly one challenge question and no question is shared; every link is a real in-page anchor; the mid-sentence concept form keeps its proper nouns, so nothing can regenerate it by lowercasing and print "the gaussian"; and the set of revisit targets flagged as expert-gated is asserted exactly, because a flag that drifts sends a guided reader to a section that is not on their page.
- **Geo-indistinguishability.** Known-answer tests pin the planar density, attained metric bound, radial CDF and quantiles. A seeded 50,000-draw check distinguishes the Gamma(shape 2) radius from independent coordinate noise. Finite-grid probabilities are normalised and independently audited at every output cell; the naive border violation and half-rate control are both pinned. Transcript inference accepts public paths and releases but no ground-truth argument, and its loss is checked against the sum of every per-release metric bound. Browser claims independently reproduce the seeded current-run utility and transcript rather than trusting rendered labels.
- **ℓ-diversity and t-closeness.** Exact k, distinct ℓ, class and whole-table distributions, and the ordered EMD as a BigInt fraction, with hand calculations on two- and three-point domains, the zero final cumulative term, normalisation invariance under doubling both distributions, malformed-distribution refusals, and the threshold applied below, **at** and above t. The similarity class is asserted to be distinct 3-diverse *and* over t; the repaired release to meet all three criteria; the utility interval to be derived from the rows and to contain the truth. The intersection attack is asserted to use two releases that each pass k, ℓ **and t**, to receive a public projection with no identity or raw salary, to disclose nothing from either release alone, to narrow five bands to one, and to move when the published rows move. The payroll's own k, homogeneity leak and record count are asserted unchanged.
- **Focused mutation evidence.** `npm run test:mutations` first requires every owning suite to pass unmodified, then makes twenty-two concrete source edits — eight covering geo density normalisation, likelihood orientation, radial CDF/sampling, finite-grid normalisation/audit and transcript accounting, and fourteen covering distinct-value counting, the reference distribution, the EMD normalisation factor, a dropped and a reversed cumulative term, `≤` versus `<` at the threshold, a scenario label standing in for the computed verdict, the age-partition boundary, secret-bearing fields in the public projection, a dropped release in the intersection, ground truth leaked into the attacker, an inverted deterministic-release event check, a stale utility truth and a collapsed query interval. Every edit must fail its named owning test; the runner restores and hashes the sources, then reruns the clean baseline before accepting the run.

Statistical assertions run on a seeded generator, so a failure means the sampler is wrong rather than that a coin landed badly. The page itself uses `crypto.getRandomValues` and never `Math.random()`.

**Accessibility gates**, both blocking the Pages deploy:

- **Conformance.** `@axe-core/playwright` scans the production build for zero WCAG 2.1 A/AA violations in the lab's pinned dark theme across the complete state drive — every exhibit, both routes, sampled and refusal states, all disclosures, desktop and phone reflow. Exhibit 7 adds its idle, invalid, sampled-utility, four-release and twelve-release states to that same gate.
- **Task completion.** A separate suite asks the question axe cannot: the four core ideas established with **keyboard input only** (Tab, Enter, arrow keys — no synthetic clicks); the same path at **375 × 667** with an assertion of no horizontal overflow, including with every disclosure open; and every core conclusion read **with the chart SVGs removed from the document**, which asserts the findings exist as numbers rather than that the pictures were described.
- **The lesson's own claims.** Three tests hold the instructional spine to what it says: a linked ε sync must *not* establish another exhibit's step (this one was written against a real bug — moving the dial used to tick off the definition); exactly one step carries the next-action tag, and it advances; and a revisit pointer into expert-gated material actually reveals it.

## Performance

The exact samplers are the expensive part, and deliberately so. A discrete Laplace draw costs about `1/γ` geometric trials, so the 4,000 draws behind Exhibit 3's histograms run in a few hundred milliseconds at ε = 1 and are chunked across animation frames — the motion on this page *is* the computation, never decoration. Queries with a large Δ are released on a coarse lattice for the same reason: an exact integer sampler at Δ = $250,000 would need minutes per draw. Readers who ask for reduced motion get the same work done in one pass.

---

*Part of the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
