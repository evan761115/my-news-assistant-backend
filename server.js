// 載入環境變數 (例如 GEMINI_API_KEY, YOUTUBE_API_KEY)
require('dotenv').config();
const express = require('express');
const axios = require('axios'); // 為了 extractArticleContent 函數
const cheerio = require('cheerio'); // 為了 extractArticleContent 函數
const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');
const cors = require('cors');
const ytdl = require('ytdl-core'); // 引入 ytdl-core
const xml2js = require('xml2js'); // 用於解析 TTML 字幕
const path = require('path'); // 引入 path 模組來處理檔案路徑

const app = express();
const port = process.env.PORT || 3000; // 使用環境變數或預設 3000

// 設置 CORS，允許來自前端的請求
app.use(cors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true
}));

// 啟用 Express 應用程式處理 JSON 格式的請求體
app.use(express.json());

// 檢查 GEMINI_API_KEY 是否存在
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error('錯誤：請在 .env 檔案中設定 GEMINI_API_KEY。');
    // 注意: 在生產環境中，這裡可能不需要終止應用程式，而是提供一個友好的錯誤頁面
    // 對於本地開發，終止有助於快速發現問題
    // process.exit(1); // 終止應用程式
}

// 初始化 Gemini AI 模型
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // 使用 gemini-1.5-flash 模型

// 配置安全設置，降低生成有害內容的風險
const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
];

// --- 提供靜態檔案服務 ---
// 這會將 PUBLIC 資料夾中的所有檔案作為靜態檔案提供。
// 當瀏覽器請求 /index.html, /script.js, /style.css 等時，伺服器會直接回應這些檔案。
app.use(express.static(path.join(__dirname, 'PUBLIC')));

// --- 處理根路徑的 GET 請求，現在直接發送 index.html ---
// 當用戶訪問根路徑 (例如 http://localhost:3000/) 時，伺服器會發送 PUBLIC/index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'PUBLIC', 'index.html'));
});


