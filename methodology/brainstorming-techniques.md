# Brainstorming Techniques

A curated library of brainstorming techniques the ideator uses internally during product discovery conversations. These are tools in the ideator's toolkit -- the human should experience a brilliant conversation, not a list of techniques being applied to them.

The ideator selects techniques based on what the conversation needs at any given moment: stuck in obvious territory? Apply a disruption technique. User fixated on one approach? Apply a perspective shift. Lots of ideas but no structure? Apply a convergence technique.

## Divergent Techniques

Techniques for expanding the idea space. Use when the conversation is too narrow, too obvious, or needs fresh energy.

### 1. First Principles Thinking

**When to use**: The human is anchored to existing solutions or industry conventions. They describe what they want in terms of what already exists ("like Uber but for X").

**How it works**: Strip away every assumption about how things are currently done. Identify the fundamental truths of the problem. Rebuild the solution from those truths without referencing existing approaches.

**In practice**: "Let's forget every existing product in this space. What is the actual problem your user has, stated without any reference to how it's currently solved? What are the physics of this problem -- the things that must be true regardless of the solution?"

**Example output**: For a food delivery app: "The fundamental problem is: a person wants to eat food they didn't prepare, at a location of their choosing, within a time window. Everything else -- apps, drivers, restaurants, ratings -- is an assumption about the solution, not the problem."

### 2. Reverse Brainstorming

**When to use**: The team is stuck generating positive solutions. The idea space feels exhausted.

**How it works**: Flip the problem. Instead of asking "how do we solve this?", ask "how could we make this problem as bad as possible?" Generate anti-solutions, then invert them to discover real solutions.

**In practice**: "What if we tried to make this problem worse? What would the absolute worst version of this product look like? What would guarantee users hate it?"

**Example output**: "Worst version: force users to re-enter all information every time, show results in random order, charge before they see what they're getting." Inverted: "Auto-save everything, smart ranking by relevance, preview before commitment."

### 3. Analogical Thinking

**When to use**: The problem domain feels exhausted of ideas. The human keeps circling the same concepts.

**How it works**: Find parallel problems in completely different domains and transplant their solutions. The further the domain, the more creative the transfer.

**In practice**: "What other field has solved a similar problem? How does nature solve this? How would a hospital / airline / video game / restaurant approach this challenge?"

**Example output**: For a code review tool: "Hospitals use checklists before surgery -- not because surgeons are incompetent, but because systematic checks catch what expertise misses. What if code review had a pre-flight checklist that adapted to the type of change?"

### 4. What-If Scenarios

**When to use**: The conversation is constrained by assumed limitations. The human keeps saying "but we can't" or "that's not realistic."

**How it works**: Remove constraints one at a time and explore what becomes possible. Then work backward to see how close you can get within real constraints.

**In practice**: "What if you had unlimited budget? What if there were no technical limitations? What if you had 10 million users on day one? What would you build differently?"

**Example output**: "If we had unlimited budget, we'd have a human curator for every user. Scaled back: what if we built an AI that acts like a personal curator, trained on each user's behavior?"

### 5. SCAMPER

**When to use**: A core concept exists but needs expansion or variation. Good for feature ideation on an established direction.

**How it works**: Apply seven transformation lenses to the existing concept: Substitute (what can be replaced?), Combine (what can be merged?), Adapt (what can be borrowed from elsewhere?), Modify (what can be enlarged/reduced?), Put to other uses (what else could this serve?), Eliminate (what can be removed?), Reverse (what if we did the opposite?).

**In practice**: Apply each lens to the core product concept or a specific feature. Spend 2-3 minutes per lens, generating concrete variations.

**Example output**: For an online learning platform: "Eliminate: What if we removed all video content and used only text + interactive exercises? This would slash production costs, load instantly on slow connections, and be searchable."

### 6. Cross-Pollination

**When to use**: The idea feels conventional within its industry. Needs a distinctive angle.

**How it works**: Deliberately import solutions, patterns, or business models from unrelated industries. Ask: "How would [industry X] solve this?"

**In practice**: "How would a video game designer approach this onboarding problem? How does a restaurant create loyalty without a points program? How does a newspaper decide what's 'above the fold'?"

**Example output**: "Video games use progressive difficulty -- never overwhelming the player but always presenting the next challenge. What if our SaaS onboarding unlocked features as users demonstrated readiness, instead of dumping everything on them at once?"

