# Linear — document reminder flow (Remind me → pill → reschedule/cancel)

Captured 2026-08-24, dark, from user-supplied reference screenshots of
`linear.app/test-48bd-dd25` (images 187/188/190/191) + live CDP on
`test-workspace-bb` for the preset values (inbox snooze submenu, same set).

## State ledger

| state | entry path | captured |
|---|---|---|
| no reminder | open any doc | ✓ (no pill in header) |
| Remind-me panel | ⋯ → hover `Remind me ⇧H ▸`, or press ⇧H | ✓ image 188 |
| panel while typing | type in the NL input | measured via the issue composer's same parser (specs in open-issue-dialog docblocks) |
| reminder active | pick any preset | ✓ image 190 — header pill |
| pill menu | click the pill | ✓ image 191 |
| reschedule panel | hover `Reschedule reminder ⇧H ▸` | ✓ image 191 (same panel) |
| cancelled | `✕ Cancel reminder` | pill gone (driven on ours; reference end-state not screenshotted) |
| fired | deadline passes | reminder surfaces UNREAD in the inbox (timestamp mechanism, driven on ours) |

## Control inventory

**Remind-me / Reschedule panel** (one panel, two mounts):
1. NL input — placeholder `Try: 4 pm, 2 days, in 5 weeks...`, border-b under it
2. `An hour from now` — alarm glyph · resolved date right (`Mon, 24 Aug, 12:01`)
3. `Tomorrow` — resolves 9:00
4. `Next week` — next Monday 9:00
5. `A month from now` — +1 month 9:00
6. `Custom…` — alarm glyph, NO date; opens the calendar dialog

6 controls. Preset VALUES verified live on the inbox snooze submenu
(identical set + resolved-date column).

**Header pill** (active reminder): alarm glyph + phrase (`1 hour from now`)
in brand blue, pill chrome. 1 control.

**Pill menu**: `Reschedule reminder ⇧H ▸` (alarm glyph) · `✕ Cancel
reminder`. 2 controls.

**Toast**: title `Reminder set`, description
`You will receive a reminder on Aug 24, 12:03` (short month, day, time).

## Shortcuts

| chord | action | bound in ours |
|---|---|---|
| ⇧H | open the reminder panel (Reschedule when active) | ✓ `useHotkey("Shift+H")` |

## Not measured

- The reference's Custom… calendar for REMINDERS specifically (ours reuses
  the measured due-date calendar with reminder copy — copy is adapted).
- Exact panel px (width/row height) — built at 315w/32px matching the
  measured inbox snooze submenu, same anatomy family.
- Light-theme values (reference screenshots were dark).
- The pill's exact border/fill tokens — chrome adapted to our pill idiom.
- Whether the reference's pill label ever shows a resolved date for
  custom times (ours falls back to `Aug 24, 12:03` form).
