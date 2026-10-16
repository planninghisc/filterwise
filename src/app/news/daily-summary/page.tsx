// src/app/news/daily-summary/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { classifySentiment } from '@/lib/news/sentiment'
import { isResearchArticle } from '@/lib/news/research'
import { BarChart, Bar, Line, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Newspaper, Search, Beaker, Calendar, ChevronDown, ChevronUp, Copy, TrendingUp, TrendingDown, Minus } from 'lucide-react'

// 1. 감성 분석 (규칙: src/lib/news/sentiment.ts)
const SENTIMENT_STYLE = {
    긍정: { label: '긍정', color: 'text-green-700 bg-green-50 border-green-200', emoji: '🙂' },
    부정: { label: '부정', color: 'text-red-700 bg-red-50 border-red-200', emoji: '🙁' },
    중립: { label: '중립', color: 'text-gray-600 bg-gray-50 border-gray-200', emoji: '😐' },
} as const;

// 2. 날짜/텍스트 유틸리티
const toKSTString = (date?: Date | string | null) => {
    const d = date ? new Date(date) : new Date();
    const kstDate = new Date(d.getTime() + (9 * 60 * 60 * 1000));
    return kstDate.toISOString().split('T')[0];
}

const cleanText = (text: string | null) => {
    if (!text) return '';
    let cleaned = text.replace(/<[^>]*>?/gm, '');
    cleaned = cleaned.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#039;/gi, "'").replace(/&#39;/gi, "'");
    return cleaned.trim();
}

