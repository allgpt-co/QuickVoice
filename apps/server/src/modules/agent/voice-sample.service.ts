import { z } from "zod";
import { NotFoundError } from "../../common/errors/notFound.js";
import CustomApiError from "../../common/errors/customApiError.js";
import * as agentRepository from "./agent.repository.js";
import type { VoiceSampleInput } from "./agent.schema.js";

const sampleResponse = z.object({
  audioBase64: z.string().min(60).max(1_400_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  contentType: z.literal("audio/wav"),
  sampleText: z.string().min(1).max(300),
});

export async function createVoiceSample(
  organizationId: string,
  agentId: string,
  input: VoiceSampleInput,
  signal?: AbortSignal,
) {
  if (!await agentRepository.findByIdForOrg(organizationId, agentId)) {
    throw new NotFoundError("Agent not found");
  }
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new CustomApiError("Voice samples are not configured", 503);
  const url = (process.env.AI_API_URL ?? "http://localhost:5555").replace(/\/$/, "");
  try {
    const response = await fetch(`${url}/voice/sample`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": key },
      body: JSON.stringify(input),
      redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]),
    });
    if (!response.body) throw new Error("Empty sample response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_500_000) throw new Error("Sample response too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!response.ok) {
      const detail = typeof body.detail === "string" ? body.detail.slice(0, 300) : "Could not generate this voice sample";
      throw new CustomApiError(detail, [400, 422, 503, 504].includes(response.status) ? response.status : 503);
    }
    const sample = sampleResponse.parse(body);
    const header = Buffer.from(sample.audioBase64.slice(0, 60), "base64");
    if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") {
      throw new Error("Invalid WAV sample");
    }
    return sample;
  } catch (error) {
    if (error instanceof CustomApiError) throw error;
    throw new CustomApiError("Voice sample unavailable. Please try again shortly.", 503);
  }
}
