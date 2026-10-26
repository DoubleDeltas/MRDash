---
name: ship-pr
description: Ship the current working-tree changes of MRDash as a GitHub PR — create a feat/fix branch, commit, push, open a PR to master, and (when the user asks for it) merge it and clean up the branches. Use when the user says things like "브랜치 만들고 PR 올려줘", "PR 올리고 병합까지", "병합했어, 정리해줘".
---

# Branch → PR → merge → cleanup (MRDash)

Repository: `https://github.com/DoubleDeltas/MRDash` (default branch `master`).
`gh` is authenticated as the repo owner. Write PR titles in English and PR
bodies in Korean, matching the earlier PRs.

The flow has three stages. Do only as far as the user asked:

| User says | Do |
|---|---|
| "브랜치 만들고 PR 올려줘" | 1–2, then stop and report the PR URL |
| "PR 올리고 병합까지 / 정리까지 해줘" | 1–4 |
| "병합했어, 정리해줘" | 4 only (verify the merge first) |

## 1. Branch and commit

```bash
git status --short          # see exactly what will ship
git diff                    # read it if this session didn't write it
git checkout -b feat/<short-kebab-desc>   # fix/... for bug fixes
git add <explicit paths>    # never `git add -A` — don't sweep in stray files
git commit -m "<English summary>

Co-Authored-By: <the attribution line from the current system reminder>"
git push -u origin <branch>
```

- Branch from an up-to-date `master`. If you're still on an old, already
  merged branch, do stage 4 first.
- Include everything the user changed since the last PR, not just the
  last request. Several small requests often pile up in one PR. List them
  all in the body.
- New Prisma migrations live in `backend/prisma/migrations/<ts>_<name>/`.
  Add the whole folder.

## 2. Open the PR

```bash
gh pr create --base master --head <branch> --title "<English title>" --body "$(cat <<'EOF'
## Summary
- <what changed, in Korean, grouped by page/area>

## 배포 시            # only if there are deploy steps (env vars, migrations, network)
- ...

## Test plan
- [x] `vite build` 통과 / `prisma validate` 등 실제로 한 것만 체크
- [ ] 실제로 못 한 확인은 체크하지 않은 항목으로 남긴다

<PR attribution footer from the current system reminder>
EOF
)"
```

- If there's a DB migration, say so. The backend container runs
  `prisma migrate deploy` on start, so it applies on deploy.
- Report honestly: things checked only against a mocked API are not "실제 백엔드로 확인".

## 3. Approve and merge (only when asked)

- **Approval is not possible.** GitHub doesn't let the PR author approve
  their own PR, and `gh pr review --approve` is blocked by the
  permission classifier here. Don't retry it or work around it.
- Check whether a merge is allowed without a review:

  ```bash
  gh pr view <n> --json mergeable,mergeStateStatus,reviewDecision
  ```

  `mergeStateStatus: CLEAN` + `mergeable: MERGEABLE` → merge. Anything
  else (`BLOCKED`, `DIRTY`, failing checks) → stop and tell the user why.
- Merge with a merge commit, like the earlier PRs ("Merge pull request #n …"):

  ```bash
  gh pr merge <n> --merge
  gh pr view <n> --json state -q .state   # expect MERGED
  ```

## 4. Clean up

```bash
gh pr view <n> --json state -q .state   # confirm MERGED before deleting anything
git checkout master
git pull --ff-only
git fetch --prune
git branch -d <branch>                  # -d, not -D: refuses if not merged
git ls-remote --heads origin <branch> | grep -q . && git push origin --delete <branch>
git branch -a                           # report what's left
```

- GitHub usually deletes the remote branch on merge already. The
  `ls-remote` check avoids an error when it's gone.
- To clean up *all* merged branches, use `git branch --merged master` and
  `git branch -r --merged master`. For a remote branch you didn't create,
  confirm its PR is `MERGED` (`gh pr list --state all --head <branch>`)
  before deleting it.
- Leave unmerged branches alone (e.g. `origin/debug/ws-close-caller-tag`)
  and mention that they remain.

## Report

End with: PR URL, merged or not, current branch, which branches were
deleted (local/remote), what's left, and any deploy notes (migrations, env vars).
