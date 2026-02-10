# Code Quality Gate

Validation criteria for implementation code. Applied when a developer marks a story as complete and ready for review. Code quality failures discovered here are cheaper to fix than in production but more expensive than preventing them in stories.

## Required Completions

Before code can pass this gate, the following must be true:

- [ ] **All tasks complete**: Every task and subtask in the story file is marked as done
- [ ] **All acceptance criteria satisfied**: Implementation covers every acceptance criterion
- [ ] **File list updated**: Story file contains an accurate list of all created/modified files
- [ ] **Tests pass**: All tests (unit, integration, e2e as applicable) pass locally
- [ ] **No regressions**: All pre-existing tests continue to pass

## Quality Standards

### Functional Correctness

- [ ] **Acceptance criteria coverage**: Each acceptance criterion has corresponding implementation that satisfies it
- [ ] **Edge cases handled**: Error conditions, empty states, boundary values are addressed
- [ ] **Input validation**: User input and external data are validated before processing
- [ ] **Error handling**: Errors are caught, logged appropriately, and surfaced with meaningful messages
- [ ] **No hardcoded values**: Configuration values, URLs, credentials are externalized

### Code Structure

- [ ] **Project conventions followed**: File locations, naming patterns, and module organization match the architecture document and project context
- [ ] **Single responsibility**: Each function/method/class has one clear purpose
- [ ] **No dead code**: No commented-out code, unused imports, or unreachable branches
- [ ] **Reasonable complexity**: No functions exceeding ~50 lines or deeply nested logic (>3 levels)
- [ ] **DRY**: No significant code duplication within the story's changes

### Testing Quality

- [ ] **Unit tests exist**: Core logic has unit tests covering primary behavior and edge cases
- [ ] **Tests are meaningful**: Tests verify behavior, not implementation details
- [ ] **Tests are independent**: Each test can run in isolation without depending on other test outcomes
- [ ] **Negative tests exist**: Tests cover error conditions, invalid input, and failure scenarios
- [ ] **Test names are descriptive**: Test names describe what is being tested and expected outcome
- [ ] **No test cheating**: Tests do not mock away the behavior they should be testing

### Security

- [ ] **No secrets in code**: No API keys, passwords, tokens, or credentials in source files
- [ ] **Input sanitization**: User-provided data is sanitized before use in queries, rendering, or system commands
- [ ] **SQL injection prevention**: Database queries use parameterized queries or ORM methods, never string concatenation
- [ ] **XSS prevention**: User-generated content is escaped before rendering in HTML contexts
- [ ] **Authentication enforced**: Protected endpoints and resources check authentication
- [ ] **Authorization enforced**: Operations verify the user has permission to perform them
- [ ] **Dependency safety**: No known-vulnerable dependencies introduced

### Performance

- [ ] **No N+1 queries**: Database access patterns don't issue per-item queries inside loops
- [ ] **Reasonable resource usage**: No unbounded memory allocation, infinite loops, or resource leaks
- [ ] **Async where appropriate**: I/O operations use async patterns where the framework supports it
- [ ] **No blocking operations**: Long-running operations don't block the main thread in async contexts

## Common Failures to Check For

- **Tests that always pass**: Tests with no assertions, or assertions that can never fail
- **Implementation without tests**: Tasks completed but corresponding tests not written
- **Style-only changes**: Reformatting or renaming in files outside the story's scope
- **Scope creep**: Code changes beyond what the story requires
- **TODO comments**: Deferred work that should be tracked as a separate story, not a code comment
- **Console.log debugging**: Debug logging left in production code
- **Missing error boundaries**: Async operations without try/catch or .catch() handlers
- **Overly broad try/catch**: Catching all exceptions instead of specific error types
- **Magic numbers**: Unexplained numeric literals in logic
- **Inconsistent error responses**: Different error formats across endpoints

## Pass/Fail Criteria

**PASS** when:
- All story tasks and subtasks are marked complete
- All acceptance criteria have corresponding implementation
- All tests pass with no regressions
- No security vulnerabilities detected in the story's changes
- Code follows project conventions and architecture patterns
- File list in the story accurately reflects changes

**FAIL** when:
- Any story task is incomplete
- Any acceptance criterion is not satisfied by the implementation
- Tests fail or were not written
- Security vulnerabilities detected (SQL injection, XSS, secrets in code)
- Code violates project conventions or architecture decisions
- File list is inaccurate or missing entries

## Validation Process

1. Verify all story tasks are marked complete
2. Cross-reference each acceptance criterion against the implementation
3. Run the full test suite and verify all pass
4. Review changed files for security issues
5. Review changed files for code structure and convention compliance
6. Verify the story file's file list matches actual changes
7. Check for common failures
8. Produce validation report with pass/fail and findings
