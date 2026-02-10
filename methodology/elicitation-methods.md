# Elicitation Methods

Methods for deepening weak sections of artifacts. Each method is a focused technique for extracting richer, more specific content from a thin or vague section. These are used by the ideator during brainstorming, by the strategist when PRD sections lack depth, and by any agent when a quality gate identifies insufficient detail.

The methods are organized by the type of weakness they address.

## When Sections Are Too Vague

### 1. Socratic Questioning

**When to apply**: A section uses generic language ("users want a good experience") without specific, testable claims.

**How it works**: Ask a chain of increasingly specific questions that force the author to commit to concrete statements. Each question narrows the scope until the answer must be specific.

**What it produces**: Precise, testable claims replacing vague aspirations.

**Example**:
- "What does 'good experience' mean for this user?" -> "Fast load times"
- "How fast?" -> "Under 2 seconds"
- "Under what conditions?" -> "On a 3G connection with the initial page load"
- Result: "Pages must load within 2 seconds on 3G connections" -- a testable requirement.

### 2. Concrete Scenario Construction

**When to apply**: Requirements are stated abstractly without grounding in real user behavior.

**How it works**: Build a specific, named scenario with a real-seeming user. Walk through their exact actions, minute by minute. The scenario reveals missing requirements, edge cases, and assumptions.

**What it produces**: A narrative scenario that exposes gaps in the abstract requirement.

**Example**: "Meet Sarah, a freelance photographer. It's Tuesday morning. She opens the app because she just finished a shoot and needs to send proofs to her client within the hour. She has 200 photos on her camera's SD card. What happens next? What does she tap first? Where does she get stuck?"

### 3. Contrast Elicitation

**When to apply**: A description could apply to many products. Lacks differentiation or specificity.

**How it works**: Ask "how is this different from [existing product X]?" for multiple competitors. The answers reveal what's actually unique, or expose that the differentiation hasn't been thought through.

**What it produces**: Sharper positioning and clearer articulation of what makes this product distinct.

**Example**: "You said this is a project management tool. How is it different from Jira? From Trello? From a shared spreadsheet? If a user currently using Linear evaluated your product, what would make them switch?"

## When Requirements Are Missing

### 4. Stakeholder Round Table

**When to apply**: Only one user perspective has been considered. Important stakeholders are unrepresented.

**How it works**: Identify all stakeholders (primary users, secondary users, administrators, payers, support staff, regulators). For each, ask: "What does this stakeholder need from the system? What would make them block adoption? What would make them champion it?"

**What it produces**: Requirements from each stakeholder perspective, surfacing conflicts and priorities.

**Example**: "We've designed for the end user. But who purchases this? What does the IT admin need to approve it? What does the compliance team need to see? What does customer support need when a user calls with a problem?"

### 5. Edge Case Mining

**When to apply**: Only the happy path is described. Error states, boundary conditions, and unusual scenarios are missing.

**How it works**: Systematically explore boundaries. What happens with zero items? One million items? No network? Concurrent edits? Expired sessions? Malicious input? International users? Accessibility needs?

**What it produces**: A list of edge cases that need handling, prioritized by likelihood and impact.

**Example**: "What happens when two users edit the same document simultaneously? When the upload is interrupted halfway? When the user's subscription expires while they're in the middle of work? When someone pastes 50,000 characters into a field designed for 200?"

### 6. Jobs to Be Done Analysis

**When to apply**: Features are listed without clear connection to user needs. "What" without "why."

**How it works**: For each feature or capability, ask: "What job is the user hiring this product to do? What are they trying to accomplish in their life? What does success look like from their perspective -- not in product terms, but in life terms?"

**What it produces**: Features reframed as user jobs, which often reveals that some features are irrelevant and others are missing.

**Example**: "The user isn't hiring a 'calendar integration.' They're hiring 'I never want to double-book myself again.' That job might be better served by a smart conflict detector than a traditional calendar sync."

## When Rationale Is Thin

### 7. Devil's Advocate Stress Test

**When to apply**: A decision has been stated without sufficient justification. "We chose X" without explaining why not Y or Z.

**How it works**: Argue the opposing position with genuine effort. Present the strongest case for the alternative approach. Force the author to defend their choice against a capable counterargument.

**What it produces**: Stronger rationale that addresses real objections, or a reversal if the original choice cannot be defended.

**Example**: "You chose a monolithic architecture. Here's the strongest case for microservices in this context: [compelling argument]. How do you respond? What makes the monolith the right choice despite these advantages of microservices?"

### 8. Second-Order Consequences

**When to apply**: A decision considers only immediate effects. Long-term or indirect consequences haven't been explored.

**How it works**: For each decision, ask: "And then what happens?" repeatedly. First-order consequences are obvious. Second and third-order consequences are where the real implications hide.

**What it produces**: A chain of consequences that reveals hidden risks or hidden benefits.

**Example**: "We'll offer a free tier. First order: more users sign up. Second order: free users consume support resources and infrastructure costs. Third order: support team grows, which increases burn rate, which shortens runway. Fourth order: pressure to convert free users faster leads to aggressive upselling that damages trust. Is the free tier still the right call?"

### 9. Evidence Demand

