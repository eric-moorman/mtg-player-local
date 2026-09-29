# reports/

In-app bug/feature reports land here as plain markdown files, committed by the `/api/report` Cloudflare Pages Function. A GitHub Action (`.github/workflows/report-to-issue.yml`) turns each one into a labeled Issue and moves the processed file into `archive/` — this folder should normally be empty or contain only things not yet turned into an Issue.

Nothing in here needs to be edited by hand.
