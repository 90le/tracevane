import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const controlPayloadModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-control-payload.ts");

test("terminal control payload parser accepts batched resize controls", () => {
  const invalidResize = JSON.stringify({
    type: "resize",
    cols: null,
    rows: null,
  });
  const validResize = JSON.stringify({
    type: "resize",
    cols: 132,
    rows: 44,
  });

  const payloads = controlPayloadModule.parseTerminalControlPayloads(
    `${invalidResize}${invalidResize}\n${validResize}`,
  );

  assert.equal(payloads?.length, 3);
  assert.deepEqual(payloads?.at(-1), {
    type: "resize",
    cols: 132,
    rows: 44,
  });
  assert.equal(
    payloads?.every(controlPayloadModule.isResizeTerminalControlPayload),
    true,
  );
});

test("terminal control payload parser rejects mixed shell input", () => {
  const resize = JSON.stringify({
    type: "resize",
    cols: 120,
    rows: 40,
  });

  assert.equal(
    controlPayloadModule.parseTerminalControlPayloads(`${resize}pwd`),
    null,
  );
  assert.equal(
    controlPayloadModule.parseTerminalControlPayloads(`echo ${resize}`),
    null,
  );
});

test("terminal control payload parser rejects arrays and oversized batches", () => {
  assert.equal(controlPayloadModule.parseTerminalControlPayloads("[]"), null);

  const resize = JSON.stringify({
    type: "resize",
    cols: 80,
    rows: 24,
  });
  const oversized = Array.from(
    { length: controlPayloadModule.TERMINAL_CONTROL_BATCH_LIMIT + 1 },
    () => resize,
  ).join("");

  assert.equal(controlPayloadModule.parseTerminalControlPayloads(oversized), null);
});

test("terminal control payload type guard only accepts resize controls", () => {
  assert.equal(
    controlPayloadModule.isResizeTerminalControlPayload({ type: "resize" }),
    true,
  );
  assert.equal(
    controlPayloadModule.isResizeTerminalControlPayload({
      type: "input",
      data: "pwd",
    }),
    false,
  );
});
