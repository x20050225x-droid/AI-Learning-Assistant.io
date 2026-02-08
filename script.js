// 確保 pdf.js 的 worker 路徑在任何操作前被設定
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;
}

// --- 核心設定：模型候補名單 (解決 404 問題的關鍵) ---
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/`;
// 系統會依序嘗試以下模型，直到成功為止
const MODEL_FALLBACKS = [
    'gemini-2.0-flash-exp',    // 目前 2.0/2.5 世代的最速模型
    'gemini-1.5-flash',        // 穩定版回退
    'gemini-1.5-flash-8b',     // 輕量版回退
    'gemini-1.5-pro'         // 最後防線
];

const CONFIG = {
    // 這裡只留參數，URL 由程式動態決定
    API_BATCH_SIZE: 8,
    DEBOUNCE_DELAY: 800,
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, 
    MAX_IMAGE_SIZE_BYTES: 4 * 1024 * 1024, 
    MAX_TOTAL_IMAGE_SIZE_BYTES: 15 * 1024 * 1024, 
};

// --- DOM 元素選取 (保持不變) ---
const mainContainer = document.getElementById('main-container');
const textInput = document.getElementById('text-input');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name-display');
const fileErrorDisplay = document.getElementById('file-error-display');
const imageInput = document.getElementById('image-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imageErrorDisplay = document.getElementById('image-error-display');
const numQuestionsInput = document.getElementById('num-questions');
const formatSelect = document.getElementById('format-select');
const loadingText = document.getElementById('loading-text');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const versionBtn = document.getElementById('version-btn');
const versionModal = document.getElementById('version-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const versionHistoryContent = document.getElementById('version-history-content');
const postDownloadModal = document.getElementById('post-download-modal');
const postDownloadModalContent = document.getElementById('post-download-modal-content');
const continueEditingBtn = document.getElementById('continue-editing-btn');
const clearAndNewBtn = document.getElementById('clear-and-new-btn');
const questionTypeSelect = document.getElementById('question-type-select');
const difficultySelect = document.getElementById('difficulty-select');
const copyContentBtn = document.getElementById('copy-content-btn');
const clearContentBtn = document.getElementById('clear-content-btn');
const questionStyleSelect = document.getElementById('question-style-select');
const settingsBtn = document.getElementById('settings-btn');
const settingsPopover = document.getElementById('settings-popover');
const layoutToggleBtn = document.getElementById('layout-toggle-btn');
const themeRadios = document.querySelectorAll('input[name="theme"]');
const apiKeyInput = document.getElementById('api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const clearApiKeyBtn = document.getElementById('clear-api-key-btn');
const autoGenerateToggle = document.getElementById('auto-generate-toggle');
const tabText = document.getElementById('tab-text');
const tabImage = document.getElementById('tab-image');
const tabAi = document.getElementById('tab-ai');
const contentText = document.getElementById('content-text');
const contentImage = document.getElementById('content-image');
const contentAi = document.getElementById('content-ai');
const topicInput = document.getElementById('topic-input');
const generateContentBtn = document.getElementById('generate-content-btn');
const studentLevelSelect = document.getElementById('student-level-select');
const competencyBasedCheckbox = document.getElementById('competency-based-checkbox');
const generateFromImagesBtn = document.getElementById('generate-from-images-btn');
const previewLoader = document.getElementById('preview-loader');
const previewPlaceholder = document.getElementById('preview-placeholder');
const questionsContainer = document.getElementById('questions-container');
const previewActions = document.getElementById('preview-actions');
const regenerateBtn = document.getElementById('regenerate-btn');
const downloadBtn = document.getElementById('download-btn');
const imageDropZone = document.getElementById('image-drop-zone');
const languageChoiceModal = document.getElementById('language-choice-modal');
const languageChoiceModalContent = document.getElementById('language-choice-modal-content');
const langChoiceZhBtn = document.getElementById('lang-choice-zh-btn');
const langChoiceEnBtn = document.getElementById('lang-choice-en-btn');

const tabs = [tabText, tabImage, tabAi];
const contents = [contentText, contentImage, contentAi];
const controls = [textInput, numQuestionsInput, questionTypeSelect, difficultySelect, questionStyleSelect];

// --- 全域狀態 ---
let generatedQuestions = [];
let sortableInstance = null;
let uploadedImages = [];
let currentRequestController = null;

const questionLoadingMessages = [ "AI 老師正在絞盡腦汁出題中...", "靈感正在匯集中，題目即將問世...", "您的專屬考卷即將熱騰騰出爐！", "正在召喚出題小精靈為您服務...", "題目正在精心烹煮中，請稍候..." ];
const contentLoadingMessages = [ "AI 作家正在揮灑靈感，撰寫文章中...", "學習內文生成中，請稍待片刻...", "正在為您編織一篇精彩的故事...", "知識正在匯入，請稍候..." ];

// --- 核心功能函式 ---

function getApiKey() {
    return localStorage.getItem('gemini_api_key');
}

function showToast(message, type = 'success') {
    if (toast && toastMessage) {
        toastMessage.textContent = message;
        toast.className = `fixed bottom-5 right-5 text-white py-2 px-5 rounded-lg shadow-xl opacity-0 transition-opacity duration-300 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'} z-50`;
        toast.classList.remove('opacity-0');
        setTimeout(() => { toast.classList.add('opacity-0'); }, 4000);
    }
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

