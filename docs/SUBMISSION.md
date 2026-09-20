# Problem 3 submission

Relay was submitted in the signed-in Road To Devcon V workspace on 20 September 2026 at approximately 08:29 UTC.

- Problem: **The succession nobody wrote down**
- Repository: https://github.com/hrsh22/relay-catalogue
- App: https://relay-catalogue-hrsh22.vercel.app
- Verified implementation commit: `0e05dc7f0329769b3416fc2971174a310a0c116e`
- CI: https://github.com/hrsh22/relay-catalogue/actions/runs/35499634550 - success
- Production deployment: `dpl_8TSuNebxdVtAT4LE3vdD25xDkpHu` - ready

The workspace displayed "Saved - resubmit any time before the clock ends" and "UPDATE SUBMISSION (3)". A full page reload and inspection of each problem's saved repository confirmed:

| Problem | Repository                                      |
| ------- | ----------------------------------------------- |
| 1       | `https://github.com/hrsh22/folio-archive`       |
| 2       | `https://github.com/hrsh22/fieldnote-sightings` |
| 3       | `https://github.com/hrsh22/relay-catalogue`     |

The connected-repository dropdown defaults to Folio even in other problem slots; their actual saved URLs are visible under "PASTE URL". This was checked after reloading, not inferred from an unsaved form.

The free `loops evaluate` command returns a rubric and review instructions, not an official score. We fetched it again after submission and applied it to the Relay repository. The report is [LOOPS_EVALUATION.md](LOOPS_EVALUATION.md). No paid judging attempt or official numerical evaluation was run.

Bee, the Relay operator and the local fork were stopped after verification. The public reader was verified with those services off. The local operator is available through `npm run operator:start` when another publishing or renewal session is needed.
