# Performance Testing Guide

Patterns and practices for performance testing. Covers load profiles, benchmarks, thresholds, profiling, bottleneck identification, and memory leaks. Use this guide when the project has performance NFRs or serves concurrent users.

## Overview

Performance tests verify that the system meets speed, throughput, and resource consumption targets under expected and peak loads. Unlike functional tests, performance tests measure behavior over time and under stress. They catch regressions that functional tests miss — the feature works, but it takes 8 seconds or crashes under 50 concurrent users.

## Key Patterns

### Load Profiles

- **Baseline test**: Single user, no concurrency. Establishes the fastest possible response time for each endpoint. Run first.
- **Load test**: Simulates expected concurrent usage (e.g., 100 concurrent users for 10 minutes). Verifies the system handles normal traffic.
- **Stress test**: Increases load beyond expected limits to find the breaking point. How many users until response times degrade or errors appear?
- **Soak test**: Sustained load over an extended period (hours). Catches memory leaks, connection pool exhaustion, and log file growth.
- **Spike test**: Sudden burst of traffic (e.g., 10 to 500 users in 10 seconds). Tests auto-scaling and graceful degradation.
- **Tools**: k6 (recommended — scriptable, developer-friendly), Artillery, Locust, Gatling, JMeter.

### Benchmarks and Thresholds

- **Define targets from NFRs**: Response time (p95 < 200ms), throughput (1000 req/s), error rate (< 0.1%). These come from the PRD/architecture, not guesses.
- **Percentile-based metrics**: Use p50, p95, and p99 response times. Averages hide tail latency problems.
- **Threshold gates in CI**: Configure the load testing tool to fail the build if thresholds are breached. This prevents performance regressions from merging.
- **Track trends**: Store benchmark results over time. A 10ms regression per release compounds.

### Profiling

- **CPU profiling**: Identify functions consuming the most CPU time. Tools: Node.js inspector, py-spy, pprof, Chrome DevTools.
- **Memory profiling**: Track heap allocation growth over time. A steadily growing heap indicates a memory leak.
- **Database query profiling**: Enable slow query logging. Identify N+1 queries, missing indexes, and full table scans.
- **Network profiling**: Measure time-to-first-byte (TTFB), DNS resolution, TLS handshake, and payload size. Especially important for frontend performance.

### Bottleneck Identification

- **Database first**: Most performance issues originate in the database. Check query plans, missing indexes, and lock contention before optimizing application code.
- **Connection pools**: Verify pool sizing matches expected concurrency. Too small causes queuing; too large wastes resources.
- **Serialization costs**: JSON parsing/serialization can dominate response time for large payloads. Measure and consider pagination or streaming.
- **External dependencies**: Third-party API calls add latency and failure modes. Measure separately and set timeouts.
- **Caching effectiveness**: Measure cache hit rates. Low hit rates mean the cache is not helping; high miss rates under load indicate cache stampede risk.

### Memory Leak Detection

- **Heap snapshots**: Take snapshots at intervals during a soak test. Growing retained object counts indicate leaks.
- **Common causes**: Event listeners not cleaned up, closures holding references, growing caches without eviction, uncleared timers/intervals.
- **Process metrics**: Monitor RSS (resident set size) over time. Steady growth under constant load is a leak signal.
- **Reproduction**: Isolate the leaking code path by running targeted load against specific endpoints.

## Common Anti-Patterns

- **Performance testing in production only**: Discover performance issues before release, not after. Test in a staging environment that mirrors production infrastructure.
- **Testing with unrealistic data**: An empty database is fast. Test with production-scale data volumes.
- **Ignoring cold start**: The first request after deployment is often slow (JIT compilation, cache warming, connection establishment). Include warm-up periods.
- **Averages instead of percentiles**: Average response time of 100ms hides a p99 of 5 seconds.
- **No baseline**: Running a load test without first establishing single-user performance. You cannot identify degradation without a baseline.
- **One-time testing**: Performance testing only before launch and never again. Regressions accumulate.

## Checklist

- [ ] Performance NFRs are defined with specific, measurable thresholds
- [ ] Baseline (single-user) benchmarks are established for key endpoints
- [ ] Load tests simulate expected concurrent usage patterns
- [ ] Stress tests identify the system's breaking point
- [ ] Soak tests run for extended periods to catch memory leaks
- [ ] Response times are measured at p50, p95, and p99 — not just averages
- [ ] Database query performance is profiled (slow queries, missing indexes)
- [ ] Performance thresholds are enforced in CI (builds fail on regression)
- [ ] Test data volume matches production-scale expectations
- [ ] Memory usage is monitored during sustained load
