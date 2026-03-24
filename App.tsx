import { REGION_DATA } from './data/taxData';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, Treemap, LineChart, Line
} from 'recharts';
import { GoogleGenAI } from "@google/genai";
import { getProcessedData } from './data/taxData';
import StatCard from './components/StatCard';
import { DashboardData } from './types';

// Using colors closer to the reference image
const SEGMENT_COLORS: Record<string, string> = {
  'Corporate Tax': '#6366f1', // Indigo/Purple
  'Income Tax': '#10b981',    // Emerald/Green
  'Wealth Tax (Other)': '#94a3b8',
  'Wealth Tax (Agri)': '#cbd5e1'
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 shadow-2xl border border-slate-100 rounded-2xl min-w-[180px]">
        <p className="font-black text-slate-800 mb-2 pb-1 border-b border-slate-50">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <span className="text-[10px] font-bold text-slate-500 uppercase">{entry.name}</span>
            <span className="text-sm font-black text-indigo-600">
              {entry.name.includes('Assessees') ? entry.value.toLocaleString() : `₹${entry.value.toLocaleString()} Cr`}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const CustomizedContent = (props: any) => {
  const { x, y, width, height, index, name, value, total } = props;
  const percentage = ((value / total) * 100).toFixed(1);

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: SEGMENT_COLORS['Corporate Tax'],
          stroke: '#fff',
          strokeWidth: 2,
          opacity: 0.8 - (index * 0.1),
        }}
      />
      {width > 50 && height > 30 && (
        <>
          <text x={x + 10} y={y + 25} fill="#fff" fontSize={12} fontWeight="900" className="uppercase tracking-tighter">
            {name}
          </text>
          <text x={x + 10} y={y + 45} fill="#fff" fontSize={10} fontWeight="700" opacity={0.7}>
            {percentage}%
          </text>
        </>
      )}
    </g>
  );
};

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  feedback?: 'like' | 'dislike';
}

const App: React.FC = () => {
  const data: DashboardData = useMemo(() => getProcessedData(), []);
  const [selectedYear, setSelectedYear] = useState<string>("2018-19");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dash' | 'trend' | 'geo' | 'file'>('dash');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [chatView, setChatView] = useState<'current' | 'history'>('current');
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { role: 'model', text: 'Hello! I am Chat Buddy. I can analyze this tax data for you. How can I help today?', timestamp: new Date().toLocaleTimeString() }
  ]);
  const [fullLog, setFullLog] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isTyping, chatView]);

  const currentStats = useMemo(() => {
    const yearIndex = data.years.indexOf(selectedYear);
    const prevYear = yearIndex > 0 ? data.years[yearIndex - 1] : null;

    const currentTotalAmount = data.entries.reduce((acc, entry) => {
      const h = entry.history.find(yh => yh.year === selectedYear);
      return acc + (h?.amount || 0);
    }, 0);

    const currentTotalAssessees = data.entries.reduce((acc, entry) => {
      const h = entry.history.find(yh => yh.year === selectedYear);
      return acc + (h?.assessees || 0);
    }, 0);

    let amountGrowthValue = 0;
    let assesseesGrowthValue = 0;

    if (prevYear) {
      const prevTotalAmount = data.entries.reduce((acc, entry) => {
        const h = entry.history.find(yh => yh.year === prevYear);
        return acc + (h?.amount || 0);
      }, 0);
      const prevTotalAssessees = data.entries.reduce((acc, entry) => {
        const h = entry.history.find(yh => yh.year === prevYear);
        return acc + (h?.assessees || 0);
      }, 0);

      if (prevTotalAmount > 0) amountGrowthValue = ((currentTotalAmount - prevTotalAmount) / prevTotalAmount) * 100;
      if (prevTotalAssessees > 0) assesseesGrowthValue = ((currentTotalAssessees - prevTotalAssessees) / prevTotalAssessees) * 100;
    }

    return {
      totalAmount: currentTotalAmount,
      totalAssessees: currentTotalAssessees,
      amountTrend: `${amountGrowthValue >= 0 ? '+' : ''}${amountGrowthValue.toFixed(1)}%`,
      assesseesTrend: `${assesseesGrowthValue >= 0 ? '+' : ''}${assesseesGrowthValue.toFixed(1)}%`
    };
  }, [selectedYear, data]);

  const trendData = useMemo(() => {
    return data.years.map(year => {
      const totals: any = { year };
      data.entries.forEach(entry => {
        const found = entry.history.find(h => h.year === year);
        totals[entry.taxType] = found?.amount || 0;
        totals[`${entry.taxType} Assessees`] = found?.assessees || 0;
      });
      totals.displayValue = filterCategory 
        ? (totals[filterCategory] || 0) 
        : data.entries.reduce((acc, entry) => acc + (entry.history.find(h => h.year === year)?.amount || 0), 0);
      totals.Total = data.entries.reduce((acc, entry) => acc + (entry.history.find(h => h.year === year)?.amount || 0), 0);
      return totals;
    });
  }, [data, filterCategory]);

  const compositionData = useMemo(() => {
    return data.entries.map((entry) => {
      const yearData = entry.history.find(h => h.year === selectedYear);
      const value = yearData?.amount || 0;
      const percentage = currentStats.totalAmount > 0 ? ((value / currentStats.totalAmount) * 100).toFixed(1) : "0.0";
      return {
        name: entry.taxType,
        value,
        percentage,
        color: SEGMENT_COLORS[entry.taxType] || '#cbd5e1'
      };
    }).filter(item => item.value > 0);
  }, [data, selectedYear, currentStats.totalAmount]);

