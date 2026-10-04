import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type RemoteTrack,
} from "livekit-client";

type WidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
type WidgetLauncherSize = "compact" | "comfortable" | "large";

type WidgetTheme = {
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  buttonTextColor: string;
  borderColor: string;
  position: WidgetPosition;
  launcherSize: WidgetLauncherSize;
  panelWidth: number;
  borderRadius: number;
  defaultOpen: boolean;
  showAvatar: boolean;
  avatarImageUrl: string | null;
  avatarOrbColor1: string;
  avatarOrbColor2: string;
  brandName: string;
  actionText: string;
  welcomeText: string;
  startButtonText: string;
  endButtonText: string;
  connectingText: string;
  listeningText: string;
  speakingText: string;
  endedText: string;
  whiteLabel: boolean;
};

type PublicWidgetConfig = {
  widgetId: string;
  name: string;
  agentName: string;
  theme: WidgetTheme;
  consentRequired: boolean;
  consentText: string;
  sessionTtlSeconds: number;
};

type PublicWidgetSession = {
  sessionId: string;
  endToken: string;
  livekitUrl: string;
  roomName: string;
  participant: {
    identity: string;
    name: string;
    token: string;
    ttlSeconds: number;
  };
  expiresAt: string;
};

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };
type WidgetState =
  | "loading"
  | "idle"
  | "requesting"
  | "connecting"
  | "live"
  | "ended"
  | "error";

const loaderScript = document.currentScript as HTMLScriptElement | null;
// Read the property: browsers hide nonce values from getAttribute("nonce").
const loaderNonce = loaderScript?.nonce ?? "";

const DEFAULT_THEME: WidgetTheme = {
  primaryColor: "#002FA7",
  accentColor: "#0F172A",
  surfaceColor: "#FFFFFF",
  textColor: "#111827",
  mutedTextColor: "#667085",
  buttonTextColor: "#FFFFFF",
  borderColor: "#DADDE3",
  position: "bottom-right",
  launcherSize: "comfortable",
  panelWidth: 340,
  borderRadius: 16,
  defaultOpen: false,
  showAvatar: true,
  avatarImageUrl: null,
  avatarOrbColor1: "#002FA7",
  avatarOrbColor2: "#00F0FF",
  brandName: "QuickVoice",
  actionText: "Talk to us",
  welcomeText: "Talk with our voice agent.",
  startButtonText: "Start call",
  endButtonText: "End call",
  connectingText: "Connecting",
  listeningText: "Listening",
  speakingText: "Assistant speaking",
  endedText: "Call ended",
  whiteLabel: false,
};

