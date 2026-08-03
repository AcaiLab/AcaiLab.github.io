const welcomeVideo = document.getElementById("welcome-video");
const WELCOME_VIDEO_SRC = appUrl("videos/welcome-nclex-buddy.mp4");
const SCORE_VIDEO_SRC = appUrl("videos/score-summary.mp4");
const SCORE_SUMMARY_TEXT =
  "Here is your score. Take a moment to review, then keep practicing. Each question helps sharpen your clinical judgment.";
const VOICE_NO_MATCH_VIDEO_SRC = appUrl("videos/voice-no-match.mp4");
const VOICE_NO_MATCH_TEXT =
  "I heard your response, but I could not match it to an answer option. Try saying option A, B, C, or D.";
const liveAvatarFrame = document.getElementById("liveavatar-frame");
const videoStatus = document.getElementById("video-status");
const videoMissing = document.getElementById("video-missing");
const replayWelcomeButton = document.getElementById("replay-welcome-btn");
const educatorLine = document.getElementById("educator-line");
const progressNode = document.getElementById("progress");
const categoryNode = document.getElementById("category");
const questionCard = document.getElementById("question-card");
const difficultyNode = document.getElementById("difficulty");
const formatNode = document.getElementById("format");
const promptNode = document.getElementById("prompt");
const optionsNode = document.getElementById("options");
const feedbackNode = document.getElementById("feedback");
const resultsPanel = document.getElementById("results-panel");
const scoreValue = document.getElementById("score-value");
const scoreNote = document.getElementById("score-note");
const resultSummary = document.getElementById("result-summary");
const actionsNode = document.getElementById("actions");
const checkButton = document.getElementById("check-btn");
const nextButton = document.getElementById("next-btn");
const nextButtonLabel = document.getElementById("next-btn-label");
const restartQuizButton = document.getElementById("restart-quiz-btn");
const shuffleButton = document.getElementById("shuffle-btn");
const repeatButton = document.getElementById("repeat-btn");
const micButton = document.getElementById("mic-btn");
const voiceAnswer = document.getElementById("voice-answer");
const micStatus = document.getElementById("mic-status");
const voiceTranscript = document.getElementById("voice-transcript");
const sourcesNode = document.getElementById("sources");

const state = {
  questions: [],
  sources: {},
  index: 0,
  lastPrompt: "Welcome to NCLEX Buddy.",
  checked: false,
  responses: {},
  showingResults: false,
  welcomeVideoAvailable: true,
  recognition: null,
  isListening: false,
  shouldProcessVoice: false,
  finalTranscript: "",
  staticMode: false,
  heygenSpeechEnabled: false,
  speechAudio: null,
  speechRequestId: 0,
  videoManifest: {},
  lastVideoSrc: "",
  currentVideoSrc: WELCOME_VIDEO_SRC,
};

function setVideoStatus(message) {
  videoStatus.textContent = message;
}

async function init() {
  lucide.createIcons();
  setupWelcomeVideo();
  setupSpeechRecognition();
  await loadConfig();
  await Promise.all([loadQuestions(), loadSources(), loadVideoManifest()]);
  renderSources();
  renderQuestion({ announce: false });
}

async function loadConfig() {
  const staticConfig = await loadOptionalJson("site-config.json");
  if (staticConfig?.staticMode) {
    state.staticMode = true;
    state.heygenSpeechEnabled = false;
    return;
  }

  const data = await fetchJson("api/config");
  state.heygenSpeechEnabled = Boolean(data.heygenSpeechEnabled);
}

async function loadQuestions() {
  const data = await fetchJson(state.staticMode ? "data/demo-questions.json" : "api/questions");
  state.questions = data.questions;
}

async function loadSources() {
  const data = await fetchJson(state.staticMode ? "data/demo-sources.json" : "api/sources");
  state.sources = Object.fromEntries(data.map((source) => [source.id, source]));
}

