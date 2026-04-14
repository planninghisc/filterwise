import * as cheerio from 'cheerio';
import { fetchHtml } from '@/lib/fetchHtml';

export interface NewsArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  fullContent?: string;
}

// 💡 [핵심] 언론사별 본문이 담긴 HTML ID/Class 모음
// 여기에 포함된 선택자를 순서대로 찾아보며 본문을 추출합니다.
const CONTENT_SELECTORS = [
    '#dic_area',                 // 네이버 뉴스 표준
    '#article-view-content-div', // 연합인포맥스
    '#articleText',              // 뉴스웨이, 일부 경제지
    '#news_body_id',             // 중소형 언론사 CMS
    '.article_body',             // 공통적으로 많이 쓰임
    '.article-body',             // 공통
    '#articleBody',              // 공통
    '.view_txt',                 // 공통
    '.view_con',                 // 공통
    '.news_view',                // 공통
    '#txt_area',                 // 한국경제 등
    '.cnt_view',                 // 공통
    '#textBody',                 // 일부 지방지
    '.news_content',             // 공통
    '.article_view',             // 공통
    'div[itemprop="articleBody"]' // 구글 표준
];

export async function fetchNaverNews(keyword: string, display: number = 10, start: number = 1): Promise<NewsArticle[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Naver API Key is missing');
    return [];
  }

  // 네이버 검색 API 호출
  const apiUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=${display}&start=${start}&sort=date`;
  
  try {
    const res = await fetch(apiUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    const data = await res.json();
    const items = data.items || [];

    // 병렬로 각 기사 링크에 접속해 본문 수집
    const detailedArticles = await Promise.all(
      items.map(async (item: any) => {
        const link = item.link;
        let fullContent = '';

        if (link) {
            // 인코딩 문제가 해결된 fetchHtml 함수 사용
            const html = await fetchHtml(link); 
            
            if (html) {
                const $ = cheerio.load(html);
                
                // 1. 본문 추출에 방해되는 요소 제거 (광고, 메뉴, 관련기사 등)
                $('script, style, nav, header, footer, .ad, .advertisement, iframe, .related_news, .img_desc, .caption').remove();
                
                // 2. 등록된 선택자들로 본문 찾기 시도
                for (const selector of CONTENT_SELECTORS) {
                    const text = $(selector).text().trim();
                    // 텍스트가 50자 이상이면 유효한 본문으로 판단하고 종료
                    if (text.length > 50) {
                        fullContent = text;
                        break; 
                    }
                }

                // 3. 선택자로 못 찾았을 경우: <p> 태그 긁어모으기 (최후의 수단)
                if (!fullContent) {
                    let pText = '';
                    $('p').each((_, el) => {
                        const t = $(el).text().trim();
                        // 메뉴명이나 링크가 아닌, 문장 형태의 텍스트만 수집 (20자 이상)
                        if (t.length > 20) {
                            pText += t + ' ';
                        }
                    });
                    if (pText.length > 50) fullContent = pText.trim();
                }
            }
        }

        // 본문 수집 실패 시, 네이버가 준 요약문(description)이라도 사용
        const finalContent = fullContent || item.description.replace(/<[^>]*>?/gm, '');

        return {
          title: item.title.replace(/<[^>]*>?/gm, ''), // HTML 태그 제거
          link: item.link,
          description: item.description.replace(/<[^>]*>?/gm, ''),
          pubDate: item.pubDate,
          fullContent: finalContent // 여기에 본문이 담겨야 '연구원' 분류가 가능함
        };
      })
    );

    return detailedArticles;

  } catch (e) {
    console.error('Naver News API Error:', e);
    return [];
  }
}

// 기존 코드와의 호환성을 위한 alias export
export const ingestNaverNews = fetchNaverNews;