class QuickVoiceWidgetElement extends HTMLElement {
  private readonly root: ShadowRoot;
  private config: PublicWidgetConfig | null = null;
  private session: PublicWidgetSession | null = null;
  private room: Room | null = null;
  private localTrack: LocalAudioTrack | null = null;
  private state: WidgetState = "loading";
  private expanded = false;
  private consentAccepted = false;
  private errorMessage = "";
  private audioContainer: HTMLDivElement | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.expanded = this.getAttribute("open") === "true";
    this.render();
    void this.loadConfig();
  }

  disconnectedCallback() {
    void this.endCall({ notifyServer: true });
  }

  private get widgetId() {
    return this.getAttribute("widget-id") || this.getAttribute("data-widget-id") || "";
  }

  private get apiBaseUrl() {
    const explicit = this.getAttribute("api-base-url");
    if (explicit) return explicit.replace(/\/+$/, "");
    const scriptSrc = loaderScript?.src;
    if (scriptSrc) {
      try {
        return `${new URL(scriptSrc).origin}/api/v1`;
      } catch {
        // Fall through to current origin.
      }
    }
    return `${window.location.origin}/api/v1`;
  }

  private async loadConfig() {
    const widgetId = this.widgetId;
    if (!widgetId) {
      this.setError("Widget id is missing.");
      return;
    }

    try {
      const config = await this.apiGet<PublicWidgetConfig>(
        `/public/widgets/${encodeURIComponent(widgetId)}/config`,
      );
      this.config = {
        ...config,
        theme: normalizeTheme(config.theme),
      };
      if (!this.hasAttribute("open")) {
        this.expanded = this.currentTheme().defaultOpen;
      }
      this.state = "idle";
      this.render();
    } catch (error) {
      this.setError(errorMessage(error, "Widget is unavailable."));
    }
  }

  private async startCall() {
    if (
      !this.config ||
      this.state === "requesting" ||
      this.state === "connecting" ||
      this.state === "live"
    ) {
      return;
    }
    if (this.config.consentRequired && !this.consentAccepted) {
      this.setError("Accept the call notice before starting.");
      return;
    }

    this.errorMessage = "";
    this.state = "requesting";
    this.render();

    try {
      const localTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      this.localTrack = localTrack;
      this.state = "connecting";
      this.render();

      const session = await this.apiPost<PublicWidgetSession>(
        `/public/widgets/${encodeURIComponent(this.widgetId)}/sessions`,
        {
          visitorId: this.visitorId(),
        },
      );
      this.session = session;

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      this.room = room;
      room
        .on(RoomEvent.TrackSubscribed, (track) => this.attachRemoteTrack(track))
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((element) => element.remove());
        })
        .on(RoomEvent.Disconnected, () => {
          this.cleanupAudio();
          if (this.state === "live" || this.state === "connecting") {
            this.state = "ended";
            this.render();
          }
        })
        .on(RoomEvent.Reconnecting, () => {
          this.state = "connecting";
          this.render();
        })
        .on(RoomEvent.Reconnected, () => {
          this.state = "live";
          this.render();
        });

      await room.connect(session.livekitUrl, session.participant.token);
      await room.localParticipant.publishTrack(localTrack);
      this.state = "live";
      this.render();
    } catch (error) {
      await this.endCall({ notifyServer: true });
      this.setError(errorMessage(error, "Could not start the call."));
    }
  }

  private async endCall(options: { notifyServer: boolean }) {
    const session = this.session;
    this.localTrack?.stop();
    this.localTrack = null;
    this.room?.disconnect();
    this.room = null;
    this.cleanupAudio();

    if (options.notifyServer && session) {
      try {
        await this.apiPost(
          `/public/widgets/${encodeURIComponent(this.widgetId)}/sessions/${encodeURIComponent(session.sessionId)}/end`,
          { endToken: session.endToken },
        );
      } catch {
        // The local call is already disconnected. Server cleanup is best-effort.
      }
    }

    this.session = null;
    if (this.state !== "error") {
      this.state = "ended";
      this.render();
    }
  }

  private attachRemoteTrack(track: RemoteTrack) {
    if (track.kind !== Track.Kind.Audio) return;
    this.audioContainer =
      this.audioContainer ??
      this.root.querySelector<HTMLDivElement>('[data-audio-container="true"]');
    if (!this.audioContainer) return;
    this.audioContainer.appendChild(track.attach());
  }

  private cleanupAudio() {
    this.audioContainer?.querySelectorAll("audio").forEach((element) => element.remove());
  }

  private visitorId() {
    const key = "quickvoice_widget_visitor_id";
    try {
      const existing = window.localStorage.getItem(key);
      if (existing) return existing;
      const next =
        window.crypto?.randomUUID?.() ??
        `visitor_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.localStorage.setItem(key, next);
      return next;
    } catch {
      return undefined;
    }
  }

  private async apiGet<T>(path: string): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: "GET",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    return unwrapResponse<T>(response);
  }

  private async apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: "POST",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return unwrapResponse<T>(response);
  }

  private setError(message: string) {
    this.errorMessage = message;
    this.state = "error";
    this.expanded = true;
    this.render();
  }

  private currentTheme() {
    return themeWithAttributeOverrides(
      normalizeTheme(this.config?.theme),
      this,
    );
  }

  private statusText(theme: WidgetTheme) {
    if (this.state === "loading") return "Loading";
    if (this.state === "requesting") return "Requesting microphone";
    if (this.state === "connecting") return theme.connectingText;
    if (this.state === "live") return theme.listeningText;
    if (this.state === "ended") return theme.endedText;
    if (this.state === "error") return this.errorMessage;
    return "Ready";
  }

  private render() {
    const theme = this.currentTheme();
    const position = positionStyles(theme.position);
    const launcher = launcherSize(theme.launcherSize);
    const brandName = escapeHtml(theme.brandName);
    const welcomeText = escapeHtml(theme.welcomeText);
    const startButtonText = escapeHtml(theme.startButtonText);
    const endButtonText = escapeHtml(theme.endButtonText);
    const consentText = escapeHtml(this.config?.consentText ?? "");
    const statusText = escapeHtml(this.statusText(theme));
    const primaryColor = safeColor(theme.primaryColor, DEFAULT_THEME.primaryColor);
    const accentColor = safeColor(theme.accentColor, DEFAULT_THEME.accentColor);
    const surfaceColor = safeColor(theme.surfaceColor, DEFAULT_THEME.surfaceColor);
    const textColor = safeColor(theme.textColor, DEFAULT_THEME.textColor);
    const mutedTextColor = safeColor(theme.mutedTextColor, DEFAULT_THEME.mutedTextColor);
    const buttonTextColor = safeColor(theme.buttonTextColor, DEFAULT_THEME.buttonTextColor);
    const borderColor = safeColor(theme.borderColor, DEFAULT_THEME.borderColor);
    const avatarOrbColor1 = safeColor(theme.avatarOrbColor1, DEFAULT_THEME.avatarOrbColor1);
    const avatarOrbColor2 = safeColor(theme.avatarOrbColor2, DEFAULT_THEME.avatarOrbColor2);
    const panelWidth = clampNumber(theme.panelWidth, 280, 420);
    const borderRadius = clampNumber(theme.borderRadius, 0, 32);
    const controlRadius = Math.max(borderRadius - 6, 0);
    const isBusy = this.state === "loading" || this.state === "requesting" || this.state === "connecting";
    const isLive = this.state === "live";
    const canStart =
      this.state === "idle" ||
      this.state === "ended" ||
      this.state === "error";
    const consentRequired = Boolean(this.config?.consentRequired);
    const startDisabled = isBusy || (consentRequired && !this.consentAccepted);
    const bubbleLabel = escapeHtml(isLive ? theme.listeningText : theme.actionText);
    const avatarMarkup = theme.showAvatar
      ? avatarHtml({ theme, avatarOrbColor1, avatarOrbColor2 })
      : "";
    const styleNonce = this.nonce || loaderNonce;

    this.root.innerHTML = `
      <style${styleNonce ? ` nonce="${escapeAttribute(styleNonce)}"` : ""}>
        :host {
          all: initial;
          color-scheme: light;
          font-family: Helvetica Neue, Arial, sans-serif;
          --qv-primary: ${primaryColor};
          --qv-accent: ${accentColor};
          --qv-border: ${borderColor};
          --qv-muted: ${mutedTextColor};
          --qv-text: ${textColor};
          --qv-button-text: ${buttonTextColor};
          --qv-surface: ${surfaceColor};
          --qv-radius: ${borderRadius}px;
          --qv-control-radius: ${controlRadius}px;
        }
        .qv-shell {
          position: fixed;
          z-index: 2147483000;
          ${position.vertical}: 24px;
          ${position.horizontal}: 24px;
          display: flex;
          width: min(${panelWidth}px, calc(100vw - 32px));
          flex-direction: ${position.isTop ? "column-reverse" : "column"};
          gap: 12px;
          font-family: Helvetica Neue, Arial, sans-serif;
          line-height: 1.4;
          color: var(--qv-text);
        }
        .qv-panel {
          display: ${this.expanded ? "block" : "none"};
          overflow: hidden;
          border: 1px solid var(--qv-border);
          border-radius: var(--qv-radius);
          background: var(--qv-surface);
          box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18);
        }
        .qv-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid var(--qv-border);
          padding: 14px 16px;
        }
        .qv-brand {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 10px;
        }
        .qv-avatar,
        .qv-orb {
          width: 36px;
          height: 36px;
          flex: none;
          border-radius: 999px;
        }
        .qv-avatar {
          object-fit: cover;
        }
        .qv-orb {
          background: linear-gradient(135deg, ${avatarOrbColor1}, ${avatarOrbColor2});
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--qv-primary) 12%, transparent);
        }
        .qv-title {
          overflow: hidden;
          margin: 0;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .qv-status {
          margin: 4px 0 0;
          color: var(--qv-muted);
          font-size: 12px;
        }
        .qv-body {
          padding: 16px;
        }
        .qv-welcome {
          margin: 0 0 14px;
          font-size: 14px;
        }
        .qv-consent {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 14px;
          color: var(--qv-muted);
          font-size: 12px;
        }
        .qv-consent input {
          margin-top: 2px;
          accent-color: var(--qv-primary);
        }
        .qv-actions {
          display: grid;
          gap: 8px;
        }
        button {
          appearance: none;
          border: 1px solid var(--qv-border);
          border-radius: var(--qv-control-radius);
          cursor: pointer;
          font-family: inherit;
          font-size: 14px;
          font-weight: 700;
          transition: transform 150ms ease, box-shadow 150ms ease, opacity 150ms ease;
        }
        button:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        button:focus-visible {
          outline: 3px solid color-mix(in srgb, var(--qv-primary) 35%, transparent);
          outline-offset: 2px;
        }
        button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .qv-primary {
          min-height: 44px;
          background: var(--qv-primary);
          color: var(--qv-button-text);
        }
        .qv-secondary {
          min-height: 38px;
          background: var(--qv-surface);
          color: var(--qv-text);
        }
        .qv-close {
          width: 32px;
          height: 32px;
          flex: none;
          background: var(--qv-surface);
          color: var(--qv-muted);
        }
        .qv-bubble {
          display: flex;
          min-height: ${launcher.height}px;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 0 ${launcher.padding}px;
          border-color: var(--qv-primary);
          border-radius: var(--qv-radius);
          background: var(--qv-primary);
          color: var(--qv-button-text);
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.20);
          font-size: ${launcher.fontSize}px;
        }
        .qv-dot {
          width: 8px;
          height: 8px;
          flex: none;
          border-radius: 50%;
          background: currentColor;
          opacity: ${isLive ? "1" : "0.65"};
        }
        .qv-error {
          margin: 0 0 12px;
          border-left: 2px solid #DC2626;
          padding-left: 10px;
          color: #991B1B;
          font-size: 12px;
        }
        .qv-powered {
          margin: 12px 0 0;
          color: var(--qv-muted);
          font-size: 11px;
          text-align: center;
        }
        @media (prefers-reduced-motion: reduce) {
          button {
            transition: none;
          }
          button:hover:not(:disabled) {
            transform: none;
          }
        }
      </style>
      <div class="qv-shell">
        <section class="qv-panel" aria-live="polite">
          <div class="qv-header">
            <div class="qv-brand">
              ${avatarMarkup}
              <div>
                <p class="qv-title">${brandName}</p>
                <p class="qv-status">${statusText}</p>
              </div>
            </div>
            <button class="qv-close" type="button" data-action="collapse" aria-label="Close widget">×</button>
          </div>
          <div class="qv-body">
            <p class="qv-welcome">${welcomeText}</p>
            ${this.state === "error" ? `<p class="qv-error">${escapeHtml(this.errorMessage)}</p>` : ""}
            ${
              consentRequired && !isLive
                ? `<label class="qv-consent">
                    <input type="checkbox" data-action="consent" ${this.consentAccepted ? "checked" : ""} />
                    <span>${consentText}</span>
                  </label>`
                : ""
            }
            <div class="qv-actions">
              ${
                isLive
                  ? `<button class="qv-primary" type="button" data-action="end">${endButtonText}</button>`
                  : `<button class="qv-primary" type="button" data-action="start" ${!canStart || startDisabled ? "disabled" : ""}>${isBusy ? statusText : startButtonText}</button>`
              }
            </div>
            ${theme.whiteLabel ? "" : `<p class="qv-powered">Powered by QuickVoice</p>`}
          </div>
        </section>
        <button class="qv-bubble" type="button" data-action="toggle" aria-expanded="${this.expanded ? "true" : "false"}">
          <span class="qv-dot" aria-hidden="true"></span>
          <span>${bubbleLabel}</span>
        </button>
      </div>
      <div data-audio-container="true" hidden></div>
    `;
    this.audioContainer = this.root.querySelector<HTMLDivElement>(
      '[data-audio-container="true"]',
    );

    this.root.querySelector('[data-action="toggle"]')?.addEventListener("click", () => {
      this.expanded = !this.expanded;
      this.render();
    });
    this.root.querySelector('[data-action="collapse"]')?.addEventListener("click", () => {
      this.expanded = false;
      this.render();
    });
    this.root.querySelector('[data-action="start"]')?.addEventListener("click", () => {
      void this.startCall();
    });
    this.root.querySelector('[data-action="end"]')?.addEventListener("click", () => {
      void this.endCall({ notifyServer: true });
    });
    this.root.querySelector('[data-action="consent"]')?.addEventListener("change", (event) => {
      this.consentAccepted = (event.target as HTMLInputElement).checked;
      this.errorMessage = "";
      if (this.state === "error") this.state = "idle";
      this.render();
    });
  }
}

async function unwrapResponse<T>(response: Response): Promise<T> {
  let body: ApiEnvelope<T> | { message?: string } | null = null;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body?.message || `Request failed with ${response.status}`);
  }
  if (body && "data" in body) return body.data;
  throw new Error("Malformed widget response.");
}

function normalizeTheme(value?: unknown): WidgetTheme {
  const theme = { ...DEFAULT_THEME };
  if (!value || typeof value !== "object" || Array.isArray(value)) return theme;
  const fields = value as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_THEME) as (keyof WidgetTheme)[]) {
    const field = fields[key];
    if (
      field !== null &&
      typeof field === typeof DEFAULT_THEME[key] &&
      (typeof field !== "number" || Number.isFinite(field)) &&
      (typeof field !== "string" || field.trim().length > 0)
    ) {
      Object.assign(theme, { [key]: field });
    }
  }
  theme.position = isWidgetPosition(theme.position) ? theme.position : DEFAULT_THEME.position;
  theme.launcherSize = isLauncherSize(theme.launcherSize) ? theme.launcherSize : DEFAULT_THEME.launcherSize;
  theme.avatarImageUrl = safeImageUrl(typeof fields.avatarImageUrl === "string" ? fields.avatarImageUrl : null);
  return theme;
}

function themeWithAttributeOverrides(
  value: WidgetTheme,
  element: HTMLElement,
): WidgetTheme {
  const theme = { ...value };
  setColorOverride(element, theme, "primary-color", "primaryColor");
  setColorOverride(element, theme, "accent-color", "accentColor");
  setColorOverride(element, theme, "surface-color", "surfaceColor");
  setColorOverride(element, theme, "text-color", "textColor");
  setColorOverride(element, theme, "muted-text-color", "mutedTextColor");
  setColorOverride(element, theme, "button-text-color", "buttonTextColor");
  setColorOverride(element, theme, "border-color", "borderColor");
  setColorOverride(element, theme, "avatar-orb-color-1", "avatarOrbColor1");
  setColorOverride(element, theme, "avatar-orb-color-2", "avatarOrbColor2");

  const position = element.getAttribute("position");
  if (isWidgetPosition(position)) theme.position = position;
  const launcherSizeValue = element.getAttribute("launcher-size");
  if (isLauncherSize(launcherSizeValue)) theme.launcherSize = launcherSizeValue;

  theme.panelWidth = numberAttribute(element, "panel-width", theme.panelWidth, 280, 420);
  theme.borderRadius = numberAttribute(element, "border-radius", theme.borderRadius, 0, 32);
  theme.defaultOpen = booleanAttribute(element, "default-open", theme.defaultOpen);
  theme.showAvatar = booleanAttribute(element, "show-avatar", theme.showAvatar);

  setTextOverride(element, theme, "brand-name", "brandName", 80);
  setTextOverride(element, theme, "action-text", "actionText", 60);
  setTextOverride(element, theme, "welcome-text", "welcomeText", 160);
  setTextOverride(element, theme, "start-call-text", "startButtonText", 40);
  setTextOverride(element, theme, "end-call-text", "endButtonText", 40);
  setTextOverride(element, theme, "connecting-text", "connectingText", 40);
  setTextOverride(element, theme, "listening-text", "listeningText", 40);
  setTextOverride(element, theme, "speaking-text", "speakingText", 40);
  setTextOverride(element, theme, "ended-text", "endedText", 40);

  const avatarImageUrl = safeImageUrl(element.getAttribute("avatar-image-url"));
  if (avatarImageUrl) theme.avatarImageUrl = avatarImageUrl;

  return theme;
}

function avatarHtml(input: {
  theme: WidgetTheme;
  avatarOrbColor1: string;
  avatarOrbColor2: string;
}) {
  const imageUrl = safeImageUrl(input.theme.avatarImageUrl);
  if (imageUrl) {
    return `<img class="qv-avatar" src="${escapeAttribute(imageUrl)}" alt="" />`;
  }
  return `<span class="qv-orb" aria-hidden="true"></span>`;
}

function setColorOverride<K extends ColorThemeKey>(
  element: HTMLElement,
  theme: WidgetTheme,
  attr: string,
  key: K,
) {
  const value = element.getAttribute(attr);
  if (value && isHexColor(value)) {
    (theme as Record<ColorThemeKey, string>)[key] = value;
  }
}

type ColorThemeKey =
  | "primaryColor"
  | "accentColor"
  | "surfaceColor"
  | "textColor"
  | "mutedTextColor"
  | "buttonTextColor"
  | "borderColor"
  | "avatarOrbColor1"
  | "avatarOrbColor2";

function setTextOverride<K extends StringThemeKey>(
  element: HTMLElement,
  theme: WidgetTheme,
  attr: string,
  key: K,
  maxLength: number,
) {
  const value = element.getAttribute(attr)?.trim();
  if (value) theme[key] = value.slice(0, maxLength) as WidgetTheme[K];
}

type StringThemeKey =
  | "brandName"
  | "actionText"
  | "welcomeText"
  | "startButtonText"
  | "endButtonText"
  | "connectingText"
  | "listeningText"
  | "speakingText"
  | "endedText";

function numberAttribute(
  element: HTMLElement,
  attr: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(element.getAttribute(attr));
  return Number.isFinite(value) ? clampNumber(value, min, max) : fallback;
}

function booleanAttribute(element: HTMLElement, attr: string, fallback: boolean) {
  if (!element.hasAttribute(attr)) return fallback;
  const value = element.getAttribute(attr);
  return value !== "false" && value !== "0";
}

function positionStyles(position: WidgetPosition) {
  return {
    vertical: position.startsWith("top") ? "top" : "bottom",
    horizontal: position.endsWith("left") ? "left" : "right",
    isTop: position.startsWith("top"),
  };
}

function launcherSize(size: WidgetLauncherSize) {
  if (size === "compact") return { height: 48, padding: 16, fontSize: 13 };
  if (size === "large") return { height: 64, padding: 22, fontSize: 15 };
  return { height: 56, padding: 18, fontSize: 14 };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}

function safeColor(value: string, fallback: string) {
  return isHexColor(value) ? value : fallback;
}

function isHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function isWidgetPosition(value: string | null): value is WidgetPosition {
  return (
    value === "bottom-right" ||
    value === "bottom-left" ||
    value === "top-right" ||
    value === "top-left"
  );
}

function isLauncherSize(value: string | null): value is WidgetLauncherSize {
  return value === "compact" || value === "comfortable" || value === "large";
}

function safeImageUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

if (!customElements.get("quickvoice-widget")) {
  customElements.define("quickvoice-widget", QuickVoiceWidgetElement);
}
