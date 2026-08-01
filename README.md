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
- **k-anonymity** (Sweeney 2002) and the **homogeneity attack** (Machanavajjhala et al. 2007), for the contrast.
- **zCDP → (ε, δ) conversion**, so the 2020 Census's published ε can be re-derived from the ρ the Bureau actually budgeted in.

All randomness comes from `crypto.getRandomValues`. ε is an exact rational throughout — never a float — because the samplers compare integers and a mechanism is only as private as its sampler.

**Security model:** a *statistical* guarantee against an adversary with unlimited computing power and unlimited side knowledge, bounding what can be concluded about **any one individual**. It is not a cryptographic primitive; nothing here is encrypted. **This is not production code** — it is a teaching demo.

## How the Page Is Structured

The page is a lesson with a reference inside it, and it opens as the lesson.

- **One curriculum table** (`src/ui/curriculum.ts`) drives three things that used to be three parallel lists able to drift apart: the objectives stated up front, the core path's four steps, and the exit challenge's four questions. An objective with no interaction behind it, or an interaction nothing tests, is now not expressible.
- **Learning objectives** are stated up front, before any exhibit.
- **A core path** of four ideas sits immediately after the intro: why aggregates fail, what ε promises, why sensitivity matters, why privacy is a budget. Each names the one interaction that establishes it, the exit question that tests it, and is marked *Established* only once that interaction has actually run — not by scrolling past it, and **not by a linked ε arriving from another exhibit**. Exactly one step carries a *Start here* tag: the first not yet established.
- **Two routes.** The **guided route** is the default and removes the expert panels (k-anonymity, the guessing experiment, the composition-rule chart, post-processing, the deployments panel), naming in plain text what it has set aside. **Explore everything** restores them. The honest-scoping section is never hidden on either route.
- **Linked ε.** On the guided route one ε drives Exhibits 2, 3 and 4 together, with a readout beside every control showing `b = Δ/ε` at the current values, what an attacker's belief could reach, and what one release would cost the session ledger. Unlink it to park two exhibits at different ε.
- **Attack before defence.** On the guided route Exhibit 5 reorders so the averaging attack runs before the ledger appears — the budget arrives as the answer to a problem you have already watched happen. The swap moves DOM nodes rather than setting CSS `order`, so reading and focus order stay in step with the visual order.
- **An exit challenge** of four scenarios that appear nowhere else on the page, reported as concepts to revisit rather than as a score. Each wrong answer links to the exact interaction that re-establishes the idea — and where that interaction is one the guided route sets aside, the link widens the route on the way and says so.
- **Every release quotes its price.** The dial, the guessing game and the DP-mode differencing attack all name what they would cost the same session ledger. They quote rather than charge, because being locked out of a teaching panel teaches nothing — but no release on the page is allowed to look free.
- **Classroom mode** swaps the samplers onto a fixed seed so a lesson can be rehearsed and repeated. It is never the default, it selects and retries nothing, and every seeded panel says so on screen.

See [TEACHING.md](TEACHING.md) for lesson routes and debrief answers.

## Exhibits

1. **Two harmless totals, one person's salary** — the whole twelve-record database, printed, and then the **differencing attack** run against it: "total payroll" minus "total payroll excluding Alice" is Alice's exact salary, to the dollar, from two queries that never name a person. Switch the same two queries to ε = 1 and the attack still runs and stops meaning anything. Beside it, the obvious alternative: generalise the quasi-identifiers until the table is k-anonymous. The page **measures** k at each generalisation (1 → 1 → 3 → 6) and then runs the **homogeneity attack** — at k = 3 and again at k = 6, every equivalence class is unanimous about the sensitive attribute, so the k guarantee holds fully intact and the salary band falls out anyway.
2. **The definition, drawn** — the headline mechanism. Two worlds, one with Alice and one without, both asked "how many people earn more than $100,000?" (true answers 6 and 5). The first chart is the two output distributions; the second is the **log of their pointwise likelihood ratio, between rails at ±ε**. Drag ε from 0.01 to 10 and watch that line step from one rail straight to the other and sit there — the bound is *attained at every output*, not merely respected, which is what a tight ε looks like. Switch to the Gaussian and the same line becomes a straight diagonal through both rails: a Gaussian tail is too light for any pure ε, and the page computes the **exact δ** — `Σₓ (Pr[M(D)=x] − e^ε·Pr[M(D′)=x])₊` — that the failure costs. The panel also prints two numbers that turn out to be identical, and explains why: the total variation distance between two discrete Laplace distributions one step apart is exactly `tanh(ε/2)`, so the optimal attacker's success rate `(1 + tanh(ε/2))/2` is exactly the belief bound `e^ε/(1 + e^ε)`. The mechanism is tight in both senses at once, and the suite asserts the equality at every stop on the ladder.
3. **Can you tell which world you are in?** — the break-it-yourself panel. Draw 2,000 real releases from each world and watch the histograms build across animation frames, overlaid on the exact PMF; the panel then measures the total variation distance off the histograms and compares it with the closed-form prediction. Then the game: a cryptographic coin picks a world, the real mechanism releases one answer, and you guess. Your running score sits next to the best score *any* attacker could achieve at that ε — a theorem, not a comment on your attention span.
4. **The dial: what ε costs in usefulness** — pick a query, an ε and a mechanism, and read both sides at once: how far an attacker's belief can move, and how wrong the answer is. The typical error and the 95% interval are summed off the mechanism's own PMF. Switching from the headcount to the total payroll changes the noise by five orders of magnitude at the same ε, because **sensitivity**, not ε alone, sets the scale — and the panel shows where Δ came from (a declared clamp, never the observed data). A second panel releases the payroll and the headcount and divides them, because **post-processing is free**.
4b. **Where does Δ come from? You have to answer** — the deployment skill the rest of the page only describes. Declare a bound on one person's salary *before* looking at the data, and read what it costs on both sides: raise it and the noise rises in proportion, lower it and every record above it is clipped, so the answer is biased by an amount no averaging will remove. Then a thirteenth person is hired at $480,000, above the bound that was already published, and you choose: clip her, drop her record, or quietly raise the bound to fit. The third is offered because it is the one a well-meaning engineer picks, and it is then **refused** — Δ read off the observed maximum makes the *noise scale* a function of the data, so two neighbouring databases produce releases with different scale parameters and an attacker reads the top salary off the noise itself.
5. **Composition: ε is a budget, not a setting** — a working, fail-closed ledger. Ask questions, watch the budget deplete, and watch a query that would overdraw get **refused** rather than answered. Both composition rules are plotted as functions of k with the crossover computed. Then the attack the ledger exists to prevent: ask the same ε = 0.5 question a few hundred times and average, and the running error falls as 1/√n straight onto the predicted `b√2/√n` curve until the true payroll is recovered — from answers that were each, individually, differentially private.
6. **ε in the wild** — Apple, Google's RAPPOR, and the 2020 US Census, each ε put through the same belief calculation the rest of the page uses so the numbers can be compared rather than admired. The column that matters is **provenance**: published by the operator, measured by outside researchers from a shipping binary, or derived here from some other published parameter. The Census entry re-derives its own ε from ρ = 2.63, landing on 18.19 by the standard conversion and 17.43 by the Rényi-optimised one against the Bureau's published 17.14 — one mechanism, three defensible labels.

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
- **Expecting DP to protect a group.** ε bounds what can be learned about *one person*. Conclusions about a population — that this company pays engineers well — are exactly what the release is for, and DP neither prevents them nor claims to.

