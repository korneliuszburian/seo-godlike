# Context packet v1

The KRN local Markdown tracker compiles one claimed ticket into an immutable
JSON snapshot before Sandcastle execution. The packet is execution input, not
a second tracker and not a shell template.

Required boundaries:

- `source.tracker` is `krn-local-markdown` and includes ticket plus claim IDs.
- `target` names the repository and base ref explicitly.
- `task` contains bounded acceptance, owned paths, non-goals, and context prose.
- `authority` assigns commit/push-PR/merge/KRN-state ownership explicitly.
- `content_sha256` binds the final packet; the compiler writes exclusively and
  refuses to overwrite an existing output.
- Context rejects `!command` lines and common secret-like material.

The packet compiler does not create or update GitHub Issues, call Sandcastle,
open or merge PRs, or update the local ticket after execution.

Compile manually:

```sh
node scripts/context-packet.mjs \
  --ticket .scratch/seo-godlike-infra/issues/07-context-packet-adapter.md \
  --target-repo owner/name \
  --base-ref master \
  --created-at 2026-07-27T12:00:00.000Z \
  --output /tmp/seo-godlike-packet.json \
  --prompt-output /tmp/seo-godlike-packet.md
```

The Markdown output is a deterministic execution prompt for Sandcastle's
`--prompt-file`; it contains no executable command expansion and does not
change packet authority or tracker ownership.