### 7. Constraint Forcing

**When to use**: The human is designing something bloated or unfocused. Too many features, too broad a scope.

**How it works**: Impose extreme artificial constraints to force creative simplification. "$100 budget." "One screen only." "Must work offline." "Build it in a weekend."

**In practice**: "If this product could only have one screen, what would be on it? If your users had only 30 seconds, what would they need to accomplish? If you had to launch next week, what would you ship?"

**Example output**: "One-screen version: a single input field where users describe what they need, and the system returns the three best matches with one-click actions. Everything else is secondary navigation."

## Perspective Shift Techniques

Techniques for seeing the problem from different angles. Use when the conversation is stuck in one viewpoint or the human is not considering key stakeholders.

### 8. Role Playing (Stakeholder Perspectives)

**When to use**: The human is designing only for themselves or only for one user type. Important perspectives are missing.

**How it works**: Temporarily embody a different stakeholder and reason from their position. What do they want? What frustrates them? What would make them champion or sabotage this product?

**In practice**: "Let's think about this from the perspective of [a power user / a first-time user / the person who pays but doesn't use it / the admin / the competitor]. What do they see?"

**Example output**: "From the IT admin's perspective: 'I don't care how pretty it is. Can I provision 500 users from a CSV? Can I revoke access instantly? Does it integrate with our SSO? If no, this tool creates more work for me, not less.'"

### 9. Pre-Mortem Analysis

**When to use**: The human is overly optimistic. The idea sounds too good and no one has questioned why it might fail.

**How it works**: Imagine the product has launched and failed spectacularly. Now work backward: what went wrong? This surfaces risks that optimism hides.

**In practice**: "It's one year from now. This product launched and it's being shut down. What happened? Why did users leave? Why didn't it gain traction? What did the post-mortem say?"

**Example output**: "The post-mortem said: 'We built for early adopters who loved the concept but the mainstream market never converted. The onboarding assumed technical literacy our target users didn't have. The viral loop we depended on never materialized because users were embarrassed to share their usage publicly.'"

### 10. Six Thinking Hats

**When to use**: The conversation keeps oscillating between excitement and criticism without making progress. Need structured perspective rotation.

**How it works**: Explicitly separate different types of thinking. White (facts only), Red (gut feelings), Yellow (benefits), Black (risks), Green (creative alternatives), Blue (process/meta). Apply one at a time to prevent mixing.

**In practice**: "Let's do a quick round. First, just the facts -- what do we actually know about this market? No opinions yet. Now, gut check -- how does this idea feel? Now, what's the strongest case for it? Now, what's the strongest case against it?"

**Example output**: "White hat: The market for X is $2B, growing 15% annually, dominated by two players. Red hat: This feels like a 'nice to have,' not a 'must have.' Yellow hat: If it works, the network effects create a moat. Black hat: Both incumbents have 10x our resources and could copy this in a quarter."

### 11. Alien Anthropologist

**When to use**: The human is so deep in their domain they cannot see the obvious. Familiarity blindness.

**How it works**: Examine the problem as if seeing it for the first time with no cultural context. What seems absurd? What conventions exist only because of history, not logic?

**In practice**: "If you had never seen how this industry works, what would strike you as strange? What would an outsider find baffling about how people currently solve this problem?"

**Example output**: "An alien observing apartment hunting would find it bizarre that humans visit physical spaces one at a time, making decisions in minutes about where they'll live for years, based primarily on visual appearance while ignoring noise levels, neighbor compatibility, and commute patterns."

## Convergence Techniques

Techniques for narrowing, prioritizing, and structuring. Use when there are many ideas but no direction, or when it's time to move toward the product brief.

### 12. Morphological Analysis

**When to use**: Multiple independent dimensions of the product need to be resolved, and the combinations matter.

**How it works**: Identify the key dimensions (e.g., target user, pricing model, core feature, distribution channel). List 3-4 options for each. Systematically explore promising combinations.

**In practice**: "Let's map the dimensions of this product. For each one, what are our realistic options? Now, which combinations create something coherent?"

**Example output**: "User: freelancers / small teams / enterprise. Pricing: freemium / per-seat / usage-based. Core: collaboration / automation / analytics. Best combination: small teams + per-seat + collaboration -- this is a focused, defensible position."

### 13. Decision Tree Mapping

**When to use**: A critical fork in the product direction exists and the options need to be laid out clearly.

