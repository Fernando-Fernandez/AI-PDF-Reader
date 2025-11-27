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
    modelName: localStorage.getItem('modelName') || 'gpt-5.1'
}; // was using gpt-4o-mini

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
const pageContextCountInput = document.getElementById('page-context-count');

const pdfViewerContainer = document.getElementById('pdf-viewer-container');

// --- PDF Handling ---

/**
 * Get page info from document, resize canvas accordingly, and render page.
 * @param num Page number.
 */
function renderPage(num) {
    pageRendering = true;

    // Scroll to top
    pdfViewerContainer.scrollTop = 0;

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

const overlayPrevBtn = document.getElementById('overlay-prev');
const overlayNextBtn = document.getElementById('overlay-next');

const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomLevelSpan = document.getElementById('zoom-level');

// ... (existing code)

/**
 * Zoom In
 */
function onZoomIn() {
    scale += 0.25;
    zoomLevelSpan.textContent = `${Math.round(scale * 100)}%`;
    renderPage(pageNum);
}

/**
 * Zoom Out
 */
function onZoomOut() {
    if (scale <= 0.5) return;
    scale -= 0.25;
    zoomLevelSpan.textContent = `${Math.round(scale * 100)}%`;
    renderPage(pageNum);
}

prevPageBtn.addEventListener('click', onPrevPage);
nextPageBtn.addEventListener('click', onNextPage);
overlayPrevBtn.addEventListener('click', onPrevPage);
overlayNextBtn.addEventListener('click', onNextPage);
zoomInBtn.addEventListener('click', onZoomIn);
zoomOutBtn.addEventListener('click', onZoomOut);

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

                // Show overlays
                overlayPrevBtn.style.display = 'flex';
                overlayNextBtn.style.display = 'flex';

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
            const pageCount = parseInt(pageContextCountInput.value) || 1;
            let startPage = pageNum;
            let endPage = Math.min(pageNum + pageCount - 1, pdfDoc.numPages);

            if (pageCount > 1) {
                addSystemMessage(`Reading pages ${startPage} to ${endPage}...`);
                for (let i = startPage; i <= endPage; i++) {
                    context += `[Page ${i}]\n` + await getPageText(i) + "\n\n";
                }
                systemPrompt = `You are a helpful AI PDF assistant. You have access to the content of PAGES ${startPage} to ${endPage} of the document provided below. Answer the user's question based on these pages' content.`;
            } else {
                context = await getPageText(pageNum);
                systemPrompt = `You are a helpful AI PDF assistant. You have access to the content of PAGE ${pageNum} of the document provided below. Answer the user's question based on this page's content.`;
            }
        }
    } catch (err) {
        addSystemMessage("Error extracting text: " + err.message);
        sendBtn.disabled = false;
        return;
    }
    // AI Message Placeholder
    const aiMessageContent = addMessage("Thinking...", 'ai');
    let fullResponse = "";

    if (useLocalModel) {
        if (!isModelReady) {
            aiMessageContent.textContent = "⚠️ Local model is not loaded. Please load it in Settings.";
            sendBtn.disabled = false;
            return;
        }

        // Send to worker
        // Construct messages compatible with Transformers.js chat template
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Document Content:\n${context}\n\nQuestion: ${question}` }
        ];
console.log( messages );
        worker.postMessage({ type: 'generate', data: messages });

        // The worker listener handles the updates. 
        // We just need to ensure the UI knows we are waiting.
        // The worker listener updates the *last* AI message.

    } else {
        // API Mode (Existing Logic)
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

// --- Local Model State ---
let useLocalModel = false;
let worker = null;
let isModelLoading = false;
let isModelReady = false;
let localModelId = null;
let transformersLibSource = window.TRANSFORMERS_LIB || null;
let transformersLibBaseUrl = null;

async function loadTransformersBundle() {
    if (!transformersLibSource) {
        throw new Error('Transformers library bundle not found.');
    }
    return transformersLibSource;
}

function getTransformersBaseUrl() {
    if (!transformersLibBaseUrl) {
        transformersLibBaseUrl = new URL('public/transformers.iife.js', window.location.href).href;
    }
    return transformersLibBaseUrl;
}

// Worker Code as String (to bypass file:// security restrictions)
// This function returns the entire worker script as a string.
// We do this to create a Blob worker, which avoids "SecurityError" when running from file://
// MODEL_REGISTRY is now provided by `public/models.js` and injected on global scope.

const getWorkerCode = (baseUrl) => `
// Define base URL for the library to resolve relative paths correctly
// This is critical for file:// protocol support where relative paths fail in Blob workers
self.transformersBaseUrl = '${baseUrl}';

// Inlined transformers library
// This variable is injected by the build script and contains the bundled library
${TRANSFORMERS_LIB}

// Destructure from the global 'transformers' object provided by the library
const {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
} = self.transformers;

// Configure WASM paths to use CDN since we are in a blob worker
// Blob workers have an opaque origin, so relative paths to WASM files fail.
// We explicitly point to the CDN versions of the ONNX Runtime WASM files.
if (self.transformers.env && self.transformers.env.wasm) {
    self.transformers.env.wasm.wasmPaths = {
        'ort-wasm-simd-threaded.wasm': 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.0/dist/ort-wasm-simd-threaded.wasm',
        'ort-wasm-simd.wasm': 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.0/dist/ort-wasm-simd.wasm',
        'ort-wasm-threaded.wasm': 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.0/dist/ort-wasm-threaded.wasm',
        'ort-wasm.wasm': 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.0/dist/ort-wasm.wasm',
    };
}

console.log('Imported dependencies via importScripts');

// Check for WebGPU support within the worker context
async function check() {
  console.log('Running WebGPU check');
  try {
    const adapter = await navigator.gpu.requestAdapter();
    console.log('Got adapter:', adapter);
    if (!adapter) {
      throw new Error("WebGPU is not supported (no adapter found)");
    }
  } catch (e) {
    console.error('WebGPU check failed:', e);
    self.postMessage({
      status: "error", 
      data: e.toString(),
    });
  }
}

// Singleton class to manage the model pipeline
class TextGenerationPipeline {
  static model_id = "onnx-community/Qwen3-0.6B-ONNX";

  // Lazy-load the tokenizer and model instance
  static async getInstance(progress_callback = null) {
    console.log('Getting pipeline instance');
    try {
      // Load tokenizer if not already loaded
      this.tokenizer ??= await AutoTokenizer.from_pretrained(this.model_id, {
        progress_callback,
      });
      console.log('Tokenizer loaded successfully');
      
      // Load model if not already loaded
      // Choose device/dtype dynamically: prefer an explicit '_preferred_device' if set,
      // otherwise use WebGPU. Dtype is selected from '_preferred_dtype' or model heuristics.
      const preferredDevice = this._preferred_device ?? 'webgpu';
      const preferredDtype = this._preferred_dtype || (this._model_registry && this._model_registry[this.model_id] && this._model_registry[this.model_id].dtype) || (/gemma/i.test(this.model_id) ? 'fp32' : (/nanochat/i.test(this.model_id) ? 'q4' : 'q4f16'));
      this.model ??= await AutoModelForCausalLM.from_pretrained(this.model_id, {
        dtype: preferredDtype,
        device: preferredDevice,
        progress_callback,
      });
      console.log('Model loaded successfully');

      return [this.tokenizer, this.model];
    } catch (error) {
      console.error('Failed to load model:', error);
      let errorMessage = error?.message || error?.toString() || ('Unknown error (' + typeof error + '): ' + JSON.stringify(error));
      
      // Handle specific ONNX/WebGPU errors with user-friendly messages
      if (errorMessage.includes('3944596720') || errorMessage.includes('WebGPU')) {
        errorMessage = 'WebGPU device creation failed. Try refreshing the page or check your GPU drivers.';
      } else if (errorMessage.includes('onnxruntime') || errorMessage.includes('session')) {
        errorMessage = 'Model initialization failed. The model may be corrupted or incompatible.';
      } else if (errorMessage.includes('memory') || errorMessage.includes('OOM')) {
        errorMessage = 'Insufficient GPU memory. Try closing other tabs or use a device with more VRAM.';
      }

      // Attempt a CPU fallback for WebGPU/device-related failures (try once)
      try {
        if (!this._cpuFallbackTried && (errorMessage.includes('WebGPU') || errorMessage.includes('device') || errorMessage.includes('adapter') || errorMessage.includes('3944596720'))) {
          this._cpuFallbackTried = true;
          self.postMessage({ status: 'loading', data: 'WebGPU failed; falling back to CPU for ' + this.model_id + '...' });
          // Try loading model on CPU (safer but slower)
          this.model ??= await AutoModelForCausalLM.from_pretrained(this.model_id, {
            dtype: "fp32", //"float32",
            device: "wasm", // "cpu"
            progress_callback,
          });
          console.log('Model loaded successfully on CPU');
          return [this.tokenizer, this.model];
        }
      } catch (cpuError) {
        console.error('CPU fallback failed:', cpuError);
        // append CPU fallback error to original message for debugging
        errorMessage += ' | CPU fallback failed: ' + (cpuError?.message || cpuError?.toString());
      }

      self.postMessage({
        status: "error",
           data: 'Model loading failed: ' + errorMessage
      });
      throw error;
    }
  }
}

// Stopping criteria allows us to interrupt generation
const stopping_criteria = new InterruptableStoppingCriteria();
// Cache for past key values to speed up multi-turn generation
let past_key_values_cache = null;

// Main generation function
async function generate(messages) {
  console.log('Starting generation with messages:', messages);
  const [tokenizer, model] = await TextGenerationPipeline.getInstance();
  console.log('Got tokenizer and model instances');

  // Apply chat template to format messages for the model
  const inputs = tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    return_dict: true,
  });
  console.log('Applied chat template:', inputs);

  let state = "thinking";
  let startTime;
  let numTokens = 0;
  let tps;
  let rawBuffer = "";

  // Regex for special tokens of the form <|...|> (ASCII) and fullwidth variants like <｜...｜>.
  // Also detect end-of-turn / end-of-sentence tokens including fullwidth and U+2581 underscores.
  const SPECIAL_TOKEN_RE = /<\\|[^|]*\\|>|<｜[^｜]*｜>/g;
  const END_OF_TURN_RE = /<end_of_turn>|<｜end(?:_|▁)of(?:_|▁)sentence｜>/g;

  function logAndStripTokens(str, ctx) {
    if (!str) return str;
    const matches = str.match(SPECIAL_TOKEN_RE);
    if (matches && matches.length) {
      matches.forEach(m => console.log('Special token (' + ctx + '):', m));
    }
    const endMatches = str.match(END_OF_TURN_RE);
    if (endMatches && endMatches.length) {
      endMatches.forEach(m => console.log('End-of-turn token (' + ctx + '):', m));
    }
    return str.replace(SPECIAL_TOKEN_RE, '').replace(END_OF_TURN_RE, '');
  }

  // Callback for tracking tokens per second (TPS)
  const token_callback_function = (tokens) => {
    // tokens may be BigInt values or numeric ids; normalize for decoding
    //console.log('Token callback:', tokens);
    startTime ??= performance.now();
    // Try to decode the token(s) for debugging so we can see what is being emitted
    try {
      const tokenIds = Array.isArray(tokens) ? tokens.map(t => (typeof t === 'bigint' ? Number(t) : t)) : [tokens];
      let decoded = null;
      if (tokenizer && typeof tokenizer.decode === 'function') {
        decoded = tokenizer.decode(tokenIds, { skip_special_tokens: false });
      } else if (tokenizer && typeof tokenizer.batch_decode === 'function') {
        decoded = tokenizer.batch_decode([tokenIds], { skip_special_tokens: false })[0];
      }
      if (decoded !== null) {
        //console.log('Decoded token text:', decoded);
        // Remove special tokens and end-of-turn tokens from token-level debug before sending to UI,
        // but log any occurrences to the console.
        const tokenDebugMatches = (decoded || '').match(SPECIAL_TOKEN_RE);
        if (tokenDebugMatches) tokenDebugMatches.forEach(m => console.log('Special token (token_debug):', m));
        const tokenDebugEndMatches = (decoded || '').match(END_OF_TURN_RE);
        if (tokenDebugEndMatches) tokenDebugEndMatches.forEach(m => console.log('End-of-turn (token_debug):', m));
        const tokenDebugSafe = (decoded || '').replace(SPECIAL_TOKEN_RE, '').replace(END_OF_TURN_RE, '');
        // Send lightweight token-level debug to main thread so UI can show it if needed
        self.postMessage({ status: 'token_debug', tokens: tokenIds, text: tokenDebugSafe });
      }
    } catch (e) {
      console.warn('Token decode failed:', e);
    }

    if (numTokens++ > 0 && numTokens % 5 === 0) {
      tps = (numTokens / (performance.now() - startTime)) * 1000;
      console.log('Current TPS:', tps);
    }
  };

  // Callback for handling generated text output
  const callback_function = (output) => {
    //console.log('Output callback:', output);
    rawBuffer += output;

    // Logic to separate "thinking" content (<think>...</think>) from the final answer
    let thought = '';
    let answer = rawBuffer;
    const start = rawBuffer.indexOf('<think>');
    const end = rawBuffer.indexOf('</think>');

    if (start !== -1) {
      if (end !== -1 && end > start) {
        // Thought process is complete
        thought = rawBuffer.slice(start + 7, end).trim();
        answer = rawBuffer.slice(end + 8);
        state = "answering";
      } else {
        // Still thinking
        thought = rawBuffer.slice(start + 7);
        answer = rawBuffer.slice(0, start);
        state = "thinking";
      }
    } else {
      state = "answering";
    }

    // Strip special tokens before sending to the UI, but keep a log for debugging
    thought = logAndStripTokens(thought, 'thought');
    answer = logAndStripTokens(answer, 'answer');

    // Send update to main thread
    self.postMessage({
      status: "update",
      output: answer,
      thought,
      tps,
      numTokens,
      state,
    });
  };

  // Streamer handles decoding tokens into text incrementally
  // Disable skipping special tokens for debugging NanoChat output; we post token-level
  // debug messages to help identify if the model emits only special tokens.
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: false,
    callback_function,
    token_callback_function,
  });
  console.log('Created streamer');

  self.postMessage({ status: "start" });

  // Run generation
  const { past_key_values, sequences } = await model.generate({
    ...inputs,
    do_sample: false, // Greedy decoding for deterministic results
    max_new_tokens: 2048,
    streamer,
    stopping_criteria,
    return_dict_in_generate: true,
  });
  console.log('Generation complete:', sequences);

  // Cache KV pairs for next turn
  past_key_values_cache = past_key_values;

  let decoded = tokenizer.batch_decode(sequences, { skip_special_tokens: true });
  // decoded may be an array of strings; log and strip any special tokens
  if (Array.isArray(decoded)) {
    decoded = decoded.map(d => {
      const matches = (d || '').match(SPECIAL_TOKEN_RE);
      if (matches) matches.forEach(m => console.log('Special token (final):', m));
      return (d || '').replace(SPECIAL_TOKEN_RE, '');
    });
  } else if (typeof decoded === 'string') {
    const matches = decoded.match(SPECIAL_TOKEN_RE);
    if (matches) matches.forEach(m => console.log('Special token (final):', m));
    decoded = decoded.replace(SPECIAL_TOKEN_RE, '');
  }
  console.log('Decoded output:', decoded);
  self.postMessage({ status: "complete", output: decoded });
}

