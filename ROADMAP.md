# Roadmap

## v0.1 — Idea Validation Core

- Idea intake and normalization
- Structured problem / hypothesis representation
- Agent-assisted analysis and validation
- Evidence and conclusion traceability

## v0.2 — Multi-Agent Discussion

- Multiple specialized agents discuss the same idea
- Explicit roles: proposer, researcher, critic, synthesizer
- Shared discussion context and evidence
- Record disagreements instead of forcing premature consensus

## v0.3 — Discuss → Proposal → PR

Experiment with treating an idea as an engineering change proposal:

```text
Idea
  ↓
Agents Discuss
  ↓
Critic / Adversarial Review
  ↓
Implementation Plan
  ↓
Implementing Agent
  ↓
Pull Request
  ↓
Review Agent(s)
  ↓
Tests / Evaluation
  ↓
Human Decision
```

The goal is to make the repository itself part of the agent collaboration loop: discussion produces an auditable proposal, implementation produces a PR, and review produces structured feedback.

## v0.4 — Model Diversity

- Allow different models to take different roles
- Compare reasoning / implementation / critic models
- Route tasks according to capability, cost, latency and risk
- Keep model choice outside the core workflow protocol

Example:

```text
Planner Model → implementation model → critic model → test/evaluation model
```

The system should not assume that one model is optimal for every stage.

## v0.5 — Iterative PR Loop

- Critic can request changes
- Implementation agent revises the PR
- Review → revision → test can repeat
- Stop conditions based on convergence, risk, cost and human approval
- Preserve every iteration as an auditable trajectory

## Future — Agent Collaboration Runtime

Explore a more general runtime where independent agents can:

- discover each other
- discuss a shared task
- exchange structured proposals
- create and review PRs
- consume CI / evaluation feedback
- resume from checkpoints
- learn from previous trajectories

This is intentionally a roadmap experiment. The first implementation should remain small and repository-centric before introducing a general-purpose agent runtime.
