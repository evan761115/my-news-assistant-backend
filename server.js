// server.js
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
const { JSDOM } = require('jsdom'); // 引入 JSDOM，在伺服器端解析 HTML

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
// 注意：將您的資料夾名稱從 'PUBLIC' 改為小寫的 'public' 以遵循慣例。

// --- 處理根路徑的 GET 請求，現在直接發送 index.html ---

// =======================================================
// === 新增：AI 核心模組 - 內容優化與標題生成輔助函數 ===
// =======================================================

// 品牌名稱和公關詞彙列表
const BRAND_NAMES = ['ETtoday', 'XX保養品牌', 'YY手機', '某某汽車', '品牌名稱', '公司名稱'];
const PR_PHRASES = ['感謝品牌', '本次活動旨在', '此次合作', '與會貴賓', '品牌活動', '記者會', 'ETtoday報導'];

/**
 * 過濾文本中的特定品牌名稱，替換為泛稱。
 * @param {string} text - 原始文本。
 * @returns {string} 替換後的文本。
 */
function filterBrands(text) {
    let filteredText = text;
    BRAND_NAMES.forEach(brand => {
        const genericTerm = '某品牌';
        // 使用正則表達式進行全局替換
        filteredText = filteredText.replace(new RegExp(brand, 'g'), genericTerm);
    });
    return filteredText;
}

/**
 * 移除文本中包含公關詞彙的句子。
 * @param {string} text - 原始文本。
 * @returns {string} 移除後的文本。
 */
function removePRContent(text) {
    let rewrittenText = text;
    PR_PHRASES.forEach(phrase => {
        // 使用正則表達式匹配包含 PR 詞彙的整句話
        rewrittenText = rewrittenText.replace(new RegExp(`[^。？！]*${phrase}[^。？！]*[。？！]`, 'g'), '');
    });
    return rewrittenText;
}

/**
 * 簡單的文本清理，修正連續的標點符號。
 * @param {string} text - 原始文本。
 * @returns {string} 清理後的文本。
 */
function simpleRewrite(text) {
    const fixedText = text.replace(/，，/g, '，').replace(/。。/g, '。');
    return fixedText;
}

/**
 * 從文本中移除常見的日期格式。
 * @param {string} text - 原始文本。
 * @returns {string} 清理後的文本。
 */
function removeDatesFromText(text) {
    const date_patterns = [
        /\d{4}年\d{1,2}月\d{1,2}日/g,
        /\d{1,2}月\d{1,2}日/g,
        /週[一二三四五六日]/g,
        /\(\d{1,2}\/\d{1,2}\)/g
    ];
    let cleanedText = text;
    date_patterns.forEach(pattern => {
        cleanedText = cleanedText.replace(pattern, '');
    });
    return cleanedText;
}

/**
 * 根據文章標題和內容，生成三種不同風格的優化標題。
 * @param {string} rawTitle - 原始標題。
 * @param {string} content - 經過優化的文章內容。
 * @returns {object} 包含三種標題的物件。
 */
function generateOptimizedTitles(rawTitle, content) {
    const cleanedTitle = removeDatesFromText(rawTitle);
    const cleanedContent = removeDatesFromText(content);
    
    // 嘗試從內文提取數字和主體
    const numbers = cleanedContent.match(/\d+/g) || [];
    let mainEntity = cleanedContent.substring(0, 20).replace(/，|。|\s/g, '');

    // 備用邏輯，如果內文太短，用標題代替
    if (mainEntity.length < 5 && cleanedTitle.length > 5) {
        mainEntity = cleanedTitle.substring(0, 10).replace(/，|。|\s/g, '');
    }

    let clickbaitTitle = `超狂！${mainEntity.substring(0, 6)}的${numbers.length > 0 ? numbers[0] + '個' : ''}驚人內幕！`;
    let standardTitle = `藝人出席活動，${mainEntity.substring(0, 10)}...`;
    let creativeTitle = `這就是娛樂圈？${mainEntity.substring(0, 8)}背後的故事`;

    if (cleanedTitle.length > 0) {
        standardTitle = cleanedTitle.substring(0, 25);
    }
    
    return {
        藏標: clickbaitTitle.trim(),
        正統: standardTitle.trim(),
        特別: creativeTitle.trim()
    };
}


