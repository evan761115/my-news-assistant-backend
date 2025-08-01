document.addEventListener('DOMContentLoaded', () => {
    // 獲取所有元素
    const newsContent = document.getElementById('newsContent');
    const newsTitle = document.getElementById('newsTitle');
    const minLength = document.getElementById('minLength');
    const maxLength = document.getElementById('maxLength');
    const numParagraphs = document.getElementById('numParagraphs');
    const toneSelect = document.getElementById('toneSelect');
    const generateNewsBtn = document.getElementById('generateNewsBtn');
    const generatedNewsOutput = document.getElementById('generatedNewsOutput');
    // 新增：用於顯示優化後的三種標題的元素
    const generatedNewsOptimizedTitles = document.getElementById('generatedNewsOptimizedTitles');

    const rewriteUrlInput = document.getElementById('rewriteUrlInput');
    const rewriteUrlBtn = document.getElementById('rewriteUrlBtn');
    const rewrittenUrlOutput = document.getElementById('rewrittenUrlOutput');
    // 新增：用於顯示優化後的三種標題的元素
    const rewrittenUrlOptimizedTitles = document.getElementById('rewrittenUrlOptimizedTitles');

    const newsDraftInput = document.getElementById('newsDraftInput');
    const rewriteNewsDraftBtn = document.getElementById('rewriteNewsDraftBtn');
    const rewrittenNewsDraftOutput = document.getElementById('rewrittenNewsDraftOutput');
    // 新增：用於顯示優化後的三種標題的元素
    const rewrittenNewsDraftOptimizedTitles = document.getElementById('rewrittenNewsDraftOptimizedTitles');
    const isBrandsFiltered = document.getElementById('isBrandsFiltered');


    const foreignNewsUrlInput = document.getElementById('foreignNewsUrlInput');
    const sourceLanguageSelect = document.getElementById('sourceLanguageSelect');
    const translateRewriteBtn = document.getElementById('translateRewriteBtn');
    const translatedRewrittenOutput = document.getElementById('translatedRewrittenOutput');
    // 新增：用於顯示優化後的三種標題的元素
    const translatedRewrittenOptimizedTitles = document.getElementById('translatedRewrittenOptimizedTitles');


    // 名人社群轉新聞 相關元素
    const celebrityNameInput = document.getElementById('celebrityNameInput');
    const socialPlatformSelect = document.getElementById('socialPlatformSelect');
    const socialPostContent = document.getElementById('socialPostContent');
    const mediaDescriptionInput = document.getElementById('mediaDescriptionInput');
    const originalSocialLinkInput = document.getElementById('originalSocialLinkInput');
    const socialRemarkInput = document.getElementById('socialRemarkInput');
    const generateSocialNewsBtn = document.getElementById('generateSocialNewsBtn');
    const generatedSocialNewsOutput = document.getElementById('generatedSocialNewsOutput');
    // 新增：用於顯示優化後的三種標題的元素
    const generatedSocialNewsOptimizedTitles = document.getElementById('generatedSocialNewsOptimizedTitles');


    // YouTube 連結轉新聞 相關元素
    const youtubeUrlInput = document.getElementById('youtubeUrlInput');
    const generateYoutubeNewsBtn = document.getElementById('generateYoutubeNewsBtn');
    const generatedYoutubeNewsOutput = document.getElementById('generatedYoutubeNewsOutput');
    // 新增：用於顯示優化後的三種標題的元素
    const generatedYoutubeNewsOptimizedTitles = document.getElementById('generatedYoutubeNewsOptimizedTitles');

    const proofreadTextInput = document.getElementById('proofreadTextInput');
    const proofreadTextBtn = document.getElementById('proofreadTextBtn');
    const correctedTextOutput = document.getElementById('correctedTextOutput'); // 現在是 div
    // 新增：用於顯示優化後的三種標題的元素
    const correctedTextOptimizedTitles = document.getElementById('correctedTextOptimizedTitles');

    const historyList = document.getElementById('historyList');

    // 歷史記錄功能
    let history = JSON.parse(localStorage.getItem('aiNewsHistory')) || [];

    const saveHistory = () => {
        localStorage.setItem('aiNewsHistory', JSON.stringify(history));
        renderHistory();
    };

    // 輔助函數：將轉義字符轉換為可讀文本
    function unescapeHtml(text) {
        if (typeof text !== 'string') {
            return String(text || '');
        }
        let unescapedText = text.replace(/\\n/g, '\n').replace(/\\"/g, '"');
        const doc = new DOMParser().parseFromString(unescapedText, 'text/html');
        return doc.documentElement.textContent;
    }

    // 輔助函數：將帶有特定標記的文本轉換為 HTML (用於錯字校正)
    function formatProofreadText(text) {
        if (typeof text !== 'string') return String(text || '');
        const regex = /([\u4e00-\u9fa5a-zA-Z0-9_]+)[\(\uff08]([\u4e00-\u9fa5a-zA-Z0-9_]+)[\)\uff09]/g;
        let resultHtml = '';
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            resultHtml += unescapeHtml(text.substring(lastIndex, match.index));
            const errorWord = match[1];
            const correctedWord = match[2];
            if (errorWord && correctedWord) {
                resultHtml += `<span class="error-highlight">${unescapeHtml(errorWord)}</span>（${unescapeHtml(correctedWord)}）`;
            } else {
                resultHtml += unescapeHtml(match[0]);
            }
            lastIndex = regex.lastIndex;
        }

        resultHtml += unescapeHtml(text.substring(lastIndex));
        return resultHtml;
    }


    const renderHistory = () => {
        historyList.innerHTML = '';
        if (history.length === 0) {
            historyList.innerHTML = '<p>尚無歷史記錄。</p>';
            return;
        }
        history.forEach((item, index) => {
            const historyItem = document.createElement('div');
            historyItem.classList.add('history-item');

            let displayContent = '';
            // --- 歷史記錄邏輯已更新，以適應後端的新 JSON 格式 ---
            if (item.content && item.content.content) {
                const innerContent = item.content.content;
                if (innerContent.rewrittenText) {
                    displayContent = innerContent.rewrittenText;
                } else if (innerContent.generatedText) {
                    displayContent = innerContent.generatedText;
                } else if (innerContent.translatedRewrittenText) {
                    displayContent = innerContent.translatedRewrittenText;
                } else if (innerContent.celebrityNewsText) {
                    displayContent = innerContent.celebrityNewsText;
                } else if (innerContent.newsContent) {
                    displayContent = innerContent.newsContent;
                } else if (innerContent.correctedText) {
                    displayContent = innerContent.correctedText;
                }
            } else {
                displayContent = '內容無效或空白';
            }


            let previewHtml = '';
            if (item.type === '錯字校正與語法檢查') {
                const plainTextPreview = unescapeHtml(displayContent).substring(0, 100).replace(/\n/g, ' ') + (displayContent.length > 100 ? '...' : '');
                previewHtml = plainTextPreview;
            } else {
                previewHtml = unescapeHtml(displayContent).substring(0, 100).replace(/\n/g, ' ') + (displayContent.length > 100 ? '...' : '');
            }

            historyItem.innerHTML = `
                <div class="history-header">
                    <span>${item.type} (${new Date(item.timestamp).toLocaleString()})</span>
                    <div class="history-actions">
                        <button class="copy-btn" data-index="${index}">複製</button>
                        <button class="delete-btn" data-index="${index}">刪除</button>
                    </div>
                </div>
                <div class="history-content-preview">
                    ${previewHtml}
                </div>
            `;
            historyList.appendChild(historyItem);
        });

        document.querySelectorAll('.copy-btn').forEach(button => {
            button.onclick = (e) => {
                const index = e.target.dataset.index;
                let textToCopy = '';
                const itemContent = history[index].content && history[index].content.content;

                if (itemContent) {
                    textToCopy = itemContent.rewrittenText || itemContent.generatedText || itemContent.translatedRewrittenText || itemContent.celebrityNewsText || itemContent.newsContent || itemContent.correctedText;
                }
                
                if (textToCopy) {
                     textToCopy = unescapeHtml(textToCopy); // 確保複製的是純文本
                } else {
                    textToCopy = "無法複製內容";
                }

                navigator.clipboard.writeText(textToCopy).then(() => {
                    alert('內容已複製到剪貼簿！');
                }).catch(err => {
                    console.error('複製失敗:', err);
                });
            };
        });

        document.querySelectorAll('.delete-btn').forEach(button => {
            button.onclick = (e) => {
                const index = e.target.dataset.index;
                if (confirm('確定要刪除這條歷史記錄嗎？')) {
                    history.splice(index, 1);
                    saveHistory();
                }
            };
        });
    };

    renderHistory();

    // 新增：渲染三種優化標題的函數
    function renderOptimizedTitles(ulElement, optimizedTitles) {
        ulElement.innerHTML = '';
        if (optimizedTitles && typeof optimizedTitles === 'object') {
            const keys = ['藏標', '正統', '特別'];
            keys.forEach(key => {
                const title = optimizedTitles[key];
                if (title) {
                    const li = document.createElement('li');
                    li.innerHTML = `<strong>${key}：</strong> ${unescapeHtml(title)}`;
                    ulElement.appendChild(li);
                }
            });
        } else {
            const li = document.createElement('li');
            li.textContent = '無建議標題。';
            ulElement.appendChild(li);
        }
    }


    // 通用處理函數，用於處理 AI 請求
    async function handleAIRequest(button, outputField, apiEndpoint, payload, titlesOutputElement) {
        // --- 在這裡新增後端網址 ---
        const backendUrl = 'https://my-news-assistant-backend.onrender.com';
        const fullUrl = `${backendUrl}${apiEndpoint}`;

        button.disabled = true;
        if (outputField.id === 'correctedTextOutput') {
            outputField.innerHTML = '<p style="color: #666;">AI 正在努力生成中，請稍候...</p>';
        } else {
            outputField.value = 'AI 正在努力生成中，請稍候...';
        }

        if (titlesOutputElement) {
             renderOptimizedTitles(titlesOutputElement, null);
        }

        try {
            console.log(`[Frontend Debug] Sending request to: ${fullUrl}`);
            console.log(`[Frontend Debug] Payload:`, payload);

            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            console.log(`[Frontend Debug] Received response status: ${response.status}`);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log(`[Frontend Debug] Received data:`, data);

            // --- API 響應處理邏輯已更新 ---
            const result = data.content;
            if (!result) {
                throw new Error("AI 返回的內容格式不正確，缺少 'content' 字段。");
            }

            let resultText = '';
            let historyType = '';

            if (apiEndpoint === '/generate-news') {
                resultText = result.generatedText;
                historyType = '新聞重點產出新聞';
            } else if (apiEndpoint === '/rewrite-url') {
                resultText = result.rewrittenText;
                historyType = '新聞連結改寫';
            } else if (apiEndpoint === '/translate-rewrite') {
                resultText = result.translatedRewrittenText;
                historyType = '外電新聞翻譯與改寫';
            } else if (apiEndpoint === '/rewrite-news-draft') {
                resultText = result.rewrittenNewsDraftText;
                historyType = '新聞稿改寫';
            } else if (apiEndpoint === '/celebrity-social-to-news') {
                resultText = result.celebrityNewsText;
                historyType = '名人社群文章轉新聞';
            } else if (apiEndpoint === '/generate-news-from-youtube') {
                 resultText = result.newsContent;
                 historyType = 'YouTube 連結轉新聞';
            } else if (apiEndpoint === '/proofread-text') {
                resultText = result.correctedText;
                historyType = '錯字校正與語法檢查';
            }

            if (outputField.id === 'correctedTextOutput') {
                outputField.innerHTML = formatProofreadText(resultText);
            } else if (typeof resultText === 'string') {
                outputField.value = unescapeHtml(resultText);
            } else {
                outputField.value = "錯誤：AI 返回內容格式不正確。原始響應: " + JSON.stringify(data, null, 2);
            }

            // --- 渲染優化標題 ---
            if (titlesOutputElement) {
                renderOptimizedTitles(titlesOutputElement, result.optimizedTitles);
            }

            history.unshift({
                type: historyType,
                content: data,
                timestamp: new Date().toISOString()
            });
            saveHistory();

        } catch (error) {
            console.error('[Frontend Debug] 發生錯誤:', error);
            if (outputField.id === 'correctedTextOutput') {
                 outputField.innerHTML = `<p style="color: red;">發生錯誤：${error.message}</p>`;
            } else {
                outputField.value = `發生錯誤：${error.message}`;
            }
            alert(`操作失敗：${error.message}`);
        } finally {
            button.disabled = false;
        }
    }

    // 事件監聽器：生成新聞稿
    generateNewsBtn.addEventListener('click', () => {
        const payload = {
            content: newsContent.value,
            title: newsTitle.value,
            minLength: parseInt(minLength.value) || 0,
            maxLength: parseInt(maxLength.value) || 0,
            numParagraphs: parseInt(numParagraphs.value) || 0,
            tone: toneSelect.value
        };
        handleAIRequest(generateNewsBtn, generatedNewsOutput, '/generate-news', payload,
                        generatedNewsOptimizedTitles);
    });

    // 事件監聽器：新聞連結改寫
    rewriteUrlBtn.addEventListener('click', () => {
        const payload = { url: rewriteUrlInput.value };
        handleAIRequest(rewriteUrlBtn, rewrittenUrlOutput, '/rewrite-url', payload,
                        rewrittenUrlOptimizedTitles);
    });

    // 事件監聽器：新聞稿改寫
    rewriteNewsDraftBtn.addEventListener('click', () => {
        const payload = { 
            content: newsDraftInput.value,
            isBrandsFiltered: isBrandsFiltered.checked
        };
        handleAIRequest(rewriteNewsDraftBtn, rewrittenNewsDraftOutput, '/rewrite-news-draft', payload,
                        rewrittenNewsDraftOptimizedTitles);
    });

    // 事件監聽器：外電新聞翻譯與改寫
    translateRewriteBtn.addEventListener('click', () => {
        const payload = {
            url: foreignNewsUrlInput.value,
            sourceLanguage: sourceLanguageSelect.value
        };
        handleAIRequest(translateRewriteBtn, translatedRewrittenOutput, '/translate-rewrite', payload,
                        translatedRewrittenOptimizedTitles);
    });

    // 事件監聽器：名人社群文章轉新聞
    generateSocialNewsBtn.addEventListener('click', () => {
        const payload = {
            artistName: celebrityNameInput.value,
            platform: socialPlatformSelect.value,
            postContent: socialPostContent.value,
            mediaDescription: mediaDescriptionInput.value,
            originalLink: originalSocialLinkInput.value,
            remark: socialRemarkInput.value
        };

        if (!payload.artistName || !payload.postContent) {
            alert('藝人名稱和社群文章內容為必填項。');
            return;
        }

        handleAIRequest(generateSocialNewsBtn, generatedSocialNewsOutput, '/celebrity-social-to-news', payload,
                        generatedSocialNewsOptimizedTitles);
    });

    // 事件監聽器：YouTube 連結轉新聞
    generateYoutubeNewsBtn.addEventListener('click', () => {
        const payload = { youtubeUrl: youtubeUrlInput.value };
        if (!payload.youtubeUrl) {
            alert('請輸入 YouTube 影片連結。');
            return;
        }
        handleAIRequest(generateYoutubeNewsBtn, generatedYoutubeNewsOutput, '/generate-news-from-youtube', payload,
                        generatedYoutubeNewsOptimizedTitles);
    });


    // 事件監聽器：錯字校正與語法檢查
    proofreadTextBtn.addEventListener('click', () => {
        const payload = { text: proofreadTextInput.value };
        handleAIRequest(proofreadTextBtn, correctedTextOutput, '/proofread-text', payload,
                        correctedTextOptimizedTitles);
    });

    // 統一的複製按鈕事件監聽器
    document.querySelectorAll('.copy-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetId = event.target.dataset.target;
            const targetElement = document.getElementById(targetId);
            let textToCopy = '';

            if (targetElement.tagName === 'TEXTAREA') {
                textToCopy = targetElement.value;
            } else if (targetElement.tagName === 'DIV' && targetElement.classList.contains('corrected-text-display')) {
                // 對於校對輸出的 DIV，需要去除 HTML 標記再複製
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = targetElement.innerHTML;
                const spans = tempDiv.querySelectorAll('span.error-highlight');
                spans.forEach(span => {
                    const nextSibling = span.nextSibling;
                    if (nextSibling && nextSibling.nodeType === 3 && nextSibling.textContent.startsWith('（')) {
                        const endParenIndex = nextSibling.textContent.indexOf('）');
                        if (endParenIndex !== -1) {
                            nextSibling.textContent = nextSibling.textContent.substring(endParenIndex + 1);
                        }
                    }
                    span.outerHTML = span.textContent;
                });
                textToCopy = tempDiv.textContent || tempDiv.innerText;
            }

            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    alert('內容已複製到剪貼簿！');
                }).catch(err => {
                    console.error('複製失敗:', err);
                    alert('複製失敗，請手動複製。');
                });
            } else {
                alert('沒有內容可以複製。');
            }
        });
    });


    // 導航菜單平滑滾動並激活樣式
    document.querySelectorAll('.nav-menu-sidebar a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelectorAll('.nav-menu-sidebar a').forEach(link => {
                link.classList.remove('active');
            });
            this.classList.add('active');

            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 70, // 考慮 header 和 fixed sidebar 的高度
                    behavior: 'smooth'
                });
            }
        });
    });

    // 頁面滾動時，激活當前可見的菜單項
    const sections = document.querySelectorAll('.tool-section');
    const navLinks = document.querySelectorAll('.nav-menu-sidebar a');

    const activateNavLink = () => {
        let currentActiveLink = null;
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 80; // 調整這個值以更好地適應滾動位置
            const sectionBottom = sectionTop + section.offsetHeight;
            const scrollPosition = window.scrollY;

            if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
                currentActiveLink = document.querySelector(`.nav-menu-sidebar a[href="#${section.id}"]`);
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
        });

        if (currentActiveLink) {
            currentActiveLink.classList.add('active');
        } else {
            // 如果沒有任何區塊在視圖內，則默認激活第一個連結
            if (window.scrollY < sections[0].offsetTop - 80) {
                 navLinks[0].classList.add('active');
            }
        }
    };

    window.addEventListener('scroll', activateNavLink);
    activateNavLink(); // 初始加載時調用一次以設置正確的活動連結

    // 初始化時，如果URL中有hash，則滾動到對應的section並激活菜單
    if (window.location.hash) {
        const targetElement = document.querySelector(window.location.hash);
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 70, // 考慮 header 和 fixed sidebar 的高度
                behavior: 'smooth'
            });
            const correspondingLink = document.querySelector(`.nav-menu-sidebar a[href="${window.location.hash}"]`);
            if (correspondingLink) {
                document.querySelectorAll('.nav-menu-sidebar a').forEach(link => link.classList.remove('active'));
                correspondingLink.classList.add('active');
            }
        }
    } else {
        const firstLink = document.querySelector('.nav-menu-sidebar a');
        if (firstLink) {
            firstLink.classList.add('active');
        }
    }
});