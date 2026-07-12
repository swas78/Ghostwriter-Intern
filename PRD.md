# Product Requirements Document
## Ghostwriter Intern
*"Say your day out loud. Wake up to a done inbox."*

**Track:** Agents & Automation
**Hackathon:** Mesh API Hackathon · 5–12 July 2026
**Built on:** Mesh API (mandatory, multi-model)

---

## 1. One-line pitch

You dump a messy voice note or pile of chat/email chaos about your day. Ghostwriter Intern listens, figures out who needs what, drafts every single reply in the right tone for the right person, ranks them by urgency, and hands you a done inbox — you just tap approve or edit and send.

It's not a to-do list generator. It's not a summarizer. **It's an intern that actually writes the replies.**

---

## 2. Problem statement

Every working person — freelancer, small business owner, student, employee — ends the day with a backlog of things they *said they'd get to*: reply to a client, follow up on an invoice, text the plumber back, apologize to a friend for going quiet. The blocker isn't knowing what to do. It's the friction of **composing each message** — finding the right tone, the right length, the right level of formality for each person.

Existing tools (task managers, meeting-notes apps) stop at "here's your list." That's the noticing step. Nobody closes the loop and does the *writing*.

## 3. Solution

Ghostwriter Intern collapses "I know what I need to do" into "it's already written, I just approve it."

**Input:** one messy brain-dump — voice note or pasted text, unstructured, exactly how a person actually thinks ("ugh also need to tell priya the invoice thing, and that client from tuesday never heard back from me, and I should probably just cancel on rahul tonight lol").

**Output:** an approval queue — one card per person/task, each with:
- Who it's for
- A fully drafted message in an appropriate tone
- An urgency rank
- Edit / Approve / Skip actions

---

## 4. Goals

| Goal | Why it matters for judging |
|---|---|
| Feel genuinely agentic — reads, decides, drafts, holds state across multiple items in one pass | Directly satisfies the Agents & Automation track brief |
| Multi-model routing is structurally necessary, not decorative | Mesh's "no Mesh, no entry" rule + showcases the platform's actual value |
| One "holy crap" live demo moment under 90 seconds | Judging is on a 2–3 min video — needs a fast, visual payoff |
| Ship a narrow, fully working loop rather than a broad half-built one | Completeness is judged equally with uniqueness |
| Solve a real, dailypain — not a hypothetical | Real-world utility criterion |

## 5. Non-goals (for hackathon scope — explicitly cut)

