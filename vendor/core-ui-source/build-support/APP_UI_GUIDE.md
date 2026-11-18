<!-- Generated Integral App UI guide; SDK 1.2.0; SHA-256 7f6bd5fc1b1589303a16c718f1424dabd139f5ea4d8d4a5c2859421b78484d8d. Do not edit. -->

# Integral Business App UI authoring — React SDK 1.2

This is the canonical, package-shipped guide for developers and coding agents.
Read it before creating or changing App UI. Generated local copies carry this
source's SDK version and SHA-256. Change the SDK guide and synchronize copies;
do not edit generated snapshots. Repository and App-specific instructions still
apply. User instructions and server authorization remain authoritative.

## The shared design contract

Core owns typography, controls, surfaces, spacing presets, responsive patterns,
focus treatment, overlays and the light/dark theme. Apps own domain composition,
copy, fields, queries, calculations, validation and workflows. Shared styling
must improve in Core rather than being copied independently into each App.

- Import presentation and lifecycle APIs from `@integral/sdk-react`.
- Use the host's theme. Do not add a ThemeProvider, global reset, custom font,
  fixed palette, separate spacing scale, or control-specific CSS overrides.
- Use `Text` variants/tones, `Surface` presets and typed layout gaps. Semantic
  `appTheme` aliases are available for bespoke visualizations; never hard-code
  colors. `themeTokens` retains its older aliases for compatibility.
- Compose domain sections freely. Use namespaced CSS only for domain geometry
  (grid placement, width constraints, alignment, scrolling). No selectors into
  Core controls, `data-testid`, or generated field markup.
- Standard tables, boards and typed editors remain Core native views. Compose
  existing Entry views with `EntryRegion`; do not copy internal view widgets.
- Reviewed custom React interfaces use this SDK. External or unreviewed content
  uses the isolated extension-view mechanism. Native React code is trusted code,
  not a security sandbox.
- Settings remain in Core's standard App settings dialog.

## Component catalogue

| Component | Use and contract |
| --- | --- |
| `AppPage` | Content root with consistent vertical rhythm; does not create navigation, a modal or a Save action. Accepts HTML attributes and layout-only `className`. |
| `AppHeader` | `title`, optional `description`, `eyebrow`, `meta`, `actions`; shared title hierarchy and wrapping. |
| `AppSection` | `title`, `description`, `actions`, children; `variant="panel"` or `"plain"`. Sections remain in the App's chosen order. |
| `AppGrid` | `columns={1|2|3|4}`, `gap` presets; collapses to one column below Core's medium breakpoint (four columns fit the room the grid has). `fit="container"` makes any column count follow the grid's own width instead, for a page beside the assistant. Preserve logical DOM/tab order. |
| `AppField` | `label`, optional `id`, `fieldKey`, `required`, `help`, `error`; render-function child receives control bindings. |
| `AppActions` | Wrapping action layout with `align="start"`, `"end"` or `"between"`. Does not implement mutations. |
| `AppSummary` | `title`, optional `description`, `rows` containing stable `key`, `label`, formatted `value`, optional `emphasis`. No calculation or currency policy. |
| `AppNotice` | Shared loading/empty/information/error presentation; optional `title`, `action`, `tone="info|success|warn|danger"`. Warning/error notices announce alerts; other notices use status semantics. |
| `DataTable` | Rows and columns for the App's own data. `columns` (`key`, `label`, `align="end"` for amounts, `sortable`, `pinned` (`start`/`end`) to keep a column in view, `width`, `group`, `emphasis="link"`, `render`, `total`), `rows`, `rowKey`, `caption`; optional `groups` (column group headings), `defaultSort`, `pageSize`, `onRowClick`, `empty`, `maxHeight`, `density="compact"`, `rowTone`, `sectionBy` with `sectionTotals`, `columnPicker` (presets, `persistKey`), `pinnable`, `toolbar`, `minWidth` (`0` for a narrow card). Sorting, paging, grouped headings, section rows, totals, the column picker and number alignment are built in; do not draw tables by hand. |
| `Stat` | One headline figure: `label`, `value`, optional `note`, `delta` (text with its arrow and sign), `emphasis`, `trend` (recent values drawn as a small line) and `trendLabel`. Lay tiles out with `AppGrid`. |
| `Progress` | A bar for work under way: `value` (percent, 0 to 100) with `ariaLabel`; leave `value` out when the amount is not known and the bar slides. It fills smoothly and respects reduced motion. |
| `LineChart` | One or more series over a short row of labelled points, oldest first: `labels`, `series` (`key`, `label`, `values`), `ariaLabel`; optional `tooltips`, `formatValue`. Coloured from Core's chart palette. |
| `BridgeChart` | The reasons a figure moved, one bar each around a zero line: `steps` (`key`, `label`, signed `value`), `ariaLabel`; optional `formatValue`, `upLabel`, `downLabel`. |
| `FilePreview` | A PDF, image or other file shown in the page with Download and Open in a new tab: `title`, `data` (base64) or `url`, `mime`, `filename`, optional `height`, `emptyTitle`, `emptyMessage`. Shows a plain empty state when there is no file. Made in the browser; nothing is stored. |
| `RecordView` | A whole record page from data: `record` with `title`, `subtitle`, `eyebrow`, `badges`, `figures` (headline tiles), `panels` (labelled facts), `file` (shown with `FilePreview`), `links` (buttons that open related records). Any App fills it, so a payslip, an invoice and a contract share one page. |
| `QueryRecordView` | `RecordView` filled by an App query: `<QueryRecordView query="my_query" />` asks it about this Entry and shows `{ok: false, reason}` as an error. The query returns the `record` shape. |
| `Tabs` | A short strip that switches the section below it: `options` (`value`, `label`, `count`), `value`, `onChange`, `ariaLabel`. |
| `Badge` | A short coloured state label: `tone="neutral|success|warn|danger|info"` and the text. Meaning must also be in the text, not colour alone. |

