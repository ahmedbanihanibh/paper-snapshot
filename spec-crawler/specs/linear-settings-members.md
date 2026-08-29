# Linear — Workspace settings › Members (task #70)

Captured 2026-08-25 over CDP on test-workspace-bb/settings/members
(light). Tree: spec-bundle/extracted/linear-settings-members-grid.txt.

## Table
Named-track grid, header+rows as subgrids:
[indent 60][title ~418 flex][email ~279][status 140][teams 82]
[joined 82][lastSeen 82][menu 28][end-padding 32].
Header 32h sticky; sortable columns = 24h round pills (0.5px border,
pad 0 6, 12/450 label + 12px sort arrow); Teams plain label. Group
rows 32h sticky r:8 (12/500 label + count): "Active 1",
"Application 2". Rows 50h r:8, 2px gaps.

## Rows
- Member: avatar + name 13/500 / handle 12/500 muted · email 12/450
  muted · STATUS PLAIN TEXT ("Admin") · "2 teams" · joined rel ·
  "Online" (self) · NO ⋯ on the self/only-admin row (measured: no
  Open-menu button exists on it).
- Application (Cursor, Linear): name/handle, no email, status
  "Application", lastSeen date, ⋯ present.

## Application row ⋯ menu (measured 176×165, 32h rows)
Update name… · Update username… · Manage team access… ·
Revoke access…

## Invite dialog (opened from the Invite button)
Full-screen overlay; card: title "Invite to your workspace" ·
Email multi-input (placeholder "email@gmail.com, email2@gmail.com…",
529w) · "Add to team (optional)" + "Select teams…" picker ·
"Send invites" primary. Inner card geometry NOT isolated (overlay box
only) — flag before cloning exact chrome.

## Top bar
"All" tab pill · Export CSV · Invite. (Order-by pills double as the
column headers.)

## Non-self member ⋯ + suspend/reactivate (measured 2026-08-25,
test-48bd-dd25 — second human member "ahmad banihani")
- SUSPENDED member ⋯ (175×121, 32h rows): Activate user… ·
  Update name… · Update username…
- ACTIVE non-self member ⋯: Update name… · Update username… ·
  Update email… · Suspend user… · Manage teams…
- Suspend confirm dialog (verbatim): "Suspend ahmad banihani?" /
  "They won't be able to access this workspace." · Cancel · Confirm.
- Activate confirm dialog (verbatim): "Activate ahmad banihani?" /
  "They will be able to access this workspace again." · Cancel ·
  Confirm.
- Status colors: Admin/Owner = lch(50 80 288.43) indigo 12/450;
  Suspended = muted lch(64.64 1.25 282); other roles = foreground.
- Full cycle driven on the reference: activate → active ⋯ captured →
  re-suspended (state restored).

Our build (drive-proven 2026-08-25, suspend-drive.mjs): menu
Suspend user… → confirm dialog (measured copy) → status "Suspended"
muted → menu Activate user… → confirm → "Member" foreground. Engine:
orgMembers.suspendedAt (number|null), getCallerMembership throws
member_suspended (fail-closed), orgMembers.setSuspended
(members:change_role, no self/owner), Zero mirror column.

## Team-page Role cell (measured 2026-08-25, test-48bd-dd25
teams/TES/members, two rows)
- PLAIN TEXT, NOT a chip: span "Workspace admin" 103×15, 12/450,
  color lch(50 80 288.43) indigo, no border/bg/radius/padding.
  TWO DISTINCT SURFACES (both re-verified 2026-08-25): the APP-side
  team page /{ws}/team/TES/members renders the CHIP (113×18, r:2,
  pad 0 5, 12/500, fg lch(50 80 288.43), bg lch(92.44 0.5 282));
  the SETTINGS page settings/teams/TES/members renders plain text.
  Our team-members-table (app-side) chip is correct for its surface.
- Suspended members are HIDDEN from the team members page (ahmad in
  1 team: absent while Suspended, present when Active).
- The whole row is a link to /{ws}/profiles/{username} (clicking the
  role cell navigates; role is not editable from this page).

## "Select teams…" picker (measured 2026-08-25, test-workspace-bb
invite dialog; only shown when the workspace has >1 team —
test-48bd-dd25's single-team invite dialog has NO "Add to team" row)
- Surface 231×114 fixed, r:12, bg lch(100 0 282), border 0.5px
  lch(91.9 0 282), shadow lch(0 0 0/.02) 0 6 18 + lch(0 0 0/.04)
  0 3 9 + (third layer), padding 0.
- Header 230×37: search input placeholder "Search teams…", a11y text
  "Showing all items".
- List 230×76: row plates 218×32 r:8 transparent; leading CHECKBOX
  14×14 r:3 border 1px lch(54.1 0 282) pad 2; team icon svg; name
  13/500 lch(37.776 1.25 282); trailing key (EMP/TES) muted.
- Clicking a row selects the team and CLOSES the picker.

## Not measured
- Role text for Guest/Member values (free-plan fixtures only ever
  produce Workspace admin; no demote affordance found — team page
  is read-only, ⋯ menus carry no role item).
- Trigger label after a team is selected (picker closed before the
  trigger re-read landed).
- Sorting server behavior (client toggle assumed), dark theme, the
  profile hover card's geometry.