// --- 輔助函數：從網頁提取文章內容並嘗試獲取網站名稱 (已修改，增加提取原始標題) ---
async function extractArticleContent(url) {
    let siteName = '';
    let rawTitle = ''; // 新增一個變數來儲存原始標題
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

        // 提取標題
        rawTitle = $('title').text() || $('h1').text();

        let articleText = '';
        const selectors = [
            'div.article-body p',
            'div.entry-content p',
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
                if (text.length > 50 && !text.includes('版權所有') && !text.includes('未經授權') && !text.includes('廣告') && !text.includes('延伸閱讀')) {
                    articleText += text + '\n\n';
                }
            });
            if (articleText.length > 500) {
                break;
            }
        }

        if (articleText.length < 300) {
            console.warn(`Initial extraction failed for ${url}, attempting broader search.`);
            let bodyText = $('body').text();
            bodyText = bodyText.replace(/\s{2,}/g, '\n').replace(/\t/g, '').trim();
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
            
            articleText = bodyText.substring(0, Math.min(bodyText.length, 2000)); 
            console.warn(`Fallback extraction result length for ${url}: ${articleText.length}`);
        }
        
        console.log(`Final extracted article content length for ${url}: ${articleText.length}`);

        return { content: articleText.trim(), siteName: siteName, rawTitle: rawTitle };

    } catch (error) {
        console.error(`提取文章內容失敗 for ${url}:`, error.message);
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
        const result = {
            content: typeof parsed.content === 'string' ? parsed.content : '',
            longTitles: Array.isArray(parsed.long_titles) ? parsed.long_titles : [],
            shortTitles: Array.isArray(parsed.short_titles) ? parsed.short_titles : []
        };
        // 確保 content 屬性存在
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
        } else if (!result.content && typeof parsed.newsContent === 'string') {
            result.content = parsed.newsContent;
        }
        return result;

    } catch (e) {
        console.error('解析 AI 輸出 JSON 失敗:', e);
        return {
            content: cleanedJsonString,
            longTitles: ["AI 返回內容無法解析為 JSON"],
            shortTitles: ["AI 返回內容無法解析為 JSON"]
        };
    }
}

// --- API 路由 1: 新聞網址 AI 改寫 (已修改) ---
app.post('/rewrite-url', async (req, res) => {
    console.log('收到 /rewrite-url 請求');
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: '請提供新聞網址。' });
    }

    try {
        // 從文章中同時獲取內容、站名和原始標題
        const { content: articleContent, siteName, rawTitle } = await extractArticleContent(url);
        if (!articleContent) {
            return res.status(400).json({ error: '無法獲取網址內容，請檢查網址是否有效或內容是否可讀。' });
        }

        // --- 新增：內容優化步驟 ---
        const filteredContent = filterBrands(articleContent);
        const rewrittenContent = removePRContent(filteredContent);
        const finalContent = simpleRewrite(rewrittenContent);
        const titles = generateOptimizedTitles(rawTitle, finalContent);

        // 使用優化後的內容進行 AI 改寫 (這個prompt可以根據需求調整，但目前先保留)
        const prompt = `請將以下新聞內容改寫成一篇全新、流暢、專業的新聞稿，避免與原文重複，但保留核心資訊和事實。請以繁體中文輸出。
        若原文來自《${siteName}》，請在改寫後的新聞稿開頭註明來源。
        請以 JSON 格式輸出結果，包含 'content' (新聞稿內容)。
        例如：
        {
          "content": "..."
        }
        原文：\n\n${finalContent}`;

        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings: safetySettings
        });
        const response = await result.response;
        const rawText = response.text();
        const aiOutput = parseAIOutput(rawText);

        res.json({
            // 回傳優化後的內容和新標題
            content: {
                rewrittenText: aiOutput.content || finalContent,
                optimizedTitles: titles,
                originalSource: siteName
            }
        });

    } catch (error) {
        console.error('新聞改寫失敗:', error);
        res.status(500).json({ error: error.message || '新聞改寫失敗，請稍後再試。' });
    }
});


