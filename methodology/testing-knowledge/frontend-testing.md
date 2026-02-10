# Frontend Testing Guide

Patterns and practices for testing frontend applications. Covers component tests, E2E testing, accessibility, visual regression, and interaction testing. Use this guide when the project has a browser-based or mobile UI.

## Overview

Frontend tests validate that users can see and interact with the application as designed. The testing pyramid still applies — many fast component tests, fewer integration tests, and a small set of E2E tests for critical paths. The unique challenge of frontend testing is dealing with asynchronous rendering, browser APIs, and visual correctness.

## Key Patterns

### Component Testing

- **Render and assert**: Mount the component with known props, assert on rendered output. Tools: Testing Library (React, Vue, Angular), Vitest, Jest.
- **User-centric queries**: Query by role, label, text, or placeholder — not by CSS class or test ID. `getByRole('button', { name: 'Submit' })` over `querySelector('.btn-submit')`.
- **Prop variations**: Test the component with different prop combinations including edge cases (empty arrays, null values, long strings).
- **State changes**: Simulate user actions (click, type, select) and assert that the component updates correctly.
- **Async behavior**: When components fetch data or show loading states, test all states: loading, success, error, and empty.

### E2E Testing

- **Critical paths only**: E2E tests are slow and expensive. Cover signup, login, core workflows, and payment — not every feature.
- **Stable selectors**: Use `data-testid` attributes for E2E selectors when semantic queries are not stable enough.
- **API seeding**: Set up test data via API calls or database seeds before the E2E test runs. Do not rely on UI interactions to create prerequisite data.
- **Wait for state, not time**: Use `waitFor`, `expect.poll`, or element visibility checks. Never use `sleep(2000)` or fixed timeouts.
- **Tools**: Playwright (recommended for new projects), Cypress, or WebdriverIO. Choose one and standardize.

### Accessibility Testing

- **Automated checks**: Run axe-core or similar in component tests and E2E tests to catch WCAG violations automatically.
- **Keyboard navigation**: Verify that all interactive elements are reachable and operable via keyboard (Tab, Enter, Escape, Arrow keys).
- **Screen reader labels**: Assert that interactive elements have accessible names (via aria-label, aria-labelledby, or visible text).
- **Focus management**: Test that focus moves correctly after modals open/close, route changes, and dynamic content updates.
- **Color contrast**: Verify text meets WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text). Automated tools catch most violations.

### Visual Regression Testing

- **Snapshot comparison**: Capture screenshots of components or pages and compare against baselines. Tools: Playwright screenshots, Percy, Chromatic.
- **Targeted snapshots**: Snapshot specific components, not entire pages. Page-level snapshots are brittle due to dynamic content.
- **Review workflow**: Visual diffs should be reviewed by a human on PR. Automated approval leads to missed regressions.
- **Responsive states**: Capture snapshots at key breakpoints (mobile, tablet, desktop) for layout-critical components.

### Interaction Testing

- **Form submission**: Test full form flows — fill fields, submit, verify success and error states. Include validation feedback.
- **Navigation**: Test that links and buttons navigate to the correct routes. Verify back/forward browser behavior.
- **Optimistic UI**: If the UI updates before the API confirms, test what happens when the API fails — does the UI roll back?
- **Error boundaries**: Trigger rendering errors and verify the fallback UI displays instead of a white screen.

## Common Anti-Patterns

- **Testing implementation details**: Asserting on component internal state, method calls, or class names instead of visible output.
- **Snapshot overuse**: Snapshot testing entire component trees. These tests break on every change and nobody reviews the diffs.
- **No async handling**: Tests that pass intermittently because they do not wait for data or renders to complete.
- **E2E for everything**: Writing E2E tests for scenarios that should be covered by component tests. This makes the suite slow and flaky.
- **Mocking the component under test**: Over-mocking children or hooks to the point where you are testing the mock, not the component.
- **Ignoring accessibility**: Building a full test suite with zero accessibility checks.

## Checklist

- [ ] Component tests exist for all significant UI components
- [ ] Tests query by role, label, or text — not CSS classes or DOM structure
- [ ] Async states (loading, success, error, empty) are tested
- [ ] E2E tests cover critical user journeys (auth, core workflow, payment)
- [ ] E2E tests use stable selectors and wait for state, not time
- [ ] Automated accessibility checks (axe-core) run in CI
- [ ] Keyboard navigation is tested for interactive components
- [ ] Form validation and submission flows are tested
- [ ] Visual regression is set up for layout-critical components (if applicable)
- [ ] Error boundaries and fallback UI are tested
