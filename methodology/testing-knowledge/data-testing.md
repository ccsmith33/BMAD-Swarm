# Data Testing Guide

Patterns and practices for test data management. Covers fixtures, factories, teardown, data integrity, migration testing, and seeding strategies. Use this guide when the project uses a database or any persistent data store.

## Overview

Test data is foundational to reliable tests. Bad data management is the top reason tests become flaky, slow, or meaningless. The goal is repeatable, isolated test data that represents realistic scenarios without coupling tests to each other or to a specific database state.

## Key Patterns

### Fixtures vs Factories

- **Factories** (preferred): Functions that generate test data on demand with sensible defaults and overridable fields. Use libraries like `factory_bot`, `fishery`, `faker`, or custom builder functions.
- **Fixtures**: Static data loaded before tests. Useful for reference data (countries, categories) but dangerous for mutable entities. Fixtures shared across tests create hidden coupling.
- **Rule of thumb**: Use factories for entities that tests create and modify. Use fixtures only for immutable reference data.

### Test Isolation

- **Transaction rollback**: Wrap each test in a database transaction and roll back after. Fastest approach and guarantees clean state.
- **Truncation**: Clear tables between tests. Slower than rollback but works when transactions are not feasible (e.g., multi-connection tests).
- **Dedicated test database**: Never run tests against development or production databases. The test database should be disposable and recreatable.
- **No shared mutable state**: If Test A creates a user, Test B must not depend on that user existing. Each test creates what it needs.

### Data Integrity Testing

- **Constraint enforcement**: Verify that NOT NULL, UNIQUE, FOREIGN KEY, and CHECK constraints are enforced by attempting invalid inserts.
- **Cascade behavior**: Test that ON DELETE CASCADE, SET NULL, and RESTRICT behave as designed.
- **Concurrent writes**: Test what happens when two requests update the same record simultaneously. Verify optimistic locking or conflict handling works.
- **Data type boundaries**: Test max-length strings, minimum/maximum numeric values, and special characters (unicode, emoji, null bytes).

### Migration Testing

- **Forward migration**: Apply each migration to a blank database and verify the schema matches expectations.
- **Rollback migration**: If rollbacks are supported, verify down migrations cleanly undo the up migration.
- **Data migration**: When migrations transform data, test that existing data is correctly transformed and not lost.
- **Migration idempotency**: Running the migration twice should not fail or corrupt data.

### Seeding Strategies

- **Minimal seeds**: Seed only what is required for the application to boot (admin user, required lookup tables). Avoid large realistic datasets in seeds.
- **Scenario seeds**: For E2E or demo environments, create named scenarios (empty store, store with 100 products, store with orders) as composable scripts.
- **Seed determinism**: Seeds should produce the same result every run. Avoid random data in seeds (use random data in factories for tests instead).

## Common Anti-Patterns

- **God fixture file**: A single large file with all test data for all tests. Changes break unrelated tests.
- **Test database drift**: Test database schema falls behind migrations because no one runs them in CI.
- **Leaky tests**: Tests that leave data behind, causing later tests to pass or fail depending on execution order.
- **Over-seeding**: Loading thousands of records when the test only needs two. Slows down the suite.
- **Production data in tests**: Copying production data for test fixtures. Creates privacy risks and brittle dependencies.
- **Testing with mocked data only**: Never hitting a real database, which misses constraint violations, query bugs, and type mismatches.

## Checklist

- [ ] Tests use factories (not shared fixtures) for mutable test data
- [ ] Each test is isolated — no dependence on data created by other tests
- [ ] Test database is separate from development and production
- [ ] Database is cleaned between tests (transaction rollback or truncation)
- [ ] Database constraints (NOT NULL, UNIQUE, FK) are tested explicitly
- [ ] Migrations are tested — forward, rollback (if supported), and data migrations
- [ ] Seeds are minimal, deterministic, and composable
- [ ] Edge case data is tested (max lengths, unicode, empty strings, nulls)
- [ ] Concurrent write scenarios are tested if the application supports them
- [ ] No production or sensitive data is used in test fixtures
