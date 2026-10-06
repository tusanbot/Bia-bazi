"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { importTaxiFareExcel, exportTaxiFareExcel } from "../../lib/taxi-fare/excel";
import { saveTaxiFareState, loadTaxiFareState, clearTaxiFareState } from "../../lib/taxi-fare/storage";
import { sortTaxiRows } from "../../lib/taxi-fare/alphabet";
import { DEFAULT_TAXI_FARE_SETTINGS, TaxiFareField, TaxiFareRow, TaxiFareSettings } from "../../lib/taxi-fare/types";
import { TaxiFareTable } from "./TaxiFareTable";
import { TaxiFareSettingsPanel } from "./TaxiFareSettingsPanel";
import { TaxiFarePrint } from "./TaxiFarePrint";

const newRow = (): TaxiFareRow => ({
  id: `taxi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  city: "", province: "", day: "", night: "", custom: {},
});

export function TaxiFareEditor() {
  const [rows, setRows] = useState<TaxiFareRow[]>([]);
  const [customFields, setCustomFields] = useState<TaxiFareField[]>([]);
  const [settings, setSettings] = useState<TaxiFareSettings>(DEFAULT_TAXI_FARE_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [printing, setPrinting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const state = loadTaxiFareState();
    if (state) {
      setRows(state.rows);
      setCustomFields(state.customFields);
      setSettings(state.settings);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveTaxiFareState({ rows, customFields, settings });
  }, [rows, customFields, settings, loaded]);

  const sortedRows = useMemo(() => sortTaxiRows(rows), [rows]);

  const updateRow = (id: string, patch: Partial<TaxiFareRow>) =>
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));

  const addRow = () => setRows((current) => [...current, newRow()]);
  const removeRow = (id: string) => setRows((current) => current.filter((row) => row.id !== id));

  const addField = () => {
    const name = window.prompt("نام فیلد جدید را وارد کنید:");
    if (!name?.trim()) return;
    const field: TaxiFareField = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      enabled: true,
    };
    setCustomFields((current) => [...current, field]);
  };

  const removeField = (id: string) => {
    setCustomFields((current) => current.filter((field) => field.id !== id));
    setRows((current) => current.map((row) => {
      const custom = { ...row.custom };
      delete custom[id];
      return { ...row, custom };
    }));
  };

  const importExcel = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await importTaxiFareExcel(file);
      setRows(imported.rows);
      setCustomFields(imported.customFields);
      setSettings((s) => ({ ...s, fields: { ...s.fields } }));
    } catch (error) {
      console.error(error);
      alert("خواندن فایل Excel انجام نشد.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const print = () => {
    setPrinting(true);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => setPrinting(false), 300);
    }, 80);
  };

  const reset = () => {
    if (!confirm("همه اطلاعات جدول حذف شود؟")) return;
    clearTaxiFareState();
    setRows([]);
    setCustomFields([]);
    setSettings(DEFAULT_TAXI_FARE_SETTINGS);
  };

  return (
    <main className="taxi-fare-page" dir="rtl">
      <header className="taxi-fare-title">
        <div>
          <span className="taxi-fare-eyebrow">ابزار جدول‌ساز</span>
          <h1>جدول کرایه تاکسی</h1>
          <p>ورود اطلاعات، ویرایش مستقیم، تنظیم چاپ و خروجی Excel</p>
        </div>
        <div className="taxi-fare-actions">
          <button onClick={addRow}>➕ شهر جدید</button>
          <button onClick={() => fileRef.current?.click()}>📥 ورود Excel</button>
          <button onClick={() => exportTaxiFareExcel(rows, customFields)}>📤 خروجی Excel</button>
          <button onClick={() => setShowSettings((v) => !v)}>⚙️ تنظیمات چاپ</button>
          <button className="primary" onClick={print}>🖨️ چاپ / PDF</button>
          <button className="danger" onClick={reset}>پاک‌سازی</button>
          <input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={(e) => importExcel(e.target.files?.[0])} />
        </div>
      </header>

      {showSettings && (
        <TaxiFareSettingsPanel
          settings={settings}
          customFields={customFields}
          onSettingsChange={setSettings}
          onAddField={addField}
          onRemoveField={removeField}
          onCustomFieldChange={(id, patch) => setCustomFields((items) => items.map((f) => f.id === id ? { ...f, ...patch } : f))}
        />
      )}

      <section className="taxi-fare-card">
        <div className="taxi-fare-card-head">
          <div><strong>{rows.length}</strong> شهر</div>
          <span>برای ویرایش، روی هر خانه کلیک کنید.</span>
        </div>
        <TaxiFareTable rows={sortedRows} customFields={customFields} onUpdate={updateRow} onRemove={removeRow} />
      </section>

      <TaxiFarePrint rows={sortedRows} customFields={customFields} settings={settings} enabled={printing} />
    </main>
  );
}
