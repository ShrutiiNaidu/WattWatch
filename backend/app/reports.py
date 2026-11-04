import html

import pandas as pd


def render_simple_report(df: pd.DataFrame, summary: dict, dataset: dict, metadata: dict) -> str:
    attention = (
        'Needs attention' if summary['high_risk']
        else 'Worth checking' if summary['anomalies']
        else 'Looks mostly normal'
    )
    result_text = (
        f"We found {summary['anomalies']} unusual readings. This does not by itself show what caused them."
        if summary['anomalies']
        else 'Nothing stood out as unusual in the readings we checked.'
    )
    meter_id = str(df.meter_id.iloc[0]) if not df.empty else ''
    chart_data = df[df.meter_id == meter_id].tail(40) if meter_id else df
    values = (
        chart_data.consumption.tolist() + chart_data.expected.dropna().tolist()
        if not chart_data.empty else []
    )
    low = min([0.0] + values) if values else 0.0
    high = max(values) if values else 1.0
    spread = high - low or 1.0

    def chart_path(column: str) -> str:
        points = []
        for index, value in enumerate(chart_data[column].tolist()):
            if pd.notna(value):
                x = 36 + index * 648 / max(len(chart_data) - 1, 1)
                y = 154 - (float(value) - low) * 132 / spread
                points.append(f"{'L' if points else 'M'} {x:.1f} {y:.1f}")
        return ' '.join(points)

    chart = (
        f'<svg viewBox="0 0 720 180" role="img" '
        f'aria-label="Electricity usage compared with usual use in units">'
        f'<path d="{chart_path("expected")}" fill="none" stroke="#54715c" stroke-width="3"/>'
        f'<path d="{chart_path("consumption")}" fill="none" stroke="#c87941" stroke-width="3"/>'
        f'</svg>'
        if not chart_data.empty else '<p>No readings are available for a chart.</p>'
    )

    if df.empty:
        findings = df
    else:
        findings = df[df.anomaly == -1].sort_values('risk_score', ascending=False).head(15)

    rows = []
    for record in findings.itertuples():
        if pd.isna(record.expected):
            explanation = 'Different from the usual pattern'
        else:
            direction = 'higher' if record.consumption >= record.expected else 'lower'
            pct = abs(record.deviation_pct) if pd.notna(record.deviation_pct) else 0
            explanation = f'About {pct:.0f}% {direction} than usual'
        rows.append(
            f'<tr><td>{html.escape(str(record.timestamp))}</td>'
            f'<td>{html.escape(str(record.meter_id))}</td>'
            f'<td>{record.consumption:.2f} units</td>'
            f'<td>{" " if pd.isna(record.expected) else f"{record.expected:.2f} units"}</td>'
            f'<td>{explanation}</td></tr>'
        )
    rows_html = ''.join(rows) or '<tr><td colspan="5">No unusual readings were found.</td></tr>'
    demo_label = '<span class="badge">SAMPLE DATA</span>' if dataset['is_demo'] else ''
    model_name = html.escape(str(metadata.get('model_name', 'Not available')))
    dataset_name = html.escape(str(dataset['name']))
    quality_text = (
        f"{dataset.get('valid_records', summary['records']):,} usable readings out of "
        f"{dataset.get('records', summary['records']):,} total."
    )
    if dataset.get('invalid_records', 0):
        quality_text += f" {dataset['invalid_records']:,} readings need a review."

    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Electricity Usage Report</title>
<style>
body{{font-family:Arial,sans-serif;color:#17201b;background:#f7f5ef;max-width:900px;margin:40px auto;padding:24px;line-height:1.55}}
h1,h2{{letter-spacing:-.02em}}.muted{{color:#61706a}}.badge{{background:#f3dfbf;color:#8d5b24;padding:5px 8px;border-radius:5px;font-size:12px;font-weight:bold}}
.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}}.item{{border:1px solid #d9ddd7;background:white;padding:16px;border-radius:12px}}
.item strong{{display:block;font-size:24px;margin-top:4px}}.chart{{background:white;border:1px solid #d9ddd7;padding:20px;border-radius:12px}}
svg{{width:100%;height:auto}}.legend{{display:flex;gap:24px;font-size:13px;color:#61706a}}.legend span:before{{content:'';display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px;background:#54715c}}
.legend span:last-child:before{{background:#c87941}}table{{width:100%;border-collapse:collapse;background:white}}th,td{{padding:10px;border-bottom:1px solid #e2e5e0;text-align:left;font-size:13px}}
th{{color:#61706a}}details{{margin:24px 0;color:#61706a}}summary{{cursor:pointer;font-weight:bold;color:#2f6b4f}}
button{{background:#17201b;color:white;border:0;padding:11px 15px;border-radius:8px;font-weight:bold;cursor:pointer}}
@media(max-width:600px){{body{{margin:0;padding:18px}}.grid{{grid-template-columns:1fr}}th,td{{padding:7px}}}}
@media print{{body{{margin:0;max-width:none}}button{{display:none}}.item,.chart{{break-inside:avoid}}}}
</style></head><body><button onclick="window.print()">Print / Save as PDF</button>
<h1>Your Electricity Usage Report</h1><p class="muted">A simple summary of your meter readings · {dataset_name} {demo_label}</p>
<h2>{attention}</h2><p>{result_text}</p>
<div class="grid"><div class="item">Electricity used<strong>{summary['total_energy_kwh']:,.2f} units</strong></div>
<div class="item">Readings checked<strong>{summary['records']:,}</strong></div>
<div class="item">Unusual readings<strong>{summary['anomalies']:,}</strong></div></div>
<p class="muted">1 unit of electricity = 1 kWh. Readings that look unusual are a clue to check, not proof of a fault or a specific cause.</p>
<h2>File check</h2><p>{quality_text}</p>
<h2>Electricity use over time</h2><div class="chart">{chart}<div class="legend"><span>Usual use</span><span>Actual use</span></div></div>
<h2>Readings worth checking</h2><table><thead><tr><th>Date and time</th><th>Meter</th><th>Electricity used</th><th>Usual amount</th><th>What stood out</th></tr></thead>
<tbody>{rows_html}</tbody></table>
<h2>What you can do</h2><p>Check what was running at the listed times and compare the readings with your normal routine. If unusual readings keep happening, ask your electricity provider whether the meter should be checked.</p>
<p class="muted">An unusual reading does not automatically mean theft, energy loss, wastage, or a faulty meter. Verify the context before taking action.</p>
<details><summary>Technical details</summary><p>Checking method: {model_name}. The results are screening signals, not calibrated probabilities.</p></details>
</body></html>'''