// --- 輔助函數：從網頁提取文章內容並嘗試獲取網站名稱 ---
async function extractArticleContent(url) {
    let siteName = '';
    try {
        const urlObj = new URL(url);
        // 嘗試從 hostname 提取更友好的網站名稱
        const hostnameParts = urlObj.hostname.replace('www.', '').split('.');
        if (hostnameParts.length > 1) {
            siteName = hostnameParts[0].charAt(0).toUpperCase() + hostnameParts[0].slice(1);
            // 針對常見媒體名稱進行修正，例如 ettoday.net -> ETtoday
            if (urlObj.hostname.includes('ettoday.net')) {
                siteName = 'ETtoday';
            } else if (urlObj.hostname.includes('udn.com')) {
                siteName = '聯合新聞網';
            } else if (urlObj.hostname.includes('tvbs.com.tw')) {
                siteName = 'TVBS新聞網';
            } else if (urlObj.hostname.includes('ltn.com.tw')) {
                siteName = '自由時報';
            } else if (urlObj.hostname.includes('chinatimes.com')) {
                siteName = '中時新聞網';
            } else if (urlObj.hostname.includes('setn.com')) {
                siteName = '三立新聞網';
            } else if (urlObj.hostname.includes('cna.com.tw')) {
                siteName = '中央社';
            } else if (urlObj.hostname.includes('storm.mg')) {
                siteName = '風傳媒';
            } else if (urlObj.hostname.includes('ftvnews.com.tw')) {
                siteName = '民視新聞網';
            } else if (urlObj.hostname.includes('news.pts.org.tw')) {
                siteName = '公視新聞網';
            } else if (urlObj.hostname.includes('reuters.com')) {
                siteName = '路透社';
            } else if (urlObj.hostname.includes('apnews.com')) {
                siteName = '美聯社';
            } else if (urlObj.hostname.includes('bbc.com')) {
                siteName = 'BBC新聞';
            } else if (urlObj.hostname.includes('cnn.com')) {
                siteName = 'CNN新聞';
            } else if (urlObj.hostname.includes('nytimes.com')) {
                siteName = '紐約時報';
            } else if (urlObj.hostname.includes('washingtonpost.com')) {
                siteName = '華盛頓郵報';
            }
        } else {
            siteName = urlObj.hostname; // 如果只有一個部分，直接用 hostname
        }


        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(response.data);

        let articleText = '';
        // Prioritized selectors for common article content areas
        const selectors = [
            'div.article-body p', // Common for news sites like China Times
            'div.entry-content p', // Common for WordPress-based sites
            'div[itemprop="articleBody"] p',
            'article p',
            '.article-content p',
            '.story-body p',
            '.content p',
            '.post-content p',
            'main p',
            '.post__text p',
            '#contents p',
            '.paragraph p',
            '.article-text p',
            '.News_Body p'
        ];

        for (const selector of selectors) {
            $(selector).each((i, elem) => {
                const text = $(elem).text().trim();
                // Filter out short or boilerplate text
                if (text.length > 50 && !text.includes('版權所有') && !text.includes('未經授權') && !text.includes('廣告') && !text.includes('延伸閱讀')) {
                    articleText += text + '\n\n';
                }
            });
            // If enough content is found, break early
            if (articleText.length > 500) { // Increased threshold for breaking
                break;
            }
        }

        // Fallback: if specific selectors fail, try to get content from more general areas
        if (articleText.length < 300) { // If still not enough content
            console.warn(`Initial extraction failed for ${url}, attempting broader search.`);
            let bodyText = $('body').text();
            // Remove multiple spaces, tabs, newlines, and limit length
            bodyText = bodyText.replace(/\s{2,}/g, '\n').replace(/\t/g, '').trim();
            // Further filter out common non-article text from body
            bodyText = bodyText.split('\n').filter(line => 
                line.length > 30 && 
                !line.includes('版權所有') && 
                !line.includes('未經授權') && 
                !line.includes('廣告') &&
                !line.includes('延伸閱讀') &&
                !line.includes('相關新聞') &&
                !line.includes('熱門新聞') &&
                !line.includes('推薦閱讀') &&
                !line.includes('訂閱') &&
                !line.includes('登入') &&
                !line.includes('註冊') &&
                !line.includes('搜尋') &&
                !line.includes('首頁')
            ).join('\n\n');
            
            // Limit the length of the fallback content to prevent sending too much irrelevant data to AI
            articleText = bodyText.substring(0, Math.min(bodyText.length, 2000)); 
            console.warn(`Fallback extraction result length for ${url}: ${articleText.length}`);
        }
        
        console.log(`Final extracted article content length for ${url}: ${articleText.length}`);

        return { content: articleText.trim(), siteName: siteName };

    } catch (error) {
        console.error(`提取文章內容失敗 for ${url}:`, error.message);
        // Provide a more specific error message based on the actual error
        if (error.response && error.response.status === 403) {
            throw new Error(`無法從網址 ${url} 提取文章內容。伺服器拒絕存取 (403 Forbidden)。這通常表示網站有反爬蟲機制。請嘗試手動複製文章內容，並使用「通稿改寫」功能。`);
        } else if (error.response && error.response.status) {
            throw new Error(`無法從網址 ${url} 提取文章內容。伺服器回應狀態碼: ${error.response.status}。請確認網址有效且可訪問。`);
        } else if (error.code === 'ENOTFOUND') {
            throw new Error(`無法解析網址 ${url} 的主機名稱。請確認網址拼寫正確且網路連線正常。`);
        } else {
            throw new Error(`無法從網址 ${url} 提取文章內容。可能原因：網頁結構變動、反爬蟲機制或網路問題。`);
        }
    }
}

