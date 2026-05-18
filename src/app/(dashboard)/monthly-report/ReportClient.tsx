"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts"

// ── Types ─────────────────────────────────────────────────────────────────────
interface DescriptionRow  { description: string; containers: number; mts: number; amount: number }
interface VarietyRow      { variety: string; containers: number; mts: number; amount: number; containersPct: number; descriptions: DescriptionRow[] }
interface CountryRow      { country: string; containers: number; mts: number; amount: number; buyerCount: number; pct: number; monthlyTarget: number; achievementPct: number }
interface SPRow           { salesPerson: string; containers: number; mts: number; amount: number; share: number; buyerCount: number }
interface BuyerRow        { buyerName: string; country: string; tier: string; responsiblePerson: string; containers: number; mts: number; amount: number; monthlyTarget: number; achievementPct: number; isIn8020: boolean }
interface TierStat        { done: number; total: number }

interface MonthlyReportData {
  fy: string; fyMonthNo: number; monthName: string; calendarMonthYear: string; generatedAt: string
  summary: { totalContainers: number; totalMTs: number; totalAmount: number; totalMonthlyTarget: number; achievementPct: number; uniqueBuyers: number; piCount: number; activeCountries: number; activeSalesPersons: number }
  varietyBreakdown:      VarietyRow[]
  countryBreakdown:      CountryRow[]
  salesPersonBreakdown:  SPRow[]
  buyerBreakdown:        BuyerRow[]
  meetingsSummary:       { totalDone: number; totalBuyers: number; byTier: { TIER1: TierStat; TIER2: TierStat; TIER3: TierStat } }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const FY_MONTHS = [
  {no:1,name:"April"},{no:2,name:"May"},{no:3,name:"June"},{no:4,name:"July"},
  {no:5,name:"August"},{no:6,name:"September"},{no:7,name:"October"},{no:8,name:"November"},
  {no:9,name:"December"},{no:10,name:"January"},{no:11,name:"February"},{no:12,name:"March"},
]

// Professional palette
const C = {
  emerald:  "#059669",
  emeraldL: "#d1fae5",
  blue:     "#1d4ed8",
  blueL:    "#dbeafe",
  amber:    "#d97706",
  amberL:   "#fef3c7",
  red:      "#dc2626",
  redL:     "#fee2e2",
  purple:   "#7c3aed",
  purpleL:  "#f3e8ff",
  slate:    "#0f172a",
  gray:     "#6b7280",
  bg:       "#f8fafc",
}

// Variety colors
const VARIETY_COLORS = ["#059669","#1d4ed8","#d97706","#7c3aed","#dc2626"]

// Outcome labels
const OUTCOME_LABEL: Record<string,string> = {
  ORDER_CONFIRMED:"Order Confirmed",NEGOTIATING:"Negotiating",
  AWAITING_PI:"Awaiting PI",FOLLOW_UP:"Follow-up",NO_INTEREST:"No Interest",OTHER:"Other",
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function getCurrentFY() {
  const t = new Date(); const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear()-1
  return `${y}-${String(y+1).slice(-2)}`
}
function getCurrentFYMonth() { return ((new Date().getMonth()-3+12)%12)+1 }
function genFYList() {
  const fy = getCurrentFY(); const y = parseInt(fy.split("-")[0])
  return [`${y-2}-${String(y-1).slice(-2)}`,`${y-1}-${String(y).slice(-2)}`,fy]
}
function fmt(n:number, d=0) { return n.toLocaleString("en-IN",{minimumFractionDigits:d,maximumFractionDigits:d}) }
function fmtUSD(n:number) {
  if(n>=1_000_000) return `$${(n/1_000_000).toFixed(2)}M`
  if(n>=1_000)     return `$${(n/1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
function achieveColor(pct:number){ return pct>=100?C.emerald:pct>=75?C.amber:C.red }
function achieveBg(pct:number){ return pct>=100?C.emeraldL:pct>=75?C.amberL:C.redL }
function achieveTailwind(pct:number){ return pct>=100?"bg-emerald-500":pct>=75?"bg-amber-400":"bg-red-500" }

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
function Sparkline({ pct }: { pct: number }) {
  const up   = "M2,22 C8,18 14,16 20,13 C26,10 34,7 42,4 L50,2"
  const flat = "M2,12 C10,10 18,14 26,11 C34,13 42,10 50,12"
  const down = "M2,3 C10,6 18,8 26,12 C34,14 42,18 50,22"
  const path  = pct >= 80 ? up : pct >= 45 ? flat : down
  const color = pct >= 80 ? C.emerald : pct >= 45 ? C.amber : C.red
  return (
    <svg width="52" height="26" viewBox="0 0 52 26" className="opacity-60">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={pct>=80?50:pct>=45?50:50} cy={pct>=80?2:pct>=45?12:22} r="2.5" fill={color}/>
    </svg>
  )
}

// ── Achievement Bar ───────────────────────────────────────────────────────────
function AchBar({ pct, height="h-2" }: { pct:number; height?:string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 bg-gray-100 rounded-full ${height} overflow-hidden`}>
        <div className={`${achieveTailwind(pct)} ${height} rounded-full`} style={{width:`${Math.min(pct,100)}%`}}/>
      </div>
      <span className="text-xs font-bold w-10 text-right" style={{color:achieveColor(pct)}}>
        {pct>0?`${pct.toFixed(0)}%`:"—"}
      </span>
    </div>
  )
}

