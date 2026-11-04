import React, { useState } from 'react';
import { BRAND } from '../config/brand';

interface Props {
  tariff: number;
  onChange: (value: number) => void;
}

export function TariffBar({ tariff, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(String(tariff));
  const [error, setError] = useState('');

  const commit = () => {
    const val = parseFloat(raw);
    if (!isFinite(val) || val <= 0) {
      setError('Please enter a positive number, e.g. 8 or 8.5');
      return;
    }
    setError('');
    onChange(val);
    setEditing(false);
  };

  return (
    <div className="tariffBar" role="group" aria-label="Electricity tariff setting">
      <span className="tariffLabel">Tariff rate</span>
      {editing ? (
        <div className="tariffEdit">
          <span className="tariffCurrency" aria-hidden="true">{BRAND.CURRENCY_SYMBOL}</span>
          <input
            className={`tariffInput ${error ? 'tariffInput--error' : ''}`}
            type="number"
            min="0.01"
            step="0.5"
            value={raw}
            autoFocus
            aria-label={`Enter tariff rate in ${BRAND.CURRENCY_SYMBOL} per kWh`}
            onChange={e => { setRaw(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setRaw(String(tariff)); setError(''); } }}
          />
          <span className="tariffUnit">/kWh</span>
          <button className="tariffSave" onClick={commit} aria-label="Save tariff rate">Save</button>
          <button className="tariffCancel" onClick={() => { setEditing(false); setRaw(String(tariff)); setError(''); }} aria-label="Cancel tariff edit">Cancel</button>
          {error && <span className="tariffError" role="alert">{error}</span>}
        </div>
      ) : (
        <div className="tariffDisplay">
          <span className="tariffValue" aria-label={`Current tariff: ${BRAND.CURRENCY_SYMBOL}${tariff} per kWh`}>
            {BRAND.CURRENCY_SYMBOL}{tariff}/kWh
          </span>
          <button className="tariffEdit__trigger" onClick={() => { setEditing(true); setRaw(String(tariff)); }} aria-label="Edit tariff rate">
            Edit
          </button>
        </div>
      )}
      <span className="tariffNote">Cost estimates update live</span>
    </div>
  );
}
