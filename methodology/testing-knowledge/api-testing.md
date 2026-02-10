# API Testing Guide

Patterns and practices for testing APIs. Covers contract validation, endpoint behavior, error responses, and versioning. Use this guide when the project exposes or consumes HTTP APIs.

## Overview

API tests verify that endpoints accept the right input, return the right output, enforce authentication, and handle errors gracefully. They sit between unit tests and full E2E tests — fast enough to run on every commit, broad enough to catch integration failures.

## Key Patterns

### Contract Testing

- **Schema validation**: Assert response bodies against a defined schema (JSON Schema, Zod, Joi). Do not just check status codes.
- **Request validation**: Verify the API rejects malformed requests with 400-level errors and descriptive messages.
- **Content-Type enforcement**: Confirm the API returns the correct Content-Type header and rejects unsupported media types.
- **Response shape stability**: If consumers depend on specific fields, test that those fields are present and typed correctly. This is the contract.

### Endpoint Behavior

- **CRUD lifecycle**: Test the full create-read-update-delete cycle for resources. Verify state changes persist.
- **Idempotency**: PUT and DELETE should be idempotent. Calling them twice should not produce different results or errors.
- **Pagination**: Verify limit/offset or cursor-based pagination returns correct subsets and terminates properly.
- **Filtering and sorting**: Test that query parameters produce correctly filtered and ordered results, including edge cases like empty result sets.
- **HTTP method correctness**: Confirm POST creates, GET reads, PUT/PATCH updates, DELETE removes. Return 405 for unsupported methods.

### Error Response Testing

- **Consistent error format**: Every error response should follow the same structure (e.g., `{ error: { code, message } }`).
- **Status code accuracy**: 400 for bad input, 401 for unauthenticated, 403 for unauthorized, 404 for missing, 409 for conflicts, 422 for validation, 500 for server errors.
- **Error messages are safe**: Error responses must not leak stack traces, internal paths, SQL queries, or sensitive data.
- **Validation error detail**: For 400/422 responses, verify the response identifies which fields failed and why.

### Versioning

- **Version routing**: If the API is versioned, test that requests to each supported version hit the correct handler.
- **Deprecation headers**: Verify deprecated endpoints return appropriate warning headers.
- **Breaking change detection**: Maintain a baseline response snapshot and diff against it to catch unintended contract changes.

## Common Anti-Patterns

- **Status-code-only tests**: Checking `expect(res.status).toBe(200)` without validating the response body. This misses data regressions.
- **Hardcoded IDs**: Tests that reference specific database IDs that break when the database is reset or seeded differently.
- **Order-dependent tests**: Tests that rely on previous tests having created data. Each test should set up its own state.
- **Testing the framework**: Asserting that Express or Fastify routing works. Focus on your business logic, not library internals.
- **Ignoring headers**: Not testing authentication headers, caching headers, or CORS headers when they are part of the contract.
- **Happy-path-only coverage**: Testing only successful responses while ignoring 400, 401, 403, 404, and 500 scenarios.

## Checklist

- [ ] Every endpoint has at least one success and one failure test
- [ ] Response schemas are validated, not just status codes
- [ ] Error responses follow a consistent format across all endpoints
- [ ] Authentication and authorization are tested per endpoint
- [ ] Pagination, filtering, and sorting are tested with edge cases
- [ ] Request validation rejects malformed input with descriptive errors
- [ ] No sensitive data leaks in error responses
- [ ] Tests create their own data rather than depending on shared state
- [ ] API versioning behavior is tested if applicable
- [ ] Rate limiting and throttling are tested if applicable
