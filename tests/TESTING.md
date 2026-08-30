# Testing

Listening Post uses a seven-layer fail-closed test model.

| Layer | Evidence |
| --- | --- |
| Git hook | `.githooks/pre-push` runs the full offline suite and gates |
| Static | ShellCheck plus C28-C43 vendored gates |
| Unit | Node tests cover all 29 captured feeds, parsing, ranking, retention, and notifications |
| Integration | QML, manifest, fixed-network, state-lifecycle, and accessibility contracts |
| System | `rig-verify.sh` runs the real Omarchy validator and `qmllint` on Buzz |
| E2E | `e2e/buzz.sh` starts an isolated real shell, drives unchanged production fetch and parsing boundaries, opens the panel, and captures it |
| Acceptance | C43 requires exact copy, a themed banner, a hash-bound render receipt, and explicit visual approval |

The default suite enforces 95% statements, lines, and functions plus 90%
branches. Mutation testing blocks below 90%. The race lane repeats the complete
offline suite three times with concurrent execution. Buzz fixtures are rig-only;
production has no fixture mode and runs the same Service, Model, bar, and panel.
