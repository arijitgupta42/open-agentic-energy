// Voice input for each site's assistant (issue #15): speak a request instead of typing
// it. It uses only the browser's own Web Speech API, so the page loads no third-party
// script and no key is involved (CLAUDE.md rule 8).
//
// Speech only fills the chat box. The visitor reads the text and presses Send. It never
// sends a message, answers a confirmation dialog or a partner consent card: the visitor,
// not the model, owns those (spec 3.2 and 5).
//
// Where the audio goes depends on the browser. On the first press the page asks the
// browser whether it can recognise speech on the device (`processLocally`). If it can,
// recognition starts, after a one-time language download when needed, and the audio
// stays on the device. If not, the page says the audio would go to the browser maker's
// speech service, as Chrome's goes to Google's, and listens only after a second press.
//
// Like dictation in a desktop app, it keeps listening through pauses and shows the words
// in the chat box as they are spoken, until the visitor presses Stop.

/**
 * A mic button next to the runtime's chat box, with a status line and a note on where the
 * audio goes.
 */
export class VoiceInput {
  /** The page is in British English; the second is the on-device fallback. */
  static LANGS = ["en-GB", "en-US"];

  /** What to tell the visitor for each recognition error. */
  static ERRORS = {
    "not-allowed": "The microphone is blocked. Allow it in this site's settings in your browser, or type your request.",
    "service-not-allowed": "This browser does not allow speech recognition here. Type your request instead.",
    "audio-capture": "No microphone was found. Type your request instead.",
    "no-speech": "Nothing was heard. Press the mic and try again.",
    "network": "The browser's speech service could not be reached. Some browsers, such as Brave, do not offer one: use Chrome or Edge, or type your request.",
    "language-not-supported": "This browser cannot recognise English speech. Type your request instead.",
  };

  /**
   * The browser's speech recognition constructor, if it has one.
   *
   * :param win: The window.
   * :return: SpeechRecognition, webkitSpeechRecognition, or null.
   */
  static recognitionClass(win) {
    return win.SpeechRecognition || win.webkitSpeechRecognition || null;
  }

  /**
   * Add voice input to the page, if the browser supports it and the chat box exists.
   *
   * :param doc: The document.
   * :param win: The window.
   * :return: The VoiceInput, or null when it stays hidden.
   */
  static async attach(doc, win) {
    const Recognition = VoiceInput.recognitionClass(win);
    const bar = doc.querySelector("#agent-app .ns-inputbar");
    const input = doc.querySelector("#agent-app #ns-input");
    const send = doc.querySelector("#agent-app #ns-send");
    const panel = doc.querySelector("#voice-input");
    if (!Recognition || !bar || !input || !send || !panel) {
      return null;
    }
    const voice = new VoiceInput(doc, Recognition, {bar, input, send, panel});
    voice.brave = await VoiceInput.isBrave(win);
    await voice.prepare();
    return voice;
  }

  /** What to say in Brave, which has the speech API but no online speech service. */
  static BRAVE = "Brave does not include the online speech service that voice input needs here. Use Chrome or Edge to speak your request, or type it.";

  /**
   * Whether this is Brave, which says so through navigator.brave.
   *
   * :param win: The window.
   * :return: true in Brave.
   */
  static async isBrave(win) {
    try {
      return typeof win.navigator?.brave?.isBrave === "function" && (await win.navigator.brave.isBrave()) === true;
    } catch {
      return false;
    }
  }

