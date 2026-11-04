Synthetic CSV files for testing ENERGYWISE AI. These are not real utility data.

Upload each file in the app:
- steady_usage.csv: 24 valid hourly readings for a normal usage pattern.
- usage_with_spikes.csv: 24 valid hourly readings with two intentionally high readings.
- data_quality_issues.csv: 24 rows including a blank consumption value, a negative value,
  and a duplicate timestamp/meter reading. The app should report these quality issues.

CSV columns: timestamp, meter_id, building_id, consumption.
The app requires at least 20 rows per uploaded CSV.
