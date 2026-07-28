# Evidence quality frontier

Labels: `wayfinder:research`
Status: closed
Map: `../map.md`

## Question

Which read-only quality checks must gate an agency delivery package before it
can be considered reportable: manifest integrity, provider capability state,
non-zero known-answer proof, freshness, Fallow findings, or a smaller set?

Research must distinguish checks that reject a package from advisory findings
and must preserve the existing evidence bundle as the authority. Fallow may be
evaluated only as a repository-quality aid, never as a provider or metric
authority.

## Resolution

The validated research result is retained in the ignored
`docs/agents/runs/second-opinion-review/2026-07-28-research-evidence-quality-frontier-zfhNC9/` pass directory.

Hard reportability gates are: read-only policy, registered tenant/property
scope, explicit provider/API capability version, canonical new-bundle timestamp,
manifest/hash verification, validated claim, and non-zero batch failure status.
The canonical `report.json` and manifest-verified evidence remain authoritative;
Markdown and HTML are derived views. Fallow is an advisory, read-only
code-quality signal and cannot reject SEO evidence or become tenant/provider
authority. Retention, legal hold, client export authorization, and live GA4
proof remain operator decisions.

Proof: research campaign validation and `run-research.mjs check` passed for the
fixed repository revision `ab722d1dd79d40fc251cd711196b406991bdbbc7`.
