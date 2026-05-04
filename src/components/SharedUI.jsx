import React, { useState, useEffect } from 'react';

export function DatePickerDropdown({ value, onChange, style }) {
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');

  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        setYear(parts[0]);
        setMonth(parts[1]);
        setDay(parts[2]);
      }
    } else {
      setYear('');
      setMonth('');
      setDay('');
    }
  }, [value]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

  const handleChange = (y, m, d) => {
    if (y && m && d) {
      onChange(`${y}-${m}-${d}`);
    } else {
      onChange('');
    }
  };

  const baseClass = "bg-[#13131f] border border-white/5 rounded-lg px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none [color-scheme:dark] flex-1 min-w-[60px]";

  return (
    <div className="flex gap-1 w-full">
      <select 
        value={year} 
        onChange={(e) => { setYear(e.target.value); handleChange(e.target.value, month, day); }}
        className={baseClass}
        style={style}
      >
        <option value="">연도</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <select 
        value={month} 
        onChange={(e) => { setMonth(e.target.value); handleChange(year, e.target.value, day); }}
        className={baseClass}
        style={style}
      >
        <option value="">월</option>
        {months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select 
        value={day} 
        onChange={(e) => { setDay(e.target.value); handleChange(year, month, e.target.value); }}
        className={baseClass}
        style={style}
      >
        <option value="">일</option>
        {days.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
  );
}

export function MultiSelectChips({ value = [], onChange, style }) {
  const [input, setInput] = useState('');
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChip();
    }
  };

  const addChip = () => {
    const val = input.trim();
    if (val && !value.includes(val)) {
      onChange([...value, val]);
    }
    setInput('');
  };

  const removeChip = (chip) => {
    onChange(value.filter(v => v !== chip));
  };

  return (
    <div 
      className="flex flex-wrap gap-1 bg-[#13131f] border border-white/5 rounded-lg p-1.5 focus-within:border-indigo-500 w-full"
      style={style}
    >
      {value.map(chip => (
        <span key={chip} className="flex items-center gap-1 bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full text-[11px] font-medium">
          {chip}
          <button type="button" onClick={() => removeChip(chip)} className="hover:text-white mt-0.5">✕</button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addChip}
        placeholder={value.length === 0 ? "부서 입력 후 엔터" : "추가"}
        className="flex-1 min-w-[80px] bg-transparent text-sm focus:outline-none text-white px-1"
      />
    </div>
  );
}