function isAutoGenerateEnabled() {
    const setting = localStorage.getItem('quizGenAutoGenerate_v1');
    return setting === null ? true : setting === 'true'; 
}

function updateRegenerateButtonState() {
    if (!regenerateBtn || !previewActions) return;
    const hasContent = (textInput && textInput.value.trim() !== '') || uploadedImages.length > 0;
    const isAutoMode = isAutoGenerateEnabled();

    if (!hasContent && !isAutoMode) {
        previewActions.classList.add('hidden');
        return;
    }
    
    const refreshIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10 10a1 1 0 01-1 1H5a1 1 0 110-2h5.001a5.002 5.002 0 004.087-7.885 1 1 0 111.732-1.001A7.002 7.002 0 0114 12z" clip-rule="evenodd" /></svg>`;
    const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg>`;

    if (isAutoMode) {
        if (generatedQuestions.length > 0) {
            previewActions.classList.remove('hidden');
            regenerateBtn.classList.remove('themed-button-primary');
            regenerateBtn.classList.add('bg-gray-500', 'hover:bg-gray-600');
            regenerateBtn.innerHTML = refreshIcon + '手動更新';
        } else {
            previewActions.classList.add('hidden');
        }
    } else {
        if (hasContent) {
            previewActions.classList.remove('hidden');
            regenerateBtn.classList.add('themed-button-primary');
            regenerateBtn.classList.remove('bg-gray-500', 'hover:bg-gray-600');
            if (generatedQuestions.length > 0) regenerateBtn.innerHTML = refreshIcon + '重新生成';
            else regenerateBtn.innerHTML = playIcon + '開始出題';
        } else {
             previewActions.classList.add('hidden');
        }
    }
}

// --- API 呼叫核心 (支援多模型重試) ---
async function fetchFromGemini(apiKey, payload) {
    let lastError = null;

    // 依序嘗試每一個模型
    for (const model of MODEL_FALLBACKS) {
        const apiUrl = `${BASE_URL}${model}:generateContent?key=${apiKey}`;
        if (loadingText) loadingText.textContent = `嘗試連線模型: ${model}...`;
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || response.statusText);
            }

            const result = await response.json();
            return result; // 成功就直接回傳

        } catch (error) {
            console.warn(`模型 ${model} 失敗:`, error.message);
            lastError = error;
            // 繼續下一個迴圈嘗試下一個模型
        }
    }
    // 如果全部都失敗
    throw new Error(`所有模型皆無法使用。請檢查 API Key 是否正確。(${lastError?.message})`);
}

async function generateContentFromTopic() {
    const apiKey = getApiKey();
    if (!apiKey) return showToast('請先在右上角「設定」中輸入您的 Gemini API Key！', 'error');
    if (!topicInput || !previewLoader) return;

    const topic = topicInput.value;
    if (!topic.trim()) return showToast('請輸入一個主題、單字或語詞！', 'error');
    
    previewLoader.classList.remove('hidden');
    
    try {
        const studentLevel = studentLevelSelect.value;
        const isCompetencyBased = competencyBasedCheckbox.checked;
        const wordCountMap = { '1-2': 200, '3-4': 400, '5-6': 600, '7-9': 800, '9-12': 1000 };
        const wordCount = wordCountMap[studentLevel];
        const studentGradeText = studentLevelSelect.options[studentLevelSelect.selectedIndex].text;
        const userQuery = `主題：${topic}`;
        let systemPrompt;
        
        if (isCompetencyBased) {
            systemPrompt = `你是一位頂尖的 K-12 教材設計師與說故事專家，專長是將生硬的知識點轉化為引人入勝的生活情境或故事，以培養學生的素養能力。請根據使用者提供的核心主題：「${topic}」，為「${studentGradeText}」程度的學生，創作一篇長度約為 ${wordCount} 字的素養導向短文。\n- 這篇短文應該包含一個清晰的「情境」或「待解決的問題」。\n- 請將核心主題的相關知識，自然地融入故事情節或問題描述中，而不是條列式地說明。\n- 文章風格需生動有趣，能引發學生的閱讀興趣與思考。\n- 最終產出的內容必須是一篇完整的文章，可以直接用於出題。`;
        } else {
            const isWordList = topic.includes(',') || /^[a-zA-Z\s,]+$/.test(topic) && topic.split(/\s+|,/).filter(Boolean).length <= 10;
            systemPrompt = isWordList ? `你是一位為K12學生編寫教材的創意寫作專家。請使用使用者提供的單字或語詞，為「${studentGradeText}」的學生，撰寫一篇有趣且連貫、長度約為 ${wordCount} 字的故事或閱讀短文。請確保這些詞彙自然地融入文章中。` : `你是一位知識淵博的教材編寫專家。請根據使用者提供的主題，為「${studentGradeText}」的學生，生成一段約 ${wordCount} 字的簡潔科普短文。`;
        }

        const payload = { 
            contents: [{ parts: [{ text: userQuery }] }], 
            systemInstruction: { parts: [{ text: systemPrompt }] } 
        };
        
        const result = await fetchFromGemini(apiKey, payload); // 使用新的函式
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (generatedText) {
            textInput.value = generatedText;
            showToast('學習內文已成功生成！', 'success');
            if (copyContentBtn) copyContentBtn.classList.remove('hidden');
            if (tabText) tabText.click();
            if (isCompetencyBased && questionStyleSelect) { questionStyleSelect.value = 'competency-based'; }
            triggerOrUpdate();
        } else { 
            throw new Error('AI未能生成內容。'); 
        }
    } catch (error) {
        console.error('生成內文時發生錯誤:', error);
        showToast(error.message, 'error');
    } finally {
        if (previewLoader) previewLoader.classList.add('hidden'); 
    }
}

function triggerOrUpdate() {
    if (isAutoGenerateEnabled()) {
        debouncedGenerate();
    } else {
        updateRegenerateButtonState();
    }
}
const debouncedGenerate = debounce(triggerQuestionGeneration, CONFIG.DEBOUNCE_DELAY);

async function triggerQuestionGeneration() {
    if (tabImage && tabImage.classList.contains('active') && uploadedImages.length === 0) {
        return showToast('請先上傳圖片！', 'error');
    }
    const text = textInput ? textInput.value : '';
    if (!text.trim() && uploadedImages.length === 0) return;

    if (previewPlaceholder && !previewPlaceholder.classList.contains('hidden')) {
        previewPlaceholder.classList.add('hidden');
    }

    let languageChoice = 'chinese'; 
    if (isEnglish(text)) {
        try {
            languageChoice = await askForLanguageChoice();
        } catch (error) {
            return; 
        }
    }
    proceedWithGeneration(languageChoice);
}

function isEnglish(text) {
    if (!text || text.length < 20) return false; 
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    const ratio = englishChars / text.length;
    return ratio > 0.7; 
}

function askForLanguageChoice() {
    return new Promise((resolve, reject) => {
        if (!languageChoiceModal || !languageChoiceModalContent) return reject('Modal elements not found');
        languageChoiceModal.classList.remove('hidden');
        setTimeout(() => languageChoiceModalContent.classList.add('open'), 10);

        function handleChoice(event) {
            const choice = event.target.id === 'lang-choice-en-btn' ? 'english' : 'chinese';
            languageChoiceModalContent.classList.remove('open');
            setTimeout(() => {
                languageChoiceModal.classList.add('hidden');
                langChoiceZhBtn.removeEventListener('click', handleChoice);
                langChoiceEnBtn.removeEventListener('click', handleChoice);
            }, 200);
            resolve(choice);
        }
        langChoiceZhBtn.addEventListener('click', handleChoice, { once: true });
        langChoiceEnBtn.addEventListener('click', handleChoice, { once: true });
    });
}

async function proceedWithGeneration(languageChoice) {
    const apiKey = getApiKey();
    if (!apiKey) return showToast('請先在右上角「設定」中輸入您的 Gemini API Key！', 'error');

    const text = textInput ? textInput.value : '';
    const totalQuestions = numQuestionsInput ? parseInt(numQuestionsInput.value, 10) : 0;
    const questionType = questionTypeSelect ? questionTypeSelect.value : 'multiple_choice';
    const difficulty = difficultySelect ? difficultySelect.value : '中等';
    const questionStyle = questionStyleSelect ? questionStyleSelect.value : 'knowledge-recall';

    if ((!text.trim() && uploadedImages.length === 0) || totalQuestions <= 0) {
        if (questionsContainer) questionsContainer.innerHTML = '';
        if (previewActions) previewActions.classList.add('hidden');
        if (previewPlaceholder) previewPlaceholder.classList.remove('hidden');
        return;
    }

    if (currentRequestController) currentRequestController.abort();
    currentRequestController = new AbortController();
    
    if (previewLoader) previewLoader.classList.remove('hidden');
    if (loadingText) loadingText.textContent = questionLoadingMessages[Math.floor(Math.random() * questionLoadingMessages.length)];
    if (questionsContainer) questionsContainer.innerHTML = '';
    if (previewActions) previewActions.classList.add('hidden');

    let allGeneratedQs = [];
    
    try {
        const BATCH_SIZE = CONFIG.API_BATCH_SIZE;
        const numBatches = Math.ceil(totalQuestions / BATCH_SIZE);
        for (let i = 0; i < numBatches; i++) {
            const questionsInBatch = Math.min(BATCH_SIZE, totalQuestions - allGeneratedQs.length);
            if (questionsInBatch <= 0) break;
            const batchResult = await generateSingleBatch(questionsInBatch, questionType, difficulty, text, uploadedImages, questionStyle, languageChoice);
            allGeneratedQs = allGeneratedQs.concat(batchResult);
        }
        
        if (allGeneratedQs.length > 0) {
            generatedQuestions = allGeneratedQs;
            renderQuestionsForEditing(generatedQuestions);
            initializeSortable();
        } else {
            throw new Error("AI 未能生成任何題目。");
        }
    } catch(error) {
         if (error.name === 'AbortError') return;
         console.error('生成題目時發生錯誤:', error);
         showToast(error.message, 'error');
         if (questionsContainer) questionsContainer.innerHTML = '';
         if (previewPlaceholder) previewPlaceholder.classList.remove('hidden');
    } finally {
        if (previewLoader) previewLoader.classList.add('hidden');
        updateRegenerateButtonState();
    }
}

async function generateSingleBatch(questionsInBatch, questionType, difficulty, text, images, questionStyle, languageChoice) {
    const apiKey = getApiKey();
    const selectedFormat = formatSelect ? formatSelect.value : '';
    const needsExplanation = selectedFormat === 'loilonote' || selectedFormat === 'wayground';
    
    const buildPrompt = (coreTask) => {
        const baseIntro = "你是一位協助國中小老師出題的專家。請根據使用者提供的文本和圖片，";
        const baseFormatRequirement = "你必須嚴格遵守JSON格式。不要使用Markdown標記(如 ```json)。直接回傳純JSON陣列。";
        let competencyPromptPart = `你的任務是生成「素養導向型」的題目，這代表你需要混合設計出能夠評量學生「情境理解」、「分析應用」與「批判思辨」這三種能力的題目。`;
        
        if (questionStyle === 'competency-based') {
             competencyPromptPart += ` 針對每一題，你還必須提供一個名為 'design_concept' 的欄位，簡要說明該題的「設計理念」。`;
        }

        const langInstruction = languageChoice === 'english'
            ? 'All generated content, including questions, options, and explanations, must be in English.'
            : '所有生成的內容，包含題目、選項、解析，都必須是繁體中文。';

        const finalPrompt = questionStyle === 'competency-based'
            ? `${baseIntro} ${competencyPromptPart} ${coreTask} ${langInstruction} ${baseFormatRequirement}`
            : `${baseIntro} ${coreTask} ${langInstruction} ${baseFormatRequirement}`;
        
        return finalPrompt;
    };
    
    let jsonSchema;
    const mcProperties = { text: { type: "STRING" }, options: { type: "ARRAY", items: { type: "STRING" } }, correct: { type: "ARRAY", items: { type: "INTEGER" } }, time: { type: "INTEGER", "default": 30 } };
    let mcRequired = ["text", "options", "correct"];
    if (needsExplanation) { mcProperties.explanation = { type: "STRING" }; mcRequired.push("explanation"); }
    if (questionStyle === 'competency-based') { mcProperties.design_concept = { type: "STRING" }; }
    
    let coreTask;
    switch(questionType) {
        case 'true_false':
            const tfProperties = { text: { type: "STRING" }, is_correct: { type: "BOOLEAN" } };
            let tfRequired = ["text", "is_correct"];
            if (needsExplanation) { tfProperties.explanation = { type: "STRING" }; tfRequired.push("explanation"); }
            if (questionStyle === 'competency-based') { tfProperties.design_concept = { type: "STRING" }; }
            coreTask = `生成${questionsInBatch}題${difficulty}難度的「是非題」。每個物件包含text和is_correct。`;
            if (needsExplanation) coreTask += ` 需包含explanation。`;
            jsonSchema = { type: "ARRAY", items: { type: "OBJECT", properties: tfProperties, required: tfRequired }};
            break;
        case 'mixed':
             coreTask = `生成${questionsInBatch}題${difficulty}難度的「選擇題」與「是非題」混合題組。`;
             jsonSchema = { type: "ARRAY", items: { type: "OBJECT", properties: mcProperties, required: mcRequired }};
            break;
        case 'multiple_choice':
        default:
            coreTask = `生成${questionsInBatch}題${difficulty}難度的「選擇題」。每題4個選項，標示correct索引。`;
             if(needsExplanation) coreTask += ` 需包含explanation。`;
             jsonSchema = { type: "ARRAY", items: { type: "OBJECT", properties: mcProperties, required: mcRequired }};
            break;
    }
    
    const systemPrompt = buildPrompt(coreTask);
    const parts = [{ text: "請根據以下提供的文字和圖片內容出題。" }];
    if(text.trim()){ parts.push({ text: `文字內容:\n${text}`}); }
    images.forEach(img => { parts.push({ inlineData: { mimeType: img.type, data: img.data } }); });
    
    const payload = { 
        contents: [{ parts: parts }], 
        systemInstruction: { parts: [{ text: systemPrompt }] }, 
        generationConfig: { responseMimeType: "application/json", responseSchema: jsonSchema } 
    };
    
    const result = await fetchFromGemini(apiKey, payload); // 使用新的函式
    const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    let parsedJson;
    try { 
        const cleanedText = jsonText.replace(/```json|```/g, '').trim();
        parsedJson = JSON.parse(cleanedText);
    } catch (e) { 
        console.error("解析 JSON 失敗:", jsonText); 
        throw new Error('API 回應了無效的 JSON 格式。'); 
    }

    return parsedJson.map(q => {
        if (q.options && Array.isArray(q.options)) {
            while (q.options.length < 4) {
                q.options.push("");
            }
        }
        return q;
    });
}

