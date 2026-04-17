const LETTER_MAPPING = {
  a: ["C4", "G4"],
  b: ["G4", "C5"],
  c: ["C4", "E4"],
  d: ["F4", "A4"],
  e: ["D4", "A4"],
  f: ["G4", "B4"],
  g: ["D4", "F4"],
  h: ["F4"],
  i: ["E4", "B4"],
  j: ["D5", "F5"],
  k: ["A4", "D5"],
  l: ["C4"],
  m: ["A4", "C5"],
  n: ["G4"],
  o: ["G4", "C5"],
  p: ["E4", "G4"],
  q: ["B4"],
  r: ["A4"],
  s: ["D4"],
  t: ["E4"],
  u: ["A4", "D5"],
  v: ["E4", "A4"],
  w: ["C5", "F5"],
  x: ["B4", "E5"],
  y: ["D4", "G4"],
  z: ["C5", "E5"]
};

const NUMBER_MAPPING = {
  0: ["E6"],
  1: ["C5"],
  2: ["D5"],
  3: ["E5"],
  4: ["F5"],
  5: ["G5"],
  6: ["A5"],
  7: ["B5"],
  8: ["C6"],
  9: ["D6"]
};

const SYMBOL_MAP = { ...LETTER_MAPPING, ...NUMBER_MAPPING };

const PHRASE_BANK = [
  "meet me at noon",
  "bring the blue cup",
  "turn left at the park",
  "coffee at ten",
  "the rain will pass",
  "quiet room open",
  "please call me later",
  "sunlight on the table",
  "fresh bread tonight",
  "send the file now",
  "garden gate is open",
  "pick up milk",
  "check the front door",
  "we start in five",
  "books on the shelf",
  "walk home slowly",
  "light the small lamp",
  "train arrives at six",
  "music in the hallway",
  "bring two towels",
  "flight 123 ready",
  "base 10 responding",
  "meet at 1500 hours",
  "temperature is 72",
  "take route 66",
];

const SLOW_CONFIG = {
  charDuration: 0.825,
  gapDuration: 0.42,
  vowelDuration: 0.975,
  spaceDuration: 1.275
};

const FAST_CONFIG = {
  charDuration: 0.55,
  gapDuration: 0.28,
  vowelDuration: 0.65,
  spaceDuration: 0.85
};

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

const playBtn = document.getElementById("play-btn");
const submitBtn = document.getElementById("submit-btn");
const replayBtn = document.getElementById("replay-btn");
const volumeSlider = document.getElementById("volume-slider");
const noiseSlider = document.getElementById("noise-slider");
const hardModeToggle = document.getElementById("hard-mode-toggle");
const guessInput = document.getElementById("guess-input");
const feedback = document.getElementById("feedback");
const roundIndicator = document.getElementById("round-indicator");
const speedIndicator = document.getElementById("speed-indicator");
const scoreEl = document.getElementById("score");
const tableBody = document.getElementById("mapping-table-body");

let audioCtx;
let masterGain;
let droneGain;
let droneOsc;
let noiseNode;
let noiseGain;

let isPlaying = false;
let currentRound = 0;
let score = 0;
let prompts = [];