- ❌ Real email/WhatsApp/SMS platform integrations (OAuth, sending on your behalf) — huge scope, security risk, and a rabbit hole. **Input is paste-in text or an uploaded/recorded voice note. Output is copy-able drafts**, not auto-sent messages.
- ❌ Multi-day memory / persistent contact profiles — v1 is stateless per session.
- ❌ Mobile app — responsive web only.
- ❌ Actual voice *output* (it doesn't talk back) — text drafts only.

---

## 6. Core user flow

```
1. User opens app → sees a single big input:
   "Say your day out loud, or paste the mess."
   [🎙 Record] or [paste text]

2. User records a 20–40 sec voice note (or pastes chaotic text)
   e.g. "call the plumber back, need to reply to priya about
   the invoice — she's been asking twice now — and I completely
   forgot to follow up with that client from tuesday, also
   should tell rahul I can't make dinner tonight"

3. App transcribes (if voice) → shows the raw transcript,
   fading into a "reading your day..." loading state

4. Agent pipeline runs (see architecture) →
   approval queue populates card-by-card, ranked by urgency

5. Each card shows:
   - 👤 Recipient / context tag (inferred: "Priya", "Plumber",
     "Tuesday client", "Rahul")
   - 🔴/🟡/🟢 urgency badge
   - Drafted message, in a tone matched to the relationship
     (formal for "that client," casual for "Rahul")
   - [Edit] [Approve ✓] [Skip ✗] [Copy 📋]

6. User approves/edits each card. Approved ones move to a
   "Ready to send" tray with one-tap copy for each.

7. End state: "Inbox cleared. 5 drafted, 4 approved, 1 skipped."
```

---

## 7. Feature list

### 7.1 Must-have (core loop — this is what "done" means)
- [ ] Text input (paste chaotic notes)
- [ ] Voice input with browser-based recording → transcription via Mesh
- [ ] **Extraction agent**: parses the raw dump into discrete items — each with a recipient/context, a raw intent, and inferred urgency
- [ ] **Drafting agent**: writes an actual message per item, tone-matched to the relationship implied by context
- [ ] **Urgency ranking**: cheap/fast model scores and sorts the queue
- [ ] Approval queue UI: edit inline, approve, skip, copy-to-clipboard
- [ ] Empty/error states (no items found, transcription failed, model error)
- [ ] End-state summary ("done inbox" moment)

### 7.2 Should-have (polish that wins judging points)
- [ ] Tone indicator per card (e.g. "Formal," "Warm," "Quick & casual") so the user *sees* the model made a deliberate choice, not a generic one
- [ ] Inline regenerate ("try again, more formal / shorter / friendlier") — one-tap tone nudge per card, re-calls the drafting model
- [ ] Visual "who's this for" avatar/initial derived from context, so cards feel personal not generic
- [ ] Smooth reveal animation as cards populate one by one (mirrors the "reading through your day" feeling)
- [ ] Mesh routing badge per card — small label showing which model drafted it (great for judges, shows the multi-model mechanic live)

### 7.3 Crazy / stretch — the "out of this world" layer
Pick **one or two** of these if the core loop is solid with time to spare. Don't attempt all.

- 🚀 **"Voice mode" playback** — instead of reading drafts, the app can *read them back to you* in a synthesized voice before you approve, so you can eyes-off approve your whole inbox like a briefing. (Strong demo moment, matches "say it out loud, hear it back.")
- 🚀 **"Roast my backlog"** — a lighthearted one-liner at the top summarizing your day like a slightly judgmental assistant ("You have 4 people waiting on you and one dinner you're about to bail on. Let's fix that."). Cheap, high personality payoff, costs almost nothing to build, makes the product feel alive instead of clinical.
- 🚀 **Relationship memory within session** — if the same name appears twice in one dump, the app links them and adjusts tone consistency across both drafts (shows real contextual reasoning, not independent per-item calls).
- 🚀 **"Confidence flag"** — if the agent isn't sure who a message is for or what tone fits, it visibly flags the card ("Not sure how formal to be here — check this one") instead of confidently guessing wrong. This is a *judgment* feature, not just an output feature, and signals real product thinking to judges — most hackathon agents never admit uncertainty.

**Recommended crazy pick if you only build one:** the **confidence flag**. It's cheap to build (one extra field in the drafting prompt + a UI badge), and it's the single most "we thought about this like a real product" signal you can show — judges see hundreds of demos where the AI confidently gets things wrong; showing self-aware uncertainty is a genuine differentiator on the *uniqueness* and *polish* axes.

---

## 8. System architecture

```
┌─────────────┐
│   Frontend   │  Voice/text input → Approval queue UI
│ (HTML/JS/CSS)│
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│              Mesh API (single gateway)        │
│                                                │
│  Step 1 — TRANSCRIBE (voice input only)       │
│    model: whisper-class / speech-to-text      │
│    in: audio → out: raw transcript             │
│                                                │
│  Step 2 — EXTRACT                             │
│    model: fast/cheap model                     │
│    in: raw transcript                          │
│    out: structured JSON array of items:        │
│    [{ recipient, raw_intent, context_clue }]   │
│                                                │
│  Step 3 — DRAFT (parallel, one call per item)  │
│    model: stronger/reasoning model              │
│    in: one item + relationship context          │
│    out: { message, tone_label, confidence }     │
│                                                │
│  Step 4 — RANK                                │
│    model: fast/cheap model                     │
│    in: all items                               │
│    out: urgency score 1-5 per item             │
└─────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│ Approval Queue│  Sorted by urgency, each card editable
└──────────────┘
```

**Why this is genuinely multi-model (not decorative):**
- Transcription needs a speech model — non-negotiable, different capability class entirely.
- Extraction is a cheap, fast, structured-output job — using an expensive model here would be wasteful, and showing that restraint is itself good practice worth mentioning in the demo.
- Drafting needs a stronger, more nuanced model — tone-matching is the hardest reasoning step.
- Ranking is another cheap/fast classification job, run separately so it doesn't bias the drafting step.

This mirrors exactly what Mesh is *for*: routing each sub-task to the model suited to it, instead of hammering everything through one model. That's your strongest pitch line to judges.

---

## 9. Data shape (Extraction → Draft handoff)

```json
// Step 2 output (Extraction)
[
  {
    "id": "item_1",
    "recipient": "Priya",
    "raw_intent": "reply about the invoice, she's asked twice",
    "context_clue": "recurring ask, mild guilt implied",
    "relationship_hint": "professional, familiar"
  },
  {
    "id": "item_2",
    "recipient": "Plumber",
    "raw_intent": "call back",
    "context_clue": "transactional, no message needed — flag as call not text",
    "relationship_hint": "service provider"
  }
]

// Step 3 output (Draft, per item)
{
  "id": "item_1",
  "message": "Hey Priya — so sorry for the delay on this...",
  "tone_label": "Warm but professional",
  "confidence": "high",
  "confidence_note": null
}

// Step 4 output (Ranking)
{ "item_1": 4, "item_2": 5, "item_3": 2 }
```

**Edge case to handle explicitly:** items like "call the plumber" aren't messages at all — they're calls. The extraction step should tag `channel: "call"` vs `"message"`, and the UI should show call items as a simple reminder card, not a drafted text. This is a small detail but prevents an obviously wrong output (a fake "text" drafted to a plumber for a phone call) from undermining the whole demo.

---

## 10. UI / visual direction

Keep this **warm and personal**, not corporate-productivity-dashboard. The product's whole value is "this feels like it actually knows you," so sterile SaaS aesthetics work against the pitch.

- **Palette:** warm paper/cream base, one confident ink/charcoal text color, a single warm accent (amber or coral) for urgency and CTAs — avoid generic productivity-app blue.
- **Typography:** a warm serif or humanist display face for headers ("your day, handled"), clean sans for card body text.
- **Signature element:** the approval queue itself — cards that feel like little handwritten notes/sticky notes being handed to you, not a table or list. This *is* the product's personality.
- **Motion:** cards populate one at a time with a soft fade/slide as each finishes drafting — reinforces the feeling of someone working through your list live, not a static dump.
- **Microcopy tone:** conversational, never robotic. "Reading through your day…" not "Processing input…". "Inbox cleared 🎉" not "Task queue empty."

---

## 11. Demo video script (60–90 sec)

1. **(0–10s)** "Every night I end up with five things I said I'd reply to and never did." — record a real messy voice note live, on camera.
2. **(10–20s)** Show transcript appear, then "reading through your day…" loading state.
3. **(20–50s)** Cards populate one by one — pause on 2 contrasting ones (a formal client reply vs. a casual "can't make it tonight" text) to show the tone-matching clearly.
4. **(50–65s)** Show the confidence flag catching an ambiguous one — "look, it's honest when it's not sure."
5. **(65–80s)** Approve a couple, hit copy, show "Inbox cleared" end state.
6. **(80–90s)** Quick code flash: the 4-step Mesh pipeline (transcribe → extract → draft → rank), each on a different model. "Built entirely on Mesh, one week."

---

## 12. Judging-criteria self-check

| Criterion | How this idea satisfies it |
|---|---|
| **Uniqueness** | Flips "task list" agents (common) into "done draft" agents (rare). Confidence-flag feature is a genuinely uncommon touch. |
| **Polish** | Warm, personal visual direction + animated reveal + tone labels — designed to *not* look like a generic dashboard. |
| **Completeness** | Scope is deliberately narrow (paste-in/voice → drafts → approve/copy) so it can be finished end-to-end, not a stub. |
| **Real-world utility** | Solves an obvious, universal, daily pain — not hypothetical. Testable by literally using it on your own day. |

---

## 13. Day-by-day build plan (honest commit history)

| Day | Focus |
|---|---|
| 1 | Repo init, PRD committed, static approval-queue UI with mock data (no API calls yet) |
| 2 | Wire up Extraction step with real Mesh call, hardcoded test transcript |
| 3 | Wire up Drafting step (parallel calls per item), connect to UI cards |
| 4 | Add Ranking step + sort queue, add voice input + transcription |
| 5 | Approve/Edit/Skip interactions, copy-to-clipboard, empty/error states |
| 6 | Add confidence flag feature, polish visuals/animation, test with 8-10 real messy voice notes |
| 7 | Final bug pass, record demo video, write README, submit |

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Extraction misses items or splits them wrong | Show raw transcript alongside the queue so user can sanity-check; keep extraction prompt strict with few-shot examples |
| Drafted tone feels generic/robotic in live demo | Test extensively with real messy inputs before recording; have 2-3 pre-tested "safe" examples ready if live recording misfires |
| Mesh API exact spec differs from assumed OpenAI-compatible shape | Confirm against meshapi.ai docs on Day 1, before building anything else |
| Voice transcription adds complexity/fragility | Ship text-paste path first as the reliable core; voice is an enhancement, not a blocker if it's flaky near deadline |

---

## 15. Definition of done (for submission)

- [ ] Public GitHub repo with clean, incremental commit history
- [ ] Full text-paste flow works end-to-end, live, no mocked data
- [ ] Voice input works (or is clearly marked as a fallback path if time ran out — never demo something broken)
- [ ] At least the confidence-flag stretch feature is included
- [ ] 2–3 min demo video recorded per the script above
- [ ] README with setup + Mesh config notes
- [ ] Submitted with registered Mesh email before 12 July, 12:00 AM
