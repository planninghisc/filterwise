// src/lib/fetchHtml.ts
import axios from 'axios';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';

export async function fetchHtml(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      }
    });

    const buffer = Buffer.from(response.data);
    
    // 1. 헤더에서 charset 힌트 찾기
    const headPart = buffer.slice(0, 1000).toString('ascii').toLowerCase();
    let encoding = '';

    if (headPart.includes('charset=euc-kr') || headPart.includes('charset="euc-kr"')) {
        encoding = 'euc-kr';
    } else if (headPart.includes('charset=utf-8')) {
        encoding = 'utf-8';
    }

    // 2. 없으면 감지기 사용
    if (!encoding) {
        const det = jschardet.detect(buffer);
        encoding = det.encoding || 'utf-8';
    }

    // 3. 한국 사이트 오감지 보정 (중요!)
    // jschardet이 EUC-KR을 Windows-1252로 착각하는 경우 방지
    if (['windows-1252', 'iso-8859-1', 'ascii'].includes(encoding.toLowerCase())) {
        // 메타태그에 euc-kr이 있었다면 euc-kr 유지, 아니면 utf-8 시도
        if (!headPart.includes('euc-kr')) encoding = 'utf-8';
    }

    return iconv.decode(buffer, encoding);
  } catch (error) {
    console.error(`Fetch error: ${url}`);
    return '';
  }
}