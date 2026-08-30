# Requirements traceability

| Requirement | Verification |
| --- | --- |
| Parse and sanitize all 29 fixed feed shapes within hard bounds | `tests/model.test.js`, `tests/mutation-contract.test.js` |
| Reject userinfo, shell metacharacters, non-HTTPS links, custom hosts, and redirects | `tests/model.test.js`, `tests/contract.test.js`, C34, C38, C42 |
| Cap item count, retention, source body, usage-file names, and poll time | `tests/model.test.js`, `tests/contract.test.js` |
| Initialize private state before loading or writing | `tests/contract.test.js`, Buzz E2E |
| Keep new installs quiet and personalize without reading usage-file contents | `tests/model.test.js`, Buzz E2E |
| Support pointer and keyboard operation | `tests/a11y.test.js` |
| Use exact 500-character copy and an authored SVG banner | C43, `tests/contract.test.js` |
| Show all four lanes in a direct real-shell marketplace image | Buzz E2E, C43, hash-bound visual approval |
