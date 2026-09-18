## ADDED Requirements

### Requirement: Labs are reachable by URL only

The web app SHALL serve labs under the `/labs/` path prefix, and each lab
SHALL resolve only at its exact path. The app SHALL NOT link to any lab
from any product surface — the rail, the header, settings, the board, pane
detail or the 404 page. There SHALL be no labs index: a path under `/labs`
that names no lab, including the bare `/labs`, SHALL fall through to the
`NotFound` page, and that page SHALL NOT mention or suggest labs.

#### Scenario: A mock path resolves

- **WHEN** the operator opens `/labs/file-explorer/mock1`
- **THEN** the file-explorer mock renders

#### Scenario: The bare prefix is not a page

- **WHEN** the operator opens `/labs`
- **THEN** the `NotFound` page renders, with no reference to labs

#### Scenario: Nothing in the product links to a lab

- **WHEN** any product template is rendered
- **THEN** it contains no link to a path under `/labs`

### Requirement: Lab routes are lazy-loaded

Every lab route SHALL be declared with `loadComponent`, so that no code a
lab imports is part of the application's initial bundle.

#### Scenario: The board's initial bundle carries no lab

- **WHEN** the web app is built for production
- **THEN** each lab's component is emitted in a lazy chunk, and the initial
  chunk contains no lab component

### Requirement: The dependency arrow points into labs only

Code under `apps/web/src/app/labs/` MAY import any product code. Product code
— every module reachable from `apps/web/src/main.ts` through relative
imports without passing through `labs/` — SHALL NOT import from `labs/`, by
static import, re-export, side-effect import or dynamic import. The single
exception is the route table's lazy `loadComponent` import. A unit test SHALL
walk that graph and fail the suite when a product module imports `labs/`,
naming the module and the specifier.

#### Scenario: A product file imports a lab

- **WHEN** a product module outside `labs/` imports a module under `labs/`,
  other than the route table's `loadComponent` call
- **THEN** the unit test suite fails, naming the module and the specifier

### Requirement: A lab says it is a lab

A lab's copy is exempt from the approved-copy table in `docs/BRAND.md`, and
lab strings SHALL NOT be added to that table or to `shared/copy.ts`. In
exchange, every lab page SHALL render a visible marker naming it as a lab
and naming the lab, above its content and on screen without scrolling, so a
screenshot of it cannot be mistaken for the product.

#### Scenario: A screenshot of a lab

- **WHEN** a lab page is rendered at any viewport width
- **THEN** a visible marker identifying the page as a lab is on screen

### Requirement: Labs use the design tokens and the icon set

A lab's styles SHALL use the design-system tokens and SHALL NOT declare raw
hex colours, pixel or rem design values; its icons SHALL come from
`shared/icons.ts`. The exemption labs hold is for copy only.

#### Scenario: A lab stylesheet with a raw colour

- **WHEN** a lab component's stylesheet declares a raw hex colour
- **THEN** the style lint fails, as it does for a product component

### Requirement: A mock is deleted by the change that supersedes it

A lab that mocks a surface SHALL be removed — its route, its directory and
its tests — by the change that ships or specs the real surface. A lab is not
kept as reference once its question is answered.

#### Scenario: The real file panel ships

- **WHEN** a change specs or ships the pane-detail file panel
- **THEN** that change deletes `/labs/file-explorer/mock1` and its code

### Requirement: The file-explorer mock poses its layout questions

`/labs/file-explorer/mock1` SHALL render a static mock of a read-only file
panel inside a fake pane-detail view, over hard-coded fixture data, calling
no bridge method and mounting neither `PaneDetail` nor a terminal. It SHALL:

- lay the terminal box and the file panel out as an hbox with a draggable
  splitter in landscape, and as a vbox with the panel below the terminal box
  and above the key bar in portrait;
- start with the panel collapsed, toggled by one visible control at the
  trailing edge of the repo name in the meta strip;
- make the panel a vbox of goto bar, body and status line, where the goto bar
  opens a pasted repo-relative path, the body holds a file browser and a file
  viewer side by side when the panel is wide enough and one at a time behind
  a segmented control when it is not, the viewer offers source / diff and
  offers rendered only for types that have one, the browser marks modified
  entries in ochre and untracked entries in vermilion, and the status line
  shows file state, line count and type;
- offer both answers to the key bar question — keep the key bar, or collapse
  it while the panel has focus — behind a visible control;
- offer both answers to the split question — a ratio that is remembered
  across visits, or a fixed default restored on every open — behind a
  visible control, with the current ratio shown.

Its fixture SHALL include a modified TypeScript file with a diff, a markdown
file that exercises the rendered view, an untracked directory, and a tree
nested deeply enough to show indentation.

#### Scenario: The panel opens from the repo name

- **WHEN** the mock loads and the operator activates the control beside the
  repo name
- **THEN** the file panel, collapsed on load, is shown

#### Scenario: A pasted path opens its file

- **WHEN** the operator enters a fixture file's repo-relative path in the
  goto bar and submits it
- **THEN** the viewer shows that file and the status line describes it

#### Scenario: Rendered only where it exists

- **WHEN** the viewer shows a TypeScript file
- **THEN** it offers source and diff, and not rendered
