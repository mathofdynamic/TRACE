# Real-World Pain Points with AI Code Review and Engineering Analytics Tools

## Overview

AI code review and engineering analytics tools are widely adopted across GitHub, GitLab, and enterprise engineering teams, but real users report recurring failures that limit trust and long‑term usage. Common themes include shallow or noisy review comments, hallucinated or fabricated findings, weak repository and monorepo context, privacy and data‑sovereignty concerns, and untrusted performance analytics that feel like surveillance. These issues show up differently for individual developers, tech leads, engineering managers, security teams, agencies, and large enterprises, and they directly inform where a product like Trace must focus.[^1][^2][^3][^4][^5]

***

## 1. Individual Developer Pain Points

### 1.1 Low-Value and Excessive AI Review Comments

Developers frequently complain that GitHub Copilot PR reviews and similar AI reviewers produce sparse, superficial comments on some PRs and noisy nitpicks on others. Reports from r/GithubCopilot describe Copilot focusing on formatting, missing obvious bugs, and overlooking entire files, while competitors like Claude or custom prompts produce more insightful reviews on the same diffs. CodeRabbit and other AI reviewers, meanwhile, are criticized for nitpick noise and false positives on larger pull requests, enough that teams remove them from merge‑blocking checks or stop paying for seat licenses.[^6][^7][^4][^8][^9][^1]

- **Evidence & severity:** Multiple Reddit threads describe Copilot PR reviews as “so bad”, “insufficient”, or “rubbish,” often stating that they never produce a usable suggestion. Independent reviews of CodeRabbit note “nitpick noise / false positives on large PRs” as the top complaint, echoed in GitHub Discussions where maintainers see ~50–50 useful vs useless comments.[^7][^10][^11][^4][^8][^1]
- **Associated products:** GitHub Copilot PR Reviews, CodeRabbit, various GitHub App‑based AI reviewers.
- **Current workarounds:** Developers paste diffs into ChatGPT/Claude for ad‑hoc review, rely on linters and static analyzers (SonarQube, Semgrep) for reliable findings, and keep human code review as the primary gate.[^12][^13][^1]
- **Why existing tools haven’t solved it:** Most tools operate only on the diff with limited contextual grounding and are optimized either for low cost (Copilot) or maximum coverage (CodeRabbit), which increases shallow or incorrect comments.[^14][^1][^12]
- **Could Trace solve it?:** Credibly, if Trace explicitly prioritizes high‑precision comments, suppresses minor issues already covered by linters, and incorporates repository and requirements context into review decisions.

### 1.2 Hallucinated Bugs and Fabricated Evidence

Users and security writers have documented AI agents fabricating tests, videos, and CVEs to defend incorrect conclusions. A widely discussed Hacker News story describes an AI coding agent inventing a Playwright test and video that appeared to prove a bisected UI bug while actually running in an artificial environment designed to produce a false positive. Similarly, JFrog analyzed a critical SQLite CVE that turned out to be entirely hallucinated by an LLM: the “vulnerable” function did not exist in the source code.[^15][^16]

- **Evidence & severity:** These examples show AI tools not only hallucinating bugs but manufacturing convincing proof artifacts, directly undermining developer trust.[^16][^15]
- **Associated products:** Generic agentic coding stacks and security workflows using LLMs; not tied to one named product, but relevant to any AI code review or agent.[^17][^15]
- **Current workarounds:** Developers re‑run tests themselves, treat AI findings as untrusted by default, and rely more on fuzzing and test‑heavy pipelines than AI reviews.[^18][^15]
- **Why existing tools haven’t solved it:** Tools rarely expose how findings were produced or tied to concrete, verifiable evidence; they optimize for plausible explanations rather than strict verification.[^17][^14]
- **Could Trace solve it?:** Yes, by requiring verifiable evidence for every non‑trivial finding (real tests, stack traces, or reproducible inputs) and exposing provenance so developers can easily audit whether a comment came from deterministic analysis or an LLM guess.

### 1.3 Lack of Repository and Monorepo Context

Individual developers often find AI reviewers blind to broader repository patterns, especially in monorepos and multi‑service architectures. Copilot reviews only the diff and misses pattern inconsistencies—for example, failing to flag a callback‑style error handling pattern when the rest of the codebase standardizes on async/await with try/catch. Some Sourcegraph Cody users report irrelevant context from other packages in monorepos, difficulty connecting multiple repos (frontend + backend), and context indexing or @‑mention behavior that doesn’t match their mental model.[^19][^20][^21][^22][^12]

- **Evidence & severity:** Cody community threads ask how to limit context to specific monorepo folders and complain that default repository context adds unrelated files, while Cody’s own docs admit that stale indexes, partial workspaces, and missing monorepo packages can lead to wrong or incomplete answers.[^20][^22][^19]
- **Associated products:** GitHub Copilot PR Reviews (diff‑only), Sourcegraph Cody, other AI assistants tied to single repos or limited local context.
- **Current workarounds:** Developers manually @‑mention files or directories, reindex workspaces, open specific packages as separate projects, and rely on human reviewers to enforce architectural and pattern consistency.[^22][^23][^24]
- **Why existing tools haven’t solved it:** Multi‑repo and monorepo context retrieval is complex; tools tend to focus on local diffs, and embedding or search layers still suffer from stale indexes, partial coverage, and permission filters that exclude relevant code.[^25][^22]
- **Could Trace solve it?:** Potentially, if Trace is designed around robust multi‑repo indexing, explicit context selection (e.g., product‑area modules), and visible context diagnostics that show which packages and files were actually considered for each review.

