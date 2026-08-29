# PB dashboard routes — the functionality each page must keep

Read from the shipped route code on 2026-08-21, so the Linear redesign carries
real behaviour out of the box instead of invented placeholder content. Routes
come from `components/dashboard/dashboard-app.tsx` (the `KeepAlive cacheKey`
list); content from each page component.

**More routes exist than the URL map in CLAUDE.md lists** — `/api-keys`,
`/firmware`, `/documentation`, `/integrations/cli`, `/billing/plans`,
`/settings/preferences`, `/system`, `/admin`, `/admin/beta`, `/admin/content`,
`/admin/templates`. The admin/system five are `isAdmin`-gated and are not
mounted at all for non-admins.

| cacheKey | component |
|---|---|
| `/` | `DashboardOverview` |
| `/protocols` | `ProtocolsContent` |
| `/templates` | `TemplatesContent` |
| `/usage` | `UsageContent` (`product="editor"`) |
| `/activity` | `ActivityFeed` |
| `/audit` | `AuditContent` |
| `/integrations`, `/integrations/cli` | `IntegrationsContent`, `IntegrationsCliContent` |
| `/team` | `TeamContent` → `MembersPage` + `OrgApiKeys` |
| `/billing`, `/billing/plans` | `BillingContent`, `PlansPage` (lazy — `visited` gated) |
| `/api-keys` | `ApiKeysContent` |
| `/import` | `DashboardImportPage` |
| `/documents` | `DocumentsContent` |
| `/firmware` | `FirmwareContent` |
| `/issues`, `/inbox` | `IssuesContent`, `InboxContent` |
| `/settings`, `/settings/preferences` | `SettingsContent`, `PreferencesContent` |

## What each page actually offers

**`/` Overview** — search "Search Protocols…", grid/list view toggle, filter
button, **Add New…**. Left column: *Usage* card "Last 30 days" with four metered
rows — DIS Validations, Packaged Protocols, QAction Compiles, Deployments — each
`used / limit`; *Alerts* card "Get alerted for anomalies" + **Coming Soon**.
Right column: *Protocols* list — avatar tile, project name, status word, status
chip (Draft / Completed), date, ⋯ menu.

**`/protocols`** — filter toolbar: All Time · All Authors… · All Projects… ·
Show: Active/Archived · Status 3/3. Rows: version badge (`v5` `v5.0.0`), the
word "Version", description ("Branch close-params-gap from v4", "Empty v6",
"Version 5 — imported from XML"), project chip with avatar, "7w ago by <author>",
assignee avatar. Version kinds: **Version / Restore point / Regular**. Archived
filter copy: "Only versions from archived projects" / "Versions from
non-archived projects".

**`/templates`** — filters: All Vendors… · Show: Active/Archived · "Search
templates". CTAs: **New template**, **Import from .xml**, **Save as template**,
**Save current project as template**, **Start blank**, **Create template**.
Fields: Name, Category, Source project, description ("No description"), vendor.
States: "Live templates", "Hidden from clone list", "Project has no active
version to template". Bulk: Check All / Uncheck.

**`/documents`** — filters: All Time · All Projects… · Type 5/5. Types:
**MIB · Datasheet · Chat export · OpenAPI · Postman**. **Upload** CTA. Rows:
filename, type, project chip, size, date, "by <user>", ⋯.

**`/usage`** — "Cloud action usage", "Current billing period · <plan> plan",
**Export CSV**. Four stat tiles: DIS validations, Packages, QAction compiles,
Deployments (`n / limit`, `∞` where unlimited). Bar chart across the same four.
Descriptive cards: "Cloud DIS validation runs this period", ".dmprotocol
packages produced this period", "QAction C# compiles this period", "Deploy to
live System — Enterprise only", "Members in this workspace" (Seats). Table:
**Cloud actions / Used / Limit / Usage % **, plus **Plan / Subscription**.

**`/activity`** — filters: All projects… · All users… · All Time · Filter by
Event 13/13. Month group headers ("August 2026"). Rows: actor avatar, bold
**You**, event sentence ("Ran macro Auto-start all timers on Timers — 1 change",
"Version v6 activated", "created blank v6 of Project Test"), sub-line
"Macro RUN · Project Test", optional **AGENT** badge, relative date.