function renderQuestionsForEditing(questions) {
    if (!questionsContainer) return;
    questionsContainer.innerHTML = '';
    questions.forEach((q, index) => {
        const isTF = q.hasOwnProperty('is_correct');
        const questionData = isTF ? { text: q.text, options: ['是', '否'], correct: [q.is_correct ? 0 : 1], time: q.time || 30, explanation: q.explanation || '', design_concept: q.design_concept || '' } : q;
        const card = document.createElement('div');
        card.className = 'question-card bg-gray-50 p-4 rounded-lg shadow-sm border flex gap-x-3 transition-transform duration-300 hover:border-l-indigo-300 hover:-translate-y-0.5';
        card.dataset.index = index;

        let optionsHtml = (questionData.options || []).map((opt, optIndex) => `
            <div class="flex items-center">
                <label class="option-label w-full flex items-center">
                    <input type="radio" name="correct-option-${index}" class="option-radio" value="${optIndex}" ${(questionData.correct || []).includes(optIndex) ? 'checked' : ''}>
                    <input type="text" value="${String(opt).replace(/"/g, '&quot;')}" class="ml-2 flex-grow border border-gray-300 rounded-md p-2 w-full transition focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">
                </label>
            </div>
        `).join('');

        let aiInsightHtml = '';
        if (questionStyleSelect && questionStyleSelect.value === 'competency-based' && questionData.design_concept) {
            aiInsightHtml = `
                <div class="relative flex items-center group">
                     <svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm-.707 10.607a1 1 0 011.414 0l.707-.707a1 1 0 111.414 1.414l-.707.707a1 1 0 01-1.414 0zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" /></svg>
                    <div class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-gray-800 text-white text-sm rounded-lg shadow-lg z-10 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200">
                        <h5 class="font-bold mb-1 border-b border-gray-600 pb-1">AI 設計理念</h5>
                        <p class="text-xs">${questionData.design_concept}</p>
                    </div>
                </div>`;
        }

        card.innerHTML = `
            <div class="drag-handle text-gray-400 hover:text-indigo-600 p-2 flex items-center cursor-grab active:cursor-grabbing">
                <svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </div>
            <div class="flex-grow">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center space-x-2">
                         <p class="text-sm font-bold themed-accent-text">第 ${index + 1} 題</p>
                         ${aiInsightHtml}
                    </div>
                    <div class="flex items-center space-x-2">
                       <button class="copy-question-btn text-gray-400 hover:text-indigo-500 transition-colors" title="複製題目">
                            <svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                       </button>
                       <button class="delete-question-btn text-gray-400 hover:text-red-500 transition-colors" title="刪除題目">
                            <svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       </button>
                    </div>
                </div>
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">題目：</label>
                        <textarea rows="2" class="question-text border border-gray-300 rounded-md p-2 w-full transition focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">${questionData.text}</textarea>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">選項 (點擊圓圈設為正解)：</label>
                        <div class="space-y-2 options-container">${optionsHtml}</div>
                    </div>
                </div>
            </div>`;
        questionsContainer.appendChild(card);
    });

    questionsContainer.querySelectorAll('.question-card').forEach(card => {
        const index = parseInt(card.dataset.index, 10);
        card.querySelector('.question-text').addEventListener('input', e => { generatedQuestions[index].text = e.target.value; });
        card.querySelectorAll('.options-container input[type="text"]').forEach((optInput, optIndex) => { optInput.addEventListener('input', e => { generatedQuestions[index].options[optIndex] = e.target.value; }); });
        card.querySelectorAll('.options-container input[type="radio"]').forEach(radio => { radio.addEventListener('change', e => { if (e.target.checked) { generatedQuestions[index].correct = [parseInt(e.target.value, 10)]; } }); });
        card.querySelector('.delete-question-btn').addEventListener('click', () => { generatedQuestions.splice(index, 1); renderQuestionsForEditing(generatedQuestions); initializeSortable(); });
        card.querySelector('.copy-question-btn').addEventListener('click', () => { const questionToCopy = JSON.parse(JSON.stringify(generatedQuestions[index])); generatedQuestions.splice(index + 1, 0, questionToCopy); renderQuestionsForEditing(generatedQuestions); initializeSortable(); showToast('題目已成功複製！', 'success'); });
    });
}