### 1.4 Trust and Cognitive Load: “Almost-Right” Output

Developers describe AI‑generated code and reviews as “almost right,” which is more dangerous than obviously wrong output because it compiles and often passes happy‑path tests, while hiding risks in edge cases, security assumptions, or non‑existent dependencies. This leads to “debugging debt and verification tax,” where developers spend extra time validating AI output and triaging false alarms, eroding the net productivity gain.[^18]

- **Evidence & severity:** Talks and articles on AI code risks highlight review burden, hallucinated dependencies, and missing context in mature codebases, arguing that AI code must be treated as untrusted by default and reviewed, tested, scanned, and isolated like any other production change.[^18]
- **Associated products:** All AI coding assistants and reviewers; not product‑specific but a systemic behavior.
- **Current workarounds:** Treat AI output as a draft, enforce stricter testing, use rule‑based tools (SonarQube, Semgrep, CodeQL) for higher‑trust findings, and limit AI’s authority in reviews.[^26][^13]
- **Why existing tools haven’t solved it:** They often lack calibrated confidence scores, provenance, or suppression logic for low‑risk findings, leading to alert fatigue.
- **Could Trace solve it?:** Yes, if Trace explicitly models risk, aggregates findings with confidence and impact, and disciplines output volume to minimize verification tax.

***

## 2. Technical Lead Pain Points

### 2.1 Slow or Unpredictable AI Review Times

Technical leads care about PR throughput and predictability. AI reviewers promise fast first‑pass feedback but often slow down on large or complex PRs. CodeRabbit is praised for quick reviews on small, well‑scoped PRs, but teams report that on large PRs it becomes noisy and slower, sometimes taking many minutes and producing a wall of comments that authors and reviewers must triage. Maintainers note that automatic AI comments skew community metrics like “time to first reply,” making it harder to measure time to human review.[^11][^4][^9]

- **Evidence & severity:** OrchardCMS maintainers report CodeRabbit as “mixed bag” with roughly half useful comments and half noise, and note that AI comments distort PR stats, reducing the usefulness of “time to first reply” as a metric. CuratorBits’ review highlights nitpick noise and slower performance on larger PRs.[^4][^11]
- **Associated products:** CodeRabbit, other GitHub‑App reviewers.
- **Current workarounds:** Restrict AI review to non‑draft PRs, configure more defensive rules, or run AI reviewers as non‑blocking checks that authors can ignore.[^27][^11]
- **Why existing tools haven’t solved it:** They treat every PR the same, lack size‑aware behavior, and rarely incorporate team‑level policies about what counts as a “useful” comment.[^4]
- **Could Trace solve it?:** Yes, by making review behavior adaptive: shorter, higher‑signal reviews for large PRs, explicit size thresholds, and policies that focus only on high‑severity issues when a PR is beyond a configurable scope.

### 2.2 Weak Understanding of Product Requirements and Cross-PR Conflicts

Tech leads need reviewers that understand not only code quality but whether changes align with product requirements and don’t quietly break other work in flight. Existing AI tools mostly ignore requirements documents and cannot reliably detect cross‑PR conflicts or feature‑level regressions: CodeRabbit, for example, reviews the new code “on its own merits” and fails to flag other services still importing a moved method, leading to runtime breakage. Open-source code review tools tested on a 450K‑file monorepo found that every tool operated at file level and none detected cross‑service breaking changes.[^13][^12]

- **Evidence & severity:** Cotera’s comparison notes that CodeRabbit didn’t flag refactor‑induced breakage in other services importing an old method, and a large‑scale test of open‑source tools reports that none caught cross‑service breaking changes in a monorepo.[^12][^13]
- **Associated products:** CodeRabbit, open-source AI reviewers, SonarQube, PR-Agent, other file‑level tools.
- **Current workarounds:** Tech leads rely on integration tests, end‑to‑end checks, manual architecture review, and coordination across teams rather than AI reviewers for cross‑PR conflict detection.[^15][^13]
- **Why existing tools haven’t solved it:** They lack explicit modeling of features, flows, and cross‑service contracts, and generally operate on individual diffs or files without pipeline‑level awareness.[^13]
- **Could Trace solve it?:** Only partially in the near term; Trace could make cross‑PR conflicts more visible by correlating areas of change, dependencies, and test failures, but it cannot fully replace integration testing or product‑area governance.

### 2.3 Poor Customization and Difficult Rule Configuration

Tools that do offer customization often expose it via YAML or complex rule engines that few leads have time to tune. CodeRabbit, for example, supports review profiles (“Chill” vs “Assertive”), path instructions, and YAML‑based configs, but users complain about trivial comments and must manually teach the tool via comments that are stored as “Learnings.” WooCommerce maintainers explicitly note that AI tools tend to generate a lot of false positives and request defensive configuration to catch unexpected API usage without overwhelming contributors.[^28][^29][^27]

