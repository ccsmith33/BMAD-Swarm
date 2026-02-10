# Security Testing Guide

Patterns and practices for security testing. Covers OWASP top 10 patterns, input validation, injection testing, dependency scanning, and header checks. Use this guide when the project handles user data, authentication, or is exposed to the internet.

## Overview

Security testing verifies that the application resists common attack vectors. It is not penetration testing — it is systematic verification that known vulnerability classes are addressed. Every web application should have security tests. The OWASP Top 10 provides the baseline; this guide translates those categories into testable patterns.

## Key Patterns

### Injection Testing

- **SQL injection**: Pass `'; DROP TABLE users; --`, `' OR '1'='1`, and parameterized equivalents to every input that touches a database query. Verify the query is parameterized or the ORM prevents raw interpolation.
- **NoSQL injection**: For MongoDB and similar, test with `{ "$gt": "" }` or `{ "$ne": null }` in JSON inputs. Verify input is validated, not passed directly to query operators.
- **Command injection**: If any input reaches a shell command, test with `; ls`, `| cat /etc/passwd`, and backtick injection. Prefer library APIs over shell execution.
- **Template injection**: For server-side rendering, test with `{{7*7}}` or `${7*7}` in user input. If the output is `49`, the input reaches the template engine.
- **LDAP/XPath injection**: If applicable, test with special characters for those query languages.

### Cross-Site Scripting (XSS)

- **Reflected XSS**: Inject `<script>alert(1)</script>` via URL parameters and form inputs. Verify the output is escaped.
- **Stored XSS**: Submit script payloads that are saved (comments, profiles, messages) and verify they are escaped when rendered.
- **DOM XSS**: Test client-side code that reads from `location.hash`, `document.referrer`, or other user-controlled DOM sources and writes to `innerHTML`.
- **Context-aware escaping**: HTML context, attribute context, JavaScript context, and URL context each require different escaping. Verify the framework handles this.
- **Content Security Policy**: Verify CSP headers are set and restrictive enough to mitigate XSS if escaping fails.

### Input Validation

- **Type coercion**: Send strings where numbers are expected, arrays where strings are expected, nested objects where flat values are expected.
- **Boundary values**: Maximum lengths, minimum values, negative numbers, zero, empty strings, null, undefined.
- **Encoding attacks**: Double URL encoding, UTF-8 overlong encoding, mixed encodings. Verify normalization happens before validation.
- **File uploads**: Test with oversized files, wrong MIME types, executable files renamed to image extensions, zip bombs, and files with path traversal in filenames (`../../etc/passwd`).

### Dependency Scanning

- **Automated scanning**: Run `npm audit`, `pip-audit`, `cargo audit`, or similar in CI on every build. Fail on high/critical severity.
- **Lock file integrity**: Verify lock files are committed and that `install` commands use the lock file (not resolving fresh versions).
- **Transitive dependencies**: Vulnerabilities in indirect dependencies are equally dangerous. Scanners cover these.
- **License compliance**: While not strictly security, check for copyleft licenses that may conflict with project licensing.
- **Update cadence**: Dependencies with known vulnerabilities should be updated promptly. Track time-to-patch.

### HTTP Header Security

- **Strict-Transport-Security (HSTS)**: Forces HTTPS. Verify it is set with a reasonable max-age.
- **Content-Security-Policy (CSP)**: Restricts resource loading. Verify it is present and does not use `unsafe-inline` or `unsafe-eval` without justification.
- **X-Content-Type-Options**: Should be `nosniff`. Prevents MIME-type sniffing.
- **X-Frame-Options / frame-ancestors**: Prevents clickjacking. Should be `DENY` or `SAMEORIGIN`.
- **Referrer-Policy**: Controls referrer leakage. Should be `strict-origin-when-cross-origin` or more restrictive.
- **Permissions-Policy**: Restricts browser features (camera, microphone, geolocation) the application does not use.
- **Cache-Control on sensitive responses**: Authenticated responses should include `Cache-Control: no-store` to prevent caching of sensitive data.

### Sensitive Data Exposure

- **Error responses**: Verify that error messages do not expose stack traces, database details, or internal paths.
- **Logging**: Verify that passwords, tokens, credit card numbers, and PII are not logged.
- **API responses**: Verify that endpoints do not return more data than the client needs (e.g., returning password hashes in user objects).
- **Transport encryption**: All traffic should be over HTTPS. Verify HTTP redirects to HTTPS.

## Common Anti-Patterns

- **Security testing only before release**: Security tests should run on every commit in CI, not as a one-time audit.
- **Testing only the happy path**: Confirming the app works is not the same as confirming it resists attacks.
- **Relying solely on framework protection**: Frameworks prevent most XSS and SQL injection, but custom queries, raw HTML rendering, and edge cases bypass protections.
- **Dependency scanning without action**: Running `npm audit` but ignoring the results.
- **Testing authentication but not authorization**: Confirming login works without testing that Role A cannot access Role B resources.
- **Assuming internal APIs are safe**: Internal or service-to-service APIs still need input validation and authentication.

## Checklist

- [ ] SQL/NoSQL injection is tested on all data input points
- [ ] XSS is tested for reflected, stored, and DOM-based variants
- [ ] Input validation rejects unexpected types, boundary values, and encoding attacks
- [ ] File upload validation covers size, type, extension, and filename path traversal
- [ ] Dependency scanning runs in CI and fails on high/critical vulnerabilities
- [ ] Security headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options) are present and correct
- [ ] Error responses do not leak internal details
- [ ] Sensitive data is not logged or over-exposed in API responses
- [ ] All traffic is over HTTPS with proper redirects
- [ ] Authorization is tested — not just authentication