## Live Demo

https://systemslibrarian.github.io/crypto-lab-dp-noise/

Run the differencing attack and recover a salary. Drag ε and watch two distributions merge. Declare a salary bound, then meet the person who does not fit it. Run the averaging attack and take the true payroll back, then spend a budget until the mechanism refuses to answer. Four ideas, about fifteen minutes, and a navigator that tells you which one you are on.

Then switch to **Explore everything** for the rest: play twelve rounds of the guessing game and land on the theoretical ceiling, watch the Gaussian sail through the ±ε rails, and compare Apple's, RAPPOR's and the Census's ε on one axis.

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
npm test           # 239 unit tests
npm run build      # typecheck + production build
npm run test:a11y  # accessibility gates, both themes (needs a build first)
```

`npm run test:a11y` runs two suites. `e2e/a11y.spec.ts` is the axe conformance sweep — every exhibit driven through its states, in both themes, on both routes. `e2e/task.spec.ts` is the one that asks whether the lesson can actually be *completed*: the whole core path with a keyboard alone, the same path at 375 × 667 asserting no horizontal overflow with every disclosure open, and every core conclusion read out of the data tables with the SVGs removed from the document. Automated WCAG checks are necessary and they do not establish that a dense mathematical interaction is operable.

## Related Demos

- [crypto-lab-silent-tally](https://systemslibrarian.github.io/crypto-lab-silent-tally/) — secure multi-party computation. MPC protects the inputs; DP protects the output. The natural pair.
- [crypto-lab-blind-oracle](https://systemslibrarian.github.io/crypto-lab-blind-oracle/) — oblivious pseudorandom functions, another way of computing on data you are not allowed to see.
- [crypto-lab-ckks-lab](https://systemslibrarian.github.io/crypto-lab-ckks-lab/) — homomorphic encryption, where the noise is the ciphertext's rather than the privacy's.

## Build & Verify

**239 unit tests** (Vitest), all executed in CI before deploy. What they actually pin down:

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

Statistical assertions run on a seeded generator, so a failure means the sampler is wrong rather than that a coin landed badly. The page itself uses `crypto.getRandomValues` and never `Math.random()`.

**Accessibility gates**, both blocking the Pages deploy:

- **Conformance.** `@axe-core/playwright` scans the production build for zero WCAG 2.1 A/AA violations in **both** themes, across fourteen interaction states per theme — every exhibit driven, every disclosure opened, every verdict rendered, both routes, and the sensitivity exercise's refusal.
- **Task completion.** A separate suite asks the question axe cannot: the four core ideas established with **keyboard input only** (Tab, Enter, arrow keys — no synthetic clicks); the same path at **375 × 667** with an assertion of no horizontal overflow, including with every disclosure open; and every core conclusion read **with the chart SVGs removed from the document**, which asserts the findings exist as numbers rather than that the pictures were described.
- **The lesson's own claims.** Three tests hold the instructional spine to what it says: a linked ε sync must *not* establish another exhibit's step (this one was written against a real bug — moving the dial used to tick off the definition); exactly one step carries the next-action tag, and it advances; and a revisit pointer into expert-gated material actually reveals it.

## Performance

The exact samplers are the expensive part, and deliberately so. A discrete Laplace draw costs about `1/γ` geometric trials, so the 4,000 draws behind Exhibit 3's histograms run in a few hundred milliseconds at ε = 1 and are chunked across animation frames — the motion on this page *is* the computation, never decoration. Queries with a large Δ are released on a coarse lattice for the same reason: an exact integer sampler at Δ = $250,000 would need minutes per draw. Readers who ask for reduced motion get the same work done in one pass.

---

*One of 170+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
