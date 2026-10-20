import { useState } from 'react'

export default function App() {
  const [dark, setDark] = useState(false)
  const [prereqChecks, setPrereqChecks] = useState<number[]>([])
  const [activeCell, setActiveCell] = useState<string | null>(null)
  const [searchTable, setSearchTable] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)

  const reportRows = [
    { metric: 'Spend / approved ceiling', current: '—', prior: '—', interpretation: 'Pacing; ceiling pending approval.' },
    { metric: 'Reach / impressions / frequency', current: '—', prior: '—', interpretation: 'Awareness proxies; not proof of brand lift.' },
    { metric: 'Engagement / link CTR', current: '—', prior: '—', interpretation: 'Specify the engagement-rate denominator.' },
    { metric: 'Landing-page views / conversion rate', current: '—', prior: '—', interpretation: 'State the conversion denominator.' },
    { metric: 'Leads / qualified leads', current: '—', prior: '—', interpretation: 'Include the agreed qualification definition.' },
    { metric: 'Cost per qualified lead', current: '—', prior: '—', interpretation: 'Main early efficiency measure.' },
    { metric: 'Booked calls / attended calls', current: '—', prior: '—', interpretation: 'Sales-process health.' },
    { metric: 'Sales / attributed revenue / ROAS', current: 'Pending', prior: 'Pending', interpretation: 'Mark pending revenue; never invent ROAS.' },
  ]
  const filteredReportRows = reportRows.filter(row =>
    `${row.metric} ${row.interpretation}`.toLowerCase().includes(searchTable.toLowerCase())
  )

  const downloadReportTemplate = () => {
    const csv = [
      ['Metric', 'This week', 'Prior week', 'Interpretation'],
      ...reportRows.map(row => [row.metric, row.current, row.prior, row.interpretation]),
    ].map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'weekly-report-template.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const toggleCheck = (i:number) => {
    setPrereqChecks(prev => prev.includes(i) ? prev.filter(x=>x!==i) : [...prev,i])
  }

  return (
    <div className={dark ? 'dark' : ''}>
      <div className={`min-h-screen font-[Inter] antialiased transition-colors duration-300 ${dark ? 'bg-[#0B0E1E] text-white' : 'bg-[#F6F7FB] text-[#0B1134]'}`}>

        {/* NAV */}
        <nav aria-label="Main navigation" className={`sticky top-0 z-50 backdrop-blur-xl border-b ${dark ? 'bg-[#0B0E1E]/90 border-white/10' : 'bg-white/90 border-black/5'}`}>
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 min-h-[68px] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0B1134] flex items-center justify-center text-white font-black text-[11px] leading-none shadow-lg shadow-[#0B1134]/15">AI<br/>ADS</div>
                <div>
                  <div className="text-[12px] font-extrabold tracking-[0.08em] leading-none">LOCAL ADS MANAGER</div>
                  <div className="text-[10px] font-medium opacity-55 leading-none mt-1.5">FIRST-MONTH LAUNCH PLAN</div>
                </div>
              </div>
            </div>

            <div className="hidden xl:flex items-center gap-0.5">
              {[
                ['Overview', 'overview'],
                ['Setup', 'prerequisites'],
                ['Strategy', 'campaigns'],
                ['Calendar', 'calendar'],
                ['Creative', 'creative'],
                ['Budget', 'budget'],
                ['Report', 'reports'],
                ['Handover', 'handover'],
              ].map(([label, target])=>(
                <a key={target} href={`#${target}`} className={`px-2.5 py-2 rounded-full text-[11px] font-semibold whitespace-nowrap transition ${dark?'text-white/65 hover:text-white hover:bg-white/10':'text-slate-600 hover:text-[#0B1134] hover:bg-slate-100'}`}>{label}</a>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold border ${dark?'bg-amber-400/10 text-amber-200 border-amber-300/15':'bg-amber-50 text-amber-800 border-amber-200'}`}>
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Draft · Not live
              </div>
              <button aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={()=>setDark(d=>!d)} className={`w-9 h-9 rounded-full flex items-center justify-center border transition ${dark?'bg-white text-black border-white':'bg-[#0B1134] text-white border-[#0B1134]'}`}>
                <span className="text-[14px]">{dark ? '☀︎' : '☾'}</span>
              </button>
              <button aria-label={mobileMenu ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenu} onClick={()=>setMobileMenu(!mobileMenu)} className="xl:hidden w-9 h-9 rounded-full bg-[#0B1134] text-white flex items-center justify-center">☰</button>
            </div>
          </div>
          {mobileMenu && (
            <div className={`xl:hidden px-4 pb-4 flex flex-col gap-1 max-w-[1440px] mx-auto ${dark?'bg-[#0B0E1E]':'bg-white'}`}>
              {[
                ['Overview', 'overview'], ['Launch prerequisites', 'prerequisites'],
                ['Campaign structure', 'campaigns'], ['Content calendar', 'calendar'],
                ['Creative brief', 'creative'], ['Budget & optimisation', 'budget'],
                ['Weekly report', 'reports'], ['Handover', 'handover'],
              ].map(([label, target])=>(
                <a key={target} onClick={()=>setMobileMenu(false)} href={`#${target}`} className={`py-2.5 px-3 rounded-lg text-sm font-medium ${dark?'hover:bg-white/10':'hover:bg-slate-50'}`}>{label}</a>
              ))}
            </div>
          )}
        </nav>

        {/* HERO */}
        <div id="overview" className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className={`rounded-[24px] overflow-hidden relative border ${dark?'bg-[#12152E] border-white/10':'bg-white border-black/5 shadow-sm'}`}>
            <div className="grid lg:grid-cols-[1.25fr_0.85fr] gap-0">
              <div className="p-6 sm:p-8 lg:p-12">
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.12em] border ${dark?'border-white/10 text-white/60 bg-white/5':'border-slate-200 text-slate-600 bg-slate-50'}`}>PAID SOCIAL STRATEGY</span>
                  <span className="px-3 py-1 rounded-full bg-[#C6FF2D] text-[#0B1134] text-[10px] font-extrabold tracking-[0.12em]">LONDON FIRST</span>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${dark?'border-white/15 text-white/70':'border-black/10 text-black/60'}`}>SOUTH EAST · PROPOSED</span>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${dark?'border-white/15 text-white/70':'border-black/10 text-black/60'}`}>UK · CONDITIONAL</span>
                </div>
                <h1 className="text-[38px] sm:text-[54px] lg:text-[64px] font-[800] leading-[0.98] tracking-[-0.055em] max-w-[800px]">
                  A smarter first month<br className="hidden sm:block"/> for <span className="text-[#687500]">local growth.</span>
                </h1>
                <p className={`mt-5 text-[15px] leading-7 max-w-[640px] ${dark?'text-white/70':'text-slate-600'}`}>
                  A practical launch blueprint for Facebook and Instagram: start focused in London, learn from qualified enquiries, and expand only when the evidence supports it.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <a href="#campaigns" className="inline-flex items-center gap-2 bg-[#0B1134] text-white px-5 py-3 rounded-xl text-sm font-bold shadow-lg shadow-[#0B1134]/15 hover:bg-[#182153] transition">Explore the strategy <span aria-hidden="true">→</span></a>
                  <a href="#prerequisites" className={`inline-flex items-center px-5 py-3 rounded-xl text-sm font-bold border transition ${dark?'border-white/15 bg-white/5 hover:bg-white/10':'border-slate-200 bg-white hover:bg-slate-50'}`}>View launch checklist</a>
                </div>

                <div className="mt-9 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-[700px]">
                  {[
                    {k:'Primary goal', v:'Qualified calls', sub:'Agree qualification first'},
                    {k:'Launch market', v:'London', sub:'Confirm service area'},
                    {k:'Campaign status', v:'Draft plan', sub:'No ads are live'},
                  ].map(c=>(
                    <div key={c.k} className={`p-4 rounded-2xl border ${dark?'bg-white/[0.04] border-white/10':'bg-slate-50/80 border-slate-200/80'}`}>
                      <div className="text-[10px] font-bold opacity-55 uppercase tracking-[0.12em]">{c.k}</div>
                      <div className="text-[17px] font-extrabold mt-2">{c.v}</div>
                      <div className="text-[11px] opacity-55 mt-1">{c.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right meta card */}
              <div className={`p-6 sm:p-8 lg:p-10 border-t lg:border-t-0 lg:border-l ${dark?'border-white/10 bg-[#0E1230]':'border-black/5 bg-[#0B1134] text-white'}`}>
                <div className="flex items-center justify-between mb-6">
                  <div className="text-[11px] font-extrabold tracking-[0.14em] opacity-70">EXPANSION GATES</div>
                  <div className="text-[10px] px-2.5 py-1 rounded-full bg-[#C6FF2D] text-[#0B1134] font-extrabold tracking-wide">THE ROADMAP</div>
                </div>

                <div className="space-y-4">
                      {[
                        {stage:'Local — London', desc:'Confirm included boroughs and actual service area. Separate reporting, location creative, broad eligible audience initially.', pass:'Reliable tracking + qualified leads within the agreed acquisition ceiling across two complete reporting periods.'},
                        {stage:'Regional — South East', desc:'Proposed, not confirmed. Exclude London where supported; keep London performance visible.', pass:'Sufficient qualified demand, manageable sales capacity, and acceptable acquisition cost.'},
                        {stage:'National — UK', desc:'Remaining UK markets. Separate expansion allocation and avoid unnecessary geographic overlap.', pass:'Regional economics remain viable; sales and revenue attribution are sufficiently mature.'},
                  ].map(s=>(
                        <div key={s.stage} className={`p-4 rounded-2xl border ${dark ? 'bg-white/5 border-white/10 text-white' : 'bg-white/10 border-white/15 text-white'}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-[13px] font-extrabold">{s.stage}</div>
                            <span className="text-[10px] font-bold uppercase tracking-wide text-white/50">Not activated</span>
                      </div>
                      <div className="text-[12px] leading-5 opacity-70 mt-1">{s.desc}</div>
                      <div className="text-[10px] mt-3 font-bold uppercase tracking-[0.1em] text-[#C6FF2D]">Expansion gate</div>
                      <div className="text-[11px] mt-1 leading-5 opacity-70">{s.pass}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-3 rounded-xl bg-[#C6FF2D] text-[#0B1134]">
                  <div className="text-[11px] font-extrabold">LOCATION IS AN ESTIMATE</div>
                  <div className="text-[11px] mt-1 leading-4 opacity-75">Validate targeting controls and lead postcodes before expanding.</div>
                </div>
              </div>
            </div>

            <div className={`px-6 sm:px-10 py-4 border-t text-[12px] leading-5 ${dark?'bg-white/[0.025] border-white/10 text-white/65':'bg-slate-50/80 border-slate-100 text-slate-600'}`}>
              <b>Working assumption:</b> this service provides Facebook and Instagram campaign management for local businesses. Confirm the actual business, offer, website, service capacity, customer, fees, and qualification criteria before creative production. English-language ads start in London; South East is proposed and UK expansion depends on results.
            </div>
          </div>
        </div>

        {/* KPI CARDS */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:'Spend / Approved Ceiling', value:'Pending', sub:'No budget approved or spend recorded', icon:'£' },
            { label:'Qualified Leads', value:'Pending', sub:'Qualification definition to be agreed', icon:'◈' },
            { label:'Cost / Qualified Lead', value:'Pending', sub:'Set allowable cost before launch', icon:'◎' },
            { label:'Booked / Attended Calls', value:'Pending', sub:'Populate from CRM after launch', icon:'◐' },
          ].map(card=>(
            <div key={card.label} className={`p-5 rounded-[20px] border relative overflow-hidden group hover:scale-[1.01] transition ${dark?'bg-[#12152E] border-white/10':'bg-white border-black/5 shadow-sm'}`}>
              <div className="flex justify-between items-start">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold ${dark?'bg-white text-black':'bg-[#0B1134] text-white'}`}>{card.icon}</div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-800">Pending</span>
              </div>
              <div className="text-[11px] font-bold tracking-[0.12em] opacity-60 mt-4">{card.label.toUpperCase()}</div>
              <div className="text-[28px] font-extrabold tracking-tight mt-1">{card.value}</div>
              <div className={`text-[12px] mt-1 ${dark?'text-white/60':'text-black/50'}`}>{card.sub}</div>
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#C6FF2D] to-[#0B1134] opacity-60 group-hover:opacity-100 transition"></div>
            </div>
          ))}
        </div>

        {/* PREREQUISITES + OPTIMISATION */}
        <div id="prerequisites" className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 mt-10 grid lg:grid-cols-3 gap-4">
          <div className={`lg:col-span-2 p-6 rounded-[24px] border ${dark?'bg-[#12152E] border-white/10':'bg-white border-black/5 shadow-sm'}`}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold tracking-wide">01 <span className="opacity-40">/</span> LAUNCH PREREQUISITES</div>
                <div className={`text-[12px] mt-1 ${dark?'text-white/60':'text-black/50'}`}>Mark items as ready for your own reference · least-privilege access + 2FA</div>
              </div>
              <div className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${dark?'border-white/10 bg-white/5 text-white/70':'border-amber-200 bg-amber-50 text-amber-800'}`}>{prereqChecks.length}/8 marked locally</div>
            </div>

            <div className="mt-5 grid sm:grid-cols-2 gap-3">
              {[
                {title:'Offer, customer & sales process confirmed', desc:'Business name, target customer, service capacity, fees, qualification criteria, and sales process signed off.'},
                {title:'Budget & authority agreed', desc:'Monthly media ceiling, management/production costs, allowable qualified-lead cost, customer acquisition ceiling, daily cap, and written change authority.'},
                {title:'Role-based Meta access granted', desc:'Business portfolio, Page, Instagram, ad account, and relevant dataset. Least privilege, 2FA; never share passwords.'},
                {title:'Account & policy audit complete', desc:'Prior results, account health, billing, assets, and applicable special ad category restrictions checked.'},
                {title:'Booking page & consent verified', desc:'Booking page and mobile experience, privacy notice, tracking consent, and UTM consistency checked.'},
                {title:'Tracking events tested', desc:'Pixel and Conversions API as appropriate; deduplicate and test lead/booking events without bypassing consent.'},
                {title:'CRM / lead register ready', desc:'Record source, qualification, booked and attended calls, sale, revenue, and refunds.'},
                {title:'Creative & delivery approved', desc:'Copy, visuals, destination URLs, targeting, and spending limits approved before launch.'},
              ].map((item, i)=>(
                <label key={i} className={`flex gap-3 p-3 rounded-2xl border cursor-pointer transition ${prereqChecks.includes(i) ? 'bg-[#C6FF2D] border-[#C6FF2D] text-[#0B1134]' : dark?'bg-white/5 border-white/10 hover:bg-white/10':'bg-[#F6F7FB] border-black/5 hover:bg-white'}`}>
                  <input type="checkbox" checked={prereqChecks.includes(i)} onChange={()=>toggleCheck(i)} className="mt-1 accent-[#0B1134]" />
                  <div>
                    <div className="text-[13px] font-extrabold leading-tight">{item.title}</div>
                    <div className={`text-[12px] leading-4 mt-1 ${prereqChecks.includes(i)?'opacity-70':'opacity-60'}`}>{item.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-4 text-xs opacity-60">Checklist marks are local to this page and are not saved as approvals. Monitoring requires an authorised operator.</div>
          </div>

          <div className={`p-6 rounded-[24px] border ${dark?'bg-[#0B1134] text-white border-[#0B1134]':'bg-[#0B1134] text-white border-[#0B1134] shadow-sm'}`}>
            <div className="text-[11px] font-extrabold tracking-[0.14em] opacity-70">ACTIVATION STATUS</div>
            <div className="mt-4 space-y-3 text-sm leading-6">
              <div className="p-3 rounded-xl bg-white text-[#0B1134]">
                <div className="text-xs font-extrabold">DRAFT FOR APPROVAL</div>
                <div className="text-[13px] font-medium">No ads have been published, scheduled, or funded. Approve the offer, access, tracking, creative, and spend limits before activation.</div>
              </div>
              <div className="p-3 rounded-xl bg-white/10 border border-white/15 text-xs leading-5">
                Dashboard controls are a local prototype only. It does not connect to Meta, a CRM, tracking, or a persistent monitoring service.
              </div>
              <div className="p-3 rounded-xl bg-white/10 border border-white/15 text-xs leading-5">
                Every checkbox here is a local planning mark, not evidence that a prerequisite has been completed or approved.
              </div>
              <div className="text-xs opacity-70 leading-5">Persistent monitoring and campaign changes require an authorised operator or appropriately configured automation with safeguards.</div>
            </div>
          </div>
        </div>

        {/* CAMPAIGN STRUCTURE VISUAL */}
        <div id="campaigns" className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 mt-10">
          <div className={`p-6 sm:p-8 rounded-[24px] border overflow-hidden ${dark?'bg-[#12152E] border-white/10':'bg-white border-black/5 shadow-sm'}`}>
            <div className="flex flex-wrap gap-3 justify-between items-center">
              <div className="text-sm font-extrabold tracking-wide">02 <span className="opacity-40">/</span> CAMPAIGN STRUCTURE & GEOGRAPHY</div>
              <div className="text-xs px-3 py-1 rounded-full bg-[#0B1134] text-white font-bold">One objective aligned to the real lead / booking flow</div>
            </div>

            <div className="mt-6 grid lg:grid-cols-3 gap-4">
              {[
                { title:'Local · London', sub:'Confirm boroughs and actual service area', color:'#0B1134', bullet:['Separate local reporting','Location-specific creative','Broad eligible audience initially']},
                { title:'Regional · South East', sub:'Proposed; exclude London where supported', color:'#9CA3AF', bullet:['Separate geographic test','Keep London performance visible','Gate: qualified demand, sales capacity, acceptable cost']},
                { title:'National · UK', sub:'Conditional: remaining UK markets', color:'#D1D5DB', bullet:['Separate expansion allocation','Avoid unnecessary overlap','Gate: viable regional economics and mature attribution']},
              ].map(c=>(
                <div key={c.title} className={`p-5 rounded-2xl border-2 relative ${dark?'bg-white/5 border-white/10':'bg-[#F9FAFB] border-black/5'}`} style={{borderColor: c.color+'30'}}>
                  <div className="w-2 h-2 rounded-full absolute top-5 right-5" style={{background:c.color}}></div>
                  <div className="text-[14px] font-extrabold">{c.title}</div>
                  <div className="text-xs opacity-60 mt-1">{c.sub}</div>
                  <ul className="mt-4 space-y-2">
                    {c.bullet.map(b=>(
                      <li key={b} className="flex gap-2 text-xs font-medium"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#C6FF2D] shrink-0"></span>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-6 grid md:grid-cols-3 gap-3 text-xs">
              <div className={`p-3 rounded-xl border flex gap-3 ${dark?'bg-white/5 border-white/10':'bg-amber-50 border-amber-200'}`}>
                <span>⚠️</span><span><b>No customer-list upload</b> without legal basis. Exclude existing clients where supported.</span>
              </div>
              <div className={`p-3 rounded-xl border flex gap-3 ${dark?'bg-white/5 border-white/10':'bg-slate-50 border-black/5'}`}>
                <span>🎯</span><span><b>Automation selectively</b> — review eligible Advantage+ placement previews and controls; preserve geographic comparisons and agreed spend constraints.</span>
              </div>
              <div className={`p-3 rounded-xl border flex gap-3 ${dark?'bg-white/5 border-white/10':'bg-slate-50 border-black/5'}`}>
                <span>🧪</span><span><b>Audience & retargeting</b> — compare broad local targeting with one hypothesis only when spend supports it. Interests/job roles do not guarantee business-owner identification; retarget only with usable audience size and consent.</span>
              </div>
            </div>
          </div>
        </div>

        {/* CONTENT CALENDAR + CREATIVE */}
        <div id="calendar" className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 mt-10 grid min-w-0 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,0.9fr)] gap-4">
          <div className={`min-w-0 p-6 rounded-[24px] border ${dark?'bg-[#12152E] border-white/10':'bg-white border-black/5 shadow-sm'}`}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold tracking-wide">03 <span className="opacity-40">/</span> FOUR-WEEK CONTENT & AD CALENDAR</div>
                <div className={`text-xs ${dark?'text-white/60':'text-black/50'}`}>Suggested organic cadence: three posts weekly · paid variants from the same themes</div>
              </div>
              <div className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${dark?'bg-white/5 border-white/10':'bg-[#F6F7FB] border-black/5'}`}>Dates assigned after kickoff</div>
            </div>

            <div className={`md:hidden mt-3 text-[11px] font-medium ${dark?'text-white/55':'text-slate-500'}`}>Swipe the calendar horizontally to view all days and paid actions.</div>
            <div className="mt-5 w-full min-w-0 overflow-x-auto -mx-6 px-6">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className={`text-[11px] font-extrabold tracking-wide opacity-60 border-b ${dark?'border-white/10':'border-black/5'}`}>
                    <th className="text-left py-2">Week</th><th className="text-left">Mon · Image</th><th className="text-left">Wed · Video/Reel</th><th className="text-left">Fri · Carousel</th><th className="text-left">Paid action</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {w:'1 — Introduce', mon:'“London first. Your next customers next.”', wed:'15–25s: AI-assisted ad management with human review', fri:'“From brief to booked call”: offer, creative, targeting, measurement, optimisation', paid:'Launch two concepts against one agreed conversion goal'},
                    {w:'2 — Educate', mon:'“More clicks aren’t the same as better leads.”', wed:'Sample creative revision; label illustrative', fri:'Five things to check before spending on local ads', paid:'Review funnel and lead quality; test one opening hook'},
                    {w:'3 — Build trust', mon:'Explain the weekly reporting promise', wed:'Authorised workflow walkthrough; expose no account data', fri:'What a useful weekly report includes', paid:'Replace weak creative with adequate evidence; test form/landing-page improvement'},
                    {w:'4 — Invite action', mon:'Discovery-call invitation with verified offer', wed:'Answer one real customer objection', fri:'London-to-UK approach without promises', paid:'Assess expansion readiness; keep London-only if economics are not established'},
                  ].map(row=>(
                    <tr key={row.w} className={`border-b ${dark?'border-white/5':'border-black/5'}`}>
                      <td className="py-3 font-extrabold text-xs">{row.w}</td>
                      {[
                        {k:`${row.w}-mon`, v:row.mon},
                        {k:`${row.w}-wed`, v:row.wed},
                        {k:`${row.w}-fri`, v:row.fri},
                        {k:`${row.w}-paid`, v:row.paid},
                      ].map(cell=>(
                        <td key={cell.k} className="py-3 pr-4">
                          <button aria-pressed={activeCell===cell.k} onClick={()=>setActiveCell(activeCell===cell.k?null:cell.k)} className={`text-left w-full min-h-20 p-3 rounded-xl border text-xs leading-5 transition ${activeCell===cell.k ? 'bg-[#C6FF2D] border-[#C6FF2D] text-[#0B1134] font-bold shadow-sm' : dark?'bg-white/5 border-white/10 hover:bg-white/10':'bg-[#F8F9FC] border-slate-200 hover:bg-white hover:border-slate-300'}`}>{cell.v}<span className={`mt-2 block text-[10px] font-semibold ${activeCell===cell.k?'text-[#0B1134]/65':'opacity-45'}`}>{activeCell===cell.k?'Selected for review':'Select to review'}</span></button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {activeCell && (
              <div role="status" className={`mt-3 p-3 rounded-xl text-xs leading-5 ${dark?'bg-white/5 text-white/75':'bg-lime-50 text-slate-700 border border-lime-100'}`}>
                <b>Planning note:</b> Confirm the claim, destination, owner, approval, and publishing date before this idea goes live. Dates are assigned after kickoff.
              </div>
            )}

            <div className={`mt-4 p-3 rounded-xl text-xs leading-5 flex gap-2 ${dark?'bg-white/5':'bg-slate-50 border border-black/5'}`}>
              <span className="font-extrabold">Workflow:</span> AI draft → check facts and claims → create/edit visuals → human brand/accessibility review → check asset rights → approve → publish/schedule → measure. Label illustrative examples; use licensed/original assets, do not imply fabricated evidence, and never impersonate customers.
              <span className="ml-auto hidden sm:block opacity-60">4:5 feed · 9:16 Stories/Reels · safe areas · captions · key message without sound</span>
            </div>
            <div className={`mt-3 p-3 rounded-xl text-xs leading-5 ${dark?'bg-white/5':'bg-slate-50 border border-black/5'}`}>Schedule supported organic posts/Reels in Meta Business Suite. Build paid campaigns, targeting, budgets, experiments, and delivery schedules in Meta Ads Manager; Business Suite is not a substitute for paid-ad setup.</div>
          </div>

          {/* Creative brief */}
          <div id="creative" className={`min-w-0 p-6 rounded-[24px] border flex flex-col ${dark?'bg-[#12152E] border-white/10':'bg-white border-black/5 shadow-sm'}`}>
            <div className="text-sm font-extrabold tracking-wide">04 <span className="opacity-40">/</span> INITIAL CREATIVE BRIEF</div>
            <div className="text-xs opacity-60">AI-assisted + human oversight · No fabricated ROAS, testimonials, or platform endorsements</div>

            <div className="mt-4 p-4 rounded-2xl bg-[#0B1134] text-white">
              <div className="text-[11px] font-bold tracking-wide opacity-60">IMAGE HEADLINE</div>
              <div className="text-lg font-extrabold leading-tight mt-1">London first.<br/>Your next customers next.</div>
              <div className="mt-3 text-xs leading-5 opacity-80">Running a London business leaves little time for constant ad testing. Get AI-assisted creative, local targeting, and clear weekly reporting for your Facebook and Instagram campaigns. Book a discovery call to discuss your goals and budget.</div>
              <div className="mt-4 flex gap-2">
                <span className="px-3 py-1 rounded-full bg-[#C6FF2D] text-[#0B1134] text-xs font-extrabold">Book Now if supported; otherwise use an available CTA</span>
                <span className="px-3 py-1 rounded-full bg-white/15 text-white text-xs font-bold">Local ads. Clearer decisions.</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2 text-center">
              {['Offer','Creative','Targeting','Measure','Optimise'].map((s,i)=>(
                <div key={s} className={`p-2 rounded-xl border ${i===0?'bg-[#C6FF2D] border-[#C6FF2D] text-[#0B1134]':'bg-[#F6F7FB] border-black/5'}`}>
                  <div className="text-[11px] font-extrabold">{i+1}</div>
                  <div className="text-[10px] font-bold leading-tight">{s}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-[11px] leading-4 opacity-60">
              Palette: Deep navy #0B1134 · Lime #C6FF2D · Clean type · Subtle London reference. AI imagery must not impersonate customers.
            </div>

            <div className={`mt-4 p-3 rounded-xl border text-xs ${dark?'bg-white/5 border-white/10':'bg-amber-50 border-amber-200'}`}>
              <b>Carousel:</b> 1. Start with your local market. 2. Make the offer clear. 3. Test image and video creative. 4. Track qualified enquiries. 5. Expand when results justify it.
            </div>
            <div className={`mt-3 p-3 rounded-xl border text-xs leading-5 ${dark?'bg-white/5 border-white/10':'bg-amber-50 border-amber-200'}`}>
              <b>Video outline:</b> 0–3s “London business. Limited time for ads?” → 3–10s show creative, targeting, reporting tasks → 10–18s AI assistance plus human review → 18–23s discovery-call invitation. Do not present illustrative screens as actual client results.
            </div>
          </div>
        </div>

        {/* 05 · BUDGET & OPTIMISATION */}
        <div id="budget" className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 mt-10">
          <div className={`p-6 sm:p-8 rounded-[24px] border ${dark?'bg-[#12152E] border-white/10':'bg-white border-black/5 shadow-sm'}`}>
            <div className="text-sm font-extrabold tracking-wide">05 <span className="opacity-40">/</span> BUDGET & OPTIMISATION RULES</div>
            <div className={`mt-1 text-xs ${dark?'text-white/60':'text-black/50'}`}>Budget and numeric thresholds are pending approval; this prototype does not control or monitor ad spend.</div>
            <div className="mt-5 grid md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-2xl border ${dark?'bg-white/5 border-white/10':'bg-[#F6F7FB] border-black/5'}`}>
                <div className="text-xs font-extrabold">BEFORE LAUNCH</div>
                <ul className="mt-2 space-y-2 text-xs leading-5 opacity-80">
                  <li>Agree the total media ceiling, maximum daily exposure, and written authority for changes.</li>
                  <li>80% principal conversion test / 20% challenger is provisional, only if the agreed budget is sufficient. With a small budget, test sequentially.</li>
                  <li>Do not allocate to retargeting until audience size and consent support it.</li>
                  <li>Set numeric pause and scale thresholds only after agreeing acceptable acquisition costs.</li>
                </ul>
              </div>
              <div className={`p-4 rounded-2xl border ${dark?'bg-white/5 border-white/10':'bg-[#F6F7FB] border-black/5'}`}>
                <div className="text-xs font-extrabold">OPERATING CADENCE</div>
                <ul className="mt-2 space-y-2 text-xs leading-5 opacity-80">
                  <li>Each working day: check delivery, broken links, rejected ads, tracking, pacing, and lead routing.</li>
                  <li>Twice weekly: review creative and audience tests; allow for the sales cycle and conversion reporting delay. Do not choose winners from clicks alone.</li>
                  <li>Pause for broken tracking/checkout, misleading creative, unsafe comments, or spend outside approved limits.</li>
                  <li>Document changes; require approval for total-spend increases or a new geographic stage. If performance weakens, return to the last viable allocation and inspect creative, offer, tracking, and follow-up.</li>
                </ul>
              </div>
            </div>
            <div className={`mt-4 p-4 rounded-2xl text-xs leading-5 ${dark?'bg-amber-400/10 text-amber-100':'bg-amber-50 border border-amber-200 text-amber-900'}`}>
              <b>Diagnostic only:</b> after allowing for lag, spending 2× the agreed target cost per qualified lead without a qualified lead triggers investigation; it is not statistical proof of failure. Reallocate within the approved ceiling toward qualified conversions and confirmed sales, not cheap engagement.
            </div>
            <div className={`mt-4 p-4 rounded-2xl text-xs leading-5 ${dark?'bg-[#C6FF2D] text-[#0B1134]':'bg-[#0B1134] text-white'}`}>
              Qualified-lead cost = spend ÷ qualified leads · Customer acquisition cost = spend ÷ attributed new customers · Revenue ROAS = attributed revenue ÷ ad spend, not profit. Use observed lead-to-sale rates against the agreed customer acquisition ceiling; account for service delivery costs, margins, refunds, and other marketing costs.
            </div>
          </div>
        </div>

        {/* 06 · WEEKLY REPORT */}
        <div id="reports" className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 mt-10">
          <div className={`rounded-[24px] border overflow-hidden ${dark?'bg-[#12152E] border-white/10':'bg-white border-black/5 shadow-sm'}`}>
            <div className="p-6 flex flex-wrap gap-3 justify-between items-center">
              <div>
                <div className="text-sm font-extrabold tracking-wide">06 <span className="opacity-40">/</span> WEEKLY REPORT TEMPLATE</div>
                <div className={`text-xs ${dark?'text-white/60':'text-black/50'}`}>Period: [dates] · Geography: [market] · Attribution setting: [window/source]</div>
              </div>
              <div className="flex gap-2">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-full border ${dark?'bg-white/5 border-white/10':'bg-white border-black/10'}`}>
                  <span className="text-xs">🔍</span>
                  <input value={searchTable} onChange={e=>setSearchTable(e.target.value)} placeholder="Find a metric..." className="bg-transparent outline-none text-xs font-medium w-[140px]" />
                </div>
                <button onClick={downloadReportTemplate} className="px-4 py-2 rounded-full bg-[#C6FF2D] text-[#0B1134] text-xs font-extrabold">Download CSV template</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className={`text-[11px] font-extrabold tracking-wide border-y ${dark?'bg-white/5 border-white/10':'bg-[#F6F7FB] border-black/5'}`}>
                  <tr>
                    <th className="text-left px-4 py-3">Metric</th>
                    <th className="text-left px-4 py-3">This week</th>
                    <th className="text-left px-4 py-3">Prior week</th>
                    <th className="text-left px-4 py-3">Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReportRows.map(row=>(
                    <tr key={row.metric} className={`border-b text-[13px] ${dark?'border-white/5 hover:bg-white/5':'border-black/5 hover:bg-black/[0.02]'}`}>
                      <td className="px-4 py-3 font-bold">{row.metric}</td>
                      <td className="px-4 py-3 font-mono">{row.current}</td>
                      <td className="px-4 py-3 font-mono">{row.prior}</td>
                      <td className="px-4 py-3 text-xs opacity-70">{row.interpretation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={`p-4 flex flex-wrap gap-3 text-xs items-center ${dark?'bg-white/[0.03]':'bg-[#F6F7FB]'}`}>
              <span className="font-bold">Summary:</span>
              <span>Three observations · two next actions · one decision needing approval</span>
              <span className="w-full">Break down by geography and creative where sample size permits. Reconcile Meta attribution with CRM and distinguish platform-attributed from verified revenue; neither proves incrementality.</span>
            </div>
          </div>
        </div>

        {/* HANDOVER */}
        <div id="handover" className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 mt-10 mb-12 grid lg:grid-cols-3 gap-4">
          <div className={`lg:col-span-2 p-6 rounded-[24px] border ${dark?'bg-[#12152E] border-white/10':'bg-white border-black/5 shadow-sm'}`}>
            <div className="text-sm font-extrabold tracking-wide">07 <span className="opacity-40">/</span> HANDOVER & ONGOING EXECUTION</div>
            <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
              <div className={`p-4 rounded-2xl border ${dark?'bg-white/5 border-white/10':'bg-[#F6F7FB] border-black/5'}`}>
                <div className="text-xs font-extrabold opacity-60">BEFORE ACTIVATION, SUPPLY</div>
                <ul className="mt-2 space-y-1.5 text-xs leading-5">
                  <li>• Website/booking URL, brand assets, and accurate business description</li>
                  <li>• Prior 30–90 days of results, if available</li>
                  <li>• Approved budget, reporting day, and approval turnaround</li>
                  <li>• Lead-response owner and escalation rules</li>
                </ul>
              </div>
              <div className="p-4 rounded-2xl bg-[#0B1134] text-white">
                <div className="text-xs font-bold opacity-70">THIS IS A BLUEPRINT, NOT ACTIVE SERVICE</div>
                <div className="text-xs leading-5 mt-2 opacity-80">Persistent monitoring, scheduled publishing and spend changes require an authorised operator or configured automation with appropriate access & safeguards. No unattended execution is established by this plan.</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="px-3 py-1 rounded-full bg-black text-white">Creative status: two 4:5 PNG concepts ready for review</span>
              <span className={`px-3 py-1 rounded-full border ${dark?'border-white/10':'border-black/10'}`}>Neither approved; confirm business details and destination before launch</span>
            </div>
          </div>

          <div className={`p-6 rounded-[24px] border ${dark?'bg-[#12152E] border-white/10':'bg-white border-black/5 shadow-sm'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-extrabold">READY-TO-REVIEW PNGS</div>
              <span className={`text-[10px] font-semibold ${dark?'text-white/50':'text-slate-500'}`}>1080 x 1350</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <a href="/creative-assets/option-a-london-first.png" download="london-first-ad.png" className="group block min-w-0" aria-label="Download Option A, London first, PNG">
                <img src="/creative-assets/option-a-london-first.png" alt="Option A ad: London first. Your next customers start with a clear plan." className="w-full aspect-[4/5] object-cover rounded-xl border border-black/10 shadow-sm transition group-hover:-translate-y-1 group-hover:shadow-md" />
                <span className="mt-2 flex items-center justify-between text-[11px] font-bold"><span>01 · London first</span><span aria-hidden="true">↓</span></span>
              </a>
              <a href="/creative-assets/option-b-clearer-decisions.png" download="clearer-decisions-ad.png" className="group block min-w-0" aria-label="Download Option B, Clearer decisions, PNG">
                <img src="/creative-assets/option-b-clearer-decisions.png" alt="Option B ad: Local ads. Clearer decisions." className="w-full aspect-[4/5] object-cover rounded-xl border border-black/10 shadow-sm transition group-hover:-translate-y-1 group-hover:shadow-md" />
                <span className="mt-2 flex items-center justify-between text-[11px] font-bold"><span>02 · Clearer decisions</span><span aria-hidden="true">↓</span></span>
              </a>
            </div>
            <div className={`mt-4 p-3 rounded-xl text-xs leading-5 border ${dark?'border-white/10 bg-white/5 text-white/70':'border-amber-200 bg-amber-50 text-amber-900'}`}>Draft concepts, not approved ads. Confirm business identity, claims, booking destination, and CTA before publishing.</div>
          </div>
        </div>

        <footer className={`border-t py-6 text-center text-xs opacity-60 ${dark?'border-white/10':'border-black/5'}`}>
          AI-Powered Local Ads Manager — First-month launch plan · English-language campaigns start in London · Facebook & Instagram via Meta Ads Manager only · Pixel & CAPI must not bypass consent · © 2026 Draft for approval
        </footer>
      </div>
    </div>
  )
}