**`/audit`** — "Permission audit", "Every denied permission check across your
organization. Use this to investigate suspicious access attempts and verify role
boundaries." Table columns **Action / Required / …**. Empty state: "No denied
attempts" + the owner/admin explanation, **Admin-only** badge.

**`/integrations`** — "DataMiner systems and the device tunnel connected to your
account." Empty: "No DataMiner systems yet — Run the CLI (`protocolbase tunnel`)
on a machine that can reach your DataMiner systems and devices." Then *Device
tunnel console*: "No tunnel connected", **Refresh**. `/integrations/cli` lists
commands with descriptions: `npm i -g protocolbase` ("Install the CLI
globally"), `protocolbase login` ("Authenticate this machine to your org."),
`protocolbase tunnel`, plus "Check reachability of a device.", "Walk an SNMP
subtree on a device.", "Run a one-off HTTP request from this machine."

**`/team`** — *Members*. **Invite new members** card (email rows, role select,
Add more, **Invite**, "Learn more about Team roles", seats remaining, **Add a
seat**, "Only the billing owner can add seats"). Tabs **Team Members** /
**Pending Invitations**. Toolbar: Search members · All Roles · Sort members ·
Select all · Bulk actions. Row: avatar, name, email, role dropdown, Joined date,
⋯ (Remove, Resend invitation, Revoke invitation). Invitation states: Expired,
"Expires tomorrow". **Leave team**. Below: org-wide API keys (owner/admin only).

**`/billing`** — *Current plan* (tier, "Code builds this period" n/n, "Current
period ends" date, **Team seats** − n +, **Add a seat** / **Remove a seat**,
"Only the billing owner can change seats"), "Need more seats or a different
plan?" → **Usage** / **View plans**. *Payment method* → **Manage on Polar**,
"Billing history and invoices are available through your Polar account."
Empty: "You don't have an active subscription yet."

**`/api-keys`** — **Create Key**, "Search keys…", sort **Newest**. Columns
**Name / Last Used** ("Never used", "Just now"). Scope descriptions: "Create,
cancel, and manage builds", "View build status, logs, and metadata", "View
session history and messages", "Read parameter values from DataMiner elements".
**Revoke Key**. Empty: "No API keys yet."

**`/import`** — "Let's build something new", "Import an existing DataMiner
protocol, clone a template, or start from scratch." Two columns: *Import from
XML* (drop zone "Drop a protocol.xml or click to browse", "Parsing happens in
the browser — nothing lands until you click Import") and *Clone a Template*
(**Browse all**, cards: "Example: HTTP sessions", "SNMP router (MIB-II +
reboot)", "Example: Conditions", "SNMP simple poller", each with `System ·
Skyline (SDF) / Cisco / Harmonic`). Footer: *Create Empty Project* — "Skip XML
and templates — start with a blank protocol shell and an empty first version."

**`/firmware`** — stat tiles **Active Watches**, **Unread Alerts**. "Search
devices…", **Clear Filters**, **Last Checked**, Active/Inactive.

**`/settings`** — Display Name (input + "Please use 32 characters at maximum." +
**Save**), Avatar ("Your photo shows on presence, invitations, chat and
activity…", **Upload image**, "PNG, JPEG, WebP or GIF, up to 2MB."), Workspace
logo. `/settings/preferences` is separate.

## Design consequences for the Linear redesign

1. **Every list route needs a filter toolbar**, not just a title. Linear's
   equivalent is the pill row + the filter/display icon buttons at the right of
   the scene header — that is where All Time / All Projects / Show / Type map.
2. **`/usage` is the only chart page.** Linear has no direct analogue in the
   captures taken; the closest native shape is the settings card/row with an
   inline meter. Flagged as an open design question.
3. **`/import` is a wizard, not a list** — two-column chooser plus a footer
   action row. Also no direct Linear analogue in the captures.
4. **`/team` needs a real table body**, which is exactly the surface Paper's
   importer drops (see `capture-to-paper-workflow.md` trap 3).
5. The **Add New… / Upload / Create Key / New template** CTAs all sit top-right
   of the scene header, matching Linear's "New document" button position.

## Not captured

- `/documentation`, `/system`, `/admin/*`, `/billing/plans`, `/firmware` detail,
  `/settings/preferences` — enumerated but their internals were not read.
- Per-page empty, loading and error states beyond the strings quoted above.
- What each page looks like for a **viewer** role vs owner/admin.