const HighlightText = ({ text, keyword }: { text: string, keyword: string }) => {
  if (!keyword || !text) return <>{text}</>
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedKeyword})`, 'gi'))
  return <>{parts.map((part, i) => part.toLowerCase() === keyword.toLowerCase() ? <span key={i} className="bg-orange-100 text-orange-700 font-bold px-0.5 rounded">{part}</span> : part)}</>
}

const groupArticlesByTitle = (articles: any[]) => {
    const groups: Record<string, any[]> = {};
    articles.forEach(item => {
        const key = cleanText(item.title);
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    });
    return Object.values(groups);
}

// 3. 기사 카드 컴포넌트 (컴팩트 스타일 적용)
const ArticleCard = ({ articles, keyword }: { articles: any[], keyword: string }) => {
    const mainItem = articles[0]; 
    const duplicateCount = articles.length - 1; 
    const titleText = cleanText(mainItem.title);
    const contentText = cleanText(mainItem.content || mainItem.snippet || ''); 
    const sentiment = SENTIMENT_STYLE[classifySentiment(titleText, contentText)];

    return (
        <a href={mainItem.source_url} className="block p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:border-orange-200 transition-all group relative overflow-hidden">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="text-[15px] font-bold text-gray-800 group-hover:text-orange-700 leading-snug break-keep flex-1">
              <HighlightText text={titleText} keyword={keyword} />
            </h3>
            <span className={`shrink-0 flex items-center gap-1 ${sentiment.color} text-[11px] px-1.5 py-0.5 rounded-md font-bold self-start border shadow-sm`}>
                <span className="text-[12px]">{sentiment.emoji}</span> {sentiment.label}
            </span>
            {duplicateCount > 0 && <span className="shrink-0 flex items-center gap-1 bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-md font-bold self-start"><Copy className="w-2.5 h-2.5" /> +{duplicateCount}</span>}
          </div>
          <p className="text-xs text-gray-500 line-clamp-2 mb-2 leading-relaxed">{contentText ? <HighlightText text={contentText} keyword={keyword} /> : '내용 없음'}</p>
          <div className="flex justify-between items-center text-[11px] text-gray-400 border-t border-gray-50 pt-2">
            <div className="flex items-center gap-2">
                <span className="bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded font-medium">{mainItem.publisher || '네이버 뉴스'}</span>
                {duplicateCount > 0 && <span className="text-gray-300">외 {duplicateCount}개 매체</span>}
            </div>
            <span className="font-medium">{new Date(mainItem.published_at).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})}</span>
          </div>
        </a>
    )
}

// 4. 메인 페이지
export default function DailySummaryPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-orange-600">데이터를 불러오는 중...</div>}>
      <SummaryContent />
    </Suspense>
  )
}

function SummaryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dateParam = searchParams.get('date') || toKSTString(new Date());
  
  const [keyword, setKeyword] = useState('한화') 
  const [generalGroups, setGeneralGroups] = useState<any[][]>([])
  const [researchGroups, setResearchGroups] = useState<any[][]>([])
  const [chartData, setChartData] = useState<any[]>([])
  
  const [stockInfo, setStockInfo] = useState<{ price: number, diff: number, rate: number, date: string } | null>(null)
  
  const [loading, setLoading] = useState(true)
  const [isResearchOpen, setIsResearchOpen] = useState(true)

  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {};
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate) router.push(`?date=${newDate}`);
  }

  useEffect(() => {
    if (!dateParam) return

    const fetchData = async () => {
      setLoading(true)
      const startISO = `${dateParam}T00:00:00+09:00`
      const endISO = `${dateParam}T23:59:59+09:00`

      const { data: todayNews } = await supabase.from('news_articles').select('*').gte('published_at', startISO).lte('published_at', endISO).order('published_at', { ascending: false })

      if (todayNews) {
        const groupedArticles = groupArticlesByTitle(todayNews);
        const general: any[][] = [];
        const research: any[][] = [];
        groupedArticles.forEach((group) => {
            const mainItem = group[0];
            const isManualGeneral = group.some((item: any) => item.category === 'general'); 
            const isManualResearch = group.some((item: any) => item.category === 'research'); 
            // 우리 회사 리서치가 다뤄진 기사인지 (규칙: src/lib/news/research.ts)
            const hasKeyword = isResearchArticle(mainItem.title, mainItem.content || mainItem.description || '');

            if (isManualGeneral) general.push(group);
            else if (isManualResearch || hasKeyword) research.push(group);
            else general.push(group);
        });
        setGeneralGroups(general);
        setResearchGroups(research);
      }

      // 주가 데이터
      let stockMap: Record<string, number> = {};
      let stockDates: string[] = [];
      try {
        const stockRes = await fetch(`/api/stock/history?code=003530`); 
        const stockJson = await stockRes.json();
        if (stockJson.success) {
            stockJson.data.forEach((s: any) => {
                stockMap[s.date] = s.price;
                stockDates.push(s.date);
            });
            stockJson.data.sort((a: any, b: any) => b.date.localeCompare(a.date));
            stockDates.sort();

            if (stockJson.data.length >= 2) {
                const todayStock = stockJson.data[0];
                const prevStock = stockJson.data[1];
                setStockInfo({
                    price: todayStock.price,
                    diff: todayStock.price - prevStock.price,
                    rate: ((todayStock.price - prevStock.price) / prevStock.price) * 100,
                    date: todayStock.date // 주가 기준 날짜 (12.30 등)
                });
            }
        }
      } catch (e) { console.error(e); }

      const endDateObj = new Date(dateParam);
      const dailyCounts: any[] = [];
      for (let i = 6; i >= 0; i--) {
          const d = new Date(endDateObj);
          d.setDate(endDateObj.getDate() - i);
          const kstKey = toKSTString(d);
          let price = stockMap[kstKey];
          if (!price) {
              const pastDates = stockDates.filter(sd => sd < kstKey);
              if (pastDates.length > 0) price = stockMap[pastDates[pastDates.length - 1]];
          }
          dailyCounts.push({
              date: kstKey,
              displayDate: kstKey.slice(5),
              price: price || null,
              count: 0,
              isToday: kstKey === dateParam
          });
      }

      const startDateObj = new Date(endDateObj);
      startDateObj.setDate(endDateObj.getDate() - 6);
      const startStatISO = `${startDateObj.toISOString().split('T')[0]}T00:00:00+09:00`
      const { data: statsRaw } = await supabase.from('news_articles').select('published_at').gte('published_at', startStatISO).lte('published_at', endISO)

      if (statsRaw) {
        statsRaw.forEach((item: any) => {
            const dateKey = toKSTString(item.published_at);
            const target = dailyCounts.find(d => d.date === dateKey);
            if (target) target.count++;
        })
      }

      setChartData(dailyCounts)
      setLoading(false)
    }

    fetchData()
  }, [dateParam, supabase])

  const totalArticlesCount = generalGroups.reduce((acc, g) => acc + g.length, 0) + researchGroups.reduce((acc, g) => acc + g.length, 0);

  const getStockColorClass = (diff: number) => {
      if (diff > 0) return 'text-red-600 bg-red-50 border-red-200';
      if (diff < 0) return 'text-blue-600 bg-blue-50 border-blue-200';
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }

  return (
    <div className="min-h-screen bg-orange-50/50 pb-20">
      <div className="max-w-3xl mx-auto p-4 md:p-4"> {/* ✅ [수정] 전체 패딩 축소 */}
        
        {/* ✅ [수정] 헤더 패딩 및 마진 축소 */}
        <header className="mb-4 bg-white p-4 rounded-2xl shadow-sm border border-orange-100 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"> {/* 텍스트 사이즈 축소 */}
              <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">Daily Briefing</span>
            </div>
            
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex flex-col sm:flex-row sm:items-end gap-2"> {/* 텍스트 xl로 축소 */}
              <span>📰 <span className="text-orange-600">뉴스 리포트</span></span>
              
              {stockInfo && (
                <div className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-sm ml-0 sm:ml-2 ${getStockColorClass(stockInfo.diff)}`}>
                    {/* ✅ [추가] 날짜 표시 (예: 12.30) */}
                    <span className="text-gray-500 font-medium mr-1">{stockInfo.date.slice(5).replace('-','.')} 종가:</span>
                    <span className="font-bold">{stockInfo.price.toLocaleString()}</span>
                    <span className="flex items-center text-xs font-semibold">
                        {stockInfo.diff > 0 && <TrendingUp className="w-3 h-3 mr-0.5" />}
                        {stockInfo.diff < 0 && <TrendingDown className="w-3 h-3 mr-0.5" />}
                        {stockInfo.diff === 0 && <Minus className="w-3 h-3 mr-0.5" />}
                        {stockInfo.diff > 0 ? '+' : ''}{stockInfo.diff.toLocaleString()} ({stockInfo.diff > 0 ? '+' : ''}{stockInfo.rate.toFixed(2)}%)
                    </span>
                </div>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded-xl border border-gray-200 self-start sm:self-auto">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input 
                type="date" 
                value={dateParam} 
                onChange={handleDateChange} 
                className="bg-transparent border-none text-gray-700 font-bold focus:ring-0 outline-none cursor-pointer text-sm" 
            />
          </div>
        </header>

        {/* ✅ [수정] 검색창 여백 및 높이 축소 */}
        <div className="mb-4 flex gap-2 sticky top-4 z-10 shadow-sm rounded-xl bg-white">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                    type="text" 
                    value={keyword} 
                    onChange={(e) => setKeyword(e.target.value)} 
                    placeholder="결과 내 검색" 
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm transition-all bg-transparent" 
                />
            </div>
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-40 bg-white rounded-2xl shadow-sm" />
            <div className="h-24 bg-white rounded-xl shadow-sm" />
          </div>
        ) : (
          <div className="space-y-4"> {/* 섹션 간격 축소 */}
            <section className="bg-white p-4 rounded-2xl shadow-sm border border-orange-100/50"> {/* 패딩 축소 */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-orange-600" />
                    <h2 className="text-base font-bold text-gray-800"> {/* 폰트 축소 */}
                        주가 & 뉴스 추이 <span className="text-xs font-normal text-gray-400">({chartData[0]?.displayDate} ~ {chartData[6]?.displayDate})</span>
                    </h2>
                </div>
                <div className="flex gap-2 text-[11px] font-medium bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 self-start md:self-auto">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-200 rounded-sm"></span>뉴스량(좌)</span>
                    <span className="w-px h-2.5 bg-gray-300"></span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-[2px] bg-orange-600 rounded-full"></span>주가(우)</span>
                </div>
              </div>

              {/* ✅ [수정] 차트 높이 축소 (280px -> 200px) */}
              <div className="h-[200px] w-full"> 
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                    <XAxis dataKey="displayDate" tick={{fontSize: 11, fill: '#6b7280', fontWeight: 600}} axisLine={false} tickLine={false} dy={5} />
                    <YAxis yAxisId="left" orientation="left" tick={{fontSize: 11, fill: '#9ca3af'}} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} hide />
                    
                    <Tooltip 
                      cursor={{fill: '#fff7ed', opacity: 0.5}}
                      contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '6px 10px'}}
                      labelStyle={{color: '#6b7280', fontSize: '0.8rem', marginBottom: '2px'}}
                      itemStyle={{fontSize: '0.85rem', fontWeight: 'bold'}}
                    />
                    
                    <Bar yAxisId="left" dataKey="count" name="뉴스 개수" radius={[4, 4, 0, 0]} maxBarSize={30}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.isToday ? 'url(#colorToday)' : '#fed7aa'} className="transition-all duration-300 hover:opacity-80"/>
                      ))}
                    </Bar>
                    
                    <Line 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="price" 
                        name="종가" 
                        stroke="#ea580c" 
                        strokeWidth={2} 
                        dot={{r: 3, fill: '#ea580c', strokeWidth: 2, stroke: '#fff'}} 
                        activeDot={{r: 5, fill: '#ea580c', stroke: '#fff', strokeWidth: 2}}
                        connectNulls={true} 
                    />

                    <defs>
                      <linearGradient id="colorToday" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ea580c" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0.8}/>
                      </linearGradient>
                    </defs>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-orange-600" />
                    <h2 className="text-base font-bold text-gray-800">
                        일반 기사 <span className="text-gray-500 text-xs font-medium">({generalGroups.length}건)</span>
                    </h2>
                </div>
              </div>

              {generalGroups.length === 0 ? (
                <div className="text-center py-8 bg-white rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-sm">
                  <p>일반 기사가 없습니다.</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {generalGroups.map((group, idx) => (
                    <ArticleCard key={idx} articles={group} keyword={keyword} />
                  ))}
                </div>
              )}
            </section>

            <section className="mt-4">
                <button onClick={() => setIsResearchOpen(!isResearchOpen)} className="w-full flex items-center justify-between bg-purple-50 p-3 rounded-xl border border-purple-100 hover:bg-purple-100 transition-colors group">
                    <div className="flex items-center gap-2">
                        <Beaker className="w-4 h-4 text-purple-600" />
                        <h2 className="text-base font-bold text-gray-800">
                            리서치 리포트 관련 <span className="text-purple-600 text-xs font-bold">({researchGroups.length}건)</span>
                        </h2>
                    </div>
                    {isResearchOpen ? <ChevronUp className="w-4 h-4 text-purple-400 group-hover:text-purple-600" /> : <ChevronDown className="w-4 h-4 text-purple-400 group-hover:text-purple-600" />}
                </button>
                {isResearchOpen && (
                    <div className="mt-3 grid gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        {researchGroups.length === 0 ? (
                             <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-200 text-gray-400 text-xs"><p>관련 리포트 기사가 없습니다.</p></div>
                        ) : (
                            researchGroups.map((group, idx) => (<ArticleCard key={idx} articles={group} keyword={keyword} />))
                        )}
                    </div>
                )}
            </section>

            <footer className="text-center text-[10px] text-gray-400 mt-6 pb-2">
                Total Collected Articles: {totalArticlesCount}
            </footer>
          </div>
        )}
      </div>
    </div>
  )
}