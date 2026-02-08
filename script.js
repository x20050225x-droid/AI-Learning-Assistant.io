// 全域設定
const CONFIG = {
    // 優先使用穩定版模型，避免 404
    MODEL_NAME: 'gemini-1.5-flash', 
    API_URL: 'https://generativelanguage.googleapis.com/v1beta/models'
};

// 狀態管理
let currentQuestions = [];
let currentStats = {
    currentInfo: 0,
    score: 0,
    startTime: 0,
    history: []
};

// --- 核心功能：參考了專業版的請求邏輯 ---
async function makeGeminiRequest(apiKey, payload, retryCount = 0) {
    const url = `${CONFIG.API_URL}/${CONFIG.MODEL_NAME}:generateContent?key=${apiKey}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // 處理 API 回傳錯誤
        if (!response.ok) {
            const errorMsg = data.error?.message || response.statusText;
            console.error("API Error:", errorMsg);
            throw new Error(`API 請求失敗: ${errorMsg}`);
        }

        return data;

    } catch (error) {
        // 簡單的重試邏輯 (Retry)
        if (retryCount < 1) {
            console.warn("請求失敗，正在重試...", error);
            await new Promise(r => setTimeout(r, 1000)); // 等待 1 秒
            return makeGeminiRequest(apiKey, payload, retryCount + 1);
        }
        throw error;
    }
}

// --- 核心功能：強化的 JSON 解析 (學習自參考程式碼) ---
function cleanAndParseJSON(text) {
    // 1. 移除 Markdown 標記 (```json ... ```)
    let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    // 2. 嘗試解析
    try {
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("JSON 解析失敗，原始文字:", text);
        // 3. 簡單的自動修復嘗試 (補上缺少的括號)
        if (cleanText.includes('[') && !cleanText.endsWith(']')) {
            cleanText += ']';
        }
        return JSON.parse(cleanText); // 再試一次
    }
}

// 1. 生成題庫主程式
async function generateQuiz() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const content = document.getElementById('learningContent').value;
    const qType = document.getElementById('qType').value;
    const difficulty = document.getElementById('difficulty').value;
    const count = document.getElementById('qCount').value;

    if (!apiKey || !content) {
        alert("請輸入 API Key 與 教材內容");
        return;
    }

    const btn = document.getElementById('generateBtn');
    const originalText = btn.textContent;
    btn.textContent = "AI 正在思考中 (模仿專家模式)...";
    btn.disabled = true;

    // Prompt 設計：要求更嚴格的 JSON
    const prompt = `
    你是一個專業的教師。請根據以下教材內容，設計 ${count} 題 ${difficulty} 程度的 ${qType}。
    
    【教材內容】：
    ${content}

    【絕對規則】：
    1. 只回傳純 JSON 格式。
    2. 不要說任何廢話 (如 "好的，這是題目")。
    3. 格式必須如下：
    [
        {
            "question": "題目",
            "options": ["選項A", "選項B", "選項C", "選項D"], 
            "answer": 0, 
            "explanation": "解析"
        }
    ]
    `;

    try {
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7, // 稍微降低創意度，讓格式更穩定
                responseMimeType: "application/json" // 強制 JSON 模式 (Gemini 1.5 功能)
            }
        };

        const data = await makeGeminiRequest(apiKey, payload);
        
        // 解析內容
        if (data.candidates && data.candidates[0].content) {
            const rawText = data.candidates[0].content.parts[0].text;
            currentQuestions = cleanAndParseJSON(rawText);
            
            if (currentQuestions.length === 0) throw new Error("生成的題目為空");
            
            startQuiz();
        } else {
            throw new Error("AI 沒有回傳任何候選內容");
        }

    } catch (error) {
        console.error(error);
        alert(`生成失敗：${error.message}\n請檢查 API Key 是否正確，或按 F12 查看 Console。`);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// 2. 測驗流程 (保持不變，因為這部分你的邏輯是對的)
function startQuiz() {
    currentStats.currentInfo = 0;
    currentStats.score = 0;
    currentStats.history = [];
    
    document.getElementById('setup-panel').classList.add('hidden');
    document.getElementById('quiz-panel').classList.remove('hidden');
    
    loadQuestion(0);
}

function loadQuestion(index) {
    if (index >= currentQuestions.length) {
        showResults();
        return;
    }

    const q = currentQuestions[index];
    currentStats.startTime = Date.now();

    document.getElementById('progress-text').textContent = `題目 ${index + 1} / ${currentQuestions.length}`;
    document.getElementById('question-text').textContent = q.question;
    document.getElementById('feedback-area').classList.add('hidden');

    const optsContainer = document.getElementById('options-container');
    optsContainer.innerHTML = '';

    // 防呆：如果選項不足 4 個，或者沒有選項 (如是非題)
    const options = q.options && q.options.length > 0 ? q.options : ["是", "否"];

    options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;
        btn.onclick = () => checkAnswer(i, btn);
        optsContainer.appendChild(btn);
    });
}

function checkAnswer(selectedIndex, btnElement) {
    const currentQ = currentQuestions[currentStats.currentInfo];
    const timeTaken = (Date.now() - currentStats.startTime) / 1000;
    const isCorrect = (selectedIndex === currentQ.answer);

    const opts = document.querySelectorAll('.option-btn');
    opts.forEach(btn => btn.disabled = true);

    if (isCorrect) {
        btnElement.classList.add('correct');
        currentStats.score++;
    } else {
        btnElement.classList.add('wrong');
        // 顯示正確答案
        if (opts[currentQ.answer]) {
            opts[currentQ.answer].classList.add('correct');
        }
    }

    currentStats.history.push({
        qId: currentStats.currentInfo,
        correct: isCorrect,
        time: timeTaken
    });

    document.getElementById('explanation-text').textContent = `解析：${currentQ.explanation}`;
    document.getElementById('feedback-area').classList.remove('hidden');
}

function nextQuestion() {
    currentStats.currentInfo++;
    loadQuestion(currentStats.currentInfo);
}

function showResults() {
    document.getElementById('quiz-panel').classList.add('hidden');
    document.getElementById('result-panel').classList.remove('hidden');

    const total = currentQuestions.length;
    const accuracy = total === 0 ? 0 : Math.round((currentStats.score / total) * 100);
    const avgTime = total === 0 ? 0 : (currentStats.history.reduce((a, b) => a + b.time, 0) / total).toFixed(1);

    document.getElementById('final-score').textContent = `${accuracy}%`;
    document.getElementById('avg-time').textContent = `${avgTime}s`;

    let advice = "";
    if (accuracy >= 80) advice = "太強了！完全掌握！";
    else if (accuracy >= 60) advice = "表現不錯，再接再厲！";
    else advice = "建議重新複習一下教材喔！";
    
    document.getElementById('ai-advice').textContent = advice;
}

function resetSystem() {
    document.getElementById('result-panel').classList.add('hidden');
    document.getElementById('setup-panel').classList.remove('hidden');
}