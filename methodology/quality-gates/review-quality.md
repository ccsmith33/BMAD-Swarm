# Review Quality Gate

Validation criteria for Code Review reports. Applied to verify that reviews are thorough, actionable, and complete. A review that misses critical issues or provides vague feedback defeats its purpose.

## Required Sections

Each review report must contain:

- [ ] **Review Summary** - Overall assessment of the implementation quality in 2-3 sentences
- [ ] **Story Reference** - Which story was reviewed (story key and title)
- [ ] **Acceptance Criteria Verification** - Each AC checked with pass/fail
- [ ] **Findings** - Categorized list of issues discovered
- [ ] **Verdict** - Approved, Changes Requested, or Blocked

## Quality Standards

### Acceptance Criteria Verification

- [ ] **Every AC checked**: Each acceptance criterion from the story is individually assessed as passed or failed
- [ ] **Evidence provided**: Each AC check references the specific code that satisfies or fails to satisfy it
- [ ] **No blanket approvals**: Reviewer does not simply say "all ACs pass" without checking each one

### Findings Quality

Each finding must include:

- [ ] **Severity**: Categorized as Critical, Major, or Minor
- [ ] **Location**: Specific file and line number or function where the issue exists
- [ ] **Description**: Clear explanation of what the issue is
- [ ] **Impact**: Why this matters (security risk, data loss, performance degradation, maintenance burden)
- [ ] **Recommendation**: Specific suggestion for how to fix the issue

### Severity Categorization

Findings must be categorized correctly:

- **Critical** (must fix): Security vulnerabilities, data loss risks, broken functionality, failing tests, requirements not met
- **Major** (should fix): Performance issues, architecture violations, maintainability problems, missing error handling, insufficient test coverage
- **Minor** (nice to fix): Style inconsistencies, documentation gaps, naming improvements, minor code organization

- [ ] **No severity inflation**: Minor style issues are not labeled as Critical
- [ ] **No severity deflation**: Security issues or broken functionality are not labeled as Minor

### Architecture Compliance

The review must check:

- [ ] **Pattern adherence**: Implementation follows the patterns specified in the architecture document
- [ ] **Convention compliance**: File locations, naming, and structure match project conventions
- [ ] **Technology alignment**: Libraries and frameworks used match architecture specifications
- [ ] **No unauthorized dependencies**: No new dependencies introduced without architectural justification

### Test Coverage Assessment

- [ ] **Coverage checked**: Reviewer verifies tests exist for the story's functionality
- [ ] **Test quality assessed**: Tests are not just present but meaningful (test behavior, not implementation)
- [ ] **Gaps identified**: Missing test scenarios are documented as findings

## Common Failures to Check For

- **Rubber stamp reviews**: Approving without substantive analysis (review has no findings and brief summary)
- **Style-only reviews**: Only finding formatting and naming issues while missing logic, security, or architecture problems
- **Missing AC verification**: Review does not check each acceptance criterion individually
- **Vague findings**: Issues described as "this could be better" without specific location, impact, or fix recommendation
- **Incomplete coverage**: Review only checks a subset of changed files, missing issues in files not reviewed
- **Over-blocking**: Marking review as "Blocked" for minor issues that should be "Changes Requested"
- **Missing security review**: No assessment of input validation, authentication, authorization, or data handling
- **No test assessment**: Review does not mention test coverage or test quality at all

## Pass/Fail Criteria

**PASS** when:
- All required sections are present
- Every acceptance criterion is individually verified with evidence
- All findings have severity, location, description, impact, and recommendation
- Severity categorization is appropriate (no inflation or deflation)
- Architecture compliance is checked
- Test coverage is assessed
- Review verdict is consistent with findings (not "Approved" with open Critical findings)

**FAIL** when:
- Required sections are missing
- Acceptance criteria are not individually checked
- Findings lack specific location or actionable recommendations
- Severity is miscategorized
- Architecture compliance is not assessed
- Review is a rubber stamp (no substantive analysis)
- Verdict contradicts findings

## Validation Process

1. Check that all required sections are present
2. Verify each acceptance criterion is individually addressed
3. Validate each finding for required elements (severity, location, description, impact, recommendation)
4. Check severity categorization for consistency
5. Verify architecture compliance was assessed
6. Verify test coverage was assessed
7. Check verdict consistency with findings
8. Produce validation report with pass/fail and findings
