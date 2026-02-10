# ADR Readiness Checklist

Reference checklist for Architecture Decision Records. The architect self-checks against criteria relevant to the project type. The reviewer validates that the selection of criteria was reasonable — not every criterion applies to every project.

This is a **reference checklist**, not a rigid gate. Apply the criteria relevant to your project type and document why any skipped criteria are not applicable.

## 1. Testability & Automation

- [ ] **Test strategy defined** — The architecture specifies which types of tests are expected (unit, integration, E2E, contract) and where they run.
  - *Applies to: all*
- [ ] **Test boundaries identified** — System boundaries where mocking/stubbing is appropriate are documented (external APIs, databases, third-party services).
  - *Applies to: all*
- [ ] **CI pipeline includes tests** — The deployment pipeline runs all test suites and blocks on failure.
  - *Applies to: all*
- [ ] **Testable in isolation** — Each service or major module can be tested independently without bringing up the entire system.
  - *Applies to: api, web-app, microservices*
- [ ] **Contract testing for integrations** — If services communicate with each other or external APIs, contract tests are planned.
  - *Applies to: api, microservices*

## 2. Test Data Strategy

- [ ] **Test data approach defined** — The architecture specifies how test data is created (factories, fixtures, seeds) and cleaned up (rollback, truncation).
  - *Applies to: all with persistence*
- [ ] **No production data dependency** — Test environments do not rely on copies of production data. Synthetic data strategies are documented.
  - *Applies to: all with persistence*
- [ ] **Data migration testing** — Schema migrations have a testing plan (forward, rollback, data transformation).
  - *Applies to: all with persistence*
- [ ] **Multi-tenant data isolation** — If the system is multi-tenant, test data isolation between tenants is addressed.
  - *Applies to: SaaS, multi-tenant systems*

## 3. Scalability & Availability

- [ ] **Concurrency model defined** — The architecture describes how concurrent requests are handled (thread pool, event loop, worker processes) and the expected limits.
  - *Applies to: api, web-app, production systems*
- [ ] **Horizontal scaling strategy** — If scaling beyond a single instance is expected, the approach (load balancing, stateless design, session handling) is documented.
  - *Applies to: production systems with growth expectations*
- [ ] **Database scaling approach** — Read replicas, connection pooling, sharding, or other database scaling strategies are addressed if NFRs require them.
  - *Applies to: production systems with data scale expectations*
- [ ] **Availability target defined** — Uptime target (99.9%, etc.) is stated with implications for architecture (redundancy, failover, health checks).
  - *Applies to: production systems*
- [ ] **Graceful degradation** — The system has a strategy for operating with reduced functionality when dependencies fail.
  - *Applies to: production systems with external dependencies*

## 4. Disaster Recovery

- [ ] **Backup strategy** — Database backup frequency, retention, and restoration procedure are documented.
  - *Applies to: production systems with persistence*
- [ ] **Recovery time objective (RTO)** — Maximum acceptable downtime after a failure is defined and the recovery procedure supports it.
  - *Applies to: production systems*
- [ ] **Recovery point objective (RPO)** — Maximum acceptable data loss is defined and backup frequency supports it.
  - *Applies to: production systems with persistence*
- [ ] **Failover procedure** — If high availability is required, failover triggers and procedures are documented.
  - *Applies to: production systems with availability targets > 99.9%*
- [ ] **Data integrity after recovery** — Recovery procedures include verification steps that confirm data consistency.
  - *Applies to: production systems with persistence*

## 5. Security

- [ ] **Authentication mechanism specified** — How users authenticate (JWT, session, OAuth, API key) is fully designed, not just named.
  - *Applies to: all with user access*
- [ ] **Authorization model designed** — Role-based, attribute-based, or other access control model is defined with enforcement points.
  - *Applies to: all with user access*
- [ ] **Data encryption strategy** — Encryption at rest and in transit is addressed. Key management approach is documented.
  - *Applies to: all handling sensitive data*
- [ ] **Secrets management** — How API keys, database credentials, and tokens are stored and rotated is specified (not hardcoded or in environment files committed to source).
  - *Applies to: all*
- [ ] **Input validation strategy** — Where and how user input is validated is documented (middleware, schema validation, ORM constraints).
  - *Applies to: api, web-app*
- [ ] **Dependency security** — Automated dependency scanning is planned for the CI pipeline.
  - *Applies to: all*

## 6. Observability & Debugging

- [ ] **Logging strategy** — Log levels, structured logging format, and what gets logged (and what does not) are defined.
  - *Applies to: all*
- [ ] **Error tracking** — How errors are captured, aggregated, and alerted on is specified (Sentry, Datadog, CloudWatch, etc.).
  - *Applies to: production systems*
- [ ] **Request tracing** — For systems with multiple services or complex request paths, distributed tracing or correlation IDs are planned.
  - *Applies to: microservices, api with external dependencies*
- [ ] **Health check endpoints** — Liveness and readiness endpoints are defined for monitoring and orchestration.
  - *Applies to: api, web-app, production systems*
- [ ] **Metrics collection** — Key business and system metrics (response time, error rate, queue depth) are identified and collection is planned.
  - *Applies to: production systems*

## 7. Quality of Service

- [ ] **Response time targets** — p50, p95, and p99 response time targets are defined for key endpoints or operations.
  - *Applies to: api, web-app*
- [ ] **Throughput targets** — Expected requests per second or operations per minute are defined.
  - *Applies to: api, production systems*
- [ ] **Rate limiting** — Client-facing APIs have rate limiting or throttling to prevent abuse and protect backend resources.
  - *Applies to: api, web-app exposed to the internet*
- [ ] **Timeout strategy** — Timeouts are defined for external calls, database queries, and long-running operations. No unbounded waits.
  - *Applies to: all with external dependencies*
- [ ] **Retry and circuit breaker patterns** — For unreliable dependencies, retry policies and circuit breakers are specified to prevent cascade failures.
  - *Applies to: production systems with external dependencies*

## 8. Deployability

- [ ] **Deployment strategy defined** — How the application is deployed (rolling, blue-green, canary) and to what environment (cloud, containers, serverless).
  - *Applies to: production systems*
- [ ] **Environment parity** — Development, staging, and production environments are similar enough that bugs do not appear only in production.
  - *Applies to: all with multiple environments*
- [ ] **Configuration management** — How environment-specific configuration is managed (env vars, config service, secrets manager) without code changes.
  - *Applies to: all*
- [ ] **Zero-downtime deployment** — If availability targets require it, the deployment strategy supports deploying without downtime (database migrations, backward-compatible API changes).
  - *Applies to: production systems with availability targets*
- [ ] **Rollback procedure** — How to revert a bad deployment is documented, including database rollback if migrations were applied.
  - *Applies to: production systems*
- [ ] **Feature flags** — If gradual rollout or A/B testing is needed, a feature flag strategy is defined.
  - *Applies to: production systems with gradual rollout requirements*

## Validation Process

1. The architect reviews each category and checks criteria relevant to the project type
2. For each skipped criterion, note why it does not apply (e.g., "No persistence layer" skips all data-related items)
3. The reviewer validates that:
   - All criteria relevant to the project type were addressed
   - Skipped criteria have reasonable justifications
   - Checked criteria are substantively addressed in the architecture, not just acknowledged
4. This checklist does not produce a pass/fail — it produces a coverage assessment that informs the architecture review
