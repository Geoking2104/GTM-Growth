# Redis Caching

GTM Growth supports an **optional** Redis cache to:

- Reduce Google Analytics API quota consumption
- Improve response latency for repeated queries
- Protect against rate limits

## Enable caching

Set the environment variable:

```bash
REDIS_URL=redis://localhost:6379
# or
REDIS_URL=rediss://default:password@your-upstash-or-redis-cloud:6379
```

If `REDIS_URL` is not set, the server runs normally without caching.

## Default TTLs

| Data type       | Default TTL | Env variable            |
|-----------------|-------------|-------------------------|
| Reports         | 10 minutes  | `CACHE_TTL_REPORT`      |
| Metadata        | 1 hour      | `CACHE_TTL_METADATA`    |
| Properties list | 30 minutes  | `CACHE_TTL_PROPERTIES`  |
| Realtime        | **never**   | —                       |

## Cache keys

Keys are deterministic and based on:

- Property ID
- Metrics / dimensions
- Date range
- Filters / orderBys / limit

Example key:

```
ga4:report:{"propertyId":"123456789","metrics":["activeUsers","sessions"],"startDate":"7daysAgo",...}
```

## Behavior

- On cache hit → response includes `"_cached": true`
- On Redis failure → the server continues without cache (no crash)
- Realtime reports are **never** cached

## Recommended setup (production)

- Use a managed Redis (Upstash, Redis Cloud, Railway Redis, etc.)
- Prefer `rediss://` (TLS)
- Keep TTLs relatively short for reports (5–15 min)
