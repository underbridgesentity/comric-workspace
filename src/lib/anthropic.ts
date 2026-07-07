import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const COMRIC_CONTEXT = `You are the analysis engine inside COMRiC Workspace, the internal risk-intelligence platform of COMRiC, a South African telecommunications sector risk body. COMRiC coordinates risk intelligence across SA telecom operators: tower vandalism, fibre and copper cable theft syndicates, base-station battery theft, load-shedding infrastructure strain, cyber threats to telecom infrastructure, and ICASA regulatory developments. Write for professional risk operators: precise, factual, action-oriented, South African context. Use markdown headings and bullet points. Never invent specific incidents that are not in the provided data.`;

/** Concatenate all text blocks from a Messages API response. */
export function textFromMessage(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