// ── Tier Badge ────────────────────────────────────────────────────────────────
function TierBadge({ tier }: { tier:string }) {
  const cfg: Record<string,[string,string]> = {
    TIER1:[C.purpleL,C.purple], TIER2:[C.blueL,C.blue], TIER3:[C.emeraldL,C.emerald],
  }
  const [bg,color] = cfg[tier] ?? ["#f3f4f6","#6b7280"]
  return <span className="px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap" style={{background:bg,color}}>{tier}</span>
}

// ── Section Header ────────────────────────────────────────────────────────────
function Section({ title, sub, children }: { title:string; sub?:string; children:React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-800 mb-1">{label}</p>
      {payload.map((p:any,i:number) => (
        <p key={i} style={{color:p.color}}>{p.name}: <strong>{fmt(Number(p.value),1)}</strong></p>
      ))}
    </div>
  )
}

// ── PDF Generator ─────────────────────────────────────────────────────────────
async function generatePDF(data: MonthlyReportData) {
  const { default: jsPDF } = await import("jspdf")
  const { default: autoTable } = await import("jspdf-autotable")

  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" })
  const W = 210
  const ML = 14, MR = 14

  // Helper: section divider
  let y = 0
  function section(title: string) {
    if (y > 255) { doc.addPage(); y = 14 }
    doc.setFillColor(15, 23, 42)   // slate-900
    doc.rect(ML, y, W-ML-MR, 7, "F")
    doc.setTextColor(255,255,255)
    doc.setFont("helvetica","bold")
    doc.setFontSize(7.5)
    doc.text(title.toUpperCase(), ML+3, y+4.8)
    doc.setTextColor(0,0,0)
    doc.setFont("helvetica","normal")
    y += 9
  }

  // ── Bar chart helper (draws horizontal bars inline) ────────────────────────
  function hBar(
    items: Array<{label:string; value:number; value2?:number}>,
    opts: { col1Label:string; col2Label?:string }
  ) {
    if (!items.length) return
    const barAreaX = ML + 55
    const barAreaW = W - MR - barAreaX - 18
    const rowH = 5.5, gap = 1.5
    const maxVal = Math.max(...items.map(d => Math.max(d.value, d.value2??0)))
    doc.setFontSize(6.5)
    doc.setTextColor(107,114,128)
    doc.text(opts.col1Label, barAreaX + barAreaW*0.35, y-1, {align:"center"})
    if (opts.col2Label) doc.text(opts.col2Label, barAreaX + barAreaW*0.75, y-1, {align:"center"})
    doc.setTextColor(55,65,81)
    items.forEach((d,i) => {
      const ry = y + i*(rowH*2+gap*2+1)
      // label
      doc.setFontSize(7); doc.setFont("helvetica","normal")
      doc.text(d.label.length>16?d.label.slice(0,15)+"…":d.label, barAreaX-2, ry+rowH*0.75, {align:"right"})
      // bar 1
      doc.setFillColor(241,245,249)
      doc.roundedRect(barAreaX, ry, barAreaW, rowH, 1,1,"F")
      if (maxVal>0) {
        const bw = (d.value/maxVal)*barAreaW
        doc.setFillColor(5,150,105)   // emerald
        doc.roundedRect(barAreaX, ry, Math.max(bw,1), rowH, 1,1,"F")
      }
      doc.setFontSize(6); doc.text(fmt(d.value,1), barAreaX+barAreaW+2, ry+rowH*0.75)
      // bar 2 (target)
      if (d.value2 !== undefined) {
        doc.setFillColor(241,245,249)
        doc.roundedRect(barAreaX, ry+rowH+1, barAreaW, rowH, 1,1,"F")
        if (maxVal>0) {
          const bw2 = (d.value2/maxVal)*barAreaW
          doc.setFillColor(209,250,229)
          doc.roundedRect(barAreaX, ry+rowH+1, Math.max(bw2,1), rowH, 1,1,"F")
        }
        doc.setFontSize(6); doc.text(fmt(d.value2,1), barAreaX+barAreaW+2, ry+rowH*1.9+1)
      }
    })
    y += items.length * (d2 => d2.value2!==undefined?rowH*2+gap*2+1:rowH+gap+1)(items[0]) + 4
    y += items.length * (rowH + gap) // rough estimate
  }

  // ── PAGE 1: Header ────────────────────────────────────────────────────────
  doc.setFillColor(5,150,105)
  doc.rect(0, 0, W, 30, "F")
  // accent strip
  doc.setFillColor(4,120,87)
  doc.rect(0, 22, W, 8, "F")
  doc.setTextColor(255,255,255)
  doc.setFont("helvetica","bold"); doc.setFontSize(6)
  doc.text("SHAZIA RICE EXPORT  ·  CONFIDENTIAL  ·  INTERNAL USE ONLY", ML, 8)
  doc.setFontSize(17)
  doc.text("Monthly MIS Report", ML, 17)
  doc.setFont("helvetica","normal"); doc.setFontSize(9)
  doc.text(`${data.calendarMonthYear}   ·   FY ${data.fy}`, ML, 26)
  const genDate = new Date(data.generatedAt).toLocaleString("en-IN",{
    timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"
  })
  doc.setFontSize(6.5)
  doc.text(`Generated: ${genDate} IST`, W-MR, 26, {align:"right"})
  y = 36

  // ── KPI row ───────────────────────────────────────────────────────────────
  const s = data.summary
  const kpis = [
    ["Containers",  fmt(s.totalContainers,1)],
    ["Target",      fmt(s.totalMonthlyTarget,1)],
    ["Achievement", `${s.achievementPct}%`],
    ["Revenue",     fmtUSD(s.totalAmount)],
    ["Markets",     String(s.activeCountries)],
  ]
  const bw = (W-ML-MR-8)/5
  kpis.forEach(([lbl,val],i) => {
    const bx = ML + i*(bw+2)
    const isA = i===2
    const aPct = s.achievementPct
    doc.setFillColor(
      isA ? (aPct>=100?209:254) : 248,
      isA ? (aPct>=100?250:243) : 250,
      isA ? (aPct>=100?229:199) : 252,
    )
    doc.roundedRect(bx, y, bw, 15, 2,2,"F")
    doc.setTextColor(107,114,128); doc.setFont("helvetica","normal"); doc.setFontSize(6)
    doc.text(lbl, bx+bw/2, y+4.5, {align:"center"})
    doc.setFont("helvetica","bold"); doc.setFontSize(isA?12:10.5)
    doc.setTextColor(
      isA&&aPct>=100?5:15,
      isA&&aPct>=100?150:23,
      isA&&aPct>=100?105:42,
    )
    doc.text(val, bx+bw/2, y+11, {align:"center"})
  })
  y += 18

  // Achievement bar
  doc.setFillColor(229,231,235)
  doc.roundedRect(ML, y, W-ML-MR, 4, 1,1,"F")
  const barW = Math.min(s.achievementPct,100)/100*(W-ML-MR)
  const aPct = s.achievementPct
  doc.setFillColor(aPct>=100?5:aPct>=75?217:220, aPct>=100?150:aPct>=75?119:38, aPct>=100?105:aPct>=75?6:38)
  doc.roundedRect(ML, y, Math.max(barW,2), 4, 1,1,"F")
  doc.setFontSize(6); doc.setFont("helvetica","normal"); doc.setTextColor(107,114,128)
  doc.text(`${fmt(s.totalContainers,1)} / ${fmt(s.totalMonthlyTarget,1)} containers  ·  ${s.piCount} orders  ·  ${s.uniqueBuyers} buyers  ·  ${s.activeSalesPersons} sales persons`, ML, y+8)
  y += 11

  // ── Variety breakdown ─────────────────────────────────────────────────────
  section("Variety Breakdown")
  autoTable(doc, {
    startY: y, margin:{left:ML,right:MR},
    head:[["Variety","Containers","Metric Tonnes","Revenue","Share %"]],
    body: data.varietyBreakdown.map(v=>[v.variety,fmt(v.containers,1),fmt(v.mts,1),fmtUSD(v.amount),`${v.containersPct}%`]),
    headStyles:{fillColor:[5,150,105],textColor:255,fontStyle:"bold",fontSize:7.5},
    bodyStyles:{fontSize:8},
    alternateRowStyles:{fillColor:[249,250,251]},
    columnStyles:{0:{fontStyle:"bold"},1:{halign:"right"},2:{halign:"right"},3:{halign:"right"},4:{halign:"right"}},
  })
  y = (doc as any).lastAutoTable.finalY + 3

  // Description sub-table (within each variety)
  for (const v of data.varietyBreakdown) {
    if (!v.descriptions.length) continue
    doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(55,65,81)
    doc.text(`  ${v.variety} — Description Breakdown`, ML+2, y+3)
    y += 5
    autoTable(doc, {
      startY: y, margin:{left:ML+6,right:MR+6},
      head:[["Description","Containers","MTs","Revenue"]],
      body: v.descriptions.map(d=>[d.description,fmt(d.containers,1),fmt(d.mts,1),fmtUSD(d.amount)]),
      headStyles:{fillColor:[209,250,229],textColor:[5,150,105],fontStyle:"bold",fontSize:7},
      bodyStyles:{fontSize:7},
      alternateRowStyles:{fillColor:[249,250,251]},
      columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"}},
    })
    y = (doc as any).lastAutoTable.finalY + 3
  }

  // ── Country Performance ───────────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 14 }
  section("Country Performance")
  autoTable(doc, {
    startY: y, margin:{left:ML,right:MR},
    head:[["Country","Target (Ctrs)","Actual (Ctrs)","Achievement %","MTs","Revenue","Share %","Buyers"]],
    body: data.countryBreakdown.map((c,i)=>[
      `${i+1}. ${c.country}`,
      c.monthlyTarget>0?fmt(c.monthlyTarget,1):"—",
      fmt(c.containers,1),
      c.monthlyTarget>0?`${c.achievementPct}%`:"—",
      fmt(c.mts,1),
      fmtUSD(c.amount),
      `${c.pct}%`,
      c.buyerCount,
    ]),
    headStyles:{fillColor:[5,150,105],textColor:255,fontStyle:"bold",fontSize:6.5},
    bodyStyles:{fontSize:7},
    alternateRowStyles:{fillColor:[249,250,251]},
    columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"},4:{halign:"right"},5:{halign:"right"},6:{halign:"right"},7:{halign:"right"}},
  })
  y = (doc as any).lastAutoTable.finalY + 4

  // ── Sales Person bar chart ────────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 14 }
  section("Sales Person Performance")
  {
    const items = data.salesPersonBreakdown
    const bAreaX = ML + 55, bAreaW = W-MR-bAreaX-20
    const rH = 7, gap = 3
    const maxMT = Math.max(...items.map(d=>d.mts), 1)
    items.forEach((sp, i) => {
      const ry = y + i*(rH+gap)
      doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(55,65,81)
      const lbl = sp.salesPerson.length>16?sp.salesPerson.slice(0,15)+"…":sp.salesPerson
      doc.text(lbl, bAreaX-3, ry+rH*0.72, {align:"right"})
      // bg
      doc.setFillColor(241,245,249)
      doc.roundedRect(bAreaX, ry, bAreaW, rH, 1.5,1.5,"F")
      // fill
      const fw = (sp.mts/maxMT)*bAreaW
      // gradient effect: slightly darker shade
      doc.setFillColor(5,150,105)
      doc.roundedRect(bAreaX, ry, Math.max(fw,2), rH, 1.5,1.5,"F")
      // value
      doc.setFontSize(6.5); doc.setFont("helvetica","bold"); doc.setTextColor(55,65,81)
      doc.text(`${fmt(sp.mts,1)} MTs  (${sp.share}%)`, bAreaX+fw+3, ry+rH*0.72)
    })
    y += items.length*(rH+gap)+4
  }

  // ── Buyers Target vs Actual ───────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 14 }
  section("Buyers — Target vs Actual")
  autoTable(doc, {
    startY: y, margin:{left:ML,right:MR},
    head:[["Buyer","Country","Tier","Target/Mo","Actual Ctrs","Achievement %","Revenue"]],
    body: data.buyerBreakdown.map(b=>[
      b.buyerName,
      b.country,
      b.tier,
      b.monthlyTarget>0?fmt(b.monthlyTarget,1):"—",
      fmt(b.containers,1),
      b.monthlyTarget>0?`${b.achievementPct}%`:"—",
      fmtUSD(b.amount),
    ]),
    headStyles:{fillColor:[5,150,105],textColor:255,fontStyle:"bold",fontSize:6.5},
    bodyStyles:{fontSize:7},
    alternateRowStyles:{fillColor:[249,250,251]},
    columnStyles:{3:{halign:"right"},4:{halign:"right"},5:{halign:"right"},6:{halign:"right"}},
  })
  y = (doc as any).lastAutoTable.finalY + 4

  // ── Meetings ──────────────────────────────────────────────────────────────
  if (y > 245) { doc.addPage(); y = 14 }
  section(`Meetings Done — ${data.calendarMonthYear}`)
  const ms = data.meetingsSummary
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(55,65,81)
  doc.text(
    `Total Done: ${ms.totalDone} / ${ms.totalBuyers} buyers   |   Tier 1: ${ms.byTier.TIER1.done}/${ms.byTier.TIER1.total}   Tier 2: ${ms.byTier.TIER2.done}/${ms.byTier.TIER2.total}   Tier 3: ${ms.byTier.TIER3.done}/${ms.byTier.TIER3.total}`,
    ML, y+3
  )
  y += 8

  // ── Footer on all pages ───────────────────────────────────────────────────
  const pages = (doc as any).internal.getNumberOfPages()
  for (let i=1; i<=pages; i++) {
    doc.setPage(i)
    doc.setFillColor(248,250,252)
    doc.rect(0,287,W,10,"F")
    doc.setFillColor(5,150,105); doc.rect(0,287,W,0.5,"F")
    doc.setTextColor(156,163,175); doc.setFontSize(6); doc.setFont("helvetica","normal")
    doc.text("Shazia Rice Export  ·  Monthly MIS Report  ·  Confidential", ML, 293)
    doc.text(`Page ${i} of ${pages}   ·   ${data.calendarMonthYear}  ·  FY ${data.fy}`, W-MR, 293, {align:"right"})
  }

  doc.save(`MIS-${data.calendarMonthYear.replace(/\s+/g,"-")}-FY${data.fy}.pdf`)
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ReportClient({ userRole }: { userRole: string }) {
  const fyList  = genFYList()
  const [fy,       setFY]        = useState(getCurrentFY)
  const [month,    setMonth]     = useState(getCurrentFYMonth)
  const [data,     setData]      = useState<MonthlyReportData|null>(null)
  const [loading,  setLoading]   = useState(false)
  const [pdfBusy,  setPdfBusy]   = useState(false)
  const [error,    setError]     = useState<string|null>(null)
  const [openDesc, setOpenDesc]  = useState<string|null>(null)  // variety description open

  const fetchReport = useCallback(async (f:string, m:number) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/monthly-report?fy=${f}&month=${m}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch(e:any){ setError(e.message||"Failed to load") }
    finally{ setLoading(false) }
  }, [])

  useEffect(() => { fetchReport(fy, month) }, [fy, month, fetchReport])

  const handleDownload = async () => {
    if (!data) return
    setPdfBusy(true)
    try { await generatePDF(data) } catch(e){ console.error(e) }
    finally{ setPdfBusy(false) }
  }

  return (
    <div className="flex flex-col h-full" style={{background:C.bg}}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-slate-900">Monthly MIS Report</h1>
          {data && !loading && (
            <p className="text-xs text-gray-400">{data.calendarMonthYear} · FY {data.fy}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={fy} onChange={e=>setFY(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
            {fyList.map(f=><option key={f} value={f}>FY {f}</option>)}
          </select>
          <select value={month} onChange={e=>setMonth(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
            {FY_MONTHS.map(m=><option key={m.no} value={m.no}>{m.name}</option>)}
          </select>
          <button onClick={handleDownload} disabled={!data||loading||pdfBusy}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{background:C.emerald}}>
            {pdfBusy
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Generating…</>
              : <>⬇ Download PDF</>}
          </button>
        </div>
      </div>

      {/* ── States ───────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"/>
            <p className="text-sm text-gray-400">Loading report…</p>
          </div>
        </div>
      )}
      {error && <div className="m-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">⚠️ {error}</div>}

      {/* ── Report body ───────────────────────────────────────────────────── */}
      {!loading && data && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ═ KPI Cards ═══════════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label:"Containers",    value:fmt(data.summary.totalContainers,1),     sub:`Target: ${fmt(data.summary.totalMonthlyTarget,1)}`, pct:data.summary.achievementPct },
              { label:"Achievement",   value:`${data.summary.achievementPct}%`,        sub:"vs Monthly Target",                                  pct:data.summary.achievementPct },
              { label:"Total MTs",     value:fmt(data.summary.totalMTs,1),             sub:"Metric Tonnes",                                      pct:75 },
              { label:"Revenue",       value:fmtUSD(data.summary.totalAmount),         sub:`${data.summary.piCount} orders`,                    pct:75 },
              { label:"Markets · Buyers", value:`${data.summary.activeCountries} · ${data.summary.uniqueBuyers}`, sub:`${data.summary.activeSalesPersons} Sales Persons`, pct:75 },
            ].map(card=>(
              <div key={card.label}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{card.label}</p>
                <p className="text-[22px] font-bold text-slate-900 leading-none">{card.value}</p>
                <div className="flex items-end justify-between">
                  <p className="text-[11px] text-gray-400">{card.sub}</p>
                  <Sparkline pct={card.pct}/>
                </div>
              </div>
            ))}
          </div>

          {/* Achievement bar */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="font-semibold text-slate-800">Monthly Target Achievement</span>
              <span className="font-bold text-slate-900">{fmt(data.summary.totalContainers,1)} / {fmt(data.summary.totalMonthlyTarget,1)} containers</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div className={`h-3 rounded-full ${achieveTailwind(data.summary.achievementPct)}`}
                style={{width:`${Math.min(data.summary.achievementPct,100)}%`}}/>
            </div>
            <div className="flex justify-between text-[10px] text-gray-300 mt-1 px-0.5">
              <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>

          {/* ═ Variety + Country side-by-side ═══════════════════════════════ */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

            {/* Variety */}
            {data.varietyBreakdown.length > 0 && (
              <Section title="🌾 Variety Breakdown" sub="Click a variety to see description detail">
                <div className="flex items-start gap-4">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={data.varietyBreakdown} dataKey="containers" nameKey="variety"
                        cx="50%" cy="50%" outerRadius={55} innerRadius={28}>
                        {data.varietyBreakdown.map((_,i)=>(
                          <Cell key={i} fill={VARIETY_COLORS[i%VARIETY_COLORS.length]}/>
                        ))}
                      </Pie>
                      <Tooltip formatter={(v:any)=>[`${fmt(Number(v),1)} ctrs`]}/>
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="flex-1 min-w-0">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400">
                          <th className="text-left pb-1.5">Variety</th>
                          <th className="text-right pb-1.5">Ctrs</th>
                          <th className="text-right pb-1.5">Revenue</th>
                          <th className="text-right pb-1.5">Share</th>
                          <th className="pb-1.5"/>
                        </tr>
                      </thead>
                      <tbody>
                        {data.varietyBreakdown.map((v,i)=>(
                          <>
                            <tr key={v.variety}
                              className="border-t border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                              onClick={()=>setOpenDesc(openDesc===v.variety?null:v.variety)}>
                              <td className="py-2 flex items-center gap-1.5 font-semibold text-slate-800">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{background:VARIETY_COLORS[i%VARIETY_COLORS.length]}}/>
                                {v.variety}
                              </td>
                              <td className="py-2 text-right font-bold text-slate-900">{fmt(v.containers,1)}</td>
                              <td className="py-2 text-right text-gray-500">{fmtUSD(v.amount)}</td>
                              <td className="py-2 text-right">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{background:VARIETY_COLORS[i%VARIETY_COLORS.length]+"22",color:VARIETY_COLORS[i%VARIETY_COLORS.length]}}>
                                  {v.containersPct}%
                                </span>
                              </td>
                              <td className="py-2 text-center text-gray-300 text-xs">
                                {openDesc===v.variety?"▲":"▼"}
                              </td>
                            </tr>
                            {/* Description sub-rows */}
                            {openDesc===v.variety && v.descriptions.map(d=>(
                              <tr key={d.description} className="bg-gray-50">
                                <td className="py-1.5 pl-5 text-gray-500 italic" colSpan={1}>↳ {d.description}</td>
                                <td className="py-1.5 text-right text-gray-600">{fmt(d.containers,1)}</td>
                                <td className="py-1.5 text-right text-gray-400">{fmtUSD(d.amount)}</td>
                                <td className="py-1.5 text-right text-gray-400 text-[10px]">
                                  {v.containers>0?`${((d.containers/v.containers)*100).toFixed(0)}%`:"—"}
                                </td>
                                <td/>
                              </tr>
                            ))}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Section>
            )}

            {/* Meetings Summary Card */}
            <Section title="🤝 Meetings Done" sub={data.calendarMonthYear}>
              <div className="space-y-4">
                {/* Total card */}
                <div className="rounded-xl p-4 text-center"
                  style={{background:"linear-gradient(135deg,#059669,#047857)"}}>
                  <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">Total Meetings Done</p>
                  <p className="text-white text-4xl font-bold mt-1">{data.meetingsSummary.totalDone}</p>
                  <p className="text-white/60 text-xs mt-1">out of {data.meetingsSummary.totalBuyers} monitored buyers</p>
                </div>

                {/* Tier cards row */}
                <div className="grid grid-cols-3 gap-3">
                  {(["TIER1","TIER2","TIER3"] as const).map(tier=>{
                    const stat = data.meetingsSummary.byTier[tier]
                    const pct  = stat.total>0?Math.round(stat.done/stat.total*100):0
                    const bg   = tier==="TIER1"?C.purpleL:tier==="TIER2"?C.blueL:C.emeraldL
                    const col  = tier==="TIER1"?C.purple:tier==="TIER2"?C.blue:C.emerald
                    return (
                      <div key={tier} className="rounded-xl border p-3 text-center" style={{background:bg,borderColor:col+"33"}}>
                        <p className="text-[10px] font-bold uppercase" style={{color:col}}>{tier}</p>
                        <p className="text-2xl font-bold mt-1" style={{color:col}}>{stat.done}</p>
                        <p className="text-[10px] mt-0.5" style={{color:col+"99"}}>/ {stat.total} buyers</p>
                        <div className="mt-2 bg-white/60 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full" style={{width:`${pct}%`,background:col}}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Section>
          </div>

          {/* ═ Country Performance ══════════════════════════════════════════ */}
          {data.countryBreakdown.length > 0 && (
            <Section title="🌍 Country Performance" sub={`${data.countryBreakdown.length} active markets · Target vs Actual`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      {["#","Country","Target (Ctrs)","Actual (Ctrs)","Achievement","MTs","Revenue","Share","Buyers"].map(h=>(
                        <th key={h} className={`px-3 py-2.5 text-xs font-bold uppercase tracking-wide ${h==="#"||h==="Buyers"?"text-center":"text-left"} ${h==="Actual (Ctrs)"||h==="MTs"||h==="Revenue"||h==="Share"||h==="Target (Ctrs)"?"text-right":""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.countryBreakdown.map((c,i)=>(
                      <tr key={c.country} className={`border-b border-gray-100 ${i%2?"bg-slate-50/50":""}`}>
                        <td className="px-3 py-2.5 text-center text-xs text-gray-400 font-mono">{i+1}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900">{c.country}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500 text-xs">
                          {c.monthlyTarget>0?fmt(c.monthlyTarget,1):"—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-900">{fmt(c.containers,1)}</td>
                        <td className="px-3 py-2.5 min-w-[110px]">
                          {c.monthlyTarget>0
                            ? <AchBar pct={c.achievementPct}/>
                            : <span className="text-xs text-gray-300">No target</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{fmt(c.mts,1)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{fmtUSD(c.amount)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{c.pct}%</span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-500">{c.buyerCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ═ Sales Person — Bar Chart ═════════════════════════════════════ */}
          {data.salesPersonBreakdown.length > 0 && (
            <Section title="👤 Sales Person — MTs Contributed" sub="Bar chart by metric tonnes this month">
              <ResponsiveContainer width="100%" height={Math.max(180, data.salesPersonBreakdown.length * 44)}>
                <BarChart data={data.salesPersonBreakdown} layout="vertical"
                  margin={{left:100,right:60,top:4,bottom:4}}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9"/>
                  <XAxis type="number" tick={{fontSize:11,fill:"#6b7280"}} tickFormatter={v=>fmt(v)}/>
                  <YAxis type="category" dataKey="salesPerson" tick={{fontSize:11,fill:"#374151"}}
                    width={100} tickFormatter={(v:string)=>v.length>14?v.slice(0,13)+"…":v}/>
                  <Tooltip content={<ChartTip/>}/>
                  <Bar dataKey="mts" name="MTs" fill={C.emerald} radius={[0,6,6,0]} barSize={18}
                    label={{position:"right",formatter:(v:any)=>`${fmt(Number(v),1)} MT`,fontSize:10,fill:"#374151"}}/>
                </BarChart>
              </ResponsiveContainer>
              {/* Share row below */}
              <div className="mt-3 flex flex-wrap gap-2">
                {data.salesPersonBreakdown.map((sp,i)=>(
                  <div key={sp.salesPerson} className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{background:VARIETY_COLORS[i%VARIETY_COLORS.length]}}/>
                    <span className="font-medium text-slate-800">{sp.salesPerson}</span>
                    <span className="text-gray-400">—</span>
                    <span className="font-bold text-emerald-700">{sp.share}%</span>
                    <span className="text-gray-400">share</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ═ Buyers — Target vs Actual ════════════════════════════════════ */}
          {data.buyerBreakdown.length > 0 && (
            <Section title="🏢 Buyers — Target vs Actual" sub={`${data.buyerBreakdown.length} buyers placed orders this month`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      {["#","Buyer","Country","Tier","Responsible","Target/Mo","Actual Ctrs","Achievement","Revenue"].map(h=>(
                        <th key={h} className={`px-3 py-2.5 text-xs font-bold uppercase tracking-wide
                          ${h==="Target/Mo"||h==="Actual Ctrs"||h==="Revenue"?"text-right":"text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.buyerBreakdown.map((b,i)=>(
                      <tr key={`${b.buyerName}-${b.country}`}
                        className={`border-b border-gray-100 ${i%2?"bg-slate-50/50":""}`}>
                        <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{i+1}</td>
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-slate-900">{b.buyerName}</span>
                          {b.isIn8020&&<span className="ml-1.5 text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">80/20</span>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{b.country}</td>
                        <td className="px-3 py-2.5"><TierBadge tier={b.tier}/></td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{b.responsiblePerson||"—"}</td>
                        <td className="px-3 py-2.5 text-right text-gray-400 text-xs">
                          {b.monthlyTarget>0?fmt(b.monthlyTarget,1):"—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-900">{fmt(b.containers,1)}</td>
                        <td className="px-3 py-2.5 min-w-[120px]">
                          {b.monthlyTarget>0
                            ? <AchBar pct={b.achievementPct}/>
                            : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{fmtUSD(b.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

        </div>
      )}
    </div>
  )
}
