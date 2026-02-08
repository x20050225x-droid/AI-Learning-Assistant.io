// --- 變數與設定 ---
// 基礎 API URL，模型名稱將從設定中讀取
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/`;

// 專題示範文字
const DEMO_CONTENT = `專題名稱：AI 學習助理
專題動機：
在現代教育環境中，教師不僅需投入大量時間進行試題設計，還必須顧及題目是否能準確對應教材內容。傳統題庫多為固定題目，難以依據教材更新即時調整。本專題嘗試結合人工智慧技術，開發一套能依據教材內容自動生成測驗題目，並透過學習數據分析回饋學習成效的系統。

系統核心功能：
1. 自動題庫生成：系統可依據教材內容或指定知識點，透過自然語言處理技術自動生成選擇題，並同時產出題目解析，降低教師負擔。
2. 學習行為分析：系統將自動記錄學生的作答正確率、作答時間與錯題分布情形。
3. 個人化學習路徑建議：辨識學生的學習弱點與概念盲區，進而提供對應的練習建議。`;

// --- UI 控制函式 ---
function switchTab(tabName) {
    ['project', 'text', 'ai'].forEach(id => {
        const content = document.getElementById(`content-${id}`);
        const tab = document.getElementById(`tab-${id}`);
        if(content && tab) {
            content.classList.remove('active');
            tab.classList.remove('active', 'border-purple-600', 'text-purple-600');
            tab.classList.add('text-gray-500');
        }
    });
    
    const activeTab = document.getElementById(`tab-${tabName}`);
    const activeContent = document.getElementById(`content-${tabName}`);
    
    if(activeContent && activeTab) {
        activeContent.classList.add('active');
        activeTab.classList.add('active', 'border-purple-600', 'text-purple-600');
        activeTab.classList.remove('text-gray-500');
    }
}

function switchRightTab(tabName) {
    const previewView = document.getElementById('view-preview');
    const analysisView = document.getElementById('view-analysis');
    const tabPreview = document.getElementById('tab-preview-q');
    const tabAnalysis = document.getElementById('tab-preview-a');
    
    if (tabName === 'preview') {
        previewView.classList.remove('hidden');
        analysisView.classList.add('hidden');
        tabPreview.className = "font-bold text-gray-800 border-b-2 border-purple-600 pb-1";
        tabAnalysis.className = "font-medium text-gray-400 hover:text-gray-600 pb-1";
    } else {
        previewView.classList.add('hidden');
        analysisView.classList.remove('hidden');
        tabAnalysis.className = "font-bold text-gray-800 border-b-2 border-purple-600 pb-1";
        tabPreview.className = "font-medium text-gray-400 hover:text-gray-600 pb-1";
    }
}

function loadDemoContent() {
    document.getElementById('text-input').value = DEMO_CONTENT;
    switchTab('text');
    showToast('已載入專題示範文案！', 'success');
}

function showToast(msg, type='success') {
    const toast = document.getElementById('toast');
    const msgElem = document.getElementById('toast-message');
    if(toast && msgElem) {
        msgElem.textContent = msg;
        toast.className = `fixed bottom-5 right-5 text-white py-2 px-5 rounded-lg shadow-xl transition-opacity duration-300 z-50 ${type === 'error' ? 'bg-red-500' : 'bg-green-500'}`;
        toast.classList.remove('opacity-0');
        setTimeout(() => toast.classList.add('opacity-0'), 3000);
    }
}

// --- 設定與 API Key ---
document.addEventListener('DOMContentLoaded', () => {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPopover = document.getElementById('settings-popover');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveBtn = document.getElementById('save-api-key-btn');
    const clearBtn = document.getElementById('clear-api-key-btn');
    const regenerateBtn = document.getElementById('regenerate-btn');
    const modelSelect = document.getElementById('model-select');

    // 載入儲存的 Key
    const savedKey = localStorage.getItem('gemini_api_key');
    if(savedKey) apiKeyInput.value = savedKey;

    // 載入儲存的模型 (如果有的話)
    const savedModel = localStorage.getItem('gemini_model');
    if(savedModel && modelSelect) modelSelect.value = savedModel;

    // 事件監聽
    if(settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsPopover.classList.toggle('open');
        });
    }

    document.addEventListener('click', (e) => {
        if (settingsPopover && !settingsPopover.contains(e.target) && settingsBtn && !settingsBtn.contains(e.target)) {
            settingsPopover.classList.remove('open');
        }
    });
    
    if(saveBtn) {
        saveBtn.addEventListener('click', () => {
            const key = apiKeyInput.value.trim();
            const model = modelSelect.value;
            
            if(key) localStorage.setItem('gemini_api_key', key);
            if(model) localStorage.setItem('gemini_model', model);
            
            showToast('設定已儲存');
            settingsPopover.classList.remove('open');
        });
    }
    
    if(clearBtn) {
        clearBtn.addEventListener('click', () => {
            localStorage.removeItem('gemini_api_key');
            apiKeyInput.value = '';
            showToast('API Key 已清除');
        });
    }

    if(regenerateBtn) {
        regenerateBtn.addEventListener('click', generateQuestions);
    }
});


// --- 核心出題邏輯 ---
function cleanAndParseJSON(text) {
    try {
        // 移除 markdown 標記 (```json ... ```)
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("原始回傳內容:", text);
        throw new Error("JSON 解析失敗");
    }
}

async function generateQuestions() {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return showToast('請先在右上角設定 API Key', 'error');

    const text = document.getElementById('text-input').value;
    if (!text.trim()) return showToast('請先輸入教材內容', 'error');

    // 獲取當前選擇的模型
    const selectedModel = document.getElementById('model-select').value || 'gemini-1.5-flash-002';
    
    // UI 狀態更新
    switchRightTab('preview');
    const container = document.getElementById('questions-container');
    const placeholder = document.getElementById('preview-placeholder');
    const loader = document.getElementById('preview-loader');
    const btn = document.getElementById('regenerate-btn');

    container.innerHTML = '';
    placeholder.classList.add('hidden');
    loader.classList.remove('hidden');
    btn.disabled = true;
    btn.innerHTML = '生成中...';

    const numQ = document.getElementById('num-questions').value;
    const diff = document.getElementById('difficulty-select').value;
    const type = document.getElementById('question-type-select').value;

    // Prompt 構建
    let prompt = `你是一個專業的 JSON 資料生成器。請閱讀教材，生成 ${numQ} 題 ${diff}程度的`;
    
    if (type === 'multiple_choice') {
        prompt += `「選擇題」。
        重要：請直接回傳純 JSON 陣列，不要包含任何 markdown 標記。
        格式範例：
        [
          {
            "text": "題目敘述",
            "options": ["選項A", "選項B", "選項C", "選項D"],
            "correct": 0,
            "explanation": "解析"
          }
        ]
        
        教材內容：
        ${text}`;
    } else {
        prompt += `「是非題」。
        重要：請直接回傳純 JSON 陣列，不要包含任何 markdown 標記。
        格式範例：
        [
          {
            "text": "題目敘述",
            "is_correct": true,
            "explanation": "解析"
          }
        ]
        
        教材內容：
        ${text}`;
    }

    try {
        const url = `${BASE_URL}${selectedModel}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { 
                    responseMimeType: "application/json"
                }
            })
        });

        const data = await response.json();
        
        if (data.error) {
            // 特別處理模型找不到的錯誤
            if (data.error.message.includes('not found') || data.error.message.includes('not supported')) {
                throw new Error(`模型 ${selectedModel} 無法使用，請在右上角設定切換模型。`);
            }
            throw new Error(data.error.message || 'API 呼叫錯誤');
        }

        if (!data.candidates || !data.candidates[0].content) {
            throw new Error('模型未回傳內容');
        }

        const rawText = data.candidates[0].content.parts[0].text;
        const questions = cleanAndParseJSON(rawText);

        renderQuestions(questions, type);
        showToast('題目生成成功！');

    } catch (error) {
        console.error(error);
        let msg = `錯誤: ${error.message}`;
        if (error.message.includes('API key not valid')) msg = 'API Key 無效';
        
        showToast('生成失敗，請查看下方錯誤', 'error');
        placeholder.classList.remove('hidden');
        placeholder.innerHTML = `<p class="text-red-500 font-bold mb-2">${msg}</p><p class="text-sm text-gray-500">建議：點擊右上角設定，切換其他 AI 模型版本再試一次。</p>`;
    } finally {
        loader.classList.add('hidden');
        btn.disabled = false;
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            開始出題
        `;
    }
}

function renderQuestions(questions, type) {
    const container = document.getElementById('questions-container');
    container.innerHTML = '';

    questions.forEach((q, idx) => {
        const card = document.createElement('div');
        card.className = 'bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-sm hover:border-purple-300 transition animate-fadeIn';
        
        let optionsHtml = '';
        if (type === 'multiple_choice') {
            q.options.forEach((opt, i) => {
                const isCorrect = i === q.correct;
                optionsHtml += `
                    <div class="flex items-center mt-2 ${isCorrect ? 'text-green-700 font-bold bg-green-50 p-1 rounded' : 'text-gray-600'}">
                        <div class="w-6 h-6 rounded-full border ${isCorrect ? 'border-green-600 bg-green-100 text-green-700' : 'border-gray-300'} flex items-center justify-center text-xs mr-2">
                            ${['A','B','C','D'][i]}
                        </div>
                        <span>${opt}</span>
                        ${isCorrect ? '<svg class="w-4 h-4 ml-auto text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' : ''}
                    </div>
                `;
            });
        } else {
             const isTrue = q.is_correct;
             optionsHtml = `
                <div class="flex gap-4 mt-2">
                    <span class="px-3 py-1 rounded border ${isTrue ? 'bg-green-100 border-green-300 text-green-700 font-bold' : 'bg-white border-gray-300'}">O 正確</span>
                    <span class="px-3 py-1 rounded border ${!isTrue ? 'bg-green-100 border-green-300 text-green-700 font-bold' : 'bg-white border-gray-300'}">X 錯誤</span>
                </div>
             `;
        }

        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <span class="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded">Q${idx+1}</span>
            </div>
            <p class="font-bold text-gray-800 mb-3">${q.text}</p>
            <div class="space-y-1 mb-4">
                ${optionsHtml}
            </div>
            <div class="text-xs text-gray-500 bg-white p-3 rounded border border-gray-100">
                <span class="font-bold text-gray-400">💡 解析：</span> ${q.explanation || '無解析'}
            </div>
        `;
        container.appendChild(card);
    });
}