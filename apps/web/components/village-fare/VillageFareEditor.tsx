"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { importVillageFareExcel, exportVillageFareExcel } from "../../lib/village-fare/excel";
import { saveVillageFareState, loadVillageFareState, clearVillageFareState } from "../../lib/village-fare/storage";
import { sortVillageRows } from "../../lib/village-fare/alphabet";
import { DEFAULT_VILLAGE_FARE_SETTINGS, VillageFareField, VillageFareRow, VillageFareSettings } from "../../lib/village-fare/types";
import { VillageFareTable } from "./VillageFareTable";
import { VillageFareSettingsPanel } from "./VillageFareSettingsPanel";
import { VillageFarePrint } from "./VillageFarePrint";

const newRow = (): VillageFareRow => ({ id: `village-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, village: "", day: "", night: "", custom: {} });

export function VillageFareEditor() {
  const [rows, setRows] = useState<VillageFareRow[]>([]);
  const [customFields, setCustomFields] = useState<VillageFareField[]>([]);
  const [settings, setSettings] = useState<VillageFareSettings>(DEFAULT_VILLAGE_FARE_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [printing, setPrinting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = loadVillageFareState();
    if (s) {
      setRows(s.rows);
      setCustomFields(s.customFields);
      setSettings(s.settings);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveVillageFareState({ rows, customFields, settings });
  }, [rows, customFields, settings, loaded]);

  const sortedRows = useMemo(() => sortVillageRows(rows), [rows]);
  const updateRow = (id: string, patch: Partial<VillageFareRow>) => setRows(c => c.map(r => r.id === id ? { ...r, ...patch } : r));
  const addRow = () => setRows(c => [...c, newRow()]);
  const removeRow = (id: string) => setRows(c => c.filter(r => r.id !== id));

  const addField = () => {
    const name = window.prompt("نام فیلد جدید را وارد کنید:");
    if (!name?.trim()) return;
    setCustomFields(c => [...c, { id: `custom-${Date.now()}`, name: name.trim(), enabled: true }]);
  };
  const removeField = (id: string) => {
    setCustomFields(c => c.filter(f => f.id !== id));
    setRows(c => c.map(r => {
      const custom = { ...r.custom };
      delete custom[id];
      return { ...r, custom };
    }));
  };

  const importExcel = async (file?: File) => {
    if (!file) return;
    try {
      const x = await importVillageFareExcel(file);
      setRows(x.rows);
      setCustomFields(x.customFields);
    } catch (e) {
      console.error(e);
      alert("خواندن فایل Excel انجام نشد.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveNow = () => {
    saveVillageFareState({ rows, customFields, settings });
    alert("اطلاعات با موفقیت ذخیره شد.");
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
    clearVillageFareState();
    setRows([]);
    setCustomFields([]);
    setSettings(DEFAULT_VILLAGE_FARE_SETTINGS);
  };

  return <main className="village-fare-page" dir="rtl">
    <header className="village-fare-title"><div><span className="village-fare-eyebrow">ابزار جدول‌ساز</span><h1>جدول کرایه روستاها</h1><p>ورود اطلاعات، ویرایش مستقیم، تنظیم چاپ و خروجی Excel</p></div>
      <div className="village-fare-actions">
        <button onClick={addRow}>➕ روستای جدید</button>
        <button onClick={() => fileRef.current?.click()}>📥 ورود Excel</button>
        <button onClick={() => exportVillageFareExcel(rows, customFields)}>📤 خروجی Excel</button>
        <button onClick={() => setShowSettings(v => !v)}>⚙️ تنظیمات چاپ</button>
        <button onClick={saveNow}>💾 ذخیره اطلاعات</button>
        <button className="village-primary" onClick={print}>🖨️ چاپ / PDF</button>
        <button className="village-danger" onClick={reset}>پاک‌سازی</button>
        <input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e => importExcel(e.target.files?.[0])} />
      </div>
    </header>
    {showSettings && <VillageFareSettingsPanel settings={settings} customFields={customFields} onSettingsChange={setSettings} onAddField={addField} onRemoveField={removeField} onCustomFieldChange={(id, p) => setCustomFields(items => items.map(f => f.id === id ? { ...f, ...p } : f))} />}
    <section className="village-fare-card"><div className="village-fare-card-head"><div><strong>{rows.length}</strong> روستا</div><span>برای ویرایش، روی هر خانه کلیک کنید.</span></div>
      <VillageFareTable rows={sortedRows} customFields={customFields} onUpdate={updateRow} onRemove={removeRow} />
    </section>
    <VillageFarePrint rows={sortedRows} customFields={customFields} settings={settings} enabled={printing} />
  </main>;
}