function initializeSortable() {
    if (sortableInstance) sortableInstance.destroy();
    if (!questionsContainer) return;
    sortableInstance = new Sortable(questionsContainer, { 
        animation: 150, 
        handle: '.drag-handle', 
        ghostClass: 'sortable-ghost', 
        onEnd: function (evt) { 
            const [movedItem] = generatedQuestions.splice(evt.oldIndex, 1); 
            generatedQuestions.splice(evt.newIndex, 0, movedItem); 
            renderQuestionsForEditing(generatedQuestions);
            initializeSortable();
        }, 
    });
}

function handleFile(file) {
    if (fileErrorDisplay) fileErrorDisplay.textContent = ''; 
    if (fileNameDisplay) fileNameDisplay.textContent = ''; 
    if (fileInput) fileInput.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && file.type !== 'text/plain') { const errorMsg = '檔案格式不支援。'; showToast(errorMsg, 'error'); if(fileErrorDisplay) fileErrorDisplay.textContent = errorMsg; return; }
    if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) { const errorMsg = `檔案過大 (${(CONFIG.MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB上限)。`; showToast(errorMsg, 'error'); if(fileErrorDisplay) fileErrorDisplay.textContent = errorMsg; return; }
    if (fileNameDisplay) fileNameDisplay.textContent = `已選：${file.name}`;
    const reader = new FileReader();
    if (file.type === 'application/pdf') {
        reader.onload = async (e) => {
            try {
                const pdf = await pdfjsLib.getDocument(new Uint8Array(e.target.result)).promise;
                let text = '';
                for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const content = await page.getTextContent(); text += content.items.map(item => item.str).join(' '); }
                if(textInput) textInput.value = text; 
                showToast('PDF 讀取成功！', 'success'); 
                if(tabText) tabText.click(); 
                triggerOrUpdate();
            } catch (error) { const errorMsg = "無法讀取此PDF。"; showToast(errorMsg, "error"); if(fileErrorDisplay) fileErrorDisplay.textContent = errorMsg; if(fileNameDisplay) fileNameDisplay.textContent = ''; }
        };
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = (e) => { if(textInput) textInput.value = e.target.result; showToast('文字檔讀取成功！', 'success'); if(tabText) tabText.click(); triggerOrUpdate(); };
        reader.readAsText(file);
    }
}

