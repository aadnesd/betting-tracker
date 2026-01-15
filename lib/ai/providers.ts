import { gateway } from "@ai-sdk/gateway";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";
import {
  chatModel as mockChatModel,
  reasoningModel as mockReasoningModel,
  titleModel as mockTitleModel,
  artifactModel as mockArtifactModel,
} from "./models.mock";

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        "chat-model": mockChatModel,
        "chat-model-reasoning": mockReasoningModel,
        "chat-model-fast": mockChatModel, // Fast model for simple tasks
        "title-model": mockTitleModel,
        "artifact-model": mockArtifactModel,
      },
    })
  : customProvider({
      languageModels: {
        "chat-model": gateway.languageModel("openai/gpt-5-nano"),
        "chat-model-reasoning": wrapLanguageModel({
          model: gateway.languageModel("openai/gpt-5"),
          middleware: extractReasoningMiddleware({ tagName: "think" }),
        }),
        "chat-model-fast": gateway.languageModel("google/gemini-2.0-flash"), // Fast model for match linking
        "title-model": gateway.languageModel("openai/gpt-5-nano"),
        "artifact-model": gateway.languageModel("openai/gpt-5"),
      },
    });