async function loadVideoManifest() {
  try {
    const response = await fetch(appUrl("videos/quiz/manifest.json"), { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    state.videoManifest = data.questions || {};
  } catch (error) {
    console.info("Quiz video manifest is not available yet.", error);
  }
}

async function loadOptionalJson(path) {
  try {
    const response = await fetch(appUrl(path), { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    return null;
  }
}

async function fetchJson(path, options = {}) {
  const response = await fetch(appUrl(path), options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function setupWelcomeVideo() {
  checkWelcomeVideoFile();

  welcomeVideo.addEventListener("loadeddata", () => {
    state.welcomeVideoAvailable = true;
    videoMissing.hidden = true;
    setVideoStatus("Video ready");
  });

  welcomeVideo.addEventListener("playing", () => {
    setVideoStatus(welcomeVideo.muted ? "Playing muted" : "Playing");
  });

  welcomeVideo.addEventListener("ended", () => {
    setVideoStatus("Welcome played");
  });

  welcomeVideo.addEventListener("error", () => {
    markWelcomeVideoMissing();
  });

  autoplayWelcomeVideo();
}

async function checkWelcomeVideoFile() {
  try {
    const response = await fetch(welcomeVideo.currentSrc || welcomeVideo.src, { method: "HEAD" });
    if (!response.ok) {
      markWelcomeVideoMissing();
    }
  } catch (error) {
    markWelcomeVideoMissing();
  }
}

function markWelcomeVideoMissing() {
  state.welcomeVideoAvailable = false;
  videoMissing.hidden = false;
  setVideoStatus("Video missing");
  educatorLine.textContent = "Export the HeyGen welcome clip as static/videos/welcome-nclex-buddy.mp4.";
}

async function videoExists(videoSrc) {
  try {
    const response = await fetch(videoSrc, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

async function autoplayWelcomeVideo() {
  try {
    welcomeVideo.muted = false;
    await welcomeVideo.play();
  } catch (error) {
    try {
      welcomeVideo.muted = true;
      await welcomeVideo.play();
      educatorLine.textContent = "Welcome video is autoplaying muted. Use Replay welcome for sound.";
    } catch (mutedError) {
      if (state.welcomeVideoAvailable) {
        setVideoStatus("Tap replay");
        educatorLine.textContent = "Use Replay welcome to start the educator video.";
      }
    }
  }
}

async function replayWelcomeVideo() {
  hideLiveAvatar();
  if (!state.welcomeVideoAvailable) {
    videoMissing.hidden = false;
    setVideoStatus("Video missing");
    return;
  }
  setEducatorVideoSrc(WELCOME_VIDEO_SRC);
  welcomeVideo.currentTime = 0;
  welcomeVideo.muted = false;
  await welcomeVideo.play();
}

async function parseJsonResponse(response) {
  const contentType = response.headers.get("Content-Type") || "";
  const text = await response.text();
  if (!text) {
    return {};
  }
  if (contentType.includes("application/json")) {
    return JSON.parse(text);
  }
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: text.trim().slice(0, 500) || `Request failed: ${response.status}`
    };
  }
}

function hideLiveAvatar() {
  liveAvatarFrame.hidden = true;
  welcomeVideo.hidden = false;
}

function renderSources() {
  sourcesNode.innerHTML = "";
  Object.values(state.sources).forEach((source) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = source.name;
    item.append(link);
    sourcesNode.append(item);
  });
}

function renderQuestion({ announce = true } = {}) {
  const question = currentQuestion();
  state.showingResults = false;
  state.checked = false;
  questionCard.hidden = false;
  resultsPanel.hidden = true;
  voiceAnswer.hidden = false;
  actionsNode.hidden = false;
  checkButton.hidden = false;
  checkButton.disabled = false;
  nextButton.hidden = false;
  nextButton.disabled = true;
  nextButtonLabel.textContent = state.index === state.questions.length - 1 ? "View score" : "Next";
  feedbackNode.hidden = true;
  feedbackNode.className = "feedback";
  progressNode.textContent = `Question ${state.index + 1} of ${state.questions.length}`;
  categoryNode.textContent = question.category;
  difficultyNode.textContent = question.difficulty;
  formatNode.textContent = question.format === "multiple" ? "Select all that apply" : "Single best answer";
  promptNode.textContent = question.prompt;
  optionsNode.innerHTML = "";

  question.options.forEach((option, optionIndex) => {
    const id = `${question.id}-${optionIndex}`;
    const label = document.createElement("label");
    label.className = "option";
    label.setAttribute("for", id);

    const input = document.createElement("input");
    input.id = id;
    input.name = question.id;
    input.type = question.format === "multiple" ? "checkbox" : "radio";
    input.value = String(optionIndex);
    input.addEventListener("change", () => {
      if (!state.checked) {
        feedbackNode.hidden = true;
      }
    });

    const text = document.createElement("span");
    text.textContent = option;
    label.append(input, text);
    optionsNode.append(label);
  });

  const intro = question.format === "multiple" ? "Select all that apply. " : "";
  const spokenPrompt = `Here is your ${question.category} question. ${intro}${question.prompt}`;
  if (announce) {
    speakQuestion(question, spokenPrompt);
  } else {
    state.lastPrompt = spokenPrompt;
    state.lastVideoSrc = state.videoManifest[question.id]?.question || "";
  }
}

function currentQuestion() {
  return state.questions[state.index];
}

function selectedIndexes() {
  return Array.from(optionsNode.querySelectorAll("input:checked")).map((input) => Number(input.value));
}

async function checkAnswer() {
  if (state.checked || state.showingResults) {
    return;
  }

  const question = currentQuestion();
  const selected = selectedIndexes();
  if (!selected.length) {
    speak("Choose an answer first, then I will coach your reasoning.");
    return;
  }

  const result = state.staticMode
    ? checkStaticAnswer(question, selected)
    : await fetchJson("api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, selected })
      });
  state.checked = true;
  state.responses[question.id] = {
    correct: Boolean(result.correct),
    selected,
    answer: result.answer,
    category: question.category,
    prompt: question.prompt
  };
  checkButton.disabled = true;
  nextButton.disabled = false;
  markOptions(result, selected);
  feedbackNode.hidden = false;
  feedbackNode.classList.toggle("is-wrong", !result.correct);
  feedbackNode.innerHTML = `
    <strong>${result.correct ? "Correct." : "Not quite."}</strong>
    <p>${escapeHtml(result.rationale)}</p>
    <p>${escapeHtml(result.teachingPoint)}</p>
  `;
  speakFeedback(
    question,
    selected,
    `${result.correct ? "Correct." : "Not quite."} ${result.rationale} Teaching point: ${result.teachingPoint}`
  );
}

function checkStaticAnswer(question, selected) {
  const correct = [...question.answer].sort((a, b) => a - b);
  const chosen = [...selected].sort((a, b) => a - b);
  return {
    questionId: question.id,
    correct: chosen.length === correct.length && chosen.every((value, index) => value === correct[index]),
    answer: correct,
    rationale: question.rationale,
    teachingPoint: question.teachingPoint,
    sourceIds: question.sourceIds
  };
}

function markOptions(result, selected) {
  const correct = new Set(result.answer);
  optionsNode.querySelectorAll(".option").forEach((label, index) => {
    label.classList.toggle("correct", correct.has(index));
    label.classList.toggle("incorrect", selected.includes(index) && !correct.has(index));
    label.querySelector("input").disabled = true;
  });
}

function nextQuestion() {
  if (!state.checked) {
    speak("Check your answer first, then you can move forward.");
    return;
  }
  if (state.index === state.questions.length - 1) {
    showResults();
    return;
  }
  state.index += 1;
  renderQuestion();
}

function shuffleQuestions() {
  state.responses = {};
  state.showingResults = false;
  for (let index = state.questions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [state.questions[index], state.questions[swapIndex]] = [state.questions[swapIndex], state.questions[index]];
  }
  state.index = 0;
  renderQuestion();
}

function showResults() {
  state.showingResults = true;
  if (state.isListening) {
    state.shouldProcessVoice = false;
    state.recognition.stop();
  }

  const total = state.questions.length;
  const correct = state.questions.filter((question) => state.responses[question.id]?.correct).length;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const note = scoreMessage(correct, total);

  progressNode.textContent = "Quiz complete";
  categoryNode.textContent = "Score report";
  questionCard.hidden = true;
  feedbackNode.hidden = true;
  voiceAnswer.hidden = true;
  actionsNode.hidden = true;
  resultsPanel.hidden = false;
  scoreValue.textContent = `${correct} / ${total}`;
  scoreNote.textContent = `${percent}% correct. ${note}`;
  renderResultSummary();
  playScoreSummary();
}

async function playScoreSummary() {
  state.lastPrompt = SCORE_SUMMARY_TEXT;
  educatorLine.textContent = SCORE_SUMMARY_TEXT;
  if (await videoExists(SCORE_VIDEO_SRC)) {
    state.lastVideoSrc = SCORE_VIDEO_SRC;
    playEducatorVideo(SCORE_VIDEO_SRC, SCORE_SUMMARY_TEXT);
    return;
  }
  state.lastVideoSrc = "";
  playEducatorSpeech(SCORE_SUMMARY_TEXT);
}

async function playVoiceNoMatchPrompt() {
  state.lastPrompt = VOICE_NO_MATCH_TEXT;
  educatorLine.textContent = VOICE_NO_MATCH_TEXT;
  if (await videoExists(VOICE_NO_MATCH_VIDEO_SRC)) {
    state.lastVideoSrc = VOICE_NO_MATCH_VIDEO_SRC;
    playEducatorVideo(VOICE_NO_MATCH_VIDEO_SRC, VOICE_NO_MATCH_TEXT);
    return;
  }
  state.lastVideoSrc = "";
  playEducatorSpeech(VOICE_NO_MATCH_TEXT);
}

function scoreMessage(correct, total) {
  if (!total) {
    return "No questions were loaded for this session.";
  }
  if (correct === total) {
    return "Excellent work. You answered every question correctly.";
  }
  if (correct / total >= 0.67) {
    return "Good progress. Review the missed rationales and try once more.";
  }
  return "Keep practicing. Review each teaching point, then try the set again.";
}

function renderResultSummary() {
  resultSummary.innerHTML = "";
  state.questions.forEach((question, index) => {
    const response = state.responses[question.id] || {
      correct: false,
      selected: [],
      answer: question.answer || []
    };
    const item = document.createElement("div");
    item.className = `result-item ${response.correct ? "correct" : "incorrect"}`;

    const heading = document.createElement("strong");
    heading.textContent = `Question ${index + 1}: ${response.correct ? "Correct" : "Review"}`;

    const category = document.createElement("span");
    category.textContent = question.category;

    const prompt = document.createElement("p");
    prompt.className = "result-prompt";
    prompt.textContent = question.prompt;

    const selected = document.createElement("span");
    selected.textContent = `Your answer: ${formatAnswer(response.selected, question) || "No answer recorded"}`;

    const answer = document.createElement("span");
    answer.textContent = `Correct answer: ${formatAnswer(response.answer, question)}`;

    item.append(heading, category, prompt, selected, answer);
    resultSummary.append(item);
  });
}

function formatAnswer(indexes, question) {
  return [...(indexes || [])]
    .sort((a, b) => a - b)
    .filter((index) => Number.isInteger(index) && question.options[index])
    .map((index) => `${String.fromCharCode(65 + index)}. ${question.options[index]}`)
    .join(" | ");
}

function restartQuiz() {
  state.responses = {};
  state.index = 0;
  renderQuestion();
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micButton.disabled = true;
    micStatus.textContent = "Voice answer unavailable";
    voiceTranscript.textContent = "Speech recognition is not supported in this browser. Try Chrome or Edge.";
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.lang = "en-US";
  state.recognition.continuous = true;
  state.recognition.interimResults = true;

  state.recognition.addEventListener("start", () => {
    state.isListening = true;
    micButton.setAttribute("aria-pressed", "true");
    micStatus.textContent = "Listening";
    voiceTranscript.textContent = "Listening...";
  });

  state.recognition.addEventListener("result", (event) => {
    let interimTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript.trim();
      if (event.results[index].isFinal) {
        state.finalTranscript = `${state.finalTranscript} ${transcript}`.trim();
      } else {
        interimTranscript = `${interimTranscript} ${transcript}`.trim();
      }
    }
    const shown = [state.finalTranscript, interimTranscript].filter(Boolean).join(" ");
    voiceTranscript.textContent = shown || "Listening...";
  });

  state.recognition.addEventListener("error", (event) => {
    state.isListening = false;
    state.shouldProcessVoice = false;
    micButton.setAttribute("aria-pressed", "false");
    micStatus.textContent = "Voice answer stopped";
    voiceTranscript.textContent =
      event.error === "not-allowed"
        ? "Microphone permission was blocked. Allow microphone access and try again."
        : `Speech recognition error: ${event.error}`;
  });

  state.recognition.addEventListener("end", () => {
    const shouldProcess = state.shouldProcessVoice;
    state.isListening = false;
    state.shouldProcessVoice = false;
    micButton.setAttribute("aria-pressed", "false");
    if (shouldProcess) {
      processVoiceAnswer();
    }
  });
}

function toggleVoiceInput() {
  if (!state.recognition || state.showingResults) {
    return;
  }
  if (state.isListening) {
    state.shouldProcessVoice = true;
    state.recognition.stop();
    micStatus.textContent = "Processing";
    return;
  }

  stopCurrentSpeech();
  stopEducatorVideo("Listening");
  state.finalTranscript = "";
  state.shouldProcessVoice = false;
  feedbackNode.hidden = true;
  try {
    state.recognition.start();
  } catch (error) {
    micStatus.textContent = "Voice answer unavailable";
    voiceTranscript.textContent = "The microphone could not start. Try refreshing the page.";
  }
}

async function processVoiceAnswer() {
  const transcript = state.finalTranscript.trim();
  if (!transcript) {
    micStatus.textContent = "No answer heard";
    voiceTranscript.textContent = "I did not hear an answer. Tap the microphone and try again.";
    return;
  }

  const question = currentQuestion();
  const parsed = parseVoiceAnswer(transcript, question);
  voiceTranscript.textContent = `Heard: "${transcript}"`;

  if (!parsed.indexes.length) {
    micStatus.textContent = "Could not match answer";
    playVoiceNoMatchPrompt();
    return;
  }

  applyVoiceSelection(parsed.indexes, question);
  const label = parsed.indexes.map((index) => String.fromCharCode(65 + index)).join(", ");
  micStatus.textContent = `Matched option ${label}`;
  await checkAnswer();
}

function parseVoiceAnswer(transcript, question) {
  const normalized = normalizeText(transcript);
  const optionCount = question.options.length;
  const indexes = new Set();

  collectLetterMatches(normalized, optionCount).forEach((index) => indexes.add(index));
  collectOrdinalMatches(normalized, optionCount).forEach((index) => indexes.add(index));

  if (indexes.size) {
    return { indexes: trimForQuestionFormat([...indexes], question), method: "letter" };
  }

  const bestTextMatch = findBestOptionTextMatch(normalized, question.options);
  if (bestTextMatch && bestTextMatch.score >= 0.5) {
    return { indexes: [bestTextMatch.index], method: "text" };
  }

  return { indexes: [], method: "none" };
}

function collectLetterMatches(normalized, optionCount) {
  const matches = new Set();
  const patterns = [
    /\b(?:option|answer|letter|choice)\s+([a-f])\b/g,
    /\b(?:i\s+)?(?:choose|chose|select|selected|pick|picked)\s+(?:option\s+|answer\s+|letter\s+|choice\s+)?([a-f])\b/g,
    /\b(?:my\s+answer\s+is|the\s+answer\s+is)\s+(?:option\s+)?([a-f])\b/g
  ];

  patterns.forEach((pattern) => {
    let match = pattern.exec(normalized);
    while (match) {
      const index = match[1].charCodeAt(0) - 97;
      if (index >= 0 && index < optionCount) {
        matches.add(index);
      }
      match = pattern.exec(normalized);
    }
  });

  if (/\b(option|options|letter|letters|choice|choices)\b/.test(normalized)) {
    const standalonePattern = /\b([a-f])\b/g;
    let standalone = standalonePattern.exec(normalized);
    while (standalone) {
      const index = standalone[1].charCodeAt(0) - 97;
      if (index >= 0 && index < optionCount) {
        matches.add(index);
      }
      standalone = standalonePattern.exec(normalized);
    }
  }

  const compact = normalized.replace(/\b(and|or|also|plus|comma)\b/g, " ").trim();
  if (/^[a-f](\s+[a-f])*$/.test(compact)) {
    compact.split(/\s+/).forEach((letter) => {
      const index = letter.charCodeAt(0) - 97;
      if (index >= 0 && index < optionCount) {
        matches.add(index);
      }
    });
  }

  return [...matches];
}

function collectOrdinalMatches(normalized, optionCount) {
  const ordinalMap = {
    first: 0,
    one: 0,
    "1": 0,
    second: 1,
    two: 1,
    "2": 1,
    third: 2,
    three: 2,
    "3": 2,
    fourth: 3,
    four: 3,
    "4": 3,
    fifth: 4,
    five: 4,
    "5": 4,
    sixth: 5,
    six: 5,
    "6": 5
  };
  const matches = new Set();
  const pattern = /\b(?:option|answer|choice|number)\s+(first|second|third|fourth|fifth|sixth|one|two|three|four|five|six|[1-6])\b/g;
  let match = pattern.exec(normalized);
  while (match) {
    const index = ordinalMap[match[1]];
    if (index >= 0 && index < optionCount) {
      matches.add(index);
    }
    match = pattern.exec(normalized);
  }
  return [...matches];
}

function findBestOptionTextMatch(normalizedTranscript, options) {
  const transcriptTokens = new Set(tokenizeMeaningful(normalizedTranscript));
  let best = null;

  options.forEach((option, index) => {
    const optionTokens = tokenizeMeaningful(normalizeText(option));
    if (!optionTokens.length) {
      return;
    }
    const matches = optionTokens.filter((token) => transcriptTokens.has(token)).length;
    const score = matches / optionTokens.length;
    if (!best || score > best.score) {
      best = { index, score };
    }
  });

  return best;
}

function trimForQuestionFormat(indexes, question) {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  return question.format === "multiple" ? sorted : sorted.slice(0, 1);
}

function applyVoiceSelection(indexes, question) {
  const selected = new Set(indexes);
  optionsNode.querySelectorAll("input").forEach((input, index) => {
    input.checked = selected.has(index);
    if (question.format !== "multiple" && selected.has(index)) {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMeaningful(value) {
  const stopwords = new Set([
    "a",
    "an",
    "the",
    "to",
    "with",
    "who",
    "and",
    "or",
    "of",
    "in",
    "on",
    "for",
    "is",
    "are",
    "be",
    "client",
    "option",
    "answer",
    "choose",
    "select",
    "i"
  ]);
  return value.split(/\s+/).filter((token) => token.length > 1 && !stopwords.has(token));
}

function speak(text) {
  state.lastPrompt = text;
  state.lastVideoSrc = "";
  educatorLine.textContent = text;
  playEducatorSpeech(text);
}

function speakQuestion(question, text) {
  state.lastPrompt = text;
  state.lastVideoSrc = state.videoManifest[question.id]?.question || "";
  educatorLine.textContent = text;
  if (state.lastVideoSrc) {
    playEducatorVideo(state.lastVideoSrc, text);
    return;
  }
  playEducatorSpeech(text);
}

function speakFeedback(question, selected, text) {
  state.lastPrompt = text;
  state.lastVideoSrc = "";
  educatorLine.textContent = text;
  const answerIndex = selected.length === 1 ? selected[0] : null;
  const answerKey = answerIndex === null ? "" : String.fromCharCode(97 + answerIndex);
  const videoSrc = state.videoManifest[question.id]?.answers?.[answerKey];
  if (videoSrc) {
    state.lastVideoSrc = videoSrc;
    playEducatorVideo(videoSrc, text);
    return;
  }
  playEducatorSpeech(text);
}

async function playEducatorVideo(videoSrc, fallbackText) {
  stopCurrentSpeech();
  hideLiveAvatar();
  videoMissing.hidden = true;
  welcomeVideo.hidden = false;
  welcomeVideo.muted = false;
  setEducatorVideoSrc(videoSrc);
  welcomeVideo.currentTime = 0;
  setVideoStatus("Educator video");
  try {
    await welcomeVideo.play();
  } catch (error) {
    console.warn(error);
    playEducatorSpeech(fallbackText);
  }
}

function setEducatorVideoSrc(videoSrc) {
  const resolvedVideoSrc = appUrl(videoSrc);
  if (state.currentVideoSrc !== resolvedVideoSrc) {
    welcomeVideo.src = resolvedVideoSrc;
    state.currentVideoSrc = resolvedVideoSrc;
  }
}

async function playEducatorSpeech(text) {
  const requestId = state.speechRequestId + 1;
  state.speechRequestId = requestId;
  stopCurrentSpeech();
  stopEducatorVideo("Audio only");
  const voiceText = speechFriendlyText(text);

  if (!state.heygenSpeechEnabled) {
    browserSpeak(voiceText);
    return;
  }

  try {
    const response = await fetch(appUrl("api/heygen-speech"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: voiceText })
    });
    const payload = await parseJsonResponse(response);
    if (requestId !== state.speechRequestId) {
      return;
    }
    if (!response.ok || !payload.audioUrl) {
      throw new Error(payload.error || "HeyGen speech was unavailable.");
    }
    const audio = new Audio(payload.audioUrl);
    state.speechAudio = audio;
    await audio.play();
  } catch (error) {
    console.warn(error);
    if (requestId === state.speechRequestId) {
      browserSpeak(voiceText);
    }
  }
}

function speechFriendlyText(text) {
  return text.replace(/\bNCLEX\b/g, "Enclex");
}

function appUrl(path) {
  const value = String(path);
  if (/^(https?:|data:|blob:)/i.test(value)) {
    return value;
  }
  return new URL(value.replace(/^\/+/, ""), document.baseURI).toString();
}

function stopCurrentSpeech() {
  if (state.speechAudio) {
    state.speechAudio.pause();
    state.speechAudio = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function stopEducatorVideo(status = "Video stopped") {
  if (!welcomeVideo.paused) {
    welcomeVideo.pause();
  }
  setVideoStatus(status);
}

function browserSpeak(text) {
  if (!("speechSynthesis" in window)) {
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.94;
  utterance.pitch = 1.02;
  const voices = window.speechSynthesis.getVoices();
  utterance.voice =
    voices.find((voice) => /female|samantha|jenny|aria|zira/i.test(voice.name)) ||
    voices.find((voice) => voice.lang.startsWith("en")) ||
    null;
  window.speechSynthesis.speak(utterance);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

checkButton.addEventListener("click", checkAnswer);
nextButton.addEventListener("click", nextQuestion);
restartQuizButton.addEventListener("click", restartQuiz);
shuffleButton.addEventListener("click", shuffleQuestions);
repeatButton.addEventListener("click", () => {
  const prompt = state.lastPrompt || "I am ready when you are.";
  if (state.lastVideoSrc) {
    playEducatorVideo(state.lastVideoSrc, prompt);
    return;
  }
  speak(prompt);
});
replayWelcomeButton.addEventListener("click", replayWelcomeVideo);
micButton.addEventListener("click", toggleVoiceInput);

window.speechSynthesis?.addEventListener?.("voiceschanged", () => {});
init();
