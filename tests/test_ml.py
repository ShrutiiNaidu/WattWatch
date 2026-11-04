import pandas as pd
from backend.app.ml import validate_frame, analyze

def sample():
    ts=pd.date_range('2026-01-01',periods=48,freq='h')
    vals=[1.0]*47+[8.0]
    return pd.DataFrame({'timestamp':ts,'meter_id':['M1']*48,'consumption':vals})

def test_validation_detects_negative_and_missing():
    raw=pd.DataFrame({'timestamp':['2026-01-01','bad'], 'consumption':[1,-2]})
    clean,mapping,issues,invalid,warnings=validate_frame(raw)
    assert invalid.sum()==1
    assert any(x['type']=='negative_consumption' and x['count']==1 for x in issues)

def test_isolation_forest_runs_and_returns_risk():
    result=analyze(sample(),'isolation_forest',0.05)
    assert len(result.frame)==48
    assert 'anomaly' in result.frame
    assert 'risk_score' in result.frame
    assert result.frame.risk_score.notna().any()

def test_statistical_model_runs():
    result=analyze(sample(),'statistical',0.01)
    assert len(result.frame)==48