function midiToFreq(note) {
  const match = note.match(/^([A-G])(#{0,1})(\d)$/);
  if (!match) {
    return 440;
  }
  const [, letter, sharp, octaveRaw] = match;
  const octave = parseInt(octaveRaw, 10);
  const noteIndex = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11
  }[letter] + (sharp ? 1 : 0);

  const midi = (octave + 1) * 12 + noteIndex;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createNoiseBuffer(context) {
  const bufferSize = context.sampleRate * 2;
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

function initAudio() {
  if (audioCtx) {
    return;
  }

  audioCtx = new AudioContext();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = parseInt(volumeSlider.value, 10) / 100;
  masterGain.connect(audioCtx.destination);

  droneGain = audioCtx.createGain();
  droneGain.gain.value = 0;
  droneGain.connect(masterGain);

  noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0;
  noiseGain.connect(masterGain);

  noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = createNoiseBuffer(audioCtx);
  noiseNode.loop = true;
  noiseNode.connect(noiseGain);
  noiseNode.start();
}

function startDrone() {
  if (droneOsc) {
    return;
  }

  droneOsc = audioCtx.createOscillator();
  droneOsc.type = "sine";
  droneOsc.frequency.value = midiToFreq("C3");
  droneOsc.connect(droneGain);
  droneOsc.start();

  const now = audioCtx.currentTime;
  droneGain.gain.cancelScheduledValues(now);
  droneGain.gain.setValueAtTime(0.0001, now);
  droneGain.gain.exponentialRampToValueAtTime(0.04, now + 0.08);
}

function stopDroneAt(stopTime) {
  if (!droneOsc) return;

  droneGain.gain.cancelScheduledValues(stopTime);
  droneGain.gain.setValueAtTime(droneGain.gain.value, stopTime);
  // Fade out slowly
  droneGain.gain.exponentialRampToValueAtTime(0.0001, stopTime + 0.8);
  droneOsc.stop(stopTime + 1.0);
  droneOsc = null;
}

function pickRandomPhrases(count) {
  const pool = [...PHRASE_BANK];
  const picked = [];

  while (picked.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }

  return picked;
}

function startTest() {
  prompts = pickRandomPhrases(10).map((text, idx) => ({
    text,
    speed: idx < 5 ? "slow" : "fast"
  }));

  currentRound = 0;
  score = 0;

  scoreEl.hidden = true;
  replayBtn.hidden = true;
  guessInput.disabled = false;
  submitBtn.disabled = false;
  playBtn.disabled = false;
  guessInput.value = "";
  feedback.textContent = "Press Play Prompt to hear round 1.";
  updateRoundUI();
}

function updateRoundUI() {
  if (currentRound >= prompts.length) {
    roundIndicator.textContent = "Test complete";
    speedIndicator.textContent = "-";
    return;
  }

  const round = currentRound + 1;
  const mode = prompts[currentRound].speed;
  roundIndicator.textContent = `Round ${round} of 10`;
  speedIndicator.textContent = mode === "slow" ? "Slow speed" : "Full copy speed";
}

function normalizeText(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function setNoiseForMode() {
  const hardMode = hardModeToggle.checked;
  noiseSlider.disabled = !hardMode;

  if (!noiseGain) {
    return;
  }

  noiseGain.gain.value = hardMode ? parseFloat(noiseSlider.value) * 0.25 : 0;
}

function scheduleSymbol(noteNames, startTime, duration) {
  const attack = 0.08; // Soft fade-in
  const release = 0.4; // Long ambient fade-out (bleeds into next note)
  const peakVolume = 0.15;

  noteNames.forEach((noteName) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.value = midiToFreq(noteName);

    // 1. Start at 0
    gain.gain.setValueAtTime(0, startTime);

    // 2. Swell to peak volume
    gain.gain.linearRampToValueAtTime(peakVolume, startTime + attack);

    // 3. Sustain the note
    gain.gain.setValueAtTime(peakVolume, startTime + duration);

    // 4. Graceful release fading out over time
    gain.gain.linearRampToValueAtTime(0, startTime + duration + release);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration + release + 0.1); // Safely kill oscillator after fade
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function playPrompt() {
  if (isPlaying || currentRound >= prompts.length) return;

  initAudio();
  if (audioCtx.state === "suspended") audioCtx.resume();

  isPlaying = true;
  playBtn.disabled = true;
  submitBtn.disabled = true;
  feedback.textContent = "Playing...";
  setNoiseForMode();

  const item = prompts[currentRound];
  const config = item.speed === "slow" ? SLOW_CONFIG : FAST_CONFIG;

  // Schedule the drone to start immediately
  startDrone();

  // Start scheduling notes slightly in the future to ensure smooth playback
  let timeTracker = audioCtx.currentTime + 0.2;

  for (const charRaw of item.text) {
    const char = charRaw.toLowerCase();

    if (char === " ") {
      timeTracker += config.spaceDuration;
      continue;
    }

    const mapped = SYMBOL_MAP[char];
    if (!mapped) continue;

    const charDuration = VOWELS.has(char) ? config.vowelDuration : config.charDuration;

    // Hand the precise start time to the audio hardware
    scheduleSymbol(mapped, timeTracker, charDuration);

    // Advance the clock for the next letter
    timeTracker += charDuration + config.gapDuration;
  }

  // Schedule the drone to gracefully fade out after the last note finishes
  stopDroneAt(timeTracker + 0.5);

  // Use setTimeout ONLY to unlock the UI after the audio finishes playing
  const msUntilFinished = (timeTracker - audioCtx.currentTime + 1.0) * 1000;

  setTimeout(() => {
    if (!isPlaying) return;
    if (noiseGain) noiseGain.gain.value = 0;
    isPlaying = false;
    playBtn.disabled = false;
    submitBtn.disabled = false;
    feedback.textContent = "Enter your guess and press Submit Guess.";
    guessInput.focus();
  }, msUntilFinished);
}

function submitGuess() {
  if (currentRound >= prompts.length || isPlaying) {
    return;
  }

  const entered = normalizeText(guessInput.value);
  const expected = normalizeText(prompts[currentRound].text);

  if (!entered) {
    feedback.textContent = "Please enter a guess before submitting.";
    return;
  }

  if (entered === expected) {
    score += 1;
    feedback.textContent = "Correct.";
  } else {
    feedback.textContent = `Not quite. Expected: "${prompts[currentRound].text}".`;
  }

  currentRound += 1;

  if (currentRound >= prompts.length) {
    playBtn.disabled = true;
    submitBtn.disabled = true;
    guessInput.disabled = true;
    scoreEl.hidden = false;
    scoreEl.textContent = `Final score: ${score} / 10`;
    replayBtn.hidden = false;
    updateRoundUI();
    return;
  }

  guessInput.value = "";
  updateRoundUI();
}

function populateTable() {
  const sortedKeys = Object.keys(SYMBOL_MAP).sort((a, b) => {
    const aNum = Number.isNaN(Number(a)) ? Number.POSITIVE_INFINITY : Number(a);
    const bNum = Number.isNaN(Number(b)) ? Number.POSITIVE_INFINITY : Number(b);
    if (aNum !== bNum) {
      return aNum - bNum;
    }
    return a.localeCompare(b);
  });

  tableBody.innerHTML = "";

  sortedKeys.forEach((symbol) => {
    const row = document.createElement("tr");
    const notes = SYMBOL_MAP[symbol].join(" + ");

    row.innerHTML = `<td><code>${symbol}</code></td><td>${notes}</td>`;
    tableBody.appendChild(row);
  });
}

playBtn.addEventListener("click", playPrompt);
submitBtn.addEventListener("click", submitGuess);
replayBtn.addEventListener("click", startTest);
volumeSlider.addEventListener("input", () => {
  if (masterGain) {
    masterGain.gain.value = parseInt(volumeSlider.value, 10) / 100;
  }
});
hardModeToggle.addEventListener("change", setNoiseForMode);
noiseSlider.addEventListener("input", setNoiseForMode);
guessInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    submitGuess();
  }
});

populateTable();
startTest();
