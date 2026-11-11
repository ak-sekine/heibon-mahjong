# Verified Pages snapshots

Issue #47 durable artifact store. This branch is not a Pages deployment source by itself.

No environment is published or seeded yet. Only a fully verified production candidate
may bootstrap `site/`; development cannot initialize production. Publication and
recovery are managed by the source branch's `publish-environments.yml` and
`docs/operations/environments.md`. Never replace a failed fetch with an empty store,
force push, remove history, or clear a pending journal without reconciling Pages.