// --- API 路由：通稿改寫 (已修改) ---
app.post('/rewrite-news-draft', async (req, res) => {
    console.log('收到 /rewrite-news-draft 請求');
    const { content, minLength, maxLength, numParagraphs, isBrandsFiltered } = req.body;

    if (!content) {
        return res.status(400).json({ error: '請提供通稿內容。' });
    }

    // --- 新增：內容優化步驟 ---
    let filteredDraft = content;
    if (isBrandsFiltered) {
        filteredDraft = filterBrands(content);
    }
    const rewrittenDraft = removePRContent(filteredDraft);
    const finalDraft = simpleRewrite(rewrittenDraft);
    const titles = generateOptimizedTitles(finalDraft.substring(0, 30), finalDraft);

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
請以 JSON 格式輸出結果，包含 'content' (新聞稿內容)。
例如：
{
  "content": "..."
}
原始通稿：\n\n${finalDraft}`;

    try {
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings: safetySettings
        });
        const response = await result.response;
        const rawText = response.text();
        const aiOutput = parseAIOutput(rawText);

        res.json({
            content: {
                rewrittenNewsDraftText: aiOutput.content || finalDraft,
                optimizedTitles: titles,
                originalSource: "通稿"
            }
        });

    } catch (error) {
        console.error('通稿改寫失敗:', error);
        res.status(500).json({ error: error.message || '通稿改寫失敗，請稍後再試。' });
    }
});

// --- API 路由 2: 外電新聞翻譯與改寫 (已修改) ---
app.post('/translate-rewrite', async (req, res) => {
    console.log('收到 /translate-rewrite 請求');
    const { url, sourceLanguage } = req.body;

    if (!url) {
        return res.status(400).json({ error: '請提供外電新聞網址。' });
    }

    try {
        const { content: articleContent, siteName, rawTitle } = await extractArticleContent(url);
        if (!articleContent) {
            return res.status(400).json({ error: '無法獲取外電網址內容，請檢查網址是否有效或內容是否可讀。' });
        }

        const translatePrompt = `請將以下${sourceLanguage !== 'auto' ? sourceLanguage + '語' : '外語'}新聞內容精準翻譯成繁體中文。只提供翻譯後的內容，不要額外評論。原文：\n\n${articleContent}`;
        const translateResult = await model.generateContent({
            contents: [{ parts: [{ text: translatePrompt }] }],
            safetySettings: safetySettings
        });
        const translatedText = (await translateResult.response).text();

        // --- 新增：內容優化步驟 ---
        const filteredContent = filterBrands(translatedText);
        const rewrittenContent = removePRContent(filteredContent);
        const finalContent = simpleRewrite(rewrittenContent);
        const titles = generateOptimizedTitles(rawTitle, finalContent);

        const rewritePrompt = `請將以下繁體中文的新聞內容改寫成一篇全新、流暢、專業的新聞稿，避免與原文重複，但保留核心資訊和事實。請以繁體中文輸出。
        若原文來自《${siteName}》，請在改寫後的新聞稿開頭註明來源。
        請以 JSON 格式輸出結果，包含 'content' (新聞稿內容)。
        例如：
        {
          "content": "..."
        }
        改寫前內容：\n\n${finalContent}`;

        const rewriteResult = await model.generateContent({
            contents: [{ parts: [{ text: rewritePrompt }] }],
            safetySettings: safetySettings
        });
        const response = await rewriteResult.response;
        const rawText = response.text();
        const aiOutput = parseAIOutput(rawText);

        res.json({
            content: {
                translatedRewrittenText: aiOutput.content || finalContent,
                optimizedTitles: titles,
                originalSource: siteName
            }
        });

    } catch (error) {
        console.error('外電翻譯改寫失敗:', error);
        res.status(500).json({ error: error.message || '外電翻譯改寫失敗，請稍後再試。' });
    }
});


// --- API 路由 3: 訪問內容生成新聞稿 (已修改) ---
app.post('/generate-news', async (req, res) => {
    console.log('收到 /generate-news 請求');
    const { content, title, minLength, maxLength, numParagraphs, tone } = req.body;

    if (!content) {
        return res.status(400).json({ error: '請提供訪問內容。' });
    }

    const titles = generateOptimizedTitles(title, content);

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
請以 JSON 格式輸出結果，包含 'content' (新聞稿內容)。
例如：
{
  "content": "..."
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
        const aiOutput = parseAIOutput(rawText);

        // --- 新增：內容優化步驟 ---
        const filteredContent = filterBrands(aiOutput.content);
        const rewrittenContent = removePRContent(filteredContent);
        const finalContent = simpleRewrite(rewrittenContent);

        res.json({
            content: {
                generatedText: finalContent,
                optimizedTitles: titles
            }
        });

    } catch (error) {
        console.error('生成新聞稿失敗:', error);
        res.status(500).json({ error: error.message || '生成新聞稿失敗，請稍後再試。' });
    }
});


// --- API 路由 5: 名人社群文章轉新聞 (已修改) ---
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
請以 JSON 格式輸出結果，包含 'content' (新聞稿內容)。
例如：
{
  "content": "..."
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
        const aiOutput = parseAIOutput(rawText);
        const generatedTitle = aiOutput.longTitles[0] || postContent.substring(0, 30);

        // --- 新增：內容優化步驟 ---
        const filteredContent = filterBrands(aiOutput.content);
        const rewrittenContent = removePRContent(filteredContent);
        const finalContent = simpleRewrite(rewrittenContent);
        const titles = generateOptimizedTitles(generatedTitle, finalContent);

        res.json({
            content: {
                celebrityNewsText: finalContent,
                optimizedTitles: titles
            }
        });

    } catch (error) {
        console.error('名人社群文章轉新聞失敗:', error);
        res.status(500).json({ error: error.message || '名人社群文章轉新聞失敗，請稍後再試。' });
    }
});

// --- API 路由：YouTube 連結轉新聞 (已實作) ---
app.post('/generate-news-from-youtube', async (req, res) => {
    console.log('收到 /generate-news-from-youtube 請求');
    const { youtubeUrl, sourceLanguage, mediaDescription, socialRemark } = req.body;

    if (!youtubeUrl) {
        return res.status(400).json({ error: '請提供 YouTube 影片連結。' });
    }

    try {
        const videoId = ytdl.getURLVideoID(youtubeUrl);
        const videoInfo = await ytdl.getInfo(videoId);

        const captions = videoInfo.player_response.captions;
        if (!captions || !captions.playerCaptionsTracklistRenderer) {
            throw new Error('此影片沒有字幕。');
        }

        const captionTracks = captions.playerCaptionsTracklistRenderer.captionTracks;
        const targetTrack = captionTracks.find(track => track.languageCode === sourceLanguage);

        if (!targetTrack) {
            throw new Error(`找不到 ${sourceLanguage} 語言的字幕。`);
        }

        const captionUrl = targetTrack.baseUrl;
        const captionResponse = await axios.get(captionUrl);
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(captionResponse.data);

        const captionText = result.tt.body[0].div[0].p.map(p => p._).join(' ');
        
        let prompt = `請根據以下 YouTube 影片字幕內容，寫一篇新聞報導。
        字幕內容：
        \`\`\`
        ${captionText}
        \`\`\`
        請以 JSON 格式輸出結果，包含 'content' (新聞稿內容)。
        例如：
        {
          "content": "..."
        }
        `;
        
        const resultAI = await model.generateContent(prompt, safetySettings);
        const aiOutput = parseAIOutput(resultAI.response.text());

        // --- 新增：內容優化步驟 ---
        const filteredContent = filterBrands(aiOutput.content);
        const rewrittenContent = removePRContent(filteredContent);
        const finalContent = simpleRewrite(rewrittenContent);
        const titles = generateOptimizedTitles(aiOutput.longTitles[0] || finalContent.substring(0, 30), finalContent);

        res.json({
            content: {
                newsContent: finalContent,
                optimizedTitles: titles
            }
        });
    } catch (error) {
        console.error('YouTube 連結轉新聞失敗:', error);
        res.status(500).json({ error: 'YouTube 連結轉新聞失敗：' + error.message });
    }
});


// --- API 路由 4: 錯字校正與語法檢查 (已修改) ---
app.post('/proofread-text', async (req, res) => {
    console.log('收到 /proofread-text 請求');
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: '請提供需要校對的內容。' });
    }

    const prompt = `請以繁體中文檢查以下文本的錯字、語法錯誤、標點符號錯誤。
    你的目標是返回**原始文本的完整內容**。
    對於你認為是「錯字」或「明顯的語法錯誤」的地方，請在原文中將「原始錯誤的詞彙或短語」以「原始錯誤詞彙（訂正後的詞彙）」的格式直接嵌入到原始文本中。
    **除了這些訂正標記外，不要改寫、增刪任何其他文字。**確保最終輸出是整個原始文本，但錯誤處帶有紅色標記的格式。
    如果沒有錯誤，則直接返回原始文本。
    原始文本：\n\n${text}`;

    try {
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings: safetySettings
        });
        const response = await result.response;
        const correctedText = response.text();

        // --- 新增：生成標題 ---
        const titles = generateOptimizedTitles("錯字校正", correctedText);

        res.json({ 
            content: {
                correctedText: correctedText,
                optimizedTitles: titles
            }
        });

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