## How the user experiences Nudge

Reconstructing from the route surface and product description, the user-facing flow is roughly:

**1. Discovery (outside the tool)**
User lands on the marketing site, picks a supported tool from the dashboard (Figma, TradingView), and describes a project they want to learn — "build a mobile login screen," "set up a moving average crossover chart." This is the front door, and it's deliberate: Nudge wants users to commit to a learning *project*, not just a vague intent.

**2. Project generation (server-side)**
The frontend hits the project generation route. An LLM takes the user's free-form intent and produces a structured multi-step project — likely a sequence of phases, each with steps, with target elements and success criteria. This gets persisted. The user now has a saved project they can return to.

**3. Hand-off into the tool**
The user opens Figma (or TradingView) with the Nudge extension installed. The extension's content script detects the supported site, loads the appropriate tool adapter (the Figma DOM mapping or the TradingView bridge), and pulls the active project from backend state.

**4. The in-tool loop**
This is where the meat is. The extension runs a closed loop:

- Show the instruction tooltip + highlight the target element ("Click the Frame tool")
- User clicks
- Extension captures the click + DOM state, sends to the **validation** route
- Backend says "correct" → advance to next step
- Backend says "wrong" → call **wrong-click** route, which generates an explanation ("you clicked Rectangle, but you need Frame because…")
- User retries
- Throughout: the user can hit **chat** for free-form questions, see **progress** strip, get **step feedback** prompts

**5. Phase + project completion**
At phase boundaries, the **review** route fires — likely an LLM-graded assessment of the work so far. At project end, similar review. Success toast, completion modal, back to dashboard.

The whole UX is built around **the user is being taught**. Every interaction has a pedagogical wrapper: validate, explain, review, score.

## The backend logic powering this

The mental model worth internalizing: **Nudge's backend is a state machine, not a request-response API.**

A user mid-session has:
- A project (persisted)
- A current step pointer
- A history of attempts/validations
- A DOM snapshot context the server is maintaining (or rebuilding from each request)

Every route operates against that session state. Guidance reads it, validation updates it, wrong-click annotates it, review summarizes it. The frontend/extension is essentially a thin renderer over server-held state.

**The two-tier flow architecture is the cleverest bit:**

```
User states a goal
    ↓
Goal matching route
    ↓
    ├─ Match found → run authored flow (deterministic, fast, validated)
    │
    └─ No match → on-demand generation route → LLM builds flow live
            ↓
            Unmatched goal logged for admin review
            ↓
            Admin authors the missing flow → published → next user gets the curated version
```

This is a **library that improves itself**. Every unmatched goal is a signal of demand. Admins watch the unmatched-goals queue, prioritize authoring, and the system gradually becomes more deterministic on common requests while still handling the long tail with LLMs. That's a real flywheel.

**The auth-determines-pricing-model split:**

- Extension users → Supabase JWT → consumer billing via Razorpay
- SDK integrators → API key → B2B billing (probably per-seat or per-session)
- Admins → Supabase admin → internal only

The backend serves three customer types from one codebase. That's intentional architecture.

**The protective layers:**

- LLM circuit breaker → daily budget cap, trips off LLM routes when exceeded
- Per-route rate limits → tighter on the expensive routes (authoring, docs)
- Production CORS lockdown → no wildcard allowed
- Razorpay raw-body-before-JSON → webhook signature verification works correctly

## Key takeaways for Wayfinder

**1. Their flow is "plan once, validate each step." Yours should be "perceive each step, no validation."**
Nudge generates a project upfront and grades the user against it. Wayfinder re-perceives the DOM every step and doesn't care what the user did before, only what's on screen now. This is only possible because of Cerebras speed. Lean into it — it's a fundamentally different product loop and it's your differentiator.

**2. Server-held session state is worth copying, partially.**
You need a session ID, the goal, and the list of completed steps. You do *not* need DOM history, validation results, or graded attempts. Keep your `Session` + `Step` schema lean (the PRD already does this).

**3. The "library + AI fallback" pattern is exactly backwards for you.**
Nudge: authored flows are the asset, AI is the fallback. Wayfinder: AI is the asset, no library. Don't get tempted to start authoring AWS flows manually — that's their game and you'd lose on quality while sacrificing your "works on anything" pitch.

**4. The unmatched-goal queue is actually still useful for you.**
Even without authoring, log every session's goal + outcome. The ones where the user abandoned mid-flow or where the model returned low confidence are your training signal — for prompt improvements, for example selection, for eventually fine-tuning Gemma. This is a near-free observability play.

**5. Steal the circuit breaker on Day 1.**
A buggy content script that fires `WF_NEXT_STEP` in a loop will eat your Cerebras quota in minutes. Per-user-per-minute counter, cap at ~30 inferences/min, return a clear error. Build this before the demo, not after.

**6. The auth segmentation is worth setting up early even if you only use one tier.**
Even at hackathon scope, structure your middleware as "this route requires user JWT," "this route requires API key," "this route requires admin" — three middleware functions. You'll thank yourself when the B2B SDK pitch becomes relevant in three months.

**7. The biggest UX gap to close: they have validation, you have... nothing if the user clicks the wrong thing.**
Nudge tells you "wrong, here's why." Wayfinder's current PRD just re-perceives and shows the next arrow — which is *fine* and arguably better, but you should make sure the re-perception is fast enough that the user doesn't notice they went off-script. If your loop takes 800ms after a wrong click, the user feels lost. If it takes 300ms, the arrow just *moved* and they followed it. Cerebras latency is doing real product work here.

**The single sentence summary of the difference:**

Nudge is a curriculum delivered by software. Wayfinder is a friend pointing at your screen.