function handleImageFiles(newFiles) {
    if (!newFiles || newFiles.length === 0) return;
    if(imageErrorDisplay) imageErrorDisplay.innerHTML = ''; 
    const { MAX_IMAGE_SIZE_BYTES, MAX_TOTAL_IMAGE_SIZE_BYTES } = CONFIG;
    let currentTotalSize = uploadedImages.reduce((sum, img) => sum + img.size, 0);
    let errorMessages = [], sizeLimitReached = false;
    const validFiles = Array.from(newFiles).filter(file => {
        if (!file.type.startsWith('image/')) { errorMessages.push(`"${file.name}" 格式不符。`); return false; }
        if (file.size > MAX_IMAGE_SIZE_BYTES) { errorMessages.push(`"${file.name}" 過大。`); return false; }
        if (currentTotalSize + file.size > MAX_TOTAL_IMAGE_SIZE_BYTES) { if (!sizeLimitReached) { errorMessages.push(`圖片總量超過上限。`); sizeLimitReached = true; } return false; }
        currentTotalSize += file.size; return true;
    });
    if (errorMessages.length > 0) { if(imageErrorDisplay) imageErrorDisplay.innerHTML = errorMessages.join('<br>'); showToast('部分圖片上傳失敗。', 'error'); }
    if (validFiles.length === 0) { if(imageInput) imageInput.value = ''; return; }

    const fragment = document.createDocumentFragment();
    let filesToProcess = validFiles.length;
    validFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const fullBase64 = e.target.result, base64Data = fullBase64.split(',')[1];
            const imageObject = { id: Date.now() + Math.random(), type: file.type, data: base64Data, size: file.size };
            uploadedImages.push(imageObject);
            const previewWrapper = document.createElement('div');
            previewWrapper.className = 'relative group';
            const imgElement = document.createElement('img');
            imgElement.src = fullBase64; imgElement.alt = `圖片預覽`; imgElement.className = 'w-full h-32 object-cover rounded-lg shadow-md';
            const removeBtn = document.createElement('div');
            removeBtn.className = 'absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer font-bold leading-none transition-all hover:bg-red-500/90 scale-0 group-hover:scale-100';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = () => { 
                uploadedImages = uploadedImages.filter(img => img.id !== imageObject.id); 
                previewWrapper.remove();
                triggerOrUpdate();
            };
            previewWrapper.appendChild(imgElement); previewWrapper.appendChild(removeBtn);
            fragment.appendChild(previewWrapper);
            if (--filesToProcess === 0) { 
                if (imagePreviewContainer) imagePreviewContainer.appendChild(fragment); 
                triggerOrUpdate();
            }
        };
        reader.readAsDataURL(file);
    });
    if(imageInput) imageInput.value = '';
}