// Handles progress events during model downloading
function handleProgress(event) {
  console.log('Progress event:', event);
  if (!event.total) return;

  const friendlyName = TextGenerationPipeline?.model_id || "onnx-community/Qwen3-0.6B-ONNX";
  const fileLabel = event.url || friendlyName;

  if (event.loaded === 0) {
    // Download started
    console.log('Starting file load:', event.url);
    self.postMessage({
      status: "initiate",
      file: fileLabel,
      progress: 0,
      total: event.total,
    });
  } else if (event.loaded < event.total) {
    // Download in progress
    const percent = Math.round((event.loaded / event.total) * 100);
       console.log('Loading progress: ' + percent + '%');
    self.postMessage({
      status: "progress", 
      file: fileLabel,
      progress: percent,
      total: 100,
    });
  } else {
    // Download complete
    console.log('File load complete:', event.url);
    self.postMessage({
      status: "done",
      file: fileLabel,
    });
  }
}

// Initial load function triggered by the main thread
async function load() {
  console.log('Starting model load');
  self.postMessage({ status: "loading", data: "Checking WebGPU support..." });

  try {
    // First check for WebGPU support
    console.log('Running WebGPU check');
    const adapter = await navigator.gpu.requestAdapter();
    console.log('Got adapter:', adapter);
    if (!adapter) {
      throw new Error("WebGPU is not supported (no adapter found)");
    }
    
    // If we get here, WebGPU is supported, so proceed with loading the model
    const modelId = TextGenerationPipeline?.model_id || "onnx-community/Qwen3-0.6B-ONNX";
       self.postMessage({ status: "loading", data: 'Loading ' + modelId + '...' });

    const [tokenizer, model] = await TextGenerationPipeline.getInstance(handleProgress);
    console.log('Model loaded successfully');
    
    // Perform a dry run to compile shaders and warm up the model
    self.postMessage({ status: "loading", data: "Compiling shaders and warming up model..." });
    const inputs = tokenizer("a");
    console.log('Warmup inputs:', inputs);
    await model.generate({ ...inputs, max_new_tokens: 1 });
    console.log('Warmup complete');
    self.postMessage({ status: "ready", model: modelId });
  } catch (error) {
    console.error('Model load failed:', error);
      const errorMessage = error?.message || error?.toString() || ('Unknown error (' + typeof error + '): ' + JSON.stringify(error));
    self.postMessage({
      status: "error",
         data: 'Model load failed: ' + errorMessage
    });
  }
}