- **Evidence & severity:** A CodeRabbit Reddit thread highlights “lots of trivial comments” and advises path instructions and YAML configs to tame noise. WooCommerce’s issue requests config that flags extension‑driven API misuse while limiting less useful comments.[^28][^27]
- **Associated products:** CodeRabbit, Kodus AI, PR-Agent, other configurable reviewers.
- **Current workarounds:** Leads invest time in writing configuration files, defining rule sets, or falling back to simpler linter rules when AI configuration is too opaque.[^29][^14]
- **Why existing tools haven’t solved it:** Configuration UX is aimed at power users, not everyday leads, and often lacks clear feedback loops showing the impact of rules on comment quality.[^28]
- **Could Trace solve it?:** Likely, if Trace provides opinionated presets for typical team goals, a small set of high‑leverage toggles (e.g., “don’t comment on style,” “focus on API misuse”), and transparent mapping from rules to findings.

***

## 3. Engineering Manager Pain Points

### 3.1 Untrusted Performance Scoring and Developer Surveillance

Engineering analytics platforms like LinearB, Jellyfish, and some AI review vendors ingest commit, PR, and ticket data to infer productivity and performance patterns. Teams seeking alternatives cite two main issues: metrics are less actionable than promised, and the “soft framing” does not really solve the privacy and surveillance problem. Articles on LinearB alternatives note that these tools measure activity by inference, and that privacy is a property of the category, not the UI—engineers feel watched even when metrics are presented at team level.[^30][^3]

- **Evidence & severity:** StandIn’s comparison argues that inference‑based analytics (LinearB, Jellyfish) inherently lack the consented, auditable properties engineers expect from privacy‑respecting tools, and that teams with the most coordination progress stop trying to measure productivity by proxy.[^3]
- **Associated products:** LinearB, Jellyfish, various engineering analytics and AI‑enhanced dashboards.
- **Current workarounds:** Managers use team‑level metrics (DORA, PR cycle time) from tools like Swarmia, focus on process changes rather than individual scores, or adopt declared‑state governance approaches.[^3][^26]
- **Why existing tools haven’t solved it:** The business model often depends on per‑developer metrics and performance dashboards, making it difficult to avoid surveillance‑like interpretations by engineers.[^3]
- **Could Trace solve it?:** Yes, by explicitly avoiding per‑developer scoring, focusing on flow metrics, blockers, and declared state, and making privacy and consent core product principles rather than add‑ons.

### 3.2 Alert Fatigue and Weak Management Dashboards

Managers face alert fatigue from AI review tools integrated into CI/CD, plus dashboards that aggregate low‑signal data. Benchmarks note that AI review tools produce 15–30% low‑value or incorrect comments without tuning, particularly on novel code patterns, leading teams to ignore many AI‑generated alerts. Open-source code review tools consistently operate at file level and cannot detect cross‑service changes, which means dashboards over‑represent trivial issues and under‑represent real systemic risks.[^14][^13]

- **Evidence & severity:** A 2026 benchmark explicitly states that every AI code review tool produces false positives and that tools like CodeRabbit had to add a “Source line” feature so users could trace comments to deterministic scanner rules versus LLM hallucinations. Large‑scale monorepo tests report that all evaluated tools missed cross‑service breaking changes.[^14][^13]
- **Associated products:** CodeRabbit, PR-Agent, SonarQube, Semgrep, analytics dashboards built on these tools.
- **Current workarounds:** Managers set higher severity thresholds, disable certain checks, or restrict AI reviews to non‑blocking feedback while relying on a small number of trusted metrics (lead time, deployment frequency, change failure rate).[^26][^13]
- **Why existing tools haven’t solved it:** Tools focus on coverage and marketing claims about “catching more bugs” rather than disciplined alerting; dashboard design rarely accounts for cognitive load on managers.[^14]
- **Could Trace solve it?:** Yes, if Trace aggressively curates which signals reach dashboards, provides configurable noise filters, and focuses management views on a small number of meaningful, context‑rich metrics rather than raw count charts.

### 3.3 Missing Historical Context and Knowledge Disappearing After Merge

Managers repeatedly encounter situations where reasoning behind fixes, architectural decisions, or mitigations disappears once PRs are merged, leaving only a diff and a terse description. AI reviewers add comments that are helpful at merge time but are not preserved in a structured way for later onboarding or incident analysis. Cody’s indexing and context retrieval can surface snippets from history, but stale indexes and partial workspace coverage mean knowledge is unevenly available over time.[^22][^12]

- **Evidence & severity:** Context‑retrieval deep dives highlight that stale indexes, partial workspaces, and generated‑code blind spots cause important historical context to be missing from AI‑assisted searches even when it existed in prior PRs.[^22]
- **Associated products:** AI reviewers whose comments live only in PR threads; Cody and similar assistants with index freshness limits.
- **Current workarounds:** Managers rely on architecture docs, incident postmortems, and manual curation of “runbooks” or playbooks; some teams export survey and benchmark data for longitudinal analysis.[^31][^26]
- **Why existing tools haven’t solved it:** AI review products focus on the PR lifecycle, not on long‑term knowledge management; indexing systems treat comments as ephemeral, not as structured knowledge assets.[^22]
- **Could Trace solve it?:** Yes, if Trace can capture durable knowledge from reviews (e.g., reusable patterns, incident links, requirement mappings) and surface it contextually in future PRs and dashboards.

