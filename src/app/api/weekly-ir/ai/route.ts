// src/app/api/weekly-ir/ai/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { marketText, selectedNews } = body;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // 선택된 뉴스 제목들을 하나의 문자열로 결합
    const newsList = selectedNews.length > 0 
      ? selectedNews.map((n: any) => `- [${n.publisher || '언론사'}] ${n.title}`).join('\n')
      : '선택된 주요 뉴스가 없습니다.';

    const prompt = `
      너는 한국 대형 증권사 전사 기획팀 책임자야. 최고경영진에게 보고할 '주간 IR 리포트'의 주식시장 Review와 Preview를 작성해야 해.
      
      [전주 시장 데이터 요약]
      ${marketText}

      [전주 주요 언론 보도]
      ${newsList}

      위 내용을 바탕으로 아래 JSON 형식에 맞추어 분석 결과를 작성해 줘. 
      반드시 마크다운 기호(\`\`\`json 등)를 제외하고 순수 JSON 텍스트만 반환해.

      {
        "review": {
          "main_factor": "주식시장 Review: 전주 시장에 가장 영향을 미친 핵심 요인 (예: 금리 인하 기대감 축소 및 환율 급등)",
          "description": "관련 설명 및 기타 영향을 미친 상세 정보 (3~4문장으로 분석적으로 작성)"
        },
        "preview": {
          "title": "주식시장 Preview: 차주 시장을 관통하는 핵심 제목",
          "kospi_band": "차주 KOSPI 주간 예상 포인트 (예: 2,600 ~ 2,750 pt)",
          "up_factors": ["상승 요인 1 (단답형)", "상승 요인 2"],
          "down_factors": ["하락 요인 1 (단답형)", "하락 요인 2"],
          "events": ["차주 예정된 국내외 경제/정치 주요 이벤트 1", "차주 주요 이벤트 2"],
          "strategy": "위 요인들을 기반으로 한 차주 투자 전략 (2~3문장)"
        }
      }
    `;

    const result = await model.generateContent(prompt);
    let aiText = result.response.text();
    
    // JSON 파싱 에러 방지 (마크다운 백틱 제거)
    aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
    const aiData = JSON.parse(aiText);

    return NextResponse.json({ success: true, data: aiData });

  } catch (error: any) {
    console.error('AI Generation Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}