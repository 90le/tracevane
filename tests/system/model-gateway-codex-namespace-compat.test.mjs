import test from "node:test";
import assert from "node:assert/strict";
import { adaptCodexResponsesRequestToChat, adaptChatCompletionToCodexResponse } from "../../dist/apps/api/modules/model-gateway/codex-adapter.js";

test("codex responses namespace and tool_search survive chat translation", () => {
  const adapted = adaptCodexResponsesRequestToChat(JSON.stringify({
    model: "gpt-5.4",
    input: [
      { role: "user", content: "Use CRM" },
      { type: "function_call", id: "fc_prev", call_id: "call_prev", namespace: "crm", name: "list_open_orders", arguments: { customer_id: "CUST-OLD" } },
      { type: "function_call_output", call_id: "call_prev", output: { ok: true } },
    ],
    tools: [
      { type: "namespace", name: "crm", tools: [{ type: "function", name: "list_open_orders", parameters: { type: "object" } }] },
      { type: "tool_search" },
    ],
    tool_choice: { type: "function", namespace: "crm", name: "list_open_orders" },
  }), { allowStreaming: true });

  assert.equal(adapted.chatRequest.tools[0].function.name, "crm__list_open_orders");
  assert.equal(adapted.chatRequest.tools[1].function.name, "openai_tool_search");
  assert.equal(adapted.chatRequest.tool_choice.function.name, "crm__list_open_orders");
  assert.deepEqual(adapted.namespaceToolNamesByChatName.crm__list_open_orders, { namespace: "crm", name: "list_open_orders" });
  assert.equal(adapted.chatRequest.messages[1].tool_calls[0].function.name, "crm__list_open_orders");

  const response = adaptChatCompletionToCodexResponse({
    id: "chatcmpl_namespace",
    created: 1710000040,
    model: "gpt-5.4",
    choices: [{
      message: {
        role: "assistant",
        tool_calls: [{ id: "call_orders", type: "function", function: { name: "crm__list_open_orders", arguments: "{\"customer_id\":\"CUST-12345\"}" } }],
      },
    }],
  }, "gpt-5.4", { namespaceToolNamesByChatName: adapted.namespaceToolNamesByChatName });

  assert.deepEqual(response.output, [{
    type: "function_call",
    id: "call_orders",
    call_id: "call_orders",
    status: "completed",
    namespace: "crm",
    name: "list_open_orders",
    arguments: "{\"customer_id\":\"CUST-12345\"}",
  }]);
});
