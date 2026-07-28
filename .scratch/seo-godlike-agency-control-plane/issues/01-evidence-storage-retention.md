# Durable evidence storage and retention

Labels: `wayfinder:research`
Status: closed
Map: `../map.md`

## Question

What storage, indexing, immutability, retention, and cleanup contract should
replace or extend local filesystem bundles for agency-scale history without
weakening evidence verification or tenant isolation?

## Resolution

Keep manifest-verified filesystem bundles as the durable evidence source of
truth. Any SQLite index is additive, fully rebuildable, and must be gated on
host fsync/concurrency proof; retention remains a separate operator decision.

Research disposition: `bundle-first-storage-optional-additive-index`.
