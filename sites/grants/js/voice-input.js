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
    "network": "The browser's speech service could not be reached. Type your request instead.",
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
    await voice.prepare();
    return voice;
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
    this.mode = null;
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
  }

  /** The note before the first press, when the page does not yet know where audio goes. */
  static NOTE_FIRST = "Voice input: press Speak and say your request. If this browser can turn speech into text on this device, the audio stays here. If not, the page tells you first that the audio would go to the browser maker's online speech service (Chrome uses Google's), and waits for a second press. The text goes into the chat box, and nothing is sent until you press Send.";

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

  /**
   * Start listening, or stop when already listening.
   */
  async toggle() {
    if (this.recognition) {
      this.recognition.stop();
      return;
    }
    if (this.mode === null) {
      this.mode = await this.findMode();
      this.note.textContent = this.mode.local ? VoiceInput.NOTE_LOCAL : VoiceInput.NOTE_ONLINE;
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
    this.listen();
  }

  /**
   * Listen for one request and put the words in the chat box as they come. The browser
   * asks for the microphone the first time.
   */
  listen() {
    const recognition = new this.Recognition();
    recognition.lang = this.mode.lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    if (this.mode.local) {
      recognition.processLocally = true;
    }
    const before = this.input.value.trim();
    let heard = "";
    recognition.onresult = (event) => {
      heard = Array.from(event.results).map((result) => result[0].transcript).join("").trim();
      this.fill(before ? `${before} ${heard}` : heard);
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") {
        this.say(VoiceInput.ERRORS[event.error] || "Voice input stopped. Type your request instead.");
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.button.disabled = true;
      }
    };
    recognition.onend = () => {
      this.recognition = null;
      this.button.setAttribute("aria-pressed", "false");
      this.button.textContent = "🎤 Speak";
      if (heard) {
        this.say("Check the request in the chat box, then press Send.");
        this.input.focus();
      } else if (this.status.textContent === "Listening…") {
        this.say(VoiceInput.ERRORS["no-speech"]);
      }
    };
    this.recognition = recognition;
    this.button.setAttribute("aria-pressed", "true");
    this.button.textContent = "■ Stop";
    this.say("Listening…");
    try {
      recognition.start();
    } catch (error) {
      this.recognition = null;
      this.button.setAttribute("aria-pressed", "false");
      this.button.textContent = "🎤 Speak";
      this.say("Voice input could not start. Type your request instead.");
      console.error("Voice input could not start", error);
    }
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
