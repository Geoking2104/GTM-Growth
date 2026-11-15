# Upstream attribution

This integration adapts the Slack admission pattern, authenticated tool pattern
and documented-metric workflow from Vercel's Eve Data Agent Template:
https://github.com/vercel/eve/tree/dd47b8355241fc04b14d2ff00465ac3bd463f165/apps/templates/eve-data-agent-template

Upstream: vercel/eve, Apache License 2.0; license included in LICENSE.eve and
the upstream copyright/dependency notices retained in NOTICE.eve.
Changed for GTM Growth: tenant-bound HMAC bridge, curated metric reads in place
of DuckDB/SQL/dbt, disabled HTTP sessions and default tools, five GTM tools (including source-grounded buyer questions),
bounded aggregate outputs, business profiles and console handoffs.

No Jaffle Shop sample data or dbt models are bundled. Their sample database is
not a source of GTM customer metrics. Upstream was reviewed on 2026-11-13.
