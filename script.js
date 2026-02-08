// 全域狀態管理
let questions = [];
let curIdx = 0;
let score = 0;
let qStartTime;
let timeLogs = [];

/**
 * 核心功能：生成題庫
 * [cite_start]實作分析可行性中所述之 AI 模型理解教材並產出題目之功能 [cite: 10, 11]
 */
async function generateQuiz() {
    const key = document.getElementById('apiKey').value.trim();
    const text = document.getElementById('content').value.trim();
    const type = document.getElementById('qType').value;
    const diff = document.getElementById('difficulty').value;
    const count = document.getElementById('qCount').value;

    if (!key || !text) {
        alert("請輸入 API Key 與教材內容");
        return;
    }

    const btn = document.getElementById('genBtn');
    btn.disabled = true;
    btn.textContent = "AI 正在分析教材並出題...";

    // 參考 QuestWiz 之 Prompt 設計邏輯
    const prompt = `
        你是一個專業教師。請根據教材內容：${text}，
        設計 ${count} 題 ${diff} 難度的 ${type}。
        【規則】：必須以純 JSON 陣列格式回傳，格式：
        [{"question":"題目","options":["選項1","選項2","選項3","選項4"],"answer":0,"explanation":"解析"}]
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        
        // JSON 容錯解析邏輯
        const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        questions = JSON.parse(cleanText);

        if (questions.length > 0) {
            startQuiz();
        }
    } catch (e) {
        console.error(e);
        alert("生成失敗，請檢查金鑰或 API 設定");
    } finally {
        btn.disabled = false;
        btn.textContent = "🚀 生成客製化題庫";
    }
}

/**
 * 測驗流程控制
 */
function startQuiz() {
    curIdx = 0;
    score = 0;
    timeLogs = [];
    document.getElementById('setup-panel').classList.add('hidden');
    document.getElementById('quiz-panel').classList.remove('hidden');
    loadQuestion();
}

function loadQuestion() {
    if (curIdx >= questions.length) {
        showResult();
        return;
    }
    
    qStartTime = Date.now();
    const q = questions[curIdx];
    document.getElementById('progress').textContent = `題目 ${curIdx + 1} / ${questions.length}`;
    document.getElementById('qText').textContent = q.question;
    document.getElementById('feedback').classList.add('hidden');
    
    const container = document.getElementById('options');
    container.innerHTML = '';
    
    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;
        btn.onclick = () => checkAnswer(i, btn);
        container.appendChild(btn);
    });
}

/**
 * 學習行為分析邏輯
 */
function checkAnswer(userIdx, btn) {
    const q = questions[curIdx];
    const timeSpent = (Date.now() - qStartTime) / 1000;
    timeLogs.push(timeSpent);
    
    const btns = document.querySelectorAll('.option-btn');
    btns.forEach(b => b.disabled = true);

    if (userIdx === q.answer) {
        btn.classList.add('correct');
        score++;
    } else {
        btn.classList.add('wrong');
        if (btns[q.answer]) btns[q.answer].classList.add('correct');
    }

    document.getElementById('explain').textContent = "💡 解析：" + q.explanation;
    document.getElementById('feedback').classList.remove('hidden');
}

function nextQ() {
    curIdx++;
    loadQuestion();
}

/**
 * 產出學習分析報告
 */
function showResult() {
    document.getElementById('quiz-panel').classList.add('hidden');
    document.getElementById('result-panel').classList.remove('hidden');
    
    const accuracy = Math.round((score / questions.length) * 100);
    const avgTime = (timeLogs.reduce((a, b) => a + b, 0) / questions.length).toFixed(1);
    
    document.getElementById('resScore').textContent = accuracy + "%";
    document.getElementById('resTime').textContent = avgTime + "s";
    
    // 個人化學習建議
    let advice = "";
    if (accuracy >= 80) advice = "太神啦！全對！";
    else if (accuracy >= 60) advice = "表現不錯，繼續保持！";
    else advice = "再複習一下教材吧！";
    
    document.getElementById('aiAdvice').textContent = "🤖 AI 學習分析建議：\n" + advice;
}