// State
let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;
let canvas = document.getElementById('pdf-render');
let ctx = canvas.getContext('2d');
let currentPdfText = {}; // Cache for extracted text: { pageNum: "text" }

// Settings
let settings = {
    apiKey: localStorage.getItem('apiKey') || '',
    apiUrl: localStorage.getItem('apiUrl') || 'https://api.openai.com/v1',
    modelName: localStorage.getItem('modelName') || 'gpt-4o-mini'
};

// DOM Elements
const pdfUpload = document.getElementById('pdf-upload');
const fileNameDisplay = document.getElementById('file-name');
const pdfControls = document.getElementById('pdf-controls');
const pageNumInput = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pdfPlaceholder = document.getElementById('pdf-placeholder');

const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModal = document.querySelector('.close-modal');
const saveSettingsBtn = document.getElementById('save-settings');
const contextModeCheckbox = document.getElementById('context-mode');

// --- PDF Handling ---

/**
 * Get page info from document, resize canvas accordingly, and render page.
 * @param num Page number.
 */
function renderPage(num) {
    pageRendering = true;

    // Fetch page
    pdfDoc.getPage(num).then(function (page) {
        const viewport = page.getViewport({ scale: scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render PDF page into canvas context
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        const renderTask = page.render(renderContext);

        // Wait for render to finish
        renderTask.promise.then(function () {
            pageRendering = false;
            if (pageNumPending !== null) {
                // New page rendering is pending
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        });
    });

    // Update page counters
    pageNumInput.value = num;
}

/**
 * If another page rendering in progress, waits until the rendering is
 * finised. Otherwise, executes rendering immediately.
 */
function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

/**
 * Displays previous page.
 */
function onPrevPage() {
    if (pageNum <= 1) {
        return;
    }
    pageNum--;
    queueRenderPage(pageNum);
}

/**
 * Displays next page.
 */
function onNextPage() {
    if (pageNum >= pdfDoc.numPages) {
        return;
    }
    pageNum++;
    queueRenderPage(pageNum);
}

/**
 * Jump to specific page via input
 */
function onPageNumChange() {
    let num = parseInt(pageNumInput.value);
    if (isNaN(num)) {
        pageNumInput.value = pageNum;
        return;
    }

    // Clamp value
    if (num < 1) num = 1;
    if (num > pdfDoc.numPages) num = pdfDoc.numPages;

    pageNum = num;
    queueRenderPage(pageNum);
}

prevPageBtn.addEventListener('click', onPrevPage);
nextPageBtn.addEventListener('click', onNextPage);
pageNumInput.addEventListener('change', onPageNumChange);
pageNumInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        onPageNumChange();
        pageNumInput.blur(); // Remove focus
    }
});

/**
 * Handle file upload
 */
pdfUpload.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        const fileReader = new FileReader();
        fileReader.onload = function () {
            const typedarray = new Uint8Array(this.result);
            fileNameDisplay.textContent = file.name;

            pdfjsLib.getDocument(typedarray).promise.then(function (pdfDoc_) {
                pdfDoc = pdfDoc_;
                pageCountSpan.textContent = pdfDoc.numPages;

                // Reset state
                pageNum = 1;
                currentPdfText = {};

                // UI updates
                pdfPlaceholder.style.display = 'none';
                canvas.style.display = 'block';
                pdfControls.style.display = 'flex';

                renderPage(pageNum);
                addSystemMessage(`Loaded "${file.name}" with ${pdfDoc.numPages} pages.`);
            });
        };
        fileReader.readAsArrayBuffer(file);
    }
});

// --- Text Extraction ---

async function getPageText(pageNum) {
    if (currentPdfText[pageNum]) {
        return currentPdfText[pageNum];
    }

    if (!pdfDoc) return "";

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map(item => item.str);
    const text = textItems.join(' ');

    currentPdfText[pageNum] = text;
    return text;
}

async function getFullPdfText() {
    // Warning: This can be slow and token heavy
    let fullText = "";
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        fullText += `[Page ${i}]\n` + await getPageText(i) + "\n\n";
    }
    return fullText;
}

// --- Chat & AI ---