// --- 輔助函數：解析 AI 返回的 JSON 格式內容 ---
function parseAIOutput(jsonString) {
    // 移除 markdown 程式碼區塊標記
    let cleanedJsonString = jsonString.trim();
    if (cleanedJsonString.startsWith('```json')) {
        cleanedJsonString = cleanedJsonString.substring('```json'.length);
    }
    if (cleanedJsonString.endsWith('```')) {
        cleanedJsonString = cleanedJsonString.substring(0, cleanedJsonString.length - '```'.length);
    }
    cleanedJsonString = cleanedJsonString.trim();

    try {
        const parsed = JSON.parse(cleanedJsonString);
        // 標準化 keys 為駝峰式 (camelCase) 以便前端處理
        const result = {
            content: typeof parsed.content === 'string' ? parsed.content : '',
            longTitles: Array.isArray(parsed.long_titles) ? parsed.long_titles : [],
            shortTitles: Array.isArray(parsed.short_titles) ? parsed.short_titles : []
        };
        // 確保 content 屬性存在，如果不存在，則嘗試從原始解析結果中獲取
        if (!result.content && typeof parsed.generatedText === 'string') {
            result.content = parsed.generatedText;
        } else if (!result.content && typeof parsed.rewrittenText === 'string') {
            result.content = parsed.rewrittenText;
        } else if (!result.content && typeof parsed.translatedRewrittenText === 'string') {
            result.content = parsed.translatedRewrittenText;
        } else if (!result.content && typeof parsed.celebrityNewsText === 'string') {
            result.content = parsed.celebrityNewsText;
        } else if (!result.content && typeof parsed.correctedText === 'string') {
            result.content = parsed.correctedText;
        } else if (!result.content && typeof parsed.newsContent === 'string') { // 新增對 /generate-news-from-youtube 的 newsContent 處理
            result.content = parsed.newsContent;
        }


        // 如果解析成功但標題陣列為空，則設為預設值
        if (result.longTitles.length === 0) {
            result.longTitles = ["AI 未生成長標題或格式不符"];
        }
        if (result.shortTitles.length === 0) {
            result.shortTitles = ["AI 未生成短標題或格式不符"];
        }

        return result;

    } catch (e) {
        console.error('解析 AI 輸出 JSON 失敗:', e);
        // 如果解析失敗，則將原始清理過的字串作為內容，並提供預設標題
        return {
            content: cleanedJsonString, // 將清理後的字串作為內容
            longTitles: ["AI 返回內容無法解析為 JSON"],
            shortTitles: ["AI 返回內容無法解析為 JSON"]
        };
    }
}


// --- YouTube Data API 相關輔助函數 ---

// 從 YouTube 連結中提取影片 ID
function getYouTubeVideoId(url) {
    const regExp = /^.*(?:youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[1].length === 11) ? match[1] : null;
}

// 獲取 YouTube 影片詳細資訊
async function fetchYouTubeVideoDetails(videoId) {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // 在這裡獲取，確保每次調用都是最新的
    if (!YOUTUBE_API_KEY) {
        throw new Error('YouTube API 金鑰未設定。請在 .env 檔案中設定 YOUTUBE_API_KEY，用於 YouTube Data API。');
    }
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    try {
        const response = await axios.get(apiUrl);
        if (response.data.items && response.data.items.length > 0) {
            return response.data.items[0];
        } else {
            throw new Error('找不到該 YouTube 影片或影片資訊。');
        }
    } catch (error) {
        console.error('獲取 YouTube 影片詳細資訊失敗:', error.message);
        throw new Error(`無法獲取 YouTube 影片詳細資訊: ${error.message}`);
    }
}