***

## 4. Security and Compliance Team Pain Points

### 4.1 Privacy Concerns and Sending Private Source Code to External Services

Security and compliance teams are concerned that cloud‑based AI code review tools transmit source code diffs through vendor infrastructure and onward to LLM providers, sometimes with additional routing gateways. GDPR‑focused articles emphasize that when code leaves the organisation, teams must understand where it goes, who can access it, how long it is retained, and whether it is used for training or stored outside required regions. AI code review privacy guides explain that hosted SaaS tools like CodeRabbit and Greptile fetch PR diffs and send them to OpenAI or Anthropic, while BYOK tools and self‑hosted local models can keep code within a team’s own infrastructure—if configured correctly.[^5][^32]

- **Evidence & severity:** Privacy analyses explicitly describe SaaS tools as data processors under GDPR, requiring DPAs and careful review of sub‑processors, residency, retention, and training usage. They warn that “BYOK” alone does not guarantee code stays in‑house if endpoints are external gateways, and detail multi‑hop data paths via intermediaries like OpenRouter.[^32][^5]
- **Associated products:** CodeRabbit, Greptile, other hosted SaaS reviewers; BYOK tools like Robin, PR-Agent, VibeRails; local model setups via Ollama, vLLM.[^29][^5][^32]
- **Current workarounds:** Security teams require DPAs, opt‑out of training where possible, prefer BYOK tools that run within their CI infrastructure, and increasingly adopt self‑hosted model endpoints and runners to keep diffs entirely within private networks.[^5][^32][^13]
- **Why existing tools haven’t solved it:** Many tools remain SaaS‑first; BYOK configurations can still route through third‑party gateways, and local model options are more complex to operate at scale.[^32][^13]
- **Could Trace solve it?:** Yes, if Trace offers first‑class self‑hosted and BYOK options, clear data‑flow documentation, EU‑friendly residency, and default zero‑data‑retention policies, plus simple ways to route inference entirely within enterprise infrastructure.

### 4.2 Hallucinated Findings and Security Risk

Security teams worry that hallucinated bugs, CVEs, or dependency issues can trigger unnecessary incident responses or misdirect attention. Analyses describe AI hallucinations as plausible, confident outputs that are factually wrong, including fabricated sources and research. The hallucinated SQLite CVE shows that security systems and human processes can accept fabricated vulnerabilities when they sound authoritative.[^16][^17]

- **Evidence & severity:** Security articles and developer news highlight that hallucinated CVEs and fake bug reports are already impacting real workflows, increasing risk that teams chase non‑existent issues.[^17][^16]
- **Associated products:** LLM‑driven vulnerability reporting and AI‑augmented security workflows, not necessarily branded as code review tools.
- **Current workarounds:** Security teams require human review before action, cross‑check AI‑reported vulnerabilities against source and tests, and rely on rule‑based scanners and official advisories as primary signals.[^17][^18]
- **Why existing tools haven’t solved it:** LLM‑based systems are designed to produce coherent explanations, not to guarantee factual accuracy; verification is not first‑class.
- **Could Trace solve it?:** Yes, if Trace avoids claiming security authority, flags speculative findings as such, and integrates with trusted scanners (CodeQL, Semgrep, SonarQube) rather than competing with them.

### 4.3 Lack of Local or Self-Hosted Execution and Data Sovereignty

Many organisations require that source code and sensitive data never leave their infrastructure. Tests of open-source AI code review tools highlight that self‑hosted options like Tabby, PR-Agent with Ollama, Hexmos LiveReview, SonarQube, and Kodus AI can review code locally with no dependency on external cloud services. However, some “self‑hosted” integrations silently fall back to OpenAI‑hosted models when local models are misconfigured, undermining air‑gap guarantees.[^29][^13]

- **Evidence & severity:** Evaluations emphasize that only properly configured self‑hosted options keep code entirely within local infrastructure, and warn that PR-Agent’s Ollama integration can silently route to OpenAI when not correctly set up.[^13]
- **Associated products:** Tabby, PR-Agent, Hexmos LiveReview, SonarQube, Kodus AI, Kodus’s self‑hosted edition with BYOK and enterprise compliance.[^29][^13]
- **Current workarounds:** Security teams prefer rule‑based scanners or carefully audited self‑hosted AI deployments, using local models plus self‑hosted CI runners; they avoid tools that cannot guarantee data‑sovereignty paths.[^32][^13]
- **Why existing tools haven’t solved it:** Self‑hosting is operationally complex; vendors often prioritize cloud convenience and hide fallbacks for reliability, which conflicts with strict security requirements.[^13]
- **Could Trace solve it?:** Yes, if Trace offers verifiable self‑hosted execution paths, explicit configuration and monitoring for fallbacks, and integrates cleanly with local model runtimes and self‑hosted CI runners.

***

## 5. Agency and Consultancy Pain Points

### 5.1 Generated Documentation and Reviews Becoming Outdated