  /**
   * :param doc: The document.
   * :param Recognition: The speech recognition constructor.
   * :param parts: The runtime's input bar, chat box and Send button, and the page's
   *   #voice-input panel.
   */
  constructor(doc, Recognition, parts) {
    this.doc = doc;
    this.Recognition = Recognition;
    this.input = parts.input;
    this.panel = parts.panel;
    this.status = parts.panel.querySelector("#voice-status");
    this.note = parts.panel.querySelector("#voice-note");
    this.recognition = null;
    this.listening = false;
    this.before = "";
    this.committed = "";
    this.mode = null;
    this.brave = false;
    // The status goes just under the chat box, where the visitor is looking.
    parts.bar.insertAdjacentElement?.("afterend", this.status);
    this.button = doc.createElement("button");
    this.button.type = "button";
    this.button.id = "voice-button";
    this.button.className = "voice-button";
    this.button.setAttribute("aria-pressed", "false");
    this.button.setAttribute("aria-describedby", "voice-note");
    this.button.textContent = "🎤 Speak";
    this.button.title = "Speak your request";
    this.button.addEventListener("click", () => this.toggle());
    parts.bar.insertBefore(this.button, parts.send);
    // Sending the request ends dictation. The runtime's own listeners run first, read the
    // box and clear it; this only stops the microphone and never refills the box.
    parts.send.addEventListener("click", () => this.sent());
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        this.sent();
      }
    });
  }

  /** The note before the first press, when the page does not yet know where audio goes. */
  static NOTE_FIRST = "Voice input: press Speak, say your request, then press Stop. If this browser can turn speech into text on this device, the audio stays here. If not, the page tells you first that the audio would go to the browser maker's online speech service (Chrome uses Google's), and waits for a second press. The text goes into the chat box, and nothing is sent until you press Send.";

  /** The note once the page knows recognition stays on the device. */
  static NOTE_LOCAL = "Voice input: your speech is turned into text on this device and does not leave it. The text goes into the chat box, and nothing is sent until you press Send.";

  /** The note once the page knows the browser uses an online service. */
  static NOTE_ONLINE = "Voice input: this browser turns speech into text with its maker's online speech service (Chrome uses Google's), so the audio leaves this device. The text goes into the chat box, and nothing is sent until you press Send.";

  /**
   * Show the button and say where audio may go. The browser is not asked anything yet:
   * in some Chromium builds, asking for on-device availability on page load crashes the
   * page, so the check waits for the visitor's first press.
   */
  async prepare() {
    this.note.textContent = VoiceInput.NOTE_FIRST;
    this.panel.hidden = false;
  }

  /**
   * Choose on-device recognition when the browser offers it for one of LANGS.
   *
   * :return: {local, lang, download}: whether recognition stays on the device, the
   *   language, and whether a one-time language download is needed first.
   */
  async findMode() {
    if (typeof this.Recognition.available === "function") {
      for (const lang of VoiceInput.LANGS) {
        try {
          const state = await this.Recognition.available({langs: [lang], processLocally: true});
          if (state === "available") {
            return {local: true, lang, download: false};
          }
          if (state === "downloadable" || state === "downloading") {
            return {local: true, lang, download: true};
          }
        } catch {
          // A browser that knows the method but refuses it: try the next language.
        }
      }
    }
    return {local: false, lang: VoiceInput.LANGS[0], download: false};
  }

  /** Errors after which listening again would fail the same way. */
  static FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"]);

  /** Stop on our own after this long with no new words, in case the visitor walked away. */
  static SILENCE_MS = 60000;

  /** A session that ends this soon with no words counts as one that never got going. */
  static QUICK_MS = 1500;

  /**
   * Start listening, or stop when already listening.
   */
  async toggle() {
    if (this.listening) {
      this.finish();
      return;
    }
    if (this.mode === null) {
      this.mode = await this.findMode();
      this.note.textContent = this.mode.local ? VoiceInput.NOTE_LOCAL : VoiceInput.NOTE_ONLINE;
      if (!this.mode.local && this.brave) {
        // Brave's online path fails at once with "network": say so instead of trying.
        this.mode = null;
        this.note.textContent = VoiceInput.NOTE_FIRST;
        this.say(VoiceInput.BRAVE);
        return;
      }
      if (!this.mode.local) {
        // Audio would leave the device: the visitor agrees with a second press.
        this.say("This browser would send your speech to its maker's online service. Press Speak again to go ahead, or type your request.");
        return;
      }
    }
    if (this.mode.download) {
      this.say("Downloading English speech recognition to this browser. This happens once…");
      let installed = false;
      try {
        installed = await this.Recognition.install({langs: [this.mode.lang], processLocally: true});
      } catch {
        installed = false;
      }
      if (!installed) {
        this.say("The speech download did not finish. Try again later, or type your request.");
        return;
      }
      this.mode.download = false;
    }
    this.begin();
  }

  /**
   * Dictate until the visitor presses Stop, putting the words in the chat box as they
   * come. Browsers end a recognition session at a pause or after a while, so a new one
   * starts each time, and the words so far are kept.
   */
  begin() {
    this.listening = true;
    this.before = this.input.value.trim();
    this.committed = "";
    this.quickEnds = 0;
    this.lastHeard = Date.now();
    this.button.setAttribute("aria-pressed", "true");
    this.button.textContent = "■ Stop";
    this.say("Listening… press Stop when you have finished.");
    this.session();
  }

  /**
   * Start one recognition session. The browser asks for the microphone the first time.
   */
  session() {
    const recognition = new this.Recognition();
    recognition.lang = this.mode.lang;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    if (this.mode.local) {
      recognition.processLocally = true;
    }
    const started = Date.now();
    let words = "";
    let error = null;
    recognition.onresult = (event) => {
      if (this.recognition !== recognition) {
        // A late result from a session that Send already ended.
        return;
      }
      words =VoiceInput.join(...Array.from(event.results).map((result) => result[0].transcript));
      if (words) {
        this.lastHeard = Date.now();
      }
      this.fill(VoiceInput.join(this.before, this.committed, words));
    };
    recognition.onerror = (event) => {
      error = event.error;
    };
    recognition.onend = () => {
      this.recognition = null;
      this.committed = VoiceInput.join(this.committed, words);
      if (!this.listening) {
        this.done();
        return;
      }
      const quick = !words && Date.now() - started < VoiceInput.QUICK_MS;
      this.quickEnds = quick ? this.quickEnds + 1 : 0;
      if (this.mode.local && !this.committed && (this.quickEnds >= 2 || error === "language-not-supported")) {
        this.offerOnline();
        return;
      }
      if (VoiceInput.FATAL.has(error)) {
        if (error === "not-allowed" || error === "service-not-allowed") {
          this.button.disabled = true;
        }
        this.stopListening(VoiceInput.ERRORS[error]);
        return;
      }
      if (this.quickEnds >= 3) {
        this.stopListening("Voice input stopped. Type your request instead.");
        return;
      }
      if (Date.now() - this.lastHeard > VoiceInput.SILENCE_MS) {
        this.stopListening(null);
        return;
      }
      this.session();
    };
    this.recognition = recognition;
    try {
      recognition.start();
    } catch (failure) {
      this.recognition = null;
      this.stopListening("Voice input could not start. Type your request instead.");
      console.error("Voice input could not start", failure);
    }
  }

  /** The visitor pressed Stop: the browser gives its last words, then onend calls done(). */
  finish() {
    this.listening = false;
    if (this.recognition) {
      this.recognition.stop();
    } else {
      this.done();
    }
  }

  /**
   * The visitor sent the request: stop the microphone at once and drop any words still
   * on their way, so the cleared chat box stays clear.
   */
  sent() {
    if (!this.listening && !this.recognition) {
      return;
    }
    this.listening = false;
    this.before = "";
    this.committed = "";
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        (recognition.abort || recognition.stop).call(recognition);
      } catch {
        // Already ended.
      }
    }
    this.button.setAttribute("aria-pressed", "false");
    this.button.textContent = "🎤 Speak";
    this.say("");
  }

  /**
   * Stop listening on the page's own account.
   *
   * :param message: What to tell the visitor, or null for the usual end.
   */
  stopListening(message) {
    this.listening = false;
    this.done(message);
  }

  /**
   * On-device recognition ended at once with nothing heard: offer the online service,
   * which the visitor agrees to with another press.
   */
  offerOnline() {
    this.listening = false;
    if (this.brave) {
      this.mode = null;
      this.done(VoiceInput.BRAVE);
      return;
    }
    this.mode = {local: false, lang: VoiceInput.LANGS[0], download: false};
    this.note.textContent = VoiceInput.NOTE_ONLINE;
    this.done("Speech recognition on this device stopped straight away. This browser can use its maker's online service instead, which sends your speech there. Press Speak again to go ahead, or type your request.");
  }

  /**
   * Put the button back and say what happened.
   *
   * :param message: What to tell the visitor, or null for the usual end.
   */
  done(message = null) {
    this.button.setAttribute("aria-pressed", "false");
    this.button.textContent = "🎤 Speak";
    if (this.committed) {
      this.fill(VoiceInput.join(this.before, this.committed));
      this.input.focus();
    }
    if (message) {
      this.say(message);
    } else if (this.committed) {
      this.say("Check the request in the chat box, then press Send.");
    } else {
      this.say(VoiceInput.ERRORS["no-speech"]);
    }
  }

  /**
   * Join pieces of text with single spaces.
   *
   * :param parts: The pieces; empty ones are skipped.
   * :return: The text.
   */
  static join(...parts) {
    return parts.map((part) => (part || "").trim()).filter(Boolean).join(" ");
  }

  /**
   * Put text in the chat box as if typed, so the runtime sees it.
   *
   * :param text: The request so far.
   */
  fill(text) {
    this.input.value = text;
    const EventClass = this.doc.defaultView?.Event || Event;
    this.input.dispatchEvent(new EventClass("input", {bubbles: true}));
    // Keep the newest words in view while the box fills.
    this.input.scrollLeft = this.input.scrollWidth;
  }

  /**
   * Show a message in the live status line.
   *
   * :param text: The message.
   */
  say(text) {
    this.status.textContent = text;
  }
}