**How it works**: Map the decision points as a tree. For each branch, trace the downstream consequences -- what becomes possible, what becomes impossible, what changes.

**In practice**: "This is a fork in the road. If we go with option A, what follows? What does option B lead to? Where do the paths diverge most, and where do they converge?"

**Example output**: "If we build our own auth system: full control, custom flows, but 3 weeks of work and ongoing security burden. If we use Auth0: faster to market, battle-tested security, but vendor lock-in and $X/month at scale. Both paths converge at the same user experience -- the difference is operational."

### 14. Question Storming

**When to use**: The team is jumping to solutions before understanding the problem. Need to step back and map what's unknown.

**How it works**: Generate only questions, no answers. The goal is to expose every unknown, assumption, and gap. Answers come later.

**In practice**: "Before we design anything, let's list every question we'd need to answer. What don't we know? What are we assuming? What would a skeptic ask?"

**Example output**: "Do users actually want this or are we projecting? How big is the switching cost from their current solution? What's the minimum data we need to provide value? Can we build the core experience without any ML? Who in the organization has budget authority for this category?"

## Deepening Techniques

Techniques for going deeper on a specific topic. Use when a section of the product brief is thin or when the human's thinking is surface-level.

### 15. Five Whys

**When to use**: The human has stated a problem or decision but hasn't explored the root cause. Surface-level problem statements.

**How it works**: Ask "why?" five times in succession, each time drilling deeper into the previous answer. The real problem is usually 3-5 layers below the stated problem.

**In practice**: "Why do users need this?" -> answer -> "Why is that a problem for them?" -> answer -> "Why does that happen?" -> continue until you hit bedrock.

**Example output**: "Users need a dashboard." Why? "To see their metrics." Why? "Because they make decisions based on those numbers." Why is that hard now? "The data is in three different tools." Why haven't they consolidated? "Because the tools don't integrate and they lack technical skills." Root problem: non-technical users need unified data views without integration work.

### 16. Values Archaeology

**When to use**: The product vision is technically sound but emotionally flat. No clear "why should anyone care?"

**How it works**: Excavate the deeper values and motivations behind the product idea. What does the human really care about? What would make them proud of this product? What would make users feel something?

**In practice**: "Forget the features for a moment. Why does this product matter to you personally? What would it mean for the world if this succeeded? What would users tell their friends about it?"

**Example output**: "The human cares about democratizing access. The real value isn't 'a cheaper alternative' -- it's 'anyone, regardless of connections or budget, can access professional-quality X.' That changes the positioning from price competitor to access enabler."

### 17. Assumption Reversal

**When to use**: The product direction feels obvious and unchallenged. Everyone agrees too quickly.

**How it works**: List every assumption baked into the current concept. Flip each one and explore what happens. Some reversals will be absurd; others will reveal hidden opportunities.

**In practice**: "What are we assuming must be true? Users want more features? It needs to be real-time? It should be a web app? The business model is subscription? Let's flip each one."

**Example output**: "Assumption: users want a dashboard. Reversal: what if users want no dashboard -- they want the system to proactively tell them when something needs attention, and otherwise stay silent? This inverts the interaction model from pull to push."

## Anti-Bias Protocol

These are not techniques but disciplines the ideator follows to prevent the natural clustering tendency of LLM-generated ideas.

### Domain Rotation

Every 10 ideas or responses in a generative phase, consciously pivot to an orthogonal domain. If the last ideas were about technical implementation, shift to user experience. If user experience, shift to business model. If business model, shift to edge cases or failure modes. The pivot should feel jarring -- that's the point.

Rotation sequence example: Technology -> UX -> Business viability -> Social impact -> Edge cases -> Operations -> Psychology -> Market dynamics -> Technology (restart).

### Quantity Discipline

The first 20 ideas in any brainstorming session are usually obvious. The interesting ideas live between 50 and 100. Do not converge early. Do not organize early. Stay in generative mode until the human explicitly requests convergence.

### Chain-of-Thought Novelty Check

Before generating each idea or suggestion, internally reason: "What domain haven't we explored yet? What would make this idea surprising? Am I repeating a pattern from my previous suggestions?" If the answer is yes, force a domain pivot before continuing.

### Creative Temperature

During divergent phases, deliberately push toward bolder, less conventional suggestions. Comfortable ideas are easy to generate and rarely valuable. The ideator's job is to surface ideas the human would not have reached alone.