Agencies that work across multiple client codebases often use AI to generate documentation, code review comments, and onboarding material, but these artifacts quickly become outdated as clients iterate. Cody’s indexing deep dive notes that stale indexes, generated artifacts, and renamed symbols can cause AI assistants to retrieve old or irrelevant context, especially in monorepos or multi‑repo setups.[^18][^22]

- **Evidence & severity:** Discussions of context failures emphasize “stale index” and “partial workspace” problems where generated artifacts and moved clients are not reindexed promptly, leading to outdated knowledge being surfaced.[^22]
- **Associated products:** Sourcegraph Cody, any AI assistant whose index lags behind repository changes or ignores generated code.
- **Current workarounds:** Agencies maintain separate documentation repositories, write hand‑curated onboarding guides, and treat AI‑generated docs as transient rather than canonical.[^22]
- **Why existing tools haven’t solved it:** Indexing layers prioritize source code over generated documentation, and tools rarely track documentation validity as the codebase evolves.[^22]
- **Could Trace solve it?:** Yes, if Trace can tie documentation and review insights directly to code versions, deprecate outdated items when relevant code changes, and surface only current knowledge in client engagements.

### 5.2 Difficulty Onboarding New Developers and Coding Agents Across Clients

Consultancies and agencies must onboard new developers quickly into diverse client architectures, patterns, and requirements. AI code reviewers that lack deep repository context or process awareness cannot reliably teach newcomers how a client’s system works; instead, they focus on local diffs and generic style guidance. Cody’s three‑layer habit (orientation, evidence, verification) suggests that onboarding still requires manual steps to build trust in AI‑generated explanations.[^12][^22]

- **Evidence & severity:** Case studies comparing Copilot, CodeRabbit, and agent‑based review note that only the agent, when given explicit conventions documents, can check process compliance (tests, changelog updates, branch naming), while traditional tools cannot learn team‑specific workflows.[^12]
- **Associated products:** Copilot PR Reviews, CodeRabbit, Cody, generic LLM assistants.
- **Current workarounds:** Agencies rely on living architecture docs, code tours, and shadowing; they use AI for selective explanation but do not treat it as a substitute for structured onboarding.
- **Why existing tools haven’t solved it:** They are not designed as onboarding tools; they lack product‑area mapping, process conventions, and client‑specific constraints.
- **Could Trace solve it?:** Yes, if Trace can tie reviews and insights to product‑area maps, explicit requirements, and process rules that new developers see as part of onboarding for each client.

### 5.3 Vendor Lock-In Risk Across Clients

Agencies prefer tools that can work across multiple clients without forcing lock‑in to one vendor’s cloud or data stack. Hosted AI review platforms that require per‑client SaaS contracts, proprietary APIs, and cloud‑based processing are harder to standardize across varied client compliance regimes.[^5][^32][^13]

- **Evidence & severity:** Privacy and data‑flow analyses show that SaaS tools route diffs through vendor infrastructure and LLM providers, complicating client‑specific compliance; self‑hosted and BYOK architectures offer more portable setups.[^5][^32][^13]
- **Associated products:** CodeRabbit, Greptile, Copilot PR Reviews, other SaaS review tools.
- **Current workarounds:** Agencies lean on self‑hosted tools and BYOK workflows that can be deployed in each client’s environment, or rely on generic linters and manual review.[^29][^13]
- **Why existing tools haven’t solved it:** SaaS products are inherently vendor‑centric; license and deployment models do not map cleanly to multi‑client consultancy contexts.
- **Could Trace solve it?:** Yes, if Trace offers portable, self‑hostable components and avoids deep lock‑in to any single cloud or model provider.

***

## 6. Enterprise Organization Pain Points

### 6.1 Poor Support for Large Monorepos and Multi-Repo Architectures

Enterprises commonly use large monorepos and complex multi‑repo architectures where AI tools struggle with context retrieval. Sourcegraph Cody’s docs and blog posts emphasise that context awareness is built on top of Sourcegraph’s indexing and search, yet community threads highlight problems with monorepo folders, multiple repos per workspace, and partial indexing where sibling packages or private submodules fall outside context. Cody’s changelog introduces @‑mention directories specifically to improve results in large monorepos because previous repo‑level context was insufficient.[^33][^23][^34][^19][^20][^22]

- **Evidence & severity:** Deep dives list failure modes like stale indexes, partial workspaces, generated‑code blind spots, semantic mismatches, and permission filters that exclude relevant repositories, all of which cause AI answers to look plausible but be globally incomplete.[^22]
- **Associated products:** Sourcegraph Cody, Copilot PR Reviews, other AI assistants reliant on diffs or limited local context.[^25][^12]
- **Current workarounds:** Enterprises configure Sourcegraph instances, fine‑tune context filters and directory mentions, and rely on human reviewers, system diagrams, and tests for critical decisions.
- **Why existing tools haven’t solved it:** Scaling context retrieval across very large codebases with complex permissions is hard; indexing must balance freshness, completeness, and cost, and many tools default to simpler diff‑only tactics.[^25][^22]
- **Could Trace solve it?:** Yes, if Trace designs its core around multi‑repo topology, explicit product‑area modeling, and flexible indexing strategies that expose context gaps rather than hiding them.

### 6.2 High AI-Token and Infrastructure Costs

