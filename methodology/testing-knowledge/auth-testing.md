# Authentication & Authorization Testing Guide

Patterns and practices for testing auth flows. Covers session management, token lifecycle, privilege escalation, CSRF, and OAuth. Use this guide when the project has any form of user authentication or role-based access.

## Overview

Auth is the most security-critical surface in most applications. Auth tests verify that users can only access what they are permitted to, that sessions expire correctly, and that common attack vectors are blocked. Auth bugs tend to be silent — the system works, but for the wrong people.

## Key Patterns

### Session & Token Testing

- **Token expiry**: Issue a token, wait or manipulate the expiry, and confirm the API rejects it with 401.
- **Token refresh**: Verify refresh tokens issue new access tokens and that old access tokens are invalidated (if applicable).
- **Session invalidation**: After logout, confirm the session or token is no longer accepted.
- **Concurrent sessions**: Test the policy — does the system allow multiple sessions? Does a new login invalidate old sessions?
- **Token storage**: If testing a frontend, verify tokens are stored in httpOnly cookies or secure storage, not localStorage.

### Privilege Escalation

- **Vertical escalation**: A regular user must not be able to access admin endpoints. Test every protected endpoint with each role.
- **Horizontal escalation**: User A must not be able to access User B's resources. Test resource endpoints with valid auth but wrong ownership.
- **ID manipulation**: Change resource IDs in requests (e.g., `/users/123/settings` to `/users/456/settings`) and confirm 403 or 404.
- **Role downgrade after change**: If a user's role is downgraded, existing sessions should reflect the change (immediately or on next request).

### CSRF Protection

- **Token presence**: Verify state-changing requests (POST, PUT, DELETE) require a CSRF token.
- **Token validation**: Confirm requests with missing, expired, or wrong CSRF tokens are rejected.
- **Safe methods exempt**: GET and HEAD requests should not require CSRF tokens.
- **Double-submit pattern**: If using cookie-based CSRF, verify the cookie value matches the header/form value.

### OAuth & SSO Flows

- **Redirect URI validation**: The auth server must reject redirect URIs not in the whitelist.
- **State parameter**: Verify the OAuth state parameter is validated to prevent CSRF in the auth flow.
- **Token exchange**: Confirm the authorization code is exchanged correctly and is single-use.
- **Scope enforcement**: Verify that granted scopes are enforced — a token with read scope should not permit writes.
- **Account linking**: If OAuth links to existing accounts, test for account takeover via email matching.

### Credential Handling

- **Password hashing**: Verify passwords are hashed (bcrypt, argon2, scrypt) and never stored or logged in plaintext.
- **Brute force protection**: After N failed attempts, the account should be locked or rate-limited.
- **Password reset flow**: Test the full flow — request, email/token generation, token expiry, and password change. Confirm old tokens are invalidated after use.
- **Credential rotation**: When passwords change, existing sessions should be invalidated (or configurable).

## Common Anti-Patterns

- **Testing auth only on the happy path**: Confirming login works without testing that unauthorized access is blocked.
- **Shared admin token in tests**: Using a global admin token for all tests, which masks authorization failures.
- **Skipping role permutations**: Testing admin and regular user but not edge roles (moderator, read-only, suspended).
- **Mocking auth in integration tests**: Bypassing the auth middleware in tests that should be verifying it.
- **Ignoring token lifecycle**: Testing login and authenticated requests but not expiry, refresh, or revocation.
- **Not testing after state changes**: Failing to verify that role changes, password changes, or account deactivation affect active sessions.

## Checklist

- [ ] Every protected endpoint is tested with unauthenticated requests (expect 401)
- [ ] Every protected endpoint is tested with wrong-role credentials (expect 403)
- [ ] Horizontal access control is tested — users cannot access other users' resources
- [ ] Token expiry and refresh flows are tested
- [ ] Logout invalidates sessions/tokens
- [ ] CSRF protection is verified on state-changing endpoints
- [ ] Brute force protection is tested on login endpoints
- [ ] Password reset flow is tested end-to-end including token expiry
- [ ] OAuth redirect URI and state parameter validation are tested (if applicable)
- [ ] Credential storage uses proper hashing (verified in unit tests or config)