Use `Button`, `Input`, `Select`, `Textarea`, `DateInput`, `AsyncCombobox`, `Text`,
`Surface`, `Stack`, `Inline`, and `Modal` (choose `size`: `form` by default, `confirm` for a short question, `wide` for a table; Core sets width and padding) for controls and lower-level composition.
Keep native buttons/inputs/labels and styled heading implementations inside Core.
Structural HTML such as a namespaced scrolling div or disclosure is allowed.
Do not pass color, typography, border, padding or radius utilities in className.
`Text` takes `variant`, `tone`, `weight`, `align` (`end` for amounts) and `numeric` (equal-width digits).
`Stack` and `Inline` take `gap`, `align`, and for `Inline` also `justify` and `wrap`.

`AppField` provides `id`, `required`, `invalid`, `aria-invalid` and
`aria-describedby`. Spread these onto the control; the visible label and both
help/error descriptions then stay associated. Control behavior remains owned by
the App. Use the metadata's label, required/readonly flags and installed options.
Never turn an unavailable lookup into an empty successful selection.

## Runnable Entry example

The standalone starter generates this module. It runs inside an admitted Entry
contribution, not as a second React root or a standalone browser application.

```tsx
import {AppPage, AppHeader, AppSection, AppField, AppNotice, Input,
  useAppUI, useEntryDraft} from '@integral/sdk-react';
export default function RecordEditor() {
  const ui = useAppUI();
  const draft = useEntryDraft();
  const field = draft.fields.find(item => item.type === 'text' && !item.readonly);
  return <AppPage><AppHeader title="Record" description="Review the details." />
    <AppSection title="Details">
      {field ? <AppField fieldKey={field.key} label={field.name}
        required={field.required} help={field.help} error={draft.errors[field.key]}>
        {binding => <Input {...binding} value={String(draft.values[field.key] ?? '')}
          disabled={ui.preview || draft.mode === 'detail'}
          onChange={event => draft.patch({[field.key]: event.target.value})} />}
      </AppField> : <AppNotice>No editable text field is configured.</AppNotice>}
    </AppSection></AppPage>;
}
```

