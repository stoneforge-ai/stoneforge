# Testing Engineering Rules

Use this document when adding or changing tests. It explains how to keep tests behavior-focused, resilient to refactoring, and useful as executable specifications.

## Core Principle

Tests should verify observable behavior through the same public interface production callers use. Code structure can change; behavior contracts should not.

Good tests describe what the system does:

- a Workspace can be validated with a supported repository connection
- a Scheduler returns a placement blocker when no Runtime is eligible
- a merge policy rejects stale required reviews

Weak tests describe how the system is currently implemented:

- a private helper returns an intermediate shape
- an internal collaborator is called with exact arguments that users cannot observe
- a database row is inspected directly when the package interface can report the outcome

If a test fails after an internal refactor but the user-visible or caller-visible behavior is unchanged, the test was probably coupled to implementation.

## Test Surface

Prefer integration-style tests that cross package, service, route, command, or component interfaces. Use the same entry points production code uses unless an internal helper is complex enough and stable enough to be a real local interface.

Keep tests close to source, but do not let file proximity pull tests below the public contract. A package-level behavior test beside the source is usually better than many helper-level tests that freeze internals.

Use the project domain language in test names and fixtures. Test names should read like specifications for Stoneforge behavior, not implementation notes.

## TDD Workflow

Use vertical red-green-refactor cycles for new behavior and bug fixes:

1. Write one failing test for one observable behavior.
2. Implement the smallest change that makes that test pass.
3. Repeat for the next behavior or edge case.
4. Refactor only after the tests are green.
5. Run the relevant tests after every refactor step.

The first test should be a tracer bullet: it proves the path from the public interface to the behavior under test works end to end. Later tests should respond to what the previous cycle revealed.

Do not write all planned tests first and then all implementation. Bulk test-first work often locks in imagined behavior, tests shapes rather than outcomes, and produces brittle tests that are insensitive to real regressions.

Per cycle checklist:

- The test describes behavior, not implementation.
- The test uses a public or stable local interface.
- The test would survive an internal refactor.
- The implementation is only enough for the current behavior.
- No speculative features or test-only abstractions were added.

## Mocking

Mock at trust boundaries, not inside the module under test.

Appropriate mocks and fakes:

- provider SDKs and external APIs
- filesystem, network, process, clock, and environment boundaries
- deterministic agent adapters for CI-stable workflow coverage
- in-memory repositories or stores when persistence itself is not the behavior under test

Avoid mocking internal collaborators just to isolate small functions. That couples tests to call graphs and hides integration failures between cohesive parts of the module.

When a boundary has meaningful behavior, prefer a small fake with observable state over a list of call expectations. Assert outcomes first; assert calls only when the call itself is the contract.

## Coverage, Mutation, And Risk

Coverage numbers are gates, not goals. New or changed behavior needs tests for decisions, boundaries, invariants, and expected failure modes.

Use property tests when the behavior is rule-like across many inputs, especially for parsers, policy, state machines, identifiers, placement decisions, and validation.

Use mutation testing expectations for critical logic. If a surviving mutation represents a meaningful behavior gap, add a stronger test. If it is equivalent, document why rather than weakening the test surface.

## Refactoring

Do not refactor while tests are red. First restore green with the smallest behavior-preserving change, then simplify.

During refactoring, tests should keep proving the same public behavior while internals move. If tests require large rewrites during a refactor, inspect whether they were testing implementation details.

Extract test helpers only when they clarify domain setup or remove duplicated incidental ceremony. Helpers should not hide the behavior being asserted.