// Worker message listener
self.addEventListener("message", async (e) => {
  const { type, data } = e.data;
  console.log('Received message:', type, data);

  switch (type) {
    case "check":
      check();
      break;
    case "model_registry":
      // Receive centralized registry from main thread
      TextGenerationPipeline._model_registry = data;
      self.postMessage({ status: 'registry_received' });
      break;
    case "set_model":
      // Change the model id used by the pipeline and clear any cached instances.
      // Support either a plain string (modelId) or an object { model_id, dtype }.
      console.log('Setting model id to', data);
      if (typeof data === 'string') {
        TextGenerationPipeline.model_id = data;
        TextGenerationPipeline._preferred_dtype = null;
      } else if (data && typeof data === 'object') {
        TextGenerationPipeline.model_id = data.model_id || TextGenerationPipeline.model_id;
        TextGenerationPipeline._preferred_dtype = data.dtype || null;
      }
      TextGenerationPipeline.tokenizer = null;
      TextGenerationPipeline.model = null;
      self.postMessage({ status: 'model_changed', data });
      break;
    
    case "load":
      load();
      break;
    case "generate":
      stopping_criteria.reset();
      generate(data);
      break;
    case "interrupt":
      console.log('Interrupting generation');
      stopping_criteria.interrupt();
      break;
    case "reset":
      console.log('Resetting state');
      past_key_values_cache = null;
      stopping_criteria.reset();
      break;
  }
});
`;

// --- Worker Initialization ---
async function initWorker() {
    if (worker) return worker;

    await loadTransformersBundle();
    const baseUrl = getTransformersBaseUrl();
    const code = getWorkerCode(baseUrl);

    // Create Worker from Blob to support file:// protocol
    // This bypasses the browser restriction on loading workers from local files
    const blob = new Blob([code], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    worker = new Worker(workerUrl);

    worker.addEventListener('message', (e) => {
        const payload = e.data || {};
        const { status, data, output } = payload;

        if (status === 'progress' || status === 'initiate' || status === 'done') {
            const progressData = (data && typeof data === 'object') ? data : payload;
            const progressStatus = progressData.status || status;

            if (progressStatus === 'progress') {
                const percent = typeof progressData.progress === 'number'
                    ? progressData.progress.toFixed(1)
                    : '0.0';
                document.getElementById('progress-bar').style.width = `${percent}%`;
                document.getElementById('progress-text').textContent = `${percent}%`;
                document.getElementById('loading-status').textContent = `Downloading ${progressData.file || 'model files'}...`;
            } else if (progressStatus === 'done' || status === 'done') {
                document.getElementById('loading-status').textContent = `Loaded ${progressData.file || 'model files'}`;
            } else if (progressStatus === 'initiate' || status === 'initiate') {
                document.getElementById('loading-status').textContent = `Starting ${progressData.file || 'model download'}...`;
                document.getElementById('progress-bar').style.width = `0%`;
                document.getElementById('progress-text').textContent = `0%`;
            }
        } else if (status === 'ready') {
            isModelLoading = false;
            isModelReady = true;
            document.getElementById('load-model-btn').textContent = 'Model Loaded ✅';
            document.getElementById('load-model-btn').disabled = true;
            document.getElementById('loading-status').textContent = 'Ready to chat!';
            addSystemMessage("Local model loaded and ready!");
        } else if (status === 'error') {
            isModelLoading = false;
            addSystemMessage(`❌ Model Error: ${data}`);
            document.getElementById('load-model-btn').disabled = false;
            document.getElementById('load-model-btn').textContent = 'Load Model';
        } else if (status === 'update') {
            // Streaming update
            // Note: Transformers.js callback gives full text so far or tokens. 
            // We need to handle this carefully. The simple callback above sends decoded text.
            // We might need to diff it or just replace content.
            // For now, let's assume 'output' is the full text generated so far.
            // We need to find the *new* part. 
            // Actually, let's just update the last AI message content.
            const aiMsgs = document.querySelectorAll('.message.ai .message-content');
            if (aiMsgs.length > 0) {
                const lastMsg = aiMsgs[aiMsgs.length - 1];
                // The output from callback might include the prompt? 
                // Transformers.js pipeline usually returns full text including prompt if not configured otherwise.
                // We'll handle this in handleSendMessage.
                lastMsg.innerHTML = marked.parse(output);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } else if (status === 'complete') {
            // Final output
            const aiMsgs = document.querySelectorAll('.message.ai .message-content');
            if (aiMsgs.length > 0) {
                const lastMsg = aiMsgs[aiMsgs.length - 1];
                // Clean up prompt if needed
                // For chat-generation, usually we extract the assistant response.
                // The 'output' here is likely an array of messages or string.
                // We will parse it in handleSendMessage logic.
                sendBtn.disabled = false;
            }
        }
    });

    // Send centralized model registry and ensure worker starts with selected model
    const registryPayload = (typeof MODEL_REGISTRY !== 'undefined')
        ? MODEL_REGISTRY
        : (typeof window !== 'undefined' ? window.MODEL_REGISTRY : null);
    if (registryPayload) {
        worker.postMessage({ type: 'model_registry', data: registryPayload });
        if (!localModelId) {
            const firstModelId = Object.keys(registryPayload)[0];
            if (firstModelId) {
                localModelId = firstModelId;
            }
        }
    }
    if (localModelId) {
        worker.postMessage({ type: 'set_model', data: localModelId });
    }
    return worker;
}

// --- Settings Logic ---
const modelSourceSelect = document.getElementById('model-source');
const apiSettingsDiv = document.getElementById('api-settings');
const localSettingsDiv = document.getElementById('local-settings');
const localModelSelect = document.getElementById('local-model-select');
const loadModelBtn = document.getElementById('load-model-btn');

function getModelRegistryEntries() {
    const registry = window.MODEL_REGISTRY;
    if (!registry || typeof registry !== 'object') return [];
    return Object.entries(registry);
}

function getModelOptionLabel(modelId, meta = {}) {
    const friendlyName = meta.friendly || modelId;
    const descriptors = [];
    if (meta.dtype) descriptors.push(meta.dtype.toUpperCase());
    if (meta.thinking) descriptors.push('reasoning');
    return descriptors.length ? `${friendlyName} (${descriptors.join(', ')})` : friendlyName;
}

function populateLocalModelOptions() {
    if (!localModelSelect) return;

    const entries = getModelRegistryEntries();
    localModelSelect.innerHTML = '';

    if (!entries.length) {
        const noModelsOption = document.createElement('option');
        noModelsOption.value = '';
        noModelsOption.textContent = 'No local models available';
        noModelsOption.disabled = true;
        noModelsOption.selected = true;
        localModelSelect.appendChild(noModelsOption);
        localModelSelect.disabled = true;
        if (loadModelBtn) {
            loadModelBtn.disabled = true;
            loadModelBtn.textContent = 'No Models Found';
        }
        return;
    }

    entries.forEach(([modelId, meta]) => {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = getModelOptionLabel(modelId, meta);
        localModelSelect.appendChild(option);
    });

    localModelSelect.disabled = false;
    if (loadModelBtn && !isModelLoading && !isModelReady) {
        loadModelBtn.disabled = false;
        loadModelBtn.textContent = 'Load Model';
    }

    const hasExistingSelection = localModelId && window.MODEL_REGISTRY && window.MODEL_REGISTRY[localModelId];
    const defaultModelId = hasExistingSelection ? localModelId : entries[0][0];
    localModelSelect.value = defaultModelId;
    localModelId = defaultModelId;
}

populateLocalModelOptions();

modelSourceSelect.addEventListener('change', (e) => {
    if (e.target.value === 'local') {
        useLocalModel = true;
        apiSettingsDiv.style.display = 'none';
        localSettingsDiv.style.display = 'block';
        checkWebGPU();
    } else {
        useLocalModel = false;
        apiSettingsDiv.style.display = 'block';
        localSettingsDiv.style.display = 'none';
    }
});

localModelSelect.addEventListener('change', (e) => {
    localModelId = e.target.value;
    // Reset load button if model changes
    isModelReady = false;
    if (loadModelBtn) {
        loadModelBtn.textContent = 'Load Model';
        loadModelBtn.disabled = false;
    }
    if (worker) {
        worker.postMessage({ type: 'set_model', data: localModelId });
    }
});

loadModelBtn.addEventListener('click', async () => {
    if (isModelLoading) return;
    if (!localModelId) {
        addSystemMessage("⚠️ No local models are available to load right now.");
        return;
    }
    isModelLoading = true;
    document.getElementById('load-model-btn').disabled = true;
    document.getElementById('load-model-btn').textContent = 'Loading...';
    document.getElementById('model-progress-container').style.display = 'block';

    await initWorker();
    worker.postMessage({ type: 'load' });
});

async function checkWebGPU() {
    const statusEl = document.getElementById('webgpu-status');
    if (!navigator.gpu) {
        statusEl.textContent = "❌ WebGPU not supported in this browser.";
        statusEl.style.color = "red";
        return;
    }
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            statusEl.textContent = "❌ No WebGPU adapter found.";
            statusEl.style.color = "red";
        } else {
            statusEl.textContent = "✅ WebGPU detected.";
            statusEl.style.color = "green";
        }
    } catch (e) {
        statusEl.textContent = "❌ WebGPU error: " + e.message;
        statusEl.style.color = "red";
    }
}

// --- Resizable Panel ---
const resizer = document.getElementById('resizer');
const chatSection = document.querySelector('.chat-section');
let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    e.preventDefault(); // Prevent text selection
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    // Calculate new width (from right edge)
    const newWidth = window.innerWidth - e.clientX;

    // Constraints
    if (newWidth > 300 && newWidth < 800) {
        chatSection.style.width = `${newWidth}px`;
    }
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        resizer.classList.remove('resizing');
        document.body.style.cursor = 'default';
    }
});