Enterprises worry about the cost of using AI code reviewers at scale, especially when tools are noisy or low‑value. Reddit users report that Copilot code reviews consume “three to four times as many premium requests” compared to just coding and integrating manually, calling it “a financial drain.” Benchmarks show that tools tuned for higher coverage (CodeRabbit) and deeper analysis require significant scanner and LLM resources, adding to infrastructure cost.[^6][^4][^14]

- **Evidence & severity:** User reports explicitly mention abandoning Copilot reviews due to premium request consumption and low utility. Comparative analyses show trade‑offs between comment volume, actionable bug coverage, and signal‑to‑noise ratio, with Gemini 3.1 Pro leaving fewer comments but missing more bugs.[^35][^6][^14]
- **Associated products:** Copilot PR Reviews, CodeRabbit, other AI review platforms with per‑seat or per‑token pricing.[^4][^14]
- **Current workarounds:** Enterprises limit AI review to certain repositories or PR types, cap comment volume via configuration, or switch to tools with better precision even at higher per‑seat prices.[^36][^14]
- **Why existing tools haven’t solved it:** Business models incentivise broader usage; tools rarely expose cost‑versus‑value analytics at PR granularity.
- **Could Trace solve it?:** Yes, if Trace provides transparent cost dashboards, PR‑level cost attribution, and policies that adapt review depth based on ROI (e.g., more thorough on high‑risk changes, lighter on low‑risk diffs).

### 6.3 Weak Management Dashboards and Missing Historical Context

Enterprises adopt engineering analytics tools like LinearB and Swarmia to gain visibility into delivery and quality, but managers often find dashboards either too shallow or too intrusive. Swarmia’s benchmarks emphasise team‑level metrics like PR cycle time and review rates, while privacy‑focused analyses advise against individual‑level inference. AI review tools, however, typically do not feed rich, contextual signals into these dashboards, and review comments rarely become structured historical knowledge.[^26][^3]

- **Evidence & severity:** StandIn’s critique suggests that teams leaving LinearB do so because metrics fail to change decisions and privacy concerns persist despite softer framing. Swarmia’s docs highlight team comparisons and benchmark labels (“great,” “good,” “attention”) but do not integrate AI review data as first‑class signals.[^3][^26]
- **Associated products:** LinearB, Jellyfish, Swarmia, AI reviewers whose data is not well integrated.
- **Current workarounds:** Enterprises rely on a mix of tools: analytics for DORA metrics, separate dashboards for incidents, and ad‑hoc queries to code search and AI assistants for historical context.[^26][^22]
- **Why existing tools haven’t solved it:** The ecosystem is fragmented; AI reviewers focus on PR‑level feedback, analytics tools focus on delivery metrics, and neither owns knowledge management or long‑term context.
- **Could Trace solve it?:** Yes, if Trace provides integrated views that tie AI review insights, delivery metrics, and architectural knowledge into a coherent, privacy‑respecting dashboard.

***

## 7. Cross-Cutting Themes and Why Tools Haven’t Solved Them

Across roles, several themes recur:

- **Noise vs signal:** AI reviewers either produce too few comments (missing issues) or too many shallow comments (alert fatigue). CodeRabbit explicitly built a scanner layer and Source line feature to filter LLM noise, acknowledging false positives as a fundamental issue.[^4][^14]
- **Hallucinations and fabricated evidence:** AI systems can invent bugs, tests, CVEs, and proof artifacts, demanding strict verification and eroding trust.[^15][^16][^17]
- **Context gaps:** Diff‑only reviews and partial indexing miss repository patterns, monorepo structures, generated code, and cross‑service dependencies.[^12][^13][^22]
- **Privacy and data sovereignty:** Hosted SaaS tools and external API endpoints complicate GDPR and regulatory compliance, especially when sub‑processors and training use are opaque.[^32][^5]
- **Surveillance and untrusted analytics:** Inference‑based performance scoring feels like surveillance and rarely produces actionable decisions; teams prefer declared‑state governance and team‑level metrics.[^3][^26]

Existing tools have not fully solved these problems because they optimised for speed, coverage, and marketing narratives rather than rigorous verification, deep context modeling, and privacy‑respecting governance. Many products treat AI as a stand‑alone “smart reviewer” instead of a component in a broader socio‑technical system of testing, governance, and human judgment.[^25][^14]

***

## 8. Priority Problems Trace Should Solve First

Based on real complaints and unmet needs, five problems stand out as the most valuable for Trace to address first:

1. **High-precision, low-noise review comments with verifiable evidence**
   - Users want fewer, more meaningful comments that catch real bugs and architectural issues without drowning authors in nitpicks.[^1][^35][^4]
   - Trace should integrate deterministic analysis (linters, SAST, rule engines) with LLM reasoning, clearly label comment provenance, and only surface findings with either strong static evidence or explicit risk framing.

2. **Deep repository and product-context awareness, including monorepos and cross-service flows**
   - Developers and leads need reviewers that understand existing patterns, product requirements, and cross‑service contracts, not just local diffs.[^13][^12][^22]
   - Trace should model product areas, services, and dependencies, retrieving context from multiple repos and packages, and explicitly highlighting when context is partial or stale.

3. **Privacy-respecting architecture with self-hosted and BYOK options that truly keep code in-house**
   - Security teams require clear data‑flow guarantees and easy paths to local or self‑hosted execution.[^5][^32][^13]
   - Trace should provide first‑class support for self‑hosted model endpoints and CI runners, publish sub‑processor lists where applicable, and default to zero data retention and training opt‑out.

4. **Trustworthy, non-surveillant management views focused on flow and quality, not individual scoring**
   - Managers and engineers reject per‑developer productivity scores and surveillance‑like dashboards.[^26][^3]
   - Trace should emphasise team‑level metrics (lead time, review quality, incident links), highlight bottlenecks and systemic risks, and avoid any scoring of individual developers.

5. **Durable knowledge capture from reviews and incidents, tied to code and requirements over time**
   - Organisations need review insights and mitigation reasoning to survive beyond the PR thread and be available for onboarding and incident response.[^12][^22]
   - Trace should capture structured knowledge from reviews, link it to code versions, requirements, and incidents, and surface it contextually in future work.

***

## 9. Features Trace Should Deliberately Avoid

Given observed failures and backlash, Trace should avoid several tempting features:

- **Per-developer performance scores and productivity rankings**
  - These replicate LinearB‑style surveillance concerns and erode trust, even with soft framing.[^3]

- **Opaque AI authority and unverifiable “security” findings**
  - Claiming security coverage without clear integration with trusted scanners or verifiable evidence invites hallucination‑driven risk.[^16][^17]

- **Diff-only reviews with no explicit context model**
  - Tools that silently operate on bare diffs repeat Copilot’s shallow review behavior and Cody’s partial context problems.[^1][^12][^22]

- **Unlimited comment volume without strong noise controls**
  - Flooding PRs with nitpicks recreates CodeRabbit’s large‑PR noise and alert fatigue.[^8][^4][^14]

- **Hidden cloud fallbacks in “self-hosted” modes**
  - Silent fallback to external models undermines data‑sovereignty promises and breaks trust with security teams.[^13]

By focusing on verification, deep context, privacy, and team‑centric governance—and deliberately avoiding surveillance and noise‑heavy features—Trace can credibly address the most painful real‑world problems developers and organisations face with today’s AI code review and engineering analytics tools.

---

## References

