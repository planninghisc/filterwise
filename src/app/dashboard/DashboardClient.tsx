'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient'; 
import { INDICATOR_META } from '@/lib/indicatorMeta';
import { MACRO_GEMINI_MODEL_OPTIONS } from '@/lib/macroAiOptions';
import {
  DEFAULT_MACRO_PROMPT_TEMPLATE,
  MACRO_PROMPT_PLACEHOLDER_KEYS,
} from '@/lib/macroAiPromptTemplate';
import { Info, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

const LS_MACRO_PROMPT = 'macro_ai_prompt_template';
const LS_MACRO_MODEL_ID = 'macro_ai_model_option_id';

export default function DashboardClient() {
  const [baseDate, setBaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [currentData, setCurrentData] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showMacroAiModal, setShowMacroAiModal] = useState(false);
  const [macroPromptTemplate, setMacroPromptTemplate] = useState(DEFAULT_MACRO_PROMPT_TEMPLATE);
  const [macroGeminiModelOptionId, setMacroGeminiModelOptionId] = useState<string>('auto');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: targetData } = await supabase
        .from('macro_indicators')
        .select('*')
        .eq('base_date', baseDate)
        .single();
      
      setCurrentData(targetData || null);

      let limit = 30; 
      if (period === 'weekly') limit = 30; 
      if (period === 'monthly') limit = 30; 
      
      const { data: historyData } = await supabase
        .from('macro_indicators')
        .select('*')
        .lte('base_date', baseDate)
        .order('base_date', { ascending: false })
        .limit(limit);

      if (historyData) {
        setChartData(historyData.reverse());
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    try {
      const savedPrompt = localStorage.getItem(LS_MACRO_PROMPT);
      const savedModelId = localStorage.getItem(LS_MACRO_MODEL_ID);
      if (savedPrompt) setMacroPromptTemplate(savedPrompt);
      if (
        savedModelId &&
        MACRO_GEMINI_MODEL_OPTIONS.some((o) => o.id === savedModelId)
      ) {
        setMacroGeminiModelOptionId(savedModelId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleConfirmMacroRefresh = async () => {
    setIsLoading(true);
    try {
      localStorage.setItem(LS_MACRO_PROMPT, macroPromptTemplate);
      localStorage.setItem(LS_MACRO_MODEL_ID, macroGeminiModelOptionId);

      const res = await fetch(
        `/api/macro/update?date=${baseDate}&period=${period}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            promptTemplate: macroPromptTemplate,
            geminiModelOptionId: macroGeminiModelOptionId,
          }),
        }
      );
      const result = await res.json();

      if (result.success) {
        const modelNote = result.modelUsed
          ? `\n\n사용 모델: ${result.modelUsed}`
          : '';
        alert((result.message || '데이터 및 AI 분석이 갱신되었습니다.') + modelNote);
        setShowMacroAiModal(false);
        fetchData();
      } else {
        alert(`갱신 중 오류가 발생했습니다: ${result.error}`);
      }
    } catch (error) {
      console.error(error);
      alert('갱신 요청 중 통신 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [baseDate, period]);

  const renderIndicatorCard = (key: keyof typeof INDICATOR_META, value: number | undefined, unit: string) => {
    const meta = INDICATOR_META[key];
    return (
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
        <div className="flex justify-between items-start mb-2">
          <span className="text-gray-500 font-medium text-sm flex items-center gap-1 group relative">
            {meta.title}
            <Info className="w-4 h-4 text-gray-400 cursor-help" />
            <div className="absolute left-0 bottom-full mb-2 hidden w-64 bg-gray-800 text-white text-xs rounded p-2 group-hover:block z-10 shadow-lg">
              <p className="font-bold mb-1">{meta.title}</p>
              <p className="mb-1 text-gray-300">{meta.meaning}</p>
              <p className="text-blue-300">💡 {meta.whyTrack}</p>
            </div>
          </span>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {value !== undefined && value !== null ? `${value.toLocaleString()}${unit}` : '-'}
        </div>
      </div>
    );
  };

  // ✅ 선택된 period(일간/주간/월간)에 맞는 AI 코멘트를 DB 컬럼에서 꺼내옵니다.
  const getAiAnalysisText = () => {
    if (!currentData) return null;
    if (period === 'daily') return currentData.ai_analysis_daily;
    if (period === 'weekly') return currentData.ai_analysis_weekly;
    if (period === 'monthly') return currentData.ai_analysis_monthly;
    return null;
  };

  const aiTextToDisplay = getAiAnalysisText();

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <input 
            type="date" 
            value={baseDate} 
            onChange={(e) => setBaseDate(e.target.value)}
            className="border-gray-300 rounded-lg p-2 border focus:ring-blue-500"
          />
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {['daily', 'weekly', 'monthly'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p as any)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  period === p ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p === 'daily' ? '일간' : p === 'weekly' ? '주간' : '월간'}
              </button>
            ))}
          </div>
        </div>
        
        <button
          type="button"
          onClick={() => setShowMacroAiModal(true)}
          disabled={isLoading}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
          title="Gemini 모델·프롬프트를 확인한 뒤 AI로 전송합니다"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading
            ? '수집 및 분석 중...'
            : `${period === 'daily' ? '일간' : period === 'weekly' ? '주간' : '월간'} 분석 갱신`}
        </button>
      </div>

      {showMacroAiModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="macro-ai-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-gray-200">
            <div className="p-4 border-b border-gray-100 shrink-0">
              <h2 id="macro-ai-modal-title" className="text-lg font-bold text-gray-900">
                AI 분석 전송 설정
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Google Gemini API(서버 환경 변수 키)로 지표·뉴스를 보냅니다. 아래에서 모델과 프롬프트를 확인·수정한 뒤 갱신하세요.
              </p>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gemini 모델
                </label>
                <select
                  value={macroGeminiModelOptionId}
                  onChange={(e) => setMacroGeminiModelOptionId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  {MACRO_GEMINI_MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {
                    MACRO_GEMINI_MODEL_OPTIONS.find((o) => o.id === macroGeminiModelOptionId)
                      ?.description
                  }
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  프롬프트 템플릿
                </label>
                <textarea
                  value={macroPromptTemplate}
                  onChange={(e) => setMacroPromptTemplate(e.target.value)}
                  rows={14}
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
                  spellCheck={false}
                />
                <p className="text-xs text-gray-500 mt-1">
                  치환 변수:{' '}
                  {MACRO_PROMPT_PLACEHOLDER_KEYS.map((k) => (
                    <code key={k} className="text-[11px] bg-gray-100 px-1 rounded mr-1">
                      {`{{${k}}}`}
                    </code>
                  ))}
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMacroPromptTemplate(DEFAULT_MACRO_PROMPT_TEMPLATE);
                  setMacroGeminiModelOptionId('auto');
                }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                기본값으로 초기화
              </button>
              <button
                type="button"
                onClick={() => setShowMacroAiModal(false)}
                disabled={isLoading}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmMacroRefresh}
                disabled={isLoading}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isLoading ? '처리 중...' : '이 설정으로 갱신'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 선택한 탭에 맞는 AI 코멘트가 있을 때만 출력 */}
      {aiTextToDisplay ? (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-100 shadow-sm">
          <h2 className="text-lg font-bold text-blue-900 mb-2 flex items-center gap-2">
            ✨ AI 기획팀 시황 분석 ({period === 'daily' ? '일간' : period === 'weekly' ? '주간' : '월간'} 추세)
          </h2>
          <div className="text-blue-800 text-sm whitespace-pre-wrap leading-relaxed">
            {aiTextToDisplay}
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm text-center text-gray-500 text-sm">
          해당 날짜의 {period === 'daily' ? '일간' : period === 'weekly' ? '주간' : '월간'} AI 분석 기록이 없습니다.<br/>우측 상단의 갱신 버튼을 눌러주세요.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {renderIndicatorCard('kr_bond_3y', currentData?.kr_bond_3y, '%')}
        {renderIndicatorCard('us_bond_10y', currentData?.us_bond_10y, '%')}
        {renderIndicatorCard('kospi_index', currentData?.kospi_index, ' pt')}
        {renderIndicatorCard('kospi_volume', currentData?.kospi_volume, '조')}
        {renderIndicatorCard('usd_krw', currentData?.usd_krw, ' 원')}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border h-[420px] flex flex-col">
        <h3 className="font-bold text-gray-800 mb-3 shrink-0">최근 30일 KOSPI & 환율 추세</h3>
        {chartData.length > 0 ? (
          <div className="flex-1 min-h-0 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 28, right: 12, left: 4, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                <XAxis
                  dataKey="base_date"
                  tick={{ fontSize: 11 }}
                  tickMargin={12}
                  height={36}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  domain={['auto', 'auto']}
                  stroke="#3b82f6"
                  tick={{ fontSize: 11 }}
                  width={44}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={['auto', 'auto']}
                  stroke="#10b981"
                  tick={{ fontSize: 11 }}
                  width={48}
                />
                <RechartsTooltip />
                <Legend
                  verticalAlign="top"
                  align="center"
                  wrapperStyle={{ paddingBottom: 4, fontSize: 12 }}
                  iconType="circle"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="kospi_index"
                  name="KOSPI 지수"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="usd_krw"
                  name="원/달러 환율"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            데이터가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}