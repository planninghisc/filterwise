// src/app/weekly-ir/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Search, Trash2, X, Database, ArrowDownToLine, Sparkles, Download, Save, FileCode2, CheckSquare } from 'lucide-react';
import * as XLSX from 'xlsx'; 

export default function WeeklyIRPage() {
  const [reportDate, setReportDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAIGenerating, setIsAIGenerating] = useState(false); 

  const [stockData, setStockData] = useState<any>(null);
  const [marketText, setMarketText] = useState('');
  const [rawData, setRawData] = useState<any[]>([]); 
  const [selectedNews, setSelectedNews] = useState<any[]>([]);

  const [aiReview, setAiReview] = useState<any>(null);
  const [aiPreview, setAiPreview] = useState<any>(null);

  const [sectorStart, setSectorStart] = useState<number | ''>('');
  const [sectorEnd, setSectorEnd] = useState<number | ''>('');
  const [sugeubForeign, setSugeubForeign] = useState<number | ''>('');
  const [sugeubInst, setSugeubInst] = useState<number | ''>('');
  const [sugeubRetail, setSugeubRetail] = useState<number | ''>('');

  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [isRawDataModalOpen, setIsRawDataModalOpen] = useState(false); 
  const [isAISourceModalOpen, setIsAISourceModalOpen] = useState(false); 
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedNews, setSearchedNews] = useState<any[]>([]);
  const [tempSelectedNews, setTempSelectedNews] = useState<any[]>([]);
  const [newsFilter, setNewsFilter] = useState<'all' | 'research' | 'other'>('all');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const loadSavedReport = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/weekly-ir/report?date=${date}`);
      const result = await res.json();
      if (result.success && result.data) {
        setStockData(result.data.stock_data);
        setMarketText(result.data.market_text || '');
        setSelectedNews(result.data.selected_news || []);
        setAiReview(result.data.review_text ? JSON.parse(result.data.review_text) : null);
        setAiPreview(result.data.preview_text ? JSON.parse(result.data.preview_text) : null);
      } else {
        setStockData(null);
        setMarketText('');
        setSelectedNews([]);
        setAiReview(null);
        setAiPreview(null);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const today = new Date();
    const day = today.getDay(); 
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(today.setDate(diff));
    const formattedDate = monday.toISOString().split('T')[0];
    setReportDate(formattedDate);
    loadSavedReport(formattedDate);
  }, [loadSavedReport]);

  useEffect(() => {
    if (reportDate) loadSavedReport(reportDate);
  }, [reportDate, loadSavedReport]);

  const handleSaveReport = async () => {
    if (!stockData && !marketText) return alert('저장할 데이터가 없습니다.');
    setIsSaving(true);
    try {
      const res = await fetch('/api/weekly-ir/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_date: reportDate,
          stock_data: stockData,
          market_text: marketText,
          selected_news: selectedNews,
          review_text: aiReview,
          preview_text: aiPreview
        })
      });
      const result = await res.json();
      if (result.success) alert('✅ 리포트가 성공적으로 저장되었습니다!');
      else alert('저장 실패: ' + result.error);
    } catch (e) {
      alert('저장 중 오류 발생');
    }
    setIsSaving(false);
  };

  const handleFetchData = async () => {
    if (!reportDate) return alert('기준일(월요일)을 선택해주세요.');
    setIsLoading(true);
    try {
      const res = await fetch(`/api/weekly-ir/data?date=${reportDate}`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setStockData(result.data.stock_data);
        setMarketText(result.data.market_text); 
        setRawData(result.data.raw_data); 
        setSectorStart(''); setSectorEnd('');
        setSugeubForeign(''); setSugeubInst(''); setSugeubRetail('');
        alert('데이터를 불러왔습니다. 증권업종지수와 수급을 표에 수기로 입력해주세요!');
      } else alert('데이터 수집 실패: ' + result.error);
    } catch (error) {
      alert('데이터 요청 중 오류가 발생했습니다.');
    }
    setIsLoading(false);
  };

  const handleSearchNews = async (autoLoad: boolean = false) => {
    if (!autoLoad && !searchQuery.trim()) return; 
    
    const baseDate = new Date(reportDate);
    const prevMonday = new Date(baseDate.setDate(baseDate.getDate() - 7)).toISOString().split('T')[0];
    const prevSunday = new Date(baseDate.setDate(baseDate.getDate() + 6)).toISOString().split('T')[0];

    let query = supabase.from('news_articles')
      .select('id, title, source_url, published_at, publisher, category')
      .gte('published_at', `${prevMonday} 00:00:00`)
      .lte('published_at', `${prevSunday} 23:59:59`)
      .order('published_at', { ascending: false })
      .limit(100); 

    if (searchQuery.trim()) query = query.ilike('title', `%${searchQuery}%`);

    const { data, error } = await query;
    if (error) alert('뉴스 검색 오류: ' + error.message);
    else setSearchedNews(data || []);
  };

  const openNewsModal = () => {
    setTempSelectedNews([]);
    setSearchQuery('');
    setNewsFilter('all'); 
    handleSearchNews(true); 
    setIsNewsModalOpen(true);
  };

  const getFilteredNews = () => {
    if (newsFilter === 'research') return searchedNews.filter(n => n.category && n.category.includes('리서치'));
    if (newsFilter === 'other') return searchedNews.filter(n => !n.category || !n.category.includes('리서치'));
    return searchedNews;
  };

  const toggleNewsSelection = (newsItem: any) => {
    const isSelected = tempSelectedNews.find(item => item.id === newsItem.id);
    if (isSelected) setTempSelectedNews(tempSelectedNews.filter(item => item.id !== newsItem.id));
    else setTempSelectedNews([...tempSelectedNews, newsItem]);
  };

  // ✅ 리스트에 보이는 뉴스 '전체 선택' 함수
  const selectAllFilteredNews = () => {
    const currentList = getFilteredNews();
    const toAdd = currentList.filter(news => 
      !selectedNews.find(s => s.id === news.id) && 
      !tempSelectedNews.find(t => t.id === news.id)
    );
    setTempSelectedNews([...tempSelectedNews, ...toAdd]);
  };

  const confirmNewsSelection = () => {
    const combined = [...selectedNews, ...tempSelectedNews];
    const uniqueNews = combined.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
    setSelectedNews(uniqueNews);
    setIsNewsModalOpen(false);
  };

  const removeSelectedNews = (id: string) => setSelectedNews(selectedNews.filter(n => n.id !== id));

  const sectorRate = (typeof sectorStart === 'number' && typeof sectorEnd === 'number' && sectorStart > 0) 
    ? ((sectorEnd - sectorStart) / sectorStart) * 100 : 0;
  const diffRate = stockData ? (stockData.hanwha.rate - sectorRate) : 0;

  const applyManualInputsToText = () => {
    if (sectorStart === '' || sectorEnd === '') return alert('증권업종지수 최초/마지막 종가를 모두 입력해주세요.');
    const sectorDiff = sectorEnd - sectorStart;
    const sign = (num: number) => num > 0 ? `+${num}` : `${num}`;
    const signPct = (num: number) => num > 0 ? `+${num.toFixed(2)}` : `${num.toFixed(2)}`;
    const strength = diffRate > 0 ? '강세' : '약세';

    let updatedText = marketText;
    updatedText = updatedText.replace('{증권업대비}', signPct(diffRate));
    updatedText = updatedText.replace('{강세약세}', strength);
    updatedText = updatedText.replace('{증권등락}', sign(Number(sectorDiff.toFixed(2))));
    updatedText = updatedText.replace('{증권등락률}', signPct(sectorRate));
    updatedText = updatedText.replace('{증권종가}', sectorEnd.toLocaleString());
    updatedText = updatedText.replace('{외인수급}', sugeubForeign !== '' ? sign(Number(sugeubForeign)) : '?');
    updatedText = updatedText.replace('{기관수급}', sugeubInst !== '' ? sign(Number(sugeubInst)) : '?');
    updatedText = updatedText.replace('{개인수급}', sugeubRetail !== '' ? sign(Number(sugeubRetail)) : '?');

    setMarketText(updatedText);
    alert('수기 입력하신 지수 및 수급 데이터가 텍스트에 반영되었습니다.');
  };

  const handleGenerateAI = async () => {
    if (!marketText || selectedNews.length === 0) {
      return alert('섹션 2의 시장 지표 텍스트와 섹션 3의 뉴스를 최소 1개 이상 선택해 주세요!');
    }
    
    setIsAIGenerating(true);
    try {
      const res = await fetch('/api/weekly-ir/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketText, selectedNews })
      });
      const result = await res.json();
      
      if (result.success) {
        setAiReview(result.data.review);
        setAiPreview(result.data.preview);
        alert('AI 자동 작성이 완료되었습니다! (자동으로 저장됩니다)');
        handleSaveReport(); 
      } else {
        alert('AI 생성 실패: ' + result.error);
      }
    } catch (e) {
      alert('AI 서버 통신 중 오류가 발생했습니다.');
    }
    setIsAIGenerating(false);
  };

  // ✅ 5단계: 개선된 엑셀 다운로드 (줄바꿈 셀 분리 및 양식 개선)
  const handleDownloadExcel = () => {
    if (!stockData) return alert('다운로드할 리포트 데이터가 없습니다.');
    const wb = XLSX.utils.book_new();
    
    // 텍스트 영역을 엔터(\n) 기준으로 배열(여러 행)로 쪼개기
    const marketTextRows = marketText.split('\n').filter(t => t.trim() !== '').map(line => [line]);

    const reportData = [
      ['■ Weekly IR 리포트'],
      [`작성 기준일: ${reportDate}`],
      [],
      ['[1] 주가 및 업종 등락률'],
      ['구분', `${stockData.hanwha.startDate} 종가`, `${stockData.hanwha.endDate} 종가`, '주간 등락률'],
      ['당사(한화)', stockData.hanwha.start, stockData.hanwha.end, `${stockData.hanwha.rate.toFixed(2)}%`],
      ['증권업종지수', sectorStart, sectorEnd, `${sectorRate.toFixed(2)}%`],
      ['당사 주가 - 증권업종 등락률 차이', '', '', `${diffRate.toFixed(2)}%`],
      ['주간 수급(만주)', `외인: ${sugeubForeign}`, `기관: ${sugeubInst}`, `개인: ${sugeubRetail}`],
      [],
      ['[2] 주요 지수 및 당사 주가'],
      ...marketTextRows, // ✅ 긴 텍스트를 여러 개의 셀(행)로 분리해서 삽입
      [],
      ['[3] 언론 모니터링'],
      ...selectedNews.map(n => [`[${n.publisher || '언론사'}] ${n.title}`, n.source_url]),
      []
    ];

    if (aiReview) {
      reportData.push(['[4] 주식시장 Review']);
      reportData.push([`• ${aiReview.main_factor}`]);
      reportData.push([aiReview.description]);
      reportData.push([]);
    }

    if (aiPreview) {
      reportData.push(['[5] 주식시장 Preview']);
      reportData.push([`■ ${aiPreview.title}`]);
      reportData.push(['예상 KOSPI', aiPreview.kospi_band]);
      reportData.push(['상승 요인', aiPreview.up_factors.join(' / ')]);
      reportData.push(['하락 요인', aiPreview.down_factors.join(' / ')]);
      reportData.push(['주요 이벤트', aiPreview.events.join(' / ')]);
      reportData.push(['투자 전략', aiPreview.strategy]);
    }

    const wsReport = XLSX.utils.aoa_to_sheet(reportData);
    
    // ✅ 엑셀 컬럼 너비 조정 (가독성 향상)
    wsReport['!cols'] = [
      { wch: 60 }, // A열 넓게 (주요 텍스트용)
      { wch: 20 }, // B열 
      { wch: 20 }, // C열 
      { wch: 15 }, // D열
      { wch: 60 }  // E열 (URL 등)
    ];

    XLSX.utils.book_append_sheet(wb, wsReport, 'Weekly IR 리포트');

    // 시트2: 백데이터
    if (rawData && rawData.length > 0) {
      const rawHeaders = ['영업일', '당사', '유안타', '교보', '신영', '현대차', 'KOSPI', 'S&P500', '상해종합', '홍콩H'];
      const rawRows = rawData.map(r => [r.date, r.hanwha, r.yuanta, r.kyobo, r.shinyoung, r.hyundai, r.kospi, r.sp500, r.shanghai, r.hce]);
      const wsRaw = XLSX.utils.aoa_to_sheet([rawHeaders, ...rawRows]);
      
      wsRaw['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsRaw, '백데이터(Raw)');
    }

    XLSX.writeFile(wb, `Weekly_IR_Report_${reportDate}.xlsx`);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8 pb-20">
      {/* 상단 컨트롤 패널 */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 sticky top-16 z-30">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly IR 리포트</h1>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input 
            type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)}
            className="border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button onClick={handleFetchData} disabled={isLoading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 text-sm">
            {isLoading ? '수집 중...' : '1단계: 데이터 불러오기'}
          </button>
          
          <div className="h-6 w-px bg-gray-300 mx-1"></div>

          <button onClick={handleSaveReport} disabled={isSaving} className="flex items-center gap-1 bg-gray-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-black disabled:opacity-50 text-sm">
            <Save className="w-4 h-4" /> {isSaving ? '저장 중...' : '리포트 저장'}
          </button>
          <button onClick={handleDownloadExcel} disabled={!stockData} className="flex items-center gap-1 bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 text-sm">
            <Download className="w-4 h-4" /> 엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* 섹션 1: 주가 및 수급 표 */}
        <section className="p-6 border-b border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm">1</span> 수기 입력 및 자동 계산
            </h2>
            <div className="flex gap-2">
              <button onClick={() => setIsRawDataModalOpen(true)} disabled={rawData.length === 0} className="flex items-center gap-1 text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-200 disabled:opacity-50">
                <Database className="w-4 h-4" /> 백데이터
              </button>
              {stockData && (
                <button onClick={applyManualInputsToText} className="flex items-center gap-1 text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100">
                  <ArrowDownToLine className="w-4 h-4" /> 텍스트 반영
                </button>
              )}
            </div>
          </div>
          {stockData ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="border p-3 text-center">구분</th><th className="border p-3 text-center">{stockData.hanwha.startDate} 종가</th>
                    <th className="border p-3 text-center">{stockData.hanwha.endDate} 종가</th><th className="border p-3 text-center">주간 등락률</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border p-3 font-semibold text-center bg-gray-50">당사(한화)</td>
                    <td className="border p-3 text-right">{stockData.hanwha.start.toLocaleString()}원</td>
                    <td className="border p-3 text-right">{stockData.hanwha.end.toLocaleString()}원</td>
                    <td className="border p-3 text-right font-bold text-blue-600">{stockData.hanwha.rate > 0 ? '+' : ''}{stockData.hanwha.rate.toFixed(2)}%</td>
                  </tr>
                  <tr>
                    <td className="border p-3 font-semibold text-center bg-yellow-50 text-yellow-800">증권업종지수 (수기)</td>
                    <td className="border p-3 text-right bg-yellow-50/30">
                      <input type="number" value={sectorStart} onChange={(e) => setSectorStart(e.target.value === '' ? '' : Number(e.target.value))} className="w-24 text-right border-b-2 border-yellow-300 outline-none bg-transparent p-1 focus:border-yellow-600" placeholder="0.00"/> pt
                    </td>
                    <td className="border p-3 text-right bg-yellow-50/30">
                      <input type="number" value={sectorEnd} onChange={(e) => setSectorEnd(e.target.value === '' ? '' : Number(e.target.value))} className="w-24 text-right border-b-2 border-yellow-300 outline-none bg-transparent p-1 focus:border-yellow-600" placeholder="0.00"/> pt
                    </td>
                    <td className="border p-3 text-right font-bold text-gray-700 bg-yellow-50/30">{sectorRate > 0 ? '+' : ''}{sectorRate.toFixed(2)}%</td>
                  </tr>
                  <tr className="bg-blue-50">
                    <td colSpan={3} className="border p-3 font-bold text-center text-blue-900">당사 주가 - 증권업종 등락률 차이</td>
                    <td className="border p-3 text-right font-bold text-blue-900">{diffRate > 0 ? '+' : ''}{diffRate.toFixed(2)}%</td>
                  </tr>
                  <tr>
                    <td className="border p-3 font-semibold text-center bg-green-50 text-green-800">주간 수급 (단위: 만주)</td>
                    <td className="border p-3 text-center bg-green-50/30">외인: <input type="number" value={sugeubForeign} onChange={(e) => setSugeubForeign(e.target.value === '' ? '' : Number(e.target.value))} className="w-16 text-right border-b-2 border-green-300 outline-none bg-transparent p-1" placeholder="0"/></td>
                    <td className="border p-3 text-center bg-green-50/30">기관: <input type="number" value={sugeubInst} onChange={(e) => setSugeubInst(e.target.value === '' ? '' : Number(e.target.value))} className="w-16 text-right border-b-2 border-green-300 outline-none bg-transparent p-1" placeholder="0"/></td>
                    <td className="border p-3 text-center bg-green-50/30">개인: <input type="number" value={sugeubRetail} onChange={(e) => setSugeubRetail(e.target.value === '' ? '' : Number(e.target.value))} className="w-16 text-right border-b-2 border-green-300 outline-none bg-transparent p-1" placeholder="0"/></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : <div className="text-center text-gray-400 py-8 border-2 border-dashed rounded-lg">데이터를 불러와주세요.</div>}
        </section>

        {/* 섹션 2: 주요 지수 */}
        <section className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm">2</span> 주요 지수 및 당사 주가
          </h2>
          <textarea
            value={marketText} onChange={(e) => setMarketText(e.target.value)}
            className="w-full h-56 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-y leading-relaxed text-sm bg-white"
          />
        </section>

        {/* 섹션 3: 언론 뉴스 선택 */}
        <section className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm">3</span> 언론 모니터링
            </h2>
            <button onClick={openNewsModal} className="flex items-center gap-1 text-sm bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800">
              <Search className="w-4 h-4" /> 뉴스 선택하기
            </button>
          </div>
          {selectedNews.length > 0 ? (
            <ul className="space-y-2">
              {selectedNews.map((news) => (
                <li key={news.id} className="flex justify-between items-center p-3 border rounded-lg bg-white">
                  <a href={news.source_url} target="_blank" rel="noreferrer" className="text-sm hover:underline text-blue-700 truncate block">
                    <span className="font-bold text-gray-600 mr-2">[{news.publisher || '언론사'}]</span>{news.title}
                  </a>
                  <button onClick={() => removeSelectedNews(news.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          ) : <div className="text-center text-gray-400 py-8 border-2 border-dashed rounded-lg">버튼을 눌러 DB에 수집된 뉴스를 선택해 주세요.</div>}
        </section>
      </div>

      {/* AI 분석 영역 */}
      <div className="flex flex-col items-center mt-6 space-y-6">
        <button 
          onClick={handleGenerateAI} disabled={!marketText || selectedNews.length === 0 || isAIGenerating}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:from-purple-700 hover:to-indigo-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition transform hover:scale-105 active:scale-95"
        >
          <Sparkles className="w-6 h-6" /> {isAIGenerating ? 'AI 분석 중...' : '4단계: AI Review & Preview 자동 작성'}
        </button>

        {(aiReview || aiPreview) && (
          <button onClick={() => setIsAISourceModalOpen(true)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-purple-600 underline underline-offset-4">
            <FileCode2 className="w-4 h-4" /> AI 분석 참고 원본 소스 확인
          </button>
        )}

        {(aiReview || aiPreview) && (
          <div className="w-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-2">
            <section className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-sm">4</span> 주식시장 Review</h2>
              {aiReview && (
                <div className="bg-purple-50 p-5 rounded-lg border border-purple-100 space-y-3">
                  <div className="font-bold text-lg text-purple-900 flex gap-2"><span className="text-purple-500">•</span> {aiReview.main_factor}</div>
                  <textarea value={aiReview.description} onChange={(e) => setAiReview({ ...aiReview, description: e.target.value })} className="w-full h-24 p-3 bg-white border border-purple-200 rounded outline-none focus:ring-1 focus:ring-purple-500 text-sm leading-relaxed"/>
                </div>
              )}
            </section>
            <section className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-sm">5</span> 주식시장 Preview</h2>
              {aiPreview && (
                <div className="bg-indigo-50 p-5 rounded-lg border border-indigo-100 space-y-4 text-sm">
                  <div className="font-bold text-lg text-indigo-900 border-b border-indigo-200 pb-2">{aiPreview.title}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="bg-white p-3 rounded border border-indigo-100 shadow-sm"><p className="font-bold text-indigo-800 mb-1">예상 KOSPI</p><p>{aiPreview.kospi_band}</p></div>
                     <div className="bg-white p-3 rounded border border-indigo-100 shadow-sm"><p className="font-bold text-red-600 mb-1">상승 요인</p><ul className="list-disc pl-5 space-y-1">{aiPreview.up_factors.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul></div>
                     <div className="bg-white p-3 rounded border border-indigo-100 shadow-sm"><p className="font-bold text-blue-600 mb-1">하락 요인</p><ul className="list-disc pl-5 space-y-1">{aiPreview.down_factors.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul></div>
                     <div className="bg-white p-3 rounded border border-indigo-100 shadow-sm"><p className="font-bold text-gray-700 mb-1">주요 이벤트</p><ul className="list-disc pl-5 space-y-1 text-gray-600">{aiPreview.events.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul></div>
                  </div>
                  <div className="bg-white p-4 rounded border border-indigo-200 mt-4 shadow-sm">
                     <p className="font-bold text-indigo-900 mb-2">투자 전략</p>
                     <textarea value={aiPreview.strategy} onChange={(e) => setAiPreview({ ...aiPreview, strategy: e.target.value })} className="w-full h-20 p-2 border border-gray-200 rounded outline-none focus:border-indigo-500 leading-relaxed"/>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* 모달들 (소스 확인, 백데이터) */}
      {isAISourceModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-5 border-b bg-purple-50 rounded-t-2xl">
              <h3 className="font-bold text-lg text-purple-900 flex items-center gap-2"><Sparkles className="w-5 h-5"/> AI 분석 참고 소스</h3>
              <button onClick={() => setIsAISourceModalOpen(false)}><X className="w-5 h-5 text-gray-500 hover:text-black"/></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div><h4 className="font-bold text-gray-700 mb-2 border-b pb-1">1. 시장 데이터 요약</h4><div className="bg-gray-100 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap font-mono">{marketText}</div></div>
              <div><h4 className="font-bold text-gray-700 mb-2 border-b pb-1">2. 주요 언론 보도</h4><ul className="bg-gray-100 p-4 rounded-lg text-sm text-gray-700 space-y-2 font-mono">{selectedNews.map((n: any, idx: number) => (<li key={idx}>- [{n.publisher || '언론사'}] {n.title}</li>))}</ul></div>
            </div>
          </div>
        </div>
      )}

      {isRawDataModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-5 border-b bg-gray-50 rounded-t-2xl">
              <h3 className="font-bold text-lg flex items-center gap-2"><Database className="w-5 h-5 text-gray-500"/> 전 종목/지수 일별 백데이터</h3>
              <button onClick={() => setIsRawDataModalOpen(false)}><X className="w-5 h-5 text-gray-500 hover:text-black"/></button>
            </div>
            <div className="p-5 overflow-auto">
              <table className="w-full text-xs md:text-sm text-center border-collapse whitespace-nowrap">
                <thead className="bg-gray-100 text-gray-700 sticky top-0">
                  <tr>
                    <th className="border p-2">영업일</th><th className="border p-2">당사</th><th className="border p-2">유안타</th><th className="border p-2">교보</th><th className="border p-2">신영</th><th className="border p-2">현대차</th><th className="border p-2">KOSPI</th><th className="border p-2">S&P500</th><th className="border p-2">상해종합</th><th className="border p-2">홍콩H</th>
                  </tr>
                </thead>
                <tbody>
                  {rawData.map((r, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="border p-2">{r.date}</td><td className="border p-2">{r.hanwha}</td><td className="border p-2">{r.yuanta}</td><td className="border p-2">{r.kyobo}</td><td className="border p-2">{r.shinyoung}</td><td className="border p-2">{r.hyundai}</td><td className="border p-2">{r.kospi}</td><td className="border p-2">{r.sp500}</td><td className="border p-2">{r.shanghai}</td><td className="border p-2">{r.hce}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 뉴스 모달 (전체 선택 버튼 추가됨) */}
      {isNewsModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-5 border-b">
              <h3 className="font-bold text-lg">전주 뉴스 선택</h3>
              <button onClick={() => setIsNewsModalOpen(false)}><X className="w-5 h-5 text-gray-500"/></button>
            </div>
            
            <div className="p-5 border-b bg-gray-50 space-y-3">
              <div className="flex justify-between items-center border-b pb-2">
                <div className="flex gap-4">
                  <button onClick={() => setNewsFilter('all')} className={`pb-1 px-1 ${newsFilter === 'all' ? 'border-b-2 border-blue-600 font-bold text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>전체 뉴스</button>
                  <button onClick={() => setNewsFilter('research')} className={`pb-1 px-1 ${newsFilter === 'research' ? 'border-b-2 border-blue-600 font-bold text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>리서치 뉴스</button>
                  <button onClick={() => setNewsFilter('other')} className={`pb-1 px-1 ${newsFilter === 'other' ? 'border-b-2 border-blue-600 font-bold text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>기타 뉴스</button>
                </div>
                {/* ✅ 전체 선택 버튼 추가 */}
                <button onClick={selectAllFilteredNews} className="flex items-center gap-1 text-sm bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 transition">
                  <CheckSquare className="w-4 h-4" /> 현재 탭 전체선택
                </button>
              </div>
              <div className="flex gap-2">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchNews()} placeholder="결과 내 재검색 (선택사항)" className="flex-1 border p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"/>
                <button onClick={() => handleSearchNews(false)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold">검색</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {getFilteredNews().length > 0 ? (
                <ul className="space-y-2">
                  {getFilteredNews().map((news) => {
                    const isChecked = !!tempSelectedNews.find(t => t.id === news.id) || !!selectedNews.find(s => s.id === news.id);
                    const isAlreadyAdded = !!selectedNews.find(s => s.id === news.id);
                    return (
                      <li key={news.id} className="flex gap-3 p-3 border rounded-lg hover:border-blue-300 transition-colors">
                        <input type="checkbox" checked={isChecked} disabled={isAlreadyAdded} onChange={() => toggleNewsSelection(news)} className="mt-1 w-4 h-4 text-blue-600 cursor-pointer"/>
                        <div>
                          <p className={`text-sm font-medium ${isAlreadyAdded ? 'text-gray-400' : 'text-gray-900'}`}>
                            <span className="font-bold text-gray-500 mr-1">[{news.publisher || '언론사'}]</span> {news.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400">{new Date(news.published_at).toLocaleDateString()}</span>
                            {news.category && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{news.category}</span>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : <div className="text-center text-gray-500 py-10">해당 분류에 검색 결과가 없습니다.</div>}
            </div>
            
            <div className="p-5 flex justify-end gap-3 border-t bg-gray-50 rounded-b-2xl">
              <span className="text-sm text-gray-500 self-center mr-auto">{tempSelectedNews.length}개 선택됨</span>
              <button onClick={() => setIsNewsModalOpen(false)} className="px-4 py-2 bg-white border rounded-lg hover:bg-gray-100">취소</button>
              <button onClick={confirmNewsSelection} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}