**When to apply**: Claims are made without supporting evidence. "Users prefer X" or "The market wants Y" without data.

**How it works**: For every factual claim in the artifact, ask: "What evidence supports this? How do we know this is true? What would change our mind?" Distinguish between known facts, reasonable assumptions, and wishful thinking.

**What it produces**: Claims categorized as validated, assumed, or unknown. A list of assumptions that need validation.

**Example**: "'60% of our users are on mobile.' Where does this number come from? Analytics data? An industry benchmark? A guess? If it's a guess, what would we need to measure to verify it before committing to a mobile-first strategy?"

## When Scope Is Unclear

### 10. MoSCoW Forcing Function

**When to apply**: Everything is described as important. No clear prioritization exists.

**How it works**: Force every feature/requirement into exactly one category: Must have (the product fails without it), Should have (important but the product works without it), Could have (nice but not important), Won't have (explicitly excluded). The constraint: Must-haves cannot exceed 40% of the total scope.

**What it produces**: A prioritized feature list with clear scope boundaries and explicit exclusions.

**Example**: "You listed 15 features. If you could only ship 6, which 6? Those are your must-haves. Everything else is should-have or lower. Now defend each must-have -- what fails if it's missing?"

### 11. User Story Mapping

**When to apply**: Scope is described as a flat list of features without structure or sequencing.

**How it works**: Arrange features along two axes: the horizontal axis is the user's journey (discovery -> onboarding -> core usage -> advanced usage), the vertical axis is priority (must have -> nice to have). Draw a horizontal line across the map: everything above the line is MVP.

**What it produces**: A structured scope map that shows both the breadth of the user journey and the depth of each phase.

**Example**: "Walking through the user journey: first they discover the product (landing page, pricing). Then they sign up (registration, onboarding). Then they do the core thing (the main workflow). Then they go deeper (settings, integrations, advanced features). For each phase, what's above the MVP line?"

### 12. Pre-Mortem Scoping

**When to apply**: The scope feels ambitious and there's pressure to include everything.

**How it works**: Imagine the project has failed because it was too ambitious. The scope was too large, the team couldn't deliver, and the product launched incomplete. What should have been cut? What would the team wish they had focused on?

**What it produces**: A fear-driven prioritization that often produces a tighter, more realistic scope than optimistic planning.

**Example**: "The project took 8 months instead of 3 and launched with nothing working well instead of one thing working great. Looking back, what features were distractions? What was the one thing that would have been enough for a successful launch?"

## When Technical Feasibility Is Uncertain

### 13. Spike Questions

**When to apply**: A proposed approach involves technology or integration that no one on the team has proven works.

**How it works**: Identify the single riskiest technical assumption. Frame a concrete question that a 2-day spike could answer. The question should be binary -- either the approach works or it doesn't.

**What it produces**: A focused spike question that de-risks the most dangerous assumption before committing to the approach.

**Example**: "The riskiest assumption is that we can process real-time audio streams in the browser with <200ms latency. Spike question: can we build a proof-of-concept that captures microphone input, runs it through the Web Audio API, and renders a waveform in real-time on a mid-range Android device?"

### 14. Architecture Decision Record Elicitation

**When to apply**: A technical choice has been made but the alternatives considered and tradeoffs aren't documented.

**How it works**: For each significant technical decision, document: the context (why a decision is needed), the options considered, the evaluation criteria, the decision made, and the consequences.

**What it produces**: A structured ADR that makes the decision rationale explicit and reviewable.

**Example**: "Decision: use PostgreSQL over MongoDB. Context: the data model has complex relationships between users, projects, and permissions. Options: PostgreSQL (relational, strong consistency), MongoDB (document-based, flexible schema), DynamoDB (managed, scalable). Chosen: PostgreSQL because relational queries are core to the product and eventual consistency would create user-visible bugs in permission checks."

## General-Purpose Methods

### 15. Red Team / Blue Team

**When to apply**: Any artifact that needs adversarial review. Good as a final pass before declaring a section complete.

**How it works**: Red team attacks the artifact: finds weaknesses, inconsistencies, missing pieces, unrealistic assumptions. Blue team defends: addresses each attack, strengthens the weak points, or acknowledges the gap and documents it as a known risk.

**What it produces**: A hardened artifact that has survived adversarial scrutiny, with known weaknesses documented rather than hidden.

**Example**: Red team: "Your success metric is '1000 users in 3 months' but you have no distribution strategy. How do 1000 people find out about this?" Blue team: "Fair point. We need to add a distribution section, or lower the metric to '200 users acquired through direct outreach' which is achievable without a marketing budget."

### 16. Feynman Simplification

**When to apply**: A section is dense, jargon-heavy, or confusing. The author understands it but a reader might not.

**How it works**: Explain the concept as if to someone with no domain knowledge. If you can't explain it simply, you don't understand it well enough. Simplify until the core idea is crystal clear, then add back only the necessary complexity.

**What it produces**: A clearer, more accessible version of the same content.

**Example**: Before: "The system leverages event-driven architecture with CQRS patterns to ensure eventual consistency across distributed microservices." After: "When something changes, the system sends a message. Other parts of the system pick up that message and update themselves. This means there's a brief delay before everything is in sync, but the system stays responsive even under heavy load."