const regionData = useMemo(() => {
  const rows = REGION_DATA.filter(r => r.year === selectedYear);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return rows.map(r => ({
    name: r.state,
    value: r.amount,
    total
  }));
}, [selectedYear]);

  const buildChatContext = () => {
  return data.years.map(year => {
    const yearSummary = data.entries.map(e => {
      const h = e.history.find(x => x.year === year);
      return {
        taxType: e.taxType,
        amount: h?.amount || 0,
        assessees: h?.assessees || 0
      };
    });

    return {
      year,
      summary: yearSummary
    };
  });
};

const extractYearFromMessage = (message: string) => {
  return data.years.find(y => message.includes(y));
};
const applyChatUIActions = (message: string) => {
  const m = message.toLowerCase();
if (m.includes("pending") || m.includes("verified") || m.includes("cases") || m.includes("ledger")) {
    setActiveTab("file");
  }
  
  // ---- tab switching ----
  if (m.includes("growth") || m.includes("tr5end")) {
    setActiveTab("trend");
  }

  if (m.includes("region") || m.includes("map")|| m.includes("state") ) {
    setActiveTab("geo");
  }

  if (m.includes("filing") || m.includes("audit") || m.includes("record")|| m.includes("officer")) {
    setActiveTab("file");
  }

  if (m.includes("dashboard") || m.includes("overview")) {
    setActiveTab("dash");
  }

  // ---- year sync ----
  const detectedYear = data.years.find(y => m.includes(y.toLowerCase()));
  if (detectedYear) {
    setSelectedYear(detectedYear);
  }

  // ---- tax category sync ----
  const categories = data.entries.map(e => e.taxType);

  const foundCategory = categories.find(c =>
    m.includes(c.toLowerCase())
  );

  if (foundCategory) {
    setFilterCategory(foundCategory);
  }
};


  const handleSendMessage = async () => {
    
    
    if (!inputValue.trim()) return;
    const userMessage = inputValue;
    applyChatUIActions(userMessage);

    const timestamp = new Date().toLocaleTimeString();
    const detectedYear = extractYearFromMessage(userMessage);

if (detectedYear) {
  setSelectedYear(detectedYear);
}

    setInputValue('');
    
    const newUserMsg: ChatMessage = { role: 'user', text: userMessage, timestamp };
    setChatHistory(prev => [...prev, newUserMsg]);
    setFullLog(prev => [...prev, newUserMsg]);
    setIsTyping(true);
    
  
    const lowerInput = userMessage.toLowerCase();
    
    if (lowerInput.includes("who build u") || lowerInput.includes("who built you") || lowerInput.includes("who created you")) {
      setTimeout(() => {
        const aiMsg: ChatMessage = { role: 'model', text: 'Nikhil Shivnani has build me', timestamp: new Date().toLocaleTimeString() };
        setChatHistory(prev => [...prev, aiMsg]);
        setFullLog(prev => [...prev, aiMsg]);
        setIsTyping(false);
      }, 800);
      return;
    }
    const m = userMessage.toLowerCase();
    
    try {
      const ai = new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
     const allYearsContext = buildChatContext();
    
const systemInstruction = `
You are Chat Buddy, a professional tax analyst for the Income Tax Department.
- Never say that you are a large language model.
- Never mention Google, Gemini, or your training source.
- Speak only as "Chat Buddy".
- if asked who made you or who build you speak as "Nikhil has build me and he is not responsible for any misinformation , Nikhil is my love ❤️      "  
You have complete historical tax data for ALL years.

DATA (JSON):
${JSON.stringify(allYearsContext)} 
- REGIONAL DATA: ${JSON.stringify(regionData)}
- AUDIT RECORDS: ${JSON.stringify([
  { id: 'TX-CO-1000', cat: 'Corporate Tax', officer: 'V. Sharma', status: 'VERIFIED', amount: 10136 },
  { id: 'TX-CO-1001', cat: 'Corporate Tax', officer: 'A. Gupta', status: 'PENDING',  amount: 11331 },
  { id: 'TX-CO-1002', cat: 'Corporate Tax', officer: 'R. Mehra', status: 'VERIFIED', amount: 10957 },
  { id: 'TX-CO-1003', cat: 'Corporate Tax', officer: 'S. Iyer',  status: 'VERIFIED', amount: 9030 },
  { id: 'TX-IN-1000', cat: 'Income Tax',    officer: 'R. Sodhi', status: 'VERIFIED', amount: 7678 }
])}

 - YEARLY SUMMARIES: ${JSON.stringify(buildChatContext())}
UI selected year is: ${selectedYear}
UI CAPABILITIES:
- You can switch tabs. If the user asks for "maps", "regions", "records", or "filings", identify their intent.
- Current active tab: ${activeTab}
- Current selected year: ${selectedYear}
Important rules:
- Available years are:
${data.years.join(", ")}
- The user may ask about ANY of the above years.
- If the user's message contains one of the available years, you MUST use that year.
- Only if the user does NOT mention any year, use the UI selected year.
- Do NOT restrict answers to the UI selected year if a year is mentioned.
- If the mentioned year is not in the available years, clearly say it does not exist.
ANALYTICAL RULES:
- RANKINGS: When asked for "highest", "second highest", or "least", sort the 'amount' values for that specific year and identify the correct tax category.
- AUDIT RECORDS:
  Each record contains:
  id, cat, officer, status and audited amount.
  If the user asks for highest / lowest / maximum / minimum audit case,
  rank the audited amount and return the corresponding officer and transaction id.
  Do NOT assume taxpayer names exist.
.
- MATHEMATICS: If asked for "average per user", divide 'amount' by 'assessees'.
- TONE: Be concise and use Markdown tables or bullet points for comparisons.
- If asked about "Who is the officer for TX-CO-1000", check Audit Records.
- If asked about "Which state has highest tax", refer to Regional Data.
- Be professional and concise.

`;


      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        config: { systemInstruction }
      });
      


      const aiMsg: ChatMessage = { 
        role: 'model', 
        text: response.text || "I'm sorry, I couldn't understand that.", 
        timestamp: new Date().toLocaleTimeString() 
      };
      setChatHistory(prev => [...prev, aiMsg]);
      setFullLog(prev => [...prev, aiMsg]);
    } catch (error) {
      console.log(error)
      setChatHistory(prev => [...prev, { role: 'model', text: "Service temporarily unavailable. Please check your connection.", timestamp: new Date().toLocaleTimeString() }]);
    } finally {
      setIsTyping(false);
    }
  };
  
  const handleFeedback = (index: number, type: 'like' | 'dislike') => {
    setChatHistory(prev => prev.map((msg, i) => i === index ? { ...msg, feedback: type } : msg));
  };
   
  const renderDashboard = () => (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Revenue Growth (YoY)" value={`₹${currentStats.totalAmount.toLocaleString()} Cr`} icon="fa-solid fa-sack-dollar" trend={currentStats.amountTrend} color="bg-indigo-600" />
        <StatCard title="Taxpayer Count" value={currentStats.totalAssessees.toLocaleString()} icon="fa-solid fa-users" trend={currentStats.assesseesTrend} color="bg-emerald-500" />
        <StatCard title="Compliance Risk" value="Low" icon="fa-solid fa-shield-halved" trendLabel="Stable" color="bg-amber-500" />
        <StatCard title="Active Audits" value="2,104" icon="fa-solid fa-clipboard-check" color="bg-rose-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">
              {filterCategory ? `${filterCategory} Trend` : 'Total Tax Trend'}
            </h3>
            {filterCategory && (
              <button onClick={() => setFilterCategory(null)} className="px-5 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black hover:bg-indigo-100 transition-colors">Reset Category Filter</button>
            )}
          </div>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} onClick={(s) => s?.activeLabel && setSelectedYear(String(s.activeLabel))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} />
                <Tooltip content={<CustomTooltip />} cursor={{fill: '#f8fafc'}} />
                <Bar dataKey="displayValue" fill="#e2e8f0" radius={[10, 10, 0, 0]} barSize={55}>
                  {trendData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.year === selectedYear ? '#6366f1' : '#e2e8f0'} className="cursor-pointer transition-all hover:opacity-80" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col">
          <h3 className="text-2xl font-black text-slate-800 mb-2">Revenue Split ({selectedYear})</h3>
          <p className="text-sm text-slate-400 font-bold mb-10">Distribution across primary tax domains</p>
          <div className="h-[260px] w-full relative mb-12">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={compositionData} innerRadius={80} outerRadius={110} paddingAngle={8} dataKey="value" stroke="none" cornerRadius={8} onClick={(e) => setFilterCategory(e.name === filterCategory ? null : e.name)}>
                  {compositionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} className={`cursor-pointer transition-all hover:opacity-90 ${filterCategory && filterCategory !== entry.name ? 'opacity-30' : ''}`} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total CR</span>
              <span className="text-3xl font-black text-slate-900 tracking-tight">₹{currentStats.totalAmount.toLocaleString()}</span>
            </div>
          </div>
          
          <div className="space-y-8 px-2">
            {compositionData.map((entry, i) => (
              <div key={i} className="flex items-center justify-between group cursor-pointer" onClick={() => setFilterCategory(entry.name === filterCategory ? null : entry.name)}>
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                  <span className={`text-base font-bold transition-colors ${filterCategory === entry.name ? 'text-indigo-600' : 'text-slate-700'}`}>{entry.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">₹{entry.value.toLocaleString()}</p>
                  <p className="text-[11px] font-bold text-slate-400 tracking-tight">{entry.percentage}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderGrowth = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
        <h3 className="text-2xl font-black text-slate-900 mb-2">Growth Trajectory Analysis</h3>
        <p className="text-slate-400 font-bold mb-10">Comparing long-term performance across major tax segments (Rs. in Crores)</p>
        <div className="h-[500px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SEGMENT_COLORS['Corporate Tax']} stopOpacity={0.1}/>
                  <stop offset="95%" stopColor={SEGMENT_COLORS['Corporate Tax']} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SEGMENT_COLORS['Income Tax']} stopOpacity={0.1}/>
                  <stop offset="95%" stopColor={SEGMENT_COLORS['Income Tax']} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="Corporate Tax" stroke={SEGMENT_COLORS['Corporate Tax']} strokeWidth={4} fillOpacity={1} fill="url(#colorTotal)" />
              <Area type="monotone" dataKey="Income Tax" stroke={SEGMENT_COLORS['Income Tax']} strokeWidth={4} fillOpacity={1} fill="url(#colorIncome)" />
              <Area type="monotone" dataKey="Total" stroke="#1e293b" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const renderGeo = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
        <h3 className="text-2xl font-black text-slate-900 mb-2">Geographic Revenue Distribution</h3>
        <p className="text-slate-400 font-bold mb-10">Estimated contribution breakdown by major regions (Simulated for FY {selectedYear})</p>
        <div className="h-[600px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={regionData}
              dataKey="value"
              aspectRatio={4 / 3}
              stroke="#fff"
              content={<CustomizedContent />}
            >
              <Tooltip content={<CustomTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const renderFilings = () => (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="flex justify-between items-start mb-12">
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Tax Filing Ledger</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">AGGREGATE VIEW • FY {selectedYear}</p>
          </div>
          <button className="bg-indigo-600 text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-lg shadow-indigo-100 uppercase tracking-widest">Active Audit Period</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                <th className="pb-6 pr-4">Tax Category</th>
                <th className="pb-6 px-4">Total Assessees</th>
                <th className="pb-6 px-4">Revenue (CR)</th>
                <th className="pb-6 px-4">Avg Per User</th>
                <th className="pb-6 pl-4">Compliance Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
{data.entries
  .filter(e => !filterCategory || e.taxType === filterCategory)
  .map((entry, idx) => {
                const yearData = entry.history.find(h => h.year === selectedYear) || { amount: 0, assessees: 0 };
                const avg = yearData.assessees > 0 ? (yearData.amount / yearData.assessees).toFixed(5) : '0';
                return (
                  <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="py-6 pr-4">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center"></div>
                        <span className="font-black text-slate-800 text-sm">{entry.taxType}</span>
                      </div>
                    </td>
                    <td className="py-6 px-4 font-bold text-slate-600 text-sm">{yearData.assessees.toLocaleString()}</td>
                    <td className="py-6 px-4 font-black text-indigo-600 text-sm">₹{yearData.amount.toLocaleString()}</td>
                    <td className="py-6 px-4 font-bold text-slate-400 text-[10px]">₹{avg}</td>
                    <td className="py-6 pl-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[120px]">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: '92%' }}></div>
                        </div>
                        <span className="font-black text-emerald-500 text-[10px]">92%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

     

      <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="flex justify-between items-start mb-12">
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Granular Audit Records</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Detailed transaction trail for FY {selectedYear}</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-100 rounded-xl text-[10px] font-black text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-widest">
            <i className="fa-solid fa-download"></i> Export Logs
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                <th className="pb-6 pr-4">Transaction ID</th>
                <th className="pb-6 px-4">Category</th>
                <th className="pb-6 px-4">Audited Amount</th>
                <th className="pb-6 px-4">Timestamp</th>
                <th className="pb-6 px-4">Assigned Officer</th>
                <th className="pb-6 pl-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                { id: `TX-${selectedYear}-CO-1000`, cat: 'Corporate Tax', amt: '₹10,136 Cr', time: '2018-04-12 09:45', officer: 'V. Sharma', status: 'VERIFIED', color: 'bg-emerald-50 text-emerald-500' },
                { id: `TX-${selectedYear}-CO-1001`, cat: 'Corporate Tax', amt: '₹11,331 Cr', time: '2018-05-12 09:45', officer: 'A. Gupta', status: 'PENDING', color: 'bg-amber-50 text-amber-500' },
                { id: `TX-${selectedYear}-CO-1002`, cat: 'Corporate Tax', amt: '₹10,957 Cr', time: '2018-06-12 09:45', officer: 'R. Mehra', status: 'VERIFIED', color: 'bg-emerald-50 text-amber-500' },
                { id: `TX-${selectedYear}-CO-1003`, cat: 'Corporate Tax', amt: '₹9,030 Cr', time: '2018-07-12 09:45', officer: 'S. Iyer', status: 'VERIFIED', color: 'bg-emerald-50 text-emerald-500' },
                { id: `TX-${selectedYear}-IN-1000`, cat: 'Income Tax', amt: '₹7,678 Cr', time: '2018-04-12 09:45', officer: 'R.SODHI', status: 'VERIFIED', color: 'bg-emerald-50 text-emerald-500' },
              ].map((row, i) => (
                <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="py-6 pr-4 font-bold text-slate-400 text-[10px] tracking-tight">{row.id}</td>
                  <td className="py-6 px-4 font-black text-slate-800 text-sm">{row.cat}</td>
                  <td className="py-6 px-4 font-black text-slate-800 text-sm">{row.amt}</td>
                  <td className="py-6 px-4 font-bold text-slate-400 text-[10px]">{row.time}</td>
                  <td className="py-6 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">{row.officer.split(' ')[0][0]}</div>
                      <span className="font-black text-slate-800 text-sm">{row.officer}</span>
                    </div>
                  </td>
                  <td className="py-6 pl-4 text-right">
                    <span className={`text-[8px] font-black px-3 py-1 rounded-lg uppercase tracking-widest ${row.color}`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] flex overflow-hidden max-h-screen">
      <aside className={`${isSidebarOpen ? 'w-96' : 'w-24'} bg-white border-r border-slate-200 transition-all duration-300 flex flex-col z-20 shadow-sm shrink-0`}>
        <div className="p-8 flex items-center gap-4 shrink-0">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100 shrink-0">
            <i className="fa-solid fa-building-columns text-xl"></i>
          </div>
          {isSidebarOpen && (
            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
              <span className="font-black text-slate-900 text-lg leading-tight block uppercase tracking-tighter">Income Tax<br/>Department</span>
            </div>
          )}
        </div>

        <nav className="px-5 py-4 space-y-2 shrink-0">
          {[
            { id: 'dash', label: 'Dashboard', icon: 'chart-pie' },
            { id: 'trend', label: 'Growth', icon: 'chart-line' },
            { id: 'geo', label: 'Region Map', icon: 'location-dot' },
            { id: 'file', label: 'Tax Filings', icon: 'file-invoice-dollar' },
          ].map((item) => (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl transition-all ${activeTab === item.id ? 'bg-[#5c67f2] text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}>
              <i className={`fa-solid fa-${item.icon} text-lg shrink-0`}></i>
              {isSidebarOpen && <span className="font-bold text-sm">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Chat Buddy Container - Takes most space */}
        <div className="flex-1 px-4 py-2 overflow-hidden flex flex-col min-h-0 border-t border-slate-50">
          {isSidebarOpen && (
            <div className="flex-1 flex flex-col bg-slate-50/50 rounded-3xl border border-slate-100 overflow-hidden shadow-inner">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white/80 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Chat Buddy</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setChatView(chatView === 'current' ? 'history' : 'current')} className="text-slate-300 hover:text-indigo-600 transition-colors">
                    <i className={`fa-solid ${chatView === 'current' ? 'fa-history' : 'fa-comments'} text-xs`}></i>
                  </button>
                  <button onClick={() => setChatHistory([{ role: 'model', text: 'Chat reset. Hello!', timestamp: new Date().toLocaleTimeString() }])}>
                    <i className="fa-solid fa-trash-can text-[10px] text-slate-300 hover:text-rose-400"></i>
                  </button>
                </div>
              </div>
              
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
                {chatView === 'current' ? (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[90%] px-4 py-3 rounded-2xl text-[13px] font-medium shadow-sm leading-relaxed ${
                        msg.role === 'user' ? 'bg-[#5c67f2] text-white rounded-br-none' : 'bg-white text-slate-800 border border-slate-100 rounded-bl-none'
                      }`}>
                        {msg.text}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 px-1">
                        <span className="text-[9px] font-bold text-slate-400 opacity-60 uppercase">{msg.timestamp}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  fullLog.map((msg, i) => (
                    <div key={i} className="bg-white/50 p-3 rounded-xl border border-slate-100 mb-2">
                      <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">{msg.role} • {msg.timestamp}</p>
                      <p className="text-[12px] text-slate-600 line-clamp-2">{msg.text}</p>
                    </div>
                  ))
                )}
                {isTyping && <div className="text-xs text-slate-400 font-bold italic animate-pulse">Buddy is thinking...</div>}
              </div>

              <div className="p-3 bg-white border-t border-slate-200 shrink-0">
                <div className="relative flex items-center">
                  <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()  } placeholder="Ask Chat Buddy..." className="w-full pl-4 pr-10 py-3 bg-slate-100 border-none rounded-xl text-[13px] font-bold text-slate-900 focus:ring-2 focus:ring-indigo-200 outline-none" />
                  <button onClick={handleSendMessage} disabled={isTyping} className="absolute right-1 p-2 text-indigo-700 hover:scale-110 active:scale-95 transition-all"><i className="fa-solid fa-paper-plane"></i></button>
                </div>
              </div>
            </div>
          )}

        </div>

        <div className="py-2 px-6 border-t border-slate-100 shrink-0">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="w-full flex items-center justify-center p-2 text-slate-200 hover:text-indigo-600 transition-all">
            <i className={`fa-solid fa-chevron-${isSidebarOpen ? 'left' : 'right'} text-sm`}></i>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col">
        <div className="p-8 lg:p-12 flex-1">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-4">Executive Overview</h1>
              <p className="text-slate-400 font-bold">Viewing results for fiscal period: <span className="text-indigo-600 font-black">{selectedYear}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
              {data.years.map(year => (
                <button key={year} onClick={() => setSelectedYear(year)} className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${selectedYear === year ? 'bg-[#5c67f2] text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:bg-slate-50'}`}>{year}</button>
              ))}
            </div>
          </header>

          {activeTab === 'dash' && renderDashboard()}
          {activeTab === 'trend' && renderGrowth()}
          {activeTab === 'geo' && renderGeo()}
          {activeTab === 'file' && renderFilings()}
        </div>

        <footer className="bg-white border-t border-slate-100 px-12 py-10 shrink-0">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-6">
              <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-2xl shadow-lg">T</div>
              <div>
                <p className="text-slate-900 font-black text-lg leading-tight uppercase">Income Tax Department</p>
                <p className="text-slate-400 font-bold text-[10px] tracking-widest uppercase">Satyamev Jayate</p>
              </div>
            </div>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">© MPSEDC</p>
          </div>
        </footer>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }
      `}</style>
    </div>
  );
};

export default App;