// 獲取 YouTube 影片的字幕軌道列表
async function fetchYouTubeCaptionTracks(videoId) {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // 在這裡獲取，確保每次調用都是最新的
    if (!YOUTUBE_API_KEY) {
        throw new Error('YouTube API 金鑰未設定。請在 .env 檔案中設定 YOUTUBE_API_KEY，用於 YouTube Data API。');
    }
    const apiUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${YOUTUBE_API_KEY}`;
    try {
        const response = await axios.get(apiUrl);
        return response.data.items || [];
    } catch (error) {
        console.error('獲取 YouTube 字幕軌道失敗:', error.message);
        // 如果錯誤是 404 或 403 (字幕不可用)，則返回空陣列而不是拋出錯誤
        if (error.response && (error.response.status === 404 || error.response.status === 403)) {
            console.warn(`影片 ${videoId} 無法獲取字幕或字幕不可用。`);
            return [];
        }
        throw new Error(`無法獲取 YouTube 字幕軌道: ${error.message}`);
    }
}

// 下載並解析 WebVTT 字幕
async function parseWebVTT(url) {
    try {
        const response = await axios.get(url);
        const vttContent = response.data;
        // 簡單的 VTT 解析，移除時間戳和元數據，只保留文本
        const lines = vttContent.split('\n');
        let transcript = [];
        let inCue = false; // 標記是否在字幕內容塊中

        for (const line of lines) {
            if (line.trim() === 'WEBVTT' || line.trim().startsWith('NOTE')) {
                continue; // 跳過 VTT 頭部和註釋
            }
            if (line.includes('-->')) {
                inCue = true; // 進入字幕內容塊
                continue; // 跳過時間戳行
            }
            if (line.trim() === '') {
                inCue = false; // 離開字幕內容塊
                continue; // 跳過空行
            }
            if (inCue) {
                // 移除可能的 HTML 標籤（如 <c>）和特殊字符
                const cleanLine = line.replace(/<[^>]*>/g, '').trim();
                if (cleanLine) {
                    transcript.push(cleanLine);
                }
            }
        }
        return transcript.join(' ').replace(/\s+/g, ' ').trim(); // 合併為單一字符串，處理多餘空格
    } catch (error) {
        console.error('解析 WebVTT 字幕失敗:', error.message);
        throw new Error(`無法解析 WebVTT 字幕: ${error.message}`);
    }
}

// 下載並解析 TTML 字幕 (XML)
async function parseTTML(url) {
    try {
        const response = await axios.get(url);
        const ttmlContent = response.data;
        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        const result = await parser.parseStringPromise(ttmlContent);

        let transcript = [];
        // 遍歷 TTML 結構以提取文本
        if (result && result.tt && result.tt.body && result.tt.body.div && result.tt.body.div.p) {
            const paragraphs = Array.isArray(result.tt.body.div.p) ? result.tt.body.div.p : [result.tt.body.div.p];
            for (const p of paragraphs) {
                if (p._) { // 文本內容通常在 '_' 屬性中
                    transcript.push(p._.trim());
                } else if (typeof p === 'string') { // 有時直接是文本
                    transcript.push(p.trim());
                }
            }
        }
        return transcript.join(' ').replace(/\s+/g, ' ').trim();
    } catch (error) {
        console.error('解析 TTML 字幕失敗:', error.message);
        throw new Error(`無法解析 TTML 字幕: ${error.message}`);
    }
}

// --- API 路由 1: 新聞網址 AI 改寫 ---
app.post('/rewrite-url', async (req, res) => {
    console.log('收到 /rewrite-url 請求');
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: '請提供新聞網址。' });
    }

    try {
        const { content: articleContent, siteName } = await extractArticleContent(url);
        if (!articleContent) {
            return res.status(400).json({ error: '無法獲取網址內容，請檢查網址是否有效或內容是否可讀。' });
        }

        // 檢查原文中是否已經有類似「根據《XXX新聞》報導」的語句
        const existingSourceMatch = articleContent.match(/根據《([^》]+)》報導/);
        let sourceInstruction = '';

        if (existingSourceMatch) {
            // 如果原文已有引用，則 AI 應保留該引用
            sourceInstruction = `請確保新聞稿開頭保留原文中已有的媒體引用，例如「根據《${existingSourceMatch[1]}》報導，...」。`;
        } else if (siteName) {
            // 如果原文沒有，但成功識別了網站名稱，則加入引用
            sourceInstruction = `請在新聞稿開頭加入引用，例如：「根據《${siteName}》報導，...」，以示尊重獨家新聞來源之媒體。`;
        } else {
            // 如果都無法識別，則使用通用說法
            sourceInstruction = `如果無法識別新聞來源，請在開頭使用「根據報導，...」或「據悉，...」。`;
        }


        const prompt = `請將以下新聞內容改寫成一篇全新、流暢、專業的新聞稿，避免與原文重複，但保留核心資訊和事實。請以繁體中文輸出。
${sourceInstruction}
同時，請生成 3 則符合 ETtoday 娛樂新聞風格、更吸睛、更具點擊率的長標（25-30字）和 3 則短標（20字以內）。若內容有具體數字，請盡量將其融入標題以增加吸引力。
請以 JSON 格式輸出結果，包含 'content' (新聞稿內容)、'long_titles' (長標題陣列) 和 'short_titles' (短標題陣列)。
例如：
{
  "content": "...",
  "long_titles": ["...", "...", "..."],
  "short_titles": ["...", "...", "..."]
}
原文：\n\n${articleContent}`;

        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings: safetySettings
        });
        const response = await result.response;
        const rawText = response.text();
        const parsedOutput = parseAIOutput(rawText);

        res.json({
            rewrittenText: parsedOutput.content,
            longTitles: parsedOutput.longTitles,
            shortTitles: parsedOutput.shortTitles
        });

    } catch (error) {
        console.error('新聞改寫失敗:', error);
        res.status(500).json({ error: error.message || '新聞改寫失敗，請稍後再試。' });
    }
});

// --- API 路由：通稿改寫 (針對用戶貼上的內容) ---
app.post('/rewrite-news-draft', async (req, res) => {
    console.log('收到 /rewrite-news-draft 請求');
    const { content, minLength, maxLength, numParagraphs } = req.body; // 新增字數和段落數

    if (!content) {
        return res.status(400).json({ error: '請提供通稿內容。' });
    }

    let lengthInstruction = '';
    if (minLength && maxLength && minLength > 0 && maxLength > minLength) {
        lengthInstruction = `長度控制在約 ${minLength} 到 ${maxLength} 字之間。`;
    } else if (minLength && minLength > 0) {
        lengthInstruction = `長度至少 ${minLength} 字。`;
    }

    let paragraphInstruction = '';
    if (numParagraphs && numParagraphs > 0) {
        paragraphInstruction = `分成約 ${numParagraphs} 段。`;
    }

    const prompt = `請將以下通稿內容改寫成一篇全新、流暢、專業的新聞稿，避免與原文重複，但保留核心資訊和事實。請以繁體中文輸出。
${lengthInstruction} ${paragraphInstruction}
同時，請生成 3 則符合 ETtoday 娛樂新聞風格、更吸睛、更具點擊率的長標（25-30字）和 3 則短標（20字以內）。若內容有具體數字，請盡量將其融入標題以增加吸引力。
請以 JSON 格式輸出結果，包含 'content' (新聞稿內容)、'long_titles' (長標題陣列) 和 'short_titles' (短標題陣列)。
例如：
{
  "content": "...",
  "long_titles": ["...", "...", "..."],
  "short_titles": ["...", "...", "..."]
}
原始通稿：\n\n${content}`;

    try {
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings: safetySettings
        });
        const response = await result.response;
        const rawText = response.text();
        const parsedOutput = parseAIOutput(rawText);

        res.json({
            rewrittenNewsDraftText: parsedOutput.content,
            longTitles: parsedOutput.longTitles,
            shortTitles: parsedOutput.shortTitles
        });

    } catch (error) {
        console.error('通稿改寫失敗:', error);
        res.status(500).json({ error: error.message || '通稿改寫失敗，請稍後再試。' });
    }
});

// --- API 路由 2: 外電新聞翻譯與改寫 ---
app.post('/translate-rewrite', async (req, res) => {
    console.log('收到 /translate-rewrite 請求');
    const { url, sourceLanguage } = req.body;

    if (!url) {
        return res.status(400).json({ error: '請提供外電新聞網址。' });
    }

    try {
        const { content: articleContent, siteName } = await extractArticleContent(url);
        if (!articleContent) {
            return res.status(400).json({ error: '無法獲取外電網址內容，請檢查網址是否有效或內容是否可讀。' });
        }

        // 第一步：翻譯
        const translatePrompt = `請將以下${sourceLanguage !== 'auto' ? sourceLanguage + '語' : '外語'}新聞內容精準翻譯成繁體中文。只提供翻譯後的內容，不要額外評論。原文：\n\n${articleContent}`;
        const translateResult = await model.generateContent({
            contents: [{ parts: [{ text: translatePrompt }] }],
            safetySettings: safetySettings
        });
        const translatedText = (await translateResult.response).text();

        // 檢查翻譯後的內容中是否已經有類似「根據《XXX新聞》報導」的語句
        const existingSourceMatch = translatedText.match(/根據《([^》]+)》報導/);
        let sourceInstruction = '';

        if (existingSourceMatch) {
            // 如果翻譯後的內容已有引用，則 AI 應保留該引用
            sourceInstruction = `請確保新聞稿開頭保留原文中已有的媒體引用，例如「根據《${existingSourceMatch[1]}》報導，...」。`;
        } else if (siteName) {
            // 如果翻譯後的內容沒有，但成功識別了網站名稱，則加入引用
            sourceInstruction = `請在新聞稿開頭加入引用，例如：「根據《${siteName}》報導，...」，以示尊重獨家新聞來源之媒體。`;
        } else {
            // 如果都無法識別，則使用通用說法
            sourceInstruction = `如果無法識別新聞來源，請在開頭使用「根據報導，...」或「據悉，...」。`;
        }


        // 第二步：改寫
        const rewritePrompt = `請將以下繁體中文的新聞內容改寫成一篇全新、流暢、專業的新聞稿，避免與原文重複，但保留核心資訊和事實。請以繁體中文輸出。
${sourceInstruction}
同時，請生成 3 則符合 ETtoday 娛樂新聞風格、更吸睛、更具點擊率的長標（25-30字）和 3 則短標（20字以內）。若內容有具體數字，請盡量將其融入標題以增加吸引力。
請以 JSON 格式輸出結果，包含 'content' (新聞稿內容)、'long_titles' (長標題陣列) 和 'short_titles' (短標題陣列)。
例如：
{
  "content": "...",
  "long_titles": ["...", "...", "..."],
  "short_titles": ["...", "...", "..."]
}
改寫前內容：\n\n${translatedText}`;

        const rewriteResult = await model.generateContent({
            contents: [{ parts: [{ text: rewritePrompt }] }],
            safetySettings: safetySettings
        });
        const response = await rewriteResult.response;
        const rawText = response.text();
        const parsedOutput = parseAIOutput(rawText);

        res.json({
            translatedRewrittenText: parsedOutput.content,
            longTitles: parsedOutput.longTitles,
            shortTitles: parsedOutput.shortTitles
        });

    } catch (error) {
        console.error('外電翻譯改寫失敗:', error);
        res.status(500).json({ error: error.message || '外電翻譯改寫失敗，請稍後再試。' });
    }
});


// --- API 路由 3: 訪問內容生成新聞稿 ---
app.post('/generate-news', async (req, res) => {
    console.log('收到 /generate-news 請求');
    const { content, title, minLength, maxLength, numParagraphs, tone } = req.body;

    if (!content) {
        return res.status(400).json({ error: '請提供訪問內容。' });
    }

    let lengthInstruction = '';
    if (minLength && maxLength && minLength > 0 && maxLength > minLength) {
        lengthInstruction = `長度控制在約 ${minLength} 到 ${maxLength} 字之間。`;
    } else if (minLength && minLength > 0) {
        lengthInstruction = `長度至少 ${minLength} 字。`;
    }

    let paragraphInstruction = '';
    if (numParagraphs && numParagraphs > 0) {
        paragraphInstruction = `分成約 ${numParagraphs} 段。`;
    }

    let toneInstruction = '';
    switch (tone) {
        case 'formal':
            toneInstruction = '語氣請保持正式嚴謹。';
            break;
        case 'engaging':
            toneInstruction = '語氣請保持生動引人，適合大眾閱讀。';
            break;
        case 'announcement':
            toneInstruction = '語氣請保持公告式，如同官方發布。';
            break;
        case 'neutral':
        default:
            toneInstruction = '語氣請保持中立客觀。';
            break;
    }

    const prompt = `請根據以下訪問內容和提供的資訊，生成一篇專業的繁體中文新聞稿。
${title ? `建議新聞標題：「${title}」` : ''}
${lengthInstruction} ${paragraphInstruction} ${toneInstruction}。
同時，請生成 3 則符合 ETtoday 娛樂新聞風格、更吸睛、更具點擊率的長標（25-30字）和 3 則短標（20字以內）。若內容有具體數字，請盡量將其融入標題以增加吸引力。
請以 JSON 格式輸出結果，包含 'content' (新聞稿內容)、'long_titles' (長標題陣列) 和 'short_titles' (短標題陣列)。
例如：
{
  "content": "...",
  "long_titles": ["...", "...", "..."],
  "short_titles": ["...", "...", "..."]
}
訪問內容：
${content}

請確保新聞稿內容連貫、語氣專業，並總結訪問的核心要點。`;

    try {
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings: safetySettings
        });
        const response = await result.response;
        const rawText = response.text();
        const parsedOutput = parseAIOutput(rawText);

        res.json({
            generatedText: parsedOutput.content,
            longTitles: parsedOutput.longTitles,
            shortTitles: parsedOutput.shortTitles
        });

    } catch (error) {
        console.error('生成新聞稿失敗:', error);
        res.status(500).json({ error: error.message || '生成新聞稿失敗，請稍後再試。' });
    }
});

// --- API 路由 5: 名人社群文章轉新聞 ---
app.post('/celebrity-social-to-news', async (req, res) => {
    console.log('收到 /celebrity-social-to-news 請求');
    const { artistName, platform, postContent, mediaDescription, originalLink, remark } = req.body;

    if (!artistName || !postContent) {
        return res.status(400).json({ error: '藝人名稱和社群文章內容為必填項。' });
    }

    let mediaInfo = '';
    if (mediaDescription) {
        mediaInfo = `。貼文伴隨的圖片或影片內容描述為：「${mediaDescription}」`;
    }

    let linkInfo = '';
    if (originalLink) {
        linkInfo = `(原始貼文連結：${originalLink})`;
    }

    let remarkInfo = '';
    if (remark) {
        remarkInfo = `。用戶特別指示：${remark}`;
    }

    const prompt = `請將以下關於藝人 ${artistName} 在 ${platform} 發布的社群文章內容，改寫成一篇專業、客觀且流暢的繁體中文新聞稿。
請將社群內容以媒體報導的方式呈現，並提取其主要事件、發言或情感作為新聞重點。
${mediaInfo}
${linkInfo}
${remarkInfo}

同時，請生成 3 則符合 ETtoday 娛樂新聞風格、更吸睛、更具點擊率的長標（25-30字）和 3 則短標（20字以內）。若內容有具體數字，請盡量將其融入標題以增加吸引力。
請以 JSON 格式輸出結果，包含 'content' (新聞稿內容)、'long_titles' (長標題陣列) 和 'short_titles' (短標題陣列)。
例如：
{
  "content": "...",
  "long_titles": ["...", "...", "..."],
  "short_titles": ["...", "...", "..."]
}

藝人名稱：${artistName}
社群平台：${platform}
社群文章內容：
${postContent}
`;

    try {
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings: safetySettings
        });
        const response = await result.response;
        const rawText = response.text();
        const parsedOutput = parseAIOutput(rawText);

        res.json({
            celebrityNewsText: parsedOutput.content,
            longTitles: parsedOutput.longTitles,
            shortTitles: parsedOutput.shortTitles
        });

    } catch (error) {
        console.error('名人社群文章轉新聞失敗:', error);
        res.status(500).json({ error: error.message || '名人社群文章轉新聞失敗，請稍後再試。' });
    }
});

// --- YouTube 連結轉新聞的 API 端點 (使用 YouTube Data API v3) ---
app.post('/generate-news-from-youtube', async (req, res) => {
    console.log('收到 /generate-news-from-youtube 請求 (使用 YouTube Data API)');
    // 這個功能目前在開發中，暫時不執行實際的 API 邏輯
    return res.status(200).json({
        longTitle: '開發中請稍待',
        shortTitle: '開發中請稍待',
        newsContent: '此功能正在開發中，請稍後再試。'
    });
});


// --- API 路由 4: 錯字校正與語法檢查 ---
app.post('/proofread-text', async (req, res) => {
    console.log('收到 /proofread-text 請求');
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: '請提供需要校對的內容。' });
    }

    // 更新 Prompt，使其更精準地只標記錯字，並返回原始文本，但錯誤處需特殊標記
    const prompt = `請以繁體中文檢查以下文本的錯字、語法錯誤、標點符號錯誤。
你的目標是返回**原始文本的完整內容**。
對於你認為是「錯字」或「明顯的語法錯誤」的地方，請在原文中將「原始錯誤的詞彙或短語」以「原始錯誤詞彙（訂正後的詞彙）」的格式直接嵌入到原始文本中。
**除了這些訂正標記外，不要改寫、增刪任何其他文字。**確保最終輸出是整個原始文本，但錯誤處帶有紅色標記的格式。
如果沒有錯誤，則直接返回原始文本。

範例輸入：
我姐姐從小就是我的後盾，只要我遇到不敢做的事，她就會說：徐熙娣，妳很俗辣耶！那就是她鼓勵我的方式！我人生的事，一定是第一個跟她說，因為我需藥她的意見

範例輸出：
我姐姐從小就是我的後盾，只要我遇到不敢做的事，她就會說：徐熙娣，妳很俗辣耶！那就是她鼓勵我的方式！我人生的事，一定是第一個跟她說，因為我需藥（需要）她的意見

範例輸入：
他得了世屆冠軍，心情非常興奮。

範例輸出：
他得了世屆（世界）冠軍，心情非常興奮。

範例輸入：
我今天去了圖書館，學習了好多資廖，這真是個豐收得一天。

範例輸出：
我今天去了圖書館，學習了好多資廖（資料），這真是個豐收得（的）一天。

範例輸入：
我喜歡吃蘋果。我喜歡喝牛奶。

範例輸出：
我喜歡吃蘋果。我喜歡喝牛奶。

原始文本：\n\n${text}`;

    try {
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings: safetySettings
        });
        const response = await result.response;
        const correctedText = response.text();

        // 錯字校正功能只返回文本，不返回標題
        res.json({ correctedText });

    } catch (error) {
        console.error('錯字校正失敗:', error);
        res.status(500).json({ error: error.message || '錯字校正失敗，請稍後再試。' });
    }
});

// 通用錯誤處理中間件 (確保所有錯誤都以 JSON 格式返回)
app.use((err, req, res, next) => {
    console.error('伺服器發生未捕獲的錯誤:', err.stack); // 記錄完整的錯誤堆棧
    res.status(500).json({ error: '伺服器內部錯誤，請稍後再試。' });
});


// 啟動伺服器
app.listen(port, () => {
    console.log(`後端伺服器運行在 http://localhost:${port}`);
    console.log(`現在可以打開 http://localhost:${port}/ 來使用網頁。`);
});
