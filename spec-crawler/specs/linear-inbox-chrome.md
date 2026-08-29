# Linear Inbox — header controls, row context menu, snooze submenu

Captured 2026-08-24 over CDP on `linear.app/test-workspace-bb/inbox`
(viewport 1432×723, dark). Entry paths given per surface.

## Header (list pane, 400w column at x221)

- `Notification actions` button 28×28 @281,16 (aria-haspopup=menu)
- `Add filter` button 28×28 @550,16
- `Display options` button 28×28 @584,16
- Rows are `<a>` 400×55 starting y61.

## Notification actions menu (click ⋯ @281,16)

Dialog 356×153 @281,48. Command-menu anatomy: hidden search input +
`role=status` "Showing all items"; listbox rows 355×32 (16 icon + label +
right kbd chip), separators 12h containing a 1px line, 6px list padding.

| Row | Chord |
|---|---|
| Mark all as read | ⌥U |
| Delete all | — |
| Delete all read | ⇧⌫ |
| Delete all read for completed issues and reviews | — |

RE-MEASURED 2026-08-25: exactly ONE separator, after row 1
("Mark all as read"); 356×153 = 12 pad + 32 + 12 sep + 32×3. The
earlier "3 separators" note was a mis-count from separator-wrapper
matching.

## Row context menu (right-click a row at ~400,88)

Dialog 232×261. Rows:

| Row | Chord | Submenu |
|---|---|---|
| Mark as read | U | |
| Delete notification | ⌫ | |
| Snooze | H | ▶ |
| Subscribe | ⇧S | |
| Favorite | ⌥F | |
| Copy | | ▶ |
| Open in desktop app | ⌃⌘, | |

## Snooze submenu (hover Snooze)

Dialog 315×242 @634,116 — searchable header again, listbox 314×204.
Each row: label left + RESOLVED DATE right (secondary color):

| Label | Resolved (captured Sun 24 Aug ~7:35) |
|---|---|
| An hour from now | Mon, 24 Aug, 8:35 AM |
| Tomorrow | Tue, 25 Aug, 9:00 AM |
| Next week | Mon, 31 Aug, 9:00 AM |
| A month from now | Thu, 24 Sep, 9:00 AM |
| Next cycle | (no date shown) |
| Custom… | |

So: +1h exact; tomorrow/next-Monday/a-month-out all resolve to 9:00 AM.
There is NO "later today" preset.

## Copy submenu (hover Copy)

Dialog 271×269: Copy ID ⌘., Copy URL ⌘⇧,, Copy title ⌘⇧', Copy title as
link ⌘C, Copy description as Markdown, Copy content as Markdown ⌘⌥C,
Copy git branch name (truncated capture).

## Add filter menu (click @550,16)

Dialog 207×306, "F" chord in header. Rows, all with ▶ submenus:
Notification type, Subscription, From, Team, Project, Initiative,
Issue priority, Issue status type.

## Display options popover (click @584,16)

300×161 @312,49 (wait — anchored under the LIST header, x312):
- `Ordering` row with combobox `Newest` (72×24)
- Toggle `Show snoozed`
- Toggle `Show read`
- Toggle `Show unread first`
(three switch inputs 22×14 at y115/147/179)

## Not measured

- Ordering combobox option list (Newest/Oldest assumed, unverified).
- The Custom… snooze date picker.
- The per-filter submenus of Add filter.
- Light theme values for all of the above.
- The reading pane's empty ("no notification selected") state.
- Row hover/read/unread exact colors (covered by an earlier spec:
  issues-detail-inbox-board.md "Inbox").
- Whether U toggles to "Mark as unread" on a read row (assumed toggle).


## Row anatomy LIGHT re-capture 2026-08-24 (tree: spec-bundle/extracted/linear-inbox-row-tree.txt)

```
a 400×55 (row; plate div 384×55 mx-8 px-8 r:8 — selected wash rides its
  ::before, bg lch(92.94 .5 282) light / lch(15.42 1.3 272) dark)
├ avatar cell 32×44 pt-12 flex-none min-w-24
│ ├ avatar 32×32 (actor avatar; SYSTEM notifications use the app logo
│ │   mark in a circle — Linear uses its real SVG logo)
│ └ badge 16×16 absolute (18px top, -4 right, -2 bottom, 20 left):
│     14×14 r-50% circle bg lch(87.44 .5 282) + 15×15 action icon
└ text col flex-1 gap-2 py-10
  ├ line1 17h flex ai:center:
  │   [unread dot 8×8 r-50% bg lch(53 52.26 286.91) mr-6 mt-1]
  │   [issue id 13/500 ls-0.26 mr-4] [title 13/500 flex-1 truncate]
  │   [status icon 14×14 ml-6 right]
  └ line2 16h flex ai:flex-end gap-6:
      [snippet 12/450 flex-1 truncate] [time 12/450 min-w-16 right]
```
- Unread: dot + title 13/500 lch(19.588 1.25 282).
- Read: NO dot, title 13/450 lch(39.176 1.25 282) (muted); the ACTIVE
  read row keeps dark text (lch ~18.6 .. 450).
- Hover: MEASURED 2026-08-25 — light hover wash lch(94.44 .5 282) on
  the plate ::before. It requires a real approach-then-rest mouse
  sequence to trigger; a single synthetic move reads transparent
  (that false negative is what the earlier "no hover" note was).

## Split + routing (measured)
- List pane 400w default; divider 7px col-resize (transparent strip,
  absolute) between list and pane; drag limits: list min 300, MAX 602.
  Second divider (sidebar/list) also col-resize at x218.
- Selecting a notification sets the URL to the ISSUE'S CANONICAL PATH
  (/{ws}/issue/TES-7/slug) while keeping the inbox two-pane layout.
- Reading pane = the FULL issue view (23 buttons, editable title/
  description, property sidebar), NOT a summary.

## Empty reading pane (no selection)
- Line-art inbox SVG 97.5×100 (viewBox 78×80, stroke
  lch(39.176% 1.25 282) sw1.5 — extracted verbatim:
  spec-bundle/extracted/linear-inbox-empty-pane.svg)
- Caption "N unread notifications" 13/500 lch(39.176 1.25 282).

## Display options re-verified: 300×161 — Ordering [Newest ▾] ·
## Show snoozed (off) · Show read (on) · Show unread first (off).

## Not measured (this pass)
- The DOCUMENT reading pane (E2): producing a document reminder over
  CDP kept flaking (the ⋯→Remind me submenu wouldn't hold open under
  synthetic hover); our pane renders the full DocumentPage on the
  issue-pane pattern — UNVERIFIED against a reference capture.
- Light-theme hover plate tint; divider width persistence key; the
  display button's open-state plate geometry (visible in Ahmed #218 —
  a rounded plate behind the icon when its popover is open); snooze
  row's clock badge variants per action type (badge ICON varies:
  check=closed, pencil=edited etc. — icon set not enumerated).