Prefer `EntryRegion fields={[...keys]}` for ordinary typed fields and
`EntryRegion viewKey="saved_view_key"` for an existing native region. Core owns
the Entry draft, its Save action, aggregated validation and submit lifecycle.
Register custom validation with cleanup when needed. Submit related work only
against the committed Entry ID; retain drafts after validation or save failures.

## Data and mutation boundaries

- Declare reads in the App manifest and call `useAppQuery`/`ui.query`.
- Use lazy, bounded pages and opaque cursors for relation/product lookups.
  Cancel obsolete reads and resolve only selected IDs when labels need details.
- Field-aware components can use `useEntryDraft` without fetching schema again.
  Opt into `owns_field_data` only when the component implements the corresponding
  defaults/lookups; retain an explicit declarative fallback for disabled code.
- Keep independent previews out of the rendering critical path. No record writes
  or identifier allocation on mount, preloading or lookup. Do not reload whole
  Tracks or invalidate mutation caches for read-only work.
- Use declared operations and current server permissions for writes. Never
  import Core services/models, bypass scope or use direct browser API calls as
  an alternative authority path. Receipts alone do not verify saved state.
- Preserve original intent/input for unconfirmed writes; never automatically
  retry mutations. Show failures and verify persisted scoped readback.

## Build and migrate

1. Select an authoring environment providing SDK 1.2 and Vite 8 / Node >=22.12.
   This source SDK is not an assertion that an npm release is available. Use the
   actual selected SDK source/package and its build configuration; no fixed
   sibling checkout location is required.
2. `node <sdk>/bin/app-ui-guides.mjs --target <project> --starter` creates local
   instructions, a guide snapshot, a neutral Entry component and a manifest
   fragment without overwriting existing application code.
3. Use `appUIBuild({entry, outDir, resolveFrom})` from the SDK's `build-config`
   export with Vite's `build`. Externalize React, JSX and SDK through that helper;
   produce one ES module. Do not bundle a second React or private Core modules.
4. Declare `app.ui_components` with its actual artifact path/SHA-256/export,
   `sdk_range: ^1.2.0`, supported placements and object props schema. Connect the
   contribution while retaining its previous declarative fallback.
5. Replace custom visual CSS with Core patterns, one App at a time. Domain
   geometry can remain namespaced. Preserve identifiers, metadata, reads,
   operations, approval rules, settings and saved data.
6. Rebuild from source and update only the intended artifact digest. Keep the
   previous active artifact for rollback. Source build is not signing, publishing,
   deployment or live activation; use the supported reviewed release lifecycle.
7. Run guide synchronization with `--check` and the App UI design check before
   review. New React components require SDK 1.2; legacy Apps migrate explicitly.

## Automatic agent guidance

Repository/App-local `AGENTS.md`, `CLAUDE.md`, and Cursor always-applied `.mdc`
rules point at the same local guide. No manually named skill is needed. Local
snapshots avoid automatic imports outside the opened project. Do not overwrite
App-specific instructions; synchronization replaces only managed sections.
Generate these files for new Apps and standalone authoring repositories too.
Client settings can disable project instructions; CI checks remain independent
of whether an agent follows them. Verify instruction loading when qualifying a
new client/version; do not claim unavailable client tests passed.

## Review checklist

- [ ] Core presentation imports; no private imports or duplicate base controls.
- [ ] Host theme, semantic typography/surfaces/gaps; no per-App theme or resets.
- [ ] Keyboard operation, label/help/error association and visible focus.
- [ ] Light/dark live switching, narrow layout, zoom, overflow and long text.
- [ ] Loading/empty/error/retry/readonly/permission-denied states.
- [ ] Correct defaults, retained draft, save and actual persisted readback.
- [ ] Bounded/cancelled lookups; no eager whole-Track loads or duplicate previews.
- [ ] Admission, fallback, supported SDK range and production exports verified.
- [ ] Scoped functional/permission tests, types and production build pass.
- [ ] Performance measured separately for startup, fields/lines and previews.
- [ ] Guide snapshots and automatic agent entries pass `--check`.
- [ ] Existing regression failures and unavailable checks reported explicitly.