function setupDragDrop(dropZone, fileHandler, isMultiple) {
    if (!dropZone) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false));
    ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false));
    ['dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false));
    dropZone.addEventListener('drop', (e) => { if (isMultiple) fileHandler(e.dataTransfer.files); else fileHandler(e.dataTransfer.files[0]); }, false);
}

function exportFile(questions) {
    const format = formatSelect ? formatSelect.value : '';
    if (!format) return showToast('請選擇匯出檔案格式！', 'error');
    if (!questions || questions.length === 0) return showToast('沒有可匯出的題目！', 'error');
    
    let data, filename, success = false;
    try {
        const standardMCQs = questions.map(q => q.hasOwnProperty('is_correct') ? { text: q.text, options: ['是', '否'], correct: [q.is_correct ? 0 : 1], time: 30, explanation: q.explanation || '' } : q);
        switch (format) {
            case 'wordwall':
                data = standardMCQs.map(q => ({ '問題': q.text, '選項1': q.options[0] || '', '選項2': q.options[1] || '', '選項3': q.options[2] || '', '選項4': q.options[3] || '', '正確選項': q.correct.length > 0 ? (q.correct[0] + 1) : '' }));
                filename = 'Wordwall_Quiz.xlsx'; break;
            case 'kahoot':
                const kahootData = [ ['Kahoot Quiz Template'], [], [], [], ['Question', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Time limit (sec)', 'Correct answer(s)'] ];
                standardMCQs.forEach(q => { kahootData.push([ q.text, q.options[0] || '', q.options[1] || '', q.options[2] || '', q.options[3] || '', q.time || 30, q.correct.map(i => i + 1).join(',') ]); });
                const ws = XLSX.utils.aoa_to_sheet(kahootData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
                XLSX.writeFile(wb, 'Kahoot_Quiz.xlsx');
                success = true;
                break;
            default:
                 // Default to generic Excel if format not matched (or handle other formats)
                 data = standardMCQs.map(q => ({ 'Question': q.text, 'Option 1': q.options[0] || '', 'Option 2': q.options[1] || '', 'Option 3': q.options[2] || '', 'Option 4': q.options[3] || '', 'Correct Answer Index': q.correct.join(','), 'Explanation': q.explanation || '' }));
                 filename = `Quiz_Export_${format}.xlsx`;
                 break;
        }

        if(data && !success) {
            const worksheet = XLSX.utils.json_to_sheet(data); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
            XLSX.writeFile(workbook, filename);
            success = true;
        }
        
        if (success) {
            showPostDownloadModal();
        }

    } catch (error) { 
        console.error('匯出失敗:', error); 
        showToast('匯出失敗，請檢查主控台錯誤。', 'error'); 
    }
}

function showPostDownloadModal() {
    if (postDownloadModal) postDownloadModal.classList.remove('hidden');
    if (postDownloadModalContent) setTimeout(() => { postDownloadModalContent.classList.remove('scale-95', 'opacity-0'); }, 10);
}
function hidePostDownloadModal() {
    if (postDownloadModalContent) postDownloadModalContent.classList.add('scale-95', 'opacity-0');
    if (postDownloadModal) setTimeout(() => { postDownloadModal.classList.add('hidden'); }, 200);
}

async function copyContentToClipboard() {
    const textToCopy = textInput ? textInput.value : '';
    if (!textToCopy.trim()) { showToast('沒有內容可以複製！', 'error'); return; }
    try { await navigator.clipboard.writeText(textToCopy); showToast('文章內容已成功複製！', 'success'); } catch (err) { console.error('複製失敗:', err); showToast('無法複製內容。', 'error'); }
}

function clearAllInputs() {
    if(textInput) textInput.value = ''; 
    if(fileInput) fileInput.value = ''; 
    if(fileNameDisplay) fileNameDisplay.textContent = ''; 
    if(fileErrorDisplay) fileErrorDisplay.textContent = '';
    if(imageInput) imageInput.value = ''; 
    if(imagePreviewContainer) imagePreviewContainer.innerHTML = ''; 
    if(imageErrorDisplay) imageErrorDisplay.innerHTML = ''; 
    uploadedImages = [];
    if(copyContentBtn) copyContentBtn.classList.add('hidden'); 
    if(topicInput) topicInput.value = ''; 
    if(questionStyleSelect) questionStyleSelect.value = 'knowledge-recall';
    generatedQuestions = [];
    if(questionsContainer) questionsContainer.innerHTML = '';
    if(previewPlaceholder) previewPlaceholder.classList.remove('hidden');
    updateRegenerateButtonState();
    showToast('內容已全部清除！', 'success');
}

function applyLayoutPreference() {
    const preferredLayout = localStorage.getItem('quizGenLayout_v2');
    if (!mainContainer) return;
    const placeholderP = previewPlaceholder ? previewPlaceholder.querySelector('p') : null;
    if (preferredLayout === 'reversed') {
        mainContainer.classList.add('lg:flex-row-reverse');
        if (placeholderP) placeholderP.textContent = '請在右側提供內容並設定選項';
    } else {
        mainContainer.classList.remove('lg:flex-row-reverse');
        if (placeholderP) placeholderP.textContent = '請在左側提供內容並設定選項';
    }
}

function applyThemePreference() {
    const savedTheme = localStorage.getItem('quizGenTheme_v1') || 'lavender';
    const radioToCheck = document.getElementById(`theme-${savedTheme}`);
    if (radioToCheck) {
        radioToCheck.checked = true;
    }
}

function populateVersionHistory() {
    if (!versionHistoryContent) return;
    const currentDisplayVersion = 'v7.3 穩定版';
    if (versionBtn) versionBtn.textContent = currentDisplayVersion;
    const versionHistory = [
        {
            version: "v7.3 穩定版",
            current: true,
            notes: ["修復 404 錯誤：移除不穩定的預覽版模型。", "新增自動切換模型功能：優先使用 Flash 1.5，失敗則嘗試其他版本。", "優化 API Key 設定流程。"]
        }
    ];
    let html = '';
    versionHistory.forEach(v => {
        html += `<div><h4 class="font-bold text-lg">${v.version} ${v.current ? '<span class="text-sm font-normal themed-accent-text">(目前版本)</span>' : ''}</h4><ul class="list-disc list-inside text-gray-600">${v.notes.map(note => `<li>${note}</li>`).join('')}</ul></div>`;
    });
    versionHistoryContent.innerHTML = html;
}

async function updateVisitorCount() {
    const counterElement = document.getElementById('visitor-counter');
    if (!counterElement) return;
    const namespace = 'aliang-quiz-gen';
    const key = 'main';
    const apiUrl = `https://api.counterapi.dev/v1/${namespace}/${key}/up`;
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error('計數器服務回應錯誤');
        const data = await response.json();
        if (data.count) counterElement.textContent = data.count.toLocaleString();
    } catch (error) { console.error('無法載入瀏覽人數:', error); }
}

function addSafeEventListener(element, event, handler, elementName) {
    if (element) {
        element.addEventListener(event, handler);
    } 
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    populateVersionHistory();
    applyLayoutPreference();
    applyThemePreference();
    updateVisitorCount(); 

    const savedApiKey = getApiKey();
    if (apiKeyInput && savedApiKey) {
        apiKeyInput.value = savedApiKey;
    }
    
    if (autoGenerateToggle) {
        autoGenerateToggle.checked = isAutoGenerateEnabled();
        if (autoGenerateToggle.checked) {
            controls.forEach(control => addSafeEventListener(control, control.type === 'number' || control.tagName === 'TEXTAREA' ? 'input' : 'change', debouncedGenerate));
        }
    }
    updateRegenerateButtonState();

    addSafeEventListener(generateContentBtn, 'click', generateContentFromTopic, 'generateContentBtn');
    addSafeEventListener(copyContentBtn, 'click', copyContentToClipboard, 'copyContentBtn');
    addSafeEventListener(clearContentBtn, 'click', clearAllInputs, 'clearContentBtn');
    addSafeEventListener(downloadBtn, 'click', () => exportFile(generatedQuestions), 'downloadBtn');
    addSafeEventListener(regenerateBtn, 'click', triggerQuestionGeneration, 'regenerateBtn');
    addSafeEventListener(generateFromImagesBtn, 'click', triggerQuestionGeneration, 'generateFromImagesBtn');
    
    addSafeEventListener(fileInput, 'change', (event) => handleFile(event.target.files[0]), 'fileInput');
    addSafeEventListener(imageInput, 'change', (event) => handleImageFiles(event.target.files), 'imageInput');
    addSafeEventListener(textInput, 'input', updateRegenerateButtonState, 'textInput for button state');

    setupDragDrop(textInput, (file) => handleFile(file), false);
    setupDragDrop(imageDropZone, handleImageFiles, true);
    
    addSafeEventListener(settingsBtn, 'click', (e) => {
        e.stopPropagation();
        if (settingsPopover) settingsPopover.classList.toggle('open');
    }, 'settingsBtn');
    
    document.addEventListener('click', (e) => {
        if (settingsPopover && !settingsPopover.contains(e.target) && settingsBtn && !settingsBtn.contains(e.target)) {
            settingsPopover.classList.remove('open');
        }
    });
    
    addSafeEventListener(saveApiKeyBtn, 'click', () => {
        if (apiKeyInput) {
            const key = apiKeyInput.value.trim();
            if (key) {
                localStorage.setItem('gemini_api_key', key);
                showToast('API Key 已成功儲存！', 'success');
            } else {
                showToast('API Key 不能為空！', 'error');
            }
        }
    }, 'saveApiKeyBtn');

    addSafeEventListener(clearApiKeyBtn, 'click', () => {
        localStorage.removeItem('gemini_api_key');
        if (apiKeyInput) apiKeyInput.value = '';
        showToast('API Key 已清除。', 'success');
    }, 'clearApiKeyBtn');

    addSafeEventListener(layoutToggleBtn, 'click', () => {
        if (!mainContainer) return;
        mainContainer.classList.toggle('lg:flex-row-reverse');
        const placeholderP = previewPlaceholder ? previewPlaceholder.querySelector('p') : null;
        if (mainContainer.classList.contains('lg:flex-row-reverse')) {
            localStorage.setItem('quizGenLayout_v2', 'reversed');
             if(placeholderP) placeholderP.textContent = '請在右側提供內容並設定選項';
        } else {
            localStorage.setItem('quizGenLayout_v2', 'default');
             if(placeholderP) placeholderP.textContent = '請在左側提供內容並設定選項';
        }
    }, 'layoutToggleBtn');

    addSafeEventListener(autoGenerateToggle, 'change', (e) => {
        const isEnabled = e.target.checked;
        localStorage.setItem('quizGenAutoGenerate_v1', isEnabled);
        controls.forEach(control => {
            const eventType = control.type === 'number' || control.tagName === 'TEXTAREA' ? 'input' : 'change';
            if (isEnabled) {
                addSafeEventListener(control, eventType, debouncedGenerate);
            } else {
                control.removeEventListener(eventType, debouncedGenerate);
            }
        });
        updateRegenerateButtonState();
    }, 'autoGenerateToggle');
    
    if (themeRadios) {
        themeRadios.forEach(radio => {
            addSafeEventListener(radio, 'change', () => {
                if(radio.checked) {
                    localStorage.setItem('quizGenTheme_v1', radio.id.replace('theme-', ''));
                }
            });
        });
    }

    if (tabs && contents) {
        tabs.forEach((clickedTab, index) => {
            addSafeEventListener(clickedTab, 'click', () => {
                if(!clickedTab) return;
                tabs.forEach(tab => { if(tab) { tab.classList.remove('active'); tab.setAttribute('aria-selected', 'false'); }});
                contents.forEach(content => { if(content) content.classList.remove('active'); });
                clickedTab.classList.add('active');
                clickedTab.setAttribute('aria-selected', 'true');
                if (contents[index]) {
                    contents[index].classList.add('active');
                }
                updateRegenerateButtonState();
            }, `tab-${index}`);
        });
    }
    
    addSafeEventListener(versionBtn, 'click', () => { if(versionModal) versionModal.classList.remove('hidden') }, 'versionBtn');
    addSafeEventListener(closeModalBtn, 'click', () => { if(versionModal) versionModal.classList.add('hidden') }, 'closeModalBtn');
    addSafeEventListener(versionModal, 'click', (event) => { if (event.target === versionModal && versionModal) versionModal.classList.add('hidden'); }, 'versionModal');
    
    addSafeEventListener(continueEditingBtn, 'click', hidePostDownloadModal, 'continueEditingBtn');
    addSafeEventListener(clearAndNewBtn, 'click', () => {
        hidePostDownloadModal();
        clearAllInputs();
    }, 'clearAndNewBtn');

});
