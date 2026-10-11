# Rollout gates — do not deploy before all pass

- [ ] Confirm all production callers of `spike-predictor-sync` and whether a scheduled caller exists.
- [ ] Provision a dedicated high-entropy `SPIKE_PREDICTOR_SYNC_SECRET` only for the trusted server-side caller, or use admin JWT only if no scheduler is needed.
- [ ] Integrate the helper into a complete copy of the reviewed live v41 source; remove `allowedApiKey()` and all public-key bypass paths.
- [ ] Test wrong/missing secret, valid secret, anonymous request with public `apikey`, ordinary signed-in user, admin, super-admin, and OPTIONS.
- [ ] Validate expected behavior for today's cached and fresh-sync paths in a staging project.
- [ ] Review the fixture/prediction write contract and deterministic placeholder model separately.
- [ ] Obtain explicit approval before changing the live function configuration or deploying.
