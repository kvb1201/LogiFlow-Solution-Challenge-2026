# Indian Railways delay corpus (LogiFlow)

## Important: 2017 CSV ≠ today's fleet

`Train_details_22122017.csv` has **~11,113** train numbers from **2017**. Many are discontinued or never appear on live trackers.

**Always run validation first:**

```bash
make validate-active-trains        # ~1–2 hours → active_trains.txt
make collect-delays-3d-foreground  # only confirmed-active trains
```

## Output files

| File | Purpose |
|------|---------|
| `active_trains.txt` | Confirmed on runningstatus.in (last 3 days) |
| `active_trains.json` | Validation report |
| `ir_train_delays.csv` | Station-level delay rows |
| `checkpoint.json` | Scrape resume state |

## Strategies

See [docs/miscellaneous/INDIAN_RAILWAYS_DATA.md](../../../docs/miscellaneous/INDIAN_RAILWAYS_DATA.md).
