/**
 * Voice system — TTS and STT powered by integrations config.
 *
 * TTS: ElevenLabs (cloud)
 * STT: Groq (free), OpenAI Whisper API (cloud), or whisper.cpp (local)
 *
 * Groq is the default STT — free tier, fast, supports whisper-large-v3.
 */

import type { ClankConfig } from "../config/index.js";

export interface TTSResult {
  audioBuffer: Buffer;
  format: "mp3" | "wav" | "ogg";
}

export interface STTResult {
  text: string;
  language?: string;
}

/**
 * Text-to-Speech engine.
 */
export class TTSEngine {
  private config: ClankConfig;

  constructor(config: ClankConfig) {
    this.config = config;
  }

  isAvailable(): boolean {
    return !!(this.config.integrations.elevenlabs?.enabled && this.config.integrations.elevenlabs?.apiKey);
  }

  async synthesize(text: string, opts?: { voiceId?: string }): Promise<TTSResult | null> {
    const elevenlabs = this.config.integrations.elevenlabs;
    if (!elevenlabs?.enabled || !elevenlabs.apiKey) return null;

    const voiceId = opts?.voiceId || elevenlabs.voiceId || "JBFqnCBsd6RMkjVDRZzb";
    const model = elevenlabs.model || "eleven_multilingual_v2";

    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenlabs.apiKey as string,
          },
          body: JSON.stringify({
            text,
            model_id: model,
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        },
      );

      if (!res.ok) {
        console.error(`ElevenLabs TTS error ${res.status}`);
        return null;
      }

      const arrayBuffer = await res.arrayBuffer();
      return { audioBuffer: Buffer.from(arrayBuffer), format: "mp3" };
    } catch (err) {
      console.error(`TTS error: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  async listVoices(): Promise<Array<{ id: string; name: string }>> {
    const elevenlabs = this.config.integrations.elevenlabs;
    if (!elevenlabs?.enabled || !elevenlabs.apiKey) return [];

    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": elevenlabs.apiKey as string },
      });
      if (!res.ok) return [];
      const data = await res.json() as { voices?: Array<{ voice_id: string; name: string }> };
      return (data.voices || []).map((v) => ({ id: v.voice_id, name: v.name }));
    } catch {
      return [];
    }
  }
}

/**
 * Speech-to-Text engine.
 *
 * Priority order:
 * 1. Groq (free, fast) — if groq API key configured
 * 2. OpenAI Whisper API — if OpenAI key configured
 * 3. Local whisper.cpp — if installed
 */
export class STTEngine {
  private config: ClankConfig;

  constructor(config: ClankConfig) {
    this.config = config;
  }

  isAvailable(): boolean {
    const whisper = this.config.integrations.whisper;
    if (whisper?.enabled) {
      if (whisper.provider === "groq" && whisper.apiKey) return true;
      if (whisper.provider === "openai" && whisper.apiKey) return true;
      if (whisper.provider === "local") return true;
    }
    // Fall back to any available key
    if (this.config.models.providers.openai?.apiKey) return true;
    if ((this.config.integrations as Record<string, any>).groq?.apiKey) return true;
    return false;
  }

  async transcribe(audioBuffer: Buffer, format = "ogg"): Promise<STTResult | null> {
    const whisper = this.config.integrations.whisper;

    // Priority 1: Groq (free, fast)
    const groqKey = (whisper?.provider === "groq" && whisper?.apiKey)
      ? whisper.apiKey as string
      : (this.config.integrations as Record<string, any>).groq?.apiKey as string | undefined;

    if (groqKey) {
      const result = await this.transcribeAPI(audioBuffer, format, groqKey, "https://api.groq.com/openai/v1/audio/transcriptions", "whisper-large-v3-turbo");
      if (result) return result;
    }

    // Priority 2: OpenAI Whisper API
    const openaiKey = (whisper?.provider === "openai" && whisper?.apiKey)
      ? whisper.apiKey as string
      : this.config.models.providers.openai?.apiKey;

    if (openaiKey) {
      const result = await this.transcribeAPI(audioBuffer, format, openaiKey, "https://api.openai.com/v1/audio/transcriptions", "whisper-1");
      if (result) return result;
    }

    // Priority 3: Local whisper.cpp
    if (whisper?.provider === "local") {
      return this.transcribeLocal(audioBuffer, format);
    }

    return null;
  }

  /** Transcribe via OpenAI-compatible API (works for both OpenAI and Groq) */
  private async transcribeAPI(audioBuffer: Buffer, format: string, apiKey: string, endpoint: string, model: string): Promise<STTResult | null> {
    try {
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: `audio/${format}` });
      const formData = new FormData();
      formData.append("file", blob, `audio.${format}`);
      formData.append("model", model);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`STT API error ${res.status}: ${errText.slice(0, 200)}`);
        return null;
      }

      const data = await res.json() as { text?: string; language?: string };
      return data.text ? { text: data.text, language: data.language } : null;
    } catch (err) {
      console.error(`STT error: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /** Transcribe via local whisper.cpp */
  private async transcribeLocal(audioBuffer: Buffer, format: string): Promise<STTResult | null> {
    try {
      const { writeFile, unlink } = await import("node:fs/promises");
      const { execSync } = await import("node:child_process");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");

      const tmpFile = join(tmpdir(), `clank-stt-${Date.now()}.${format}`);
      await writeFile(tmpFile, audioBuffer);

      const output = execSync(`whisper "${tmpFile}" --model base.en --output-txt`, {
        encoding: "utf-8",
        timeout: 60_000,
      });

      await unlink(tmpFile).catch(() => {});
      return output.trim() ? { text: output.trim() } : null;
    } catch {
      return null;
    }
  }
}