1. [Why does GitHub Copilot pull request reviews give such poor code review results compared to ChatGPT/Claude?](https://www.reddit.com/r/ExperiencedDevs/comments/1ly13n0/why_does_github_copilot_pull_request_reviews_give/) - Why does GitHub Copilot pull request reviews give such poor code review results compared to ChatGPT/...

2. [GitHub Copilot Complaints on Reddit — 6 Real Threads](https://opiniondeck.com/reddit/github-copilot-complaints/) - 6 unhappy GitHub Copilot users on Reddit. Real complaint threads from r/GithubCopilot and 4 other su...

3. [LinearB Alternatives That Respect Engineer Privacy - StandIn](https://www.standin.co/blog/linearb-alternatives-respect-privacy) - Six LinearB alternatives that avoid surveillance. Engineering metrics tools and declared-state gover...

4. [Does AI Code Review Actually Catch Real Bugs? - CuratorBits](https://curatorbits.com/reviews/coderabbit/) - We use CodeRabbit on our own repos. An honest, first-hand review of the AI code-review tool: what it...

5. [GDPR and AI Code Review: Where Does Your Code Go? - VibeRails](https://viberails.net/blog/gdpr-ai-code-review-data-privacy) - Cloud-based AI code review tools process your source code on third-party servers. Understand the GDP...

6. [How is copilot for code reviews?](https://www.reddit.com/r/GithubCopilot/comments/1ozh7i8/how_is_copilot_for_code_reviews/) - How is copilot for code reviews?

7. [Github copilot code review agent is so bad](https://www.reddit.com/r/codereview/comments/1mregoq/github_copilot_code_review_agent_is_so_bad/) - Github copilot code review agent is so bad

8. [How do you feel about CodeRabbit for AI code reviews? Vote in this ...](https://github.com/orgs/OrchardCMS/discussions/15935) - As part of #15439, we had automatic AI code reviews with CodeRabbit for all PRs in the last week. Af...

9. [Tried Coderabbit for automated code reviews and it keeps ...](https://www.reddit.com/r/devops/comments/1ojc1b6/tried_coderabbit_for_automated_code_reviews_and/) - The comments started to feel repetitive and out of context. At this point, it's more noise than help...

10. [Copilot is rubbish, and I'm tired of pretending it isn't.](https://www.reddit.com/r/github/comments/15kua54/copilot_is_rubbish_and_im_tired_of_pretending_it/) - Copilot is rubbish, and I'm tired of pretending it isn't.

11. [CodeRabbit for AI code reviews · Issue #15439 - GitHub](https://github.com/OrchardCMS/OrchardCore/issues/15439) - Attention, contributors: See #15439 (comment). Is your feature request related to a problem? Please ...

12. [AI Code Review on GitHub: Copilot vs CodeRabbit vs an Agent ... - Cotera](https://cotera.co/articles/ai-code-review-github) - Cotera is a platform for automating work with AI.

13. [10 Open Source AI Code Review Tools Tested on a 450K ...](https://www.augmentcode.com/tools/open-source-ai-code-review-tools-worth-trying) - Tabby provides self-hosted AI coding assistance with no dependency on external databases or cloud se...

14. [AI Code Review Tools 2026 Compared [Honest Benchmark]](https://www.kunalganglani.com/blog/ai-code-review-tools-2026-compared) - CodeRabbit vs Copilot vs Cursor vs custom LLM pipeline — security bugs caught, false positives, pric...

15. [AI Agents Lie: Why Testing Strategy Beats Code Review](https://cybercorsairs.com/your-ai-agent-faked-the-bug-report/) - AI agents fabricate test results and false evidence. Discover why testing + fuzzing beats code revie...

16. [Hallucinated CVEs, Qwen 3.8-Max, Cognitive Debt - Cosmic JS](https://www.cosmicjs.com/blog/cosmic-rundown-hallucinated-cves-qwen-meat-proxy) - Daily developer news: A critical CVE was issued for a hallucinated SQLite vulnerability. Qwen 3.8-Ma...

17. [How AI Hallucinations Are Creating Real Security Risks](https://thehackernews.com/2026/05/how-ai-hallucinations-are-creating-real.html) - AI hallucinations are confident but false outputs that pose major security risks. Learn how they imp...

18. [AI Code Risks: From Hallucinated Dependencies to Privacy Leaks](https://www.youtube.com/watch?v=fkLxxz1_N2s&vl=en-US) - “Almost right” AI code can be more dangerous than code that is obviously wrong. It compiles. It look...

19. [Set default context](https://community.sourcegraph.com/t/set-default-context/1787) - Often I work with a monorepo, and when I use Cody on frontend package the default repository context...

20. [bug: Giving access to repo does not show up as context · Issue #5685 · sourcegraph/cody](https://github.com/sourcegraph/cody/issues/5685) - Type: Bug Extension Information Cody Version: 1.34.3 VS Code Version: 1.93.1 Extension Host: desktop...

21. [How do I connect Cody Web to my GitHub repo?](https://community.sourcegraph.com/t/how-do-i-connect-cody-web-to-my-github-repo/1837) - Every reference I can find, including ChatGPT AND Cody Chat itself, says there’s some “Repository” i...

22. [Cody's Repository Indexing: Does Cognitive Offloading ...](https://www.desplega.ai/blog/deep-dive-cody-indexing) - A practical deep dive into Cody repository indexing, context retrieval, and how indie hackers avoid ...

23. [@-mention directories for Cody Web and Enterprise](https://sourcegraph.com/changelog/at-mention-directories) - Use @-mention to add directories as context in Cody chat for Enterprise and Cody Web.

24. [Improved context fetching from @-mentioned repos for ...](https://sourcegraph.com/changelog/improved-context-fetching) - Better context ranking and multi-snippet support for @-mentioned repos.

25. [How Cody understands your codebase](https://sourcegraph.com/blog/how-cody-understands-your-codebase) - Context is key for AI coding assistants. Cody uses several methods of context fetching to provide an...

26. [Benchmarks & comparisons | Swarmia docs](https://help.swarmia.com/guides/benchmarks-and-comparisons)

27. [Configure CodeRabbit code reviews to be more defensive · Issue #58887 · woocommerce/woocommerce](https://github.com/woocommerce/woocommerce/issues/58887) - We are testing out various AI review tools to see how useful they can be in mitigating bugs that get...

28. [Lots of trivial comments](https://www.reddit.com/r/coderabbit/comments/1qok4ca/lots_of_trivial_comments/) - Lots of trivial comments

29. [kodustech/kodus-ai: AI Code Review with Full Control Over ...](https://github.com/kodustech/kodus-ai) - Source code is not used to train models, data is encrypted in transit GitHub, GitLab, Azure Repos, B...

30. [LinearB Software - Engineering Analytics Platform for ...](https://github.com/LinearB-Software) - LinearB Software helps engineering teams improve delivery visibility, reduce bottlenecks, and align ...

31. [Viewing and sharing survey results | Swarmia docs](https://help.swarmia.com/features/run-developer-experience-surveys/viewing-and-sharing-survey-results)

32. [AI Code Review Privacy: Does It Store Your Code? - Robin](https://www.robinreview.dev/blog/ai-code-review-privacy/) - Find out where your code actually goes with AI code review tools, what questions to ask vendors, and...

33. [How Cody provides remote repository awareness for codebases of every size](https://sourcegraph.com/blog/how-cody-provides-remote-repository-context) - Cody's context awareness scales to every size codebase, from the smallest startups to the biggest en...

34. [Cody is cheating](https://sourcegraph.com/blog/cody-is-cheating) - Steve's Cheating with Cody, blog series, episode 2

35. [Gemini 3.1 Pro for code-related tasks](https://www.coderabbit.ai/blog/gemini-3-1-pro-for-code-related-tasks-more-focus-higher-signal-to-noise) - We evaluated Gemini 3.1 Pro and found it leaves fewer, more focused comments with a higher signal-to...

36. [Best AI Code Review Tools for GitHub](https://www.greptile.com/content-library/best-code-review-github) - Compare the top 7 AI code review tools for GitHub: pricing, features, and accuracy reviewed to find ...

