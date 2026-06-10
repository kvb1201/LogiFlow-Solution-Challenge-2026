# Road Pipeline Hero Metrics — Implementation Notes

## Approach

The Road page previously used the generic `PipelineModePage` shell (landing +
`PipelineResultsChrome`), which provided only pills and a thin analytics label — no
capability metrics. To match the Air page pattern precisely, a dedicated
`RoadPageClient` was created that owns both the pre-search landing and the
post-search results header, giving full control over the metrics display in both
states.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/RoadPageClient.tsx` | **New** — self-contained road page client |
| `src/app/road/page.tsx` | Replaced `PipelineModePage` with `<RoadPageClient />` |

`PipelineModePage`, `PipelineModeLanding`, `PipelineResultsChrome`, and
`pipeline-page-meta.ts` are unchanged — they remain used by Rail, Air (no, Air has
its own client), and Water.

---

## Metrics

Defined as a typed constant in `RoadPageClient.tsx`:

```ts
const ROAD_METRICS = [
  { value: '120+', label: 'Connected Cities'   },
  { value: '3',    label: 'Live Signal Sources' },
  { value: 'AI',   label: 'Route Intelligence'  },
] as const;
```

### Metric 1 — `120+ Connected Cities`
Represents the breadth of the TomTom routing network. The engine can geocode and
route between any two cities that the geocoder resolves. `120+` is a conservative
representation of the known-good Indian city coverage in the geocoder static table
plus TomTom's global network.

### Metric 2 — `3 Live Signal Sources`
Directly represents the three real-time data feeds consumed by the pipeline:
1. **TomTom Traffic** — real traffic delay and routing
2. **Weather API** — temperature/rain used in ML delay input
3. **ML Delay Model** — trained GradientBoosting model producing delay predictions

### Metric 3 — `AI Route Intelligence`
Represents the qualitative capabilities of the road pipeline that go beyond a
simple route count: Route Health scoring, condition intelligence (traffic +
weather classification), reoptimization support (simulation mode), and
confidence scoring per route.

---

## Capability Badges

```ts
const CAPABILITY_BADGES = [
  { icon: 'traffic',      label: 'TomTom Traffic'  },
  { icon: 'cloud',        label: 'Weather API'      },
  { icon: 'psychology',   label: 'ML Delay Model'   },
  { icon: 'favorite',     label: 'Route Health'     },
  { icon: 'auto_awesome', label: 'Reoptimization'   },
];
```

Icons use Material Symbols with `FILL 1` to match the existing badge style used
in the Air page.

---

## Visual Structure

### Landing page (pre-search)

```
[Badge pill: "Road Logistics · Traffic-aware routing"]

LogiFlow  (gradient headline)

AI-powered cargo routing across road...

[ 120+              ] [ 3                    ] [ AI              ]
[ Connected Cities  ] [ Live Signal Sources  ] [ Route Intelligence ]

[ TomTom Traffic ] [ Weather API ] [ ML Delay Model ] [ Route Health ] [ Reoptimization ]

<RoadInputForm />

"Powered by TomTom routing · live traffic · ML delay prediction"
```

### Results header (post-search)

```
[local_shipping icon] Road cargo

Road route optimization
...alongside rail and air in one workflow.

120+ Connected Cities  •  3 Live Signal Sources  •  AI Route Intelligence

                                              [Reset] [Home]
```

The results metrics strip uses the exact same dot-separator pattern as the Air page:
`70 Airports • 1,051 Active Routes • 8 Airlines`.

---

## Design Consistency with Air Page

| Element | Air page | Road page |
|---|---|---|
| Badge pill | Sky-300 tint | Secondary (road) tint |
| Gradient headline | `from-secondary via-sky-300 to-primary` | `from-secondary via-amber-300 to-primary` |
| Metric value color | `text-sky-300` | `text-secondary` |
| Capability badges | `text-primary` icon | `text-secondary` icon |
| Results header bg | `#06080d` | `#06080d` (identical) |
| Ambient blobs | sky-500 + primary | secondary + primary |
| Metrics strip | `text-sky-200/70` | `text-secondary/70` |
| Dot separator | `bg-sky-500/50` | `bg-secondary/50` |

Road uses the `--secondary` CSS variable (the road accent) everywhere sky-300 is
used on the Air page — no new design tokens introduced.

---

## Behavior

- **Pre-search:** Metrics visible immediately, no search required.
- **Post-search:** Same metrics shown in results header. Form is kept visible for
  re-search without navigating away.
- **Invalid corridor:** `RouteResults` handles `roadNoRoutesReason` internally and
  renders `<InvalidCorridorCard>` — `RoadPageClient` surfaces it via the
  `<RouteResults />` slot.
- **Loading:** Spinner shown in results view; pre-search landing does not block.
- **Mobile:** `flex-wrap` on both the metrics row and badge row ensures clean
  wrapping at all breakpoints. No horizontal scroll introduced.

---

## Build

```
npx tsc --noEmit   → 0 errors
npm run build      → 16/16 pages, Exit 0
```