function addMessage(content, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (type === 'ai') {
        // For AI, we might stream content, so we return the element
        contentDiv.innerHTML = ''; // Start empty
    } else {
        contentDiv.textContent = content;
    }

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return contentDiv;
}

function addSystemMessage(text) {
    const msg = addMessage(text, 'system');
    msg.innerHTML = text;
}

async function handleSendMessage() {
    const question = userInput.value.trim();
    if (!question) return;

    if (!settings.apiKey) {
        addSystemMessage("⚠️ Please set your API Key in settings first.");
        settingsModal.style.display = 'flex';
        return;
    }

    if (!pdfDoc) {
        addSystemMessage("⚠️ Please upload a PDF first.");
        return;
    }

    // User Message
    addMessage(question, 'user');
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;

    // Prepare Context
    let context = "";
    let systemPrompt = "";

    try {
        if (contextModeCheckbox.checked) {
            addSystemMessage("Extracting full document text... (this may take a moment)");
            context = await getFullPdfText();
            systemPrompt = "You are a helpful AI PDF assistant. You have access to the full content of the document provided below. Answer the user's question based on the document content.";
        } else {
            context = await getPageText(pageNum);
            systemPrompt = `You are a helpful AI PDF assistant. You have access to the content of PAGE ${pageNum} of the document provided below. Answer the user's question based on this page's content.`;
        }
    } catch (err) {
        addSystemMessage("Error extracting text: " + err.message);
        sendBtn.disabled = false;
        return;
    }

    // AI Message Placeholder
    const aiMessageContent = addMessage("Thinking...", 'ai');
    let fullResponse = "";

    try {
        const response = await fetch(`${settings.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.modelName,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Document Content:\n${context}\n\nQuestion: ${question}` }
                ],
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        aiMessageContent.textContent = ""; // Clear "Thinking..."

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices[0].delta.content;
                        if (content) {
                            fullResponse += content;
                            aiMessageContent.innerHTML = marked.parse(fullResponse); // Simple markdown rendering
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        }
                    } catch (e) {
                        console.error("Error parsing stream:", e);
                    }
                }
            }
        }

    } catch (err) {
        aiMessageContent.textContent += `\n[Error: ${err.message}]`;
    } finally {
        sendBtn.disabled = false;
    }
}

// Simple Markdown Parser (for streaming)
// We'll use a very basic one or import a library. 
// For now, let's add a simple script tag for 'marked' in index.html or just use textContent.
// Actually, let's inject 'marked' via CDN in index.html for better formatting.
// For now, I'll just use textContent in the loop above to be safe, 
// but let's update it to use a simple formatter or just text.
// EDIT: I will add marked.js to index.html in a follow-up step or just use textContent for MVP.
// Let's stick to textContent for safety unless I add the library.
// Reverting innerHTML to textContent for the streaming part to avoid XSS/errors without library.
// Wait, I can add the library easily.

sendBtn.addEventListener('click', handleSendMessage);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
});

// Auto-resize textarea
userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    sendBtn.disabled = this.value.trim() === '';
});

// --- Settings Modal ---

settingsBtn.addEventListener('click', () => {
    document.getElementById('api-key').value = settings.apiKey;
    document.getElementById('api-url').value = settings.apiUrl;
    document.getElementById('model-name').value = settings.modelName;
    settingsModal.style.display = 'flex';
});

closeModal.addEventListener('click', () => {
    settingsModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
    }
});

saveSettingsBtn.addEventListener('click', () => {
    settings.apiKey = document.getElementById('api-key').value.trim();
    settings.apiUrl = document.getElementById('api-url').value.trim();
    settings.modelName = document.getElementById('model-name').value.trim();

    localStorage.setItem('apiKey', settings.apiKey);
    localStorage.setItem('apiUrl', settings.apiUrl);
    localStorage.setItem('modelName', settings.modelName);

    settingsModal.style.display = 'none';
    addSystemMessage("Settings saved.");
});

// Initialize
if (!settings.apiKey) {
    setTimeout(() => {
        addSystemMessage("👋 Welcome! Please click the gear icon ⚙️ to set your API Key.");
    }, 1000);
}
