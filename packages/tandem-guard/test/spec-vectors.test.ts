import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runDeterministicDetectors,
  redactText,
  evaluateRoute,
  DEFAULT_ROUTING_POLICY
} from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const specDir = resolve(__dirname, '../../spec');

test('Shared Spec Vectors: Detection Vectors', () => {
  const vectorsPath = resolve(specDir, 'vectors/detection_vectors.json');
  const vectors = JSON.parse(readFileSync(vectorsPath, 'utf-8'));

  for (const v of vectors) {
    const detected = runDeterministicDetectors(v.text);
    for (const exp of v.expected) {
      const match = detected.find(d => d.type === exp.type && d.value === exp.value);
      assert.ok(
        match,
        `Vector ${v.id} failed: expected ${exp.type} "${exp.value}" to be detected in "${v.text}". Detected: ${JSON.stringify(detected)}`
      );
    }
  }
});

test('Shared Spec Vectors: Leak Vectors Guarantee Zero Egress Leak', () => {
  const vectorsPath = resolve(specDir, 'vectors/leak_vectors.json');
  const vectors = JSON.parse(readFileSync(vectorsPath, 'utf-8'));

  for (const v of vectors) {
    const entities = runDeterministicDetectors(v.input);
    const { sanitizedText } = redactText(v.input, entities);

    for (const forbidden of v.mustNotLeak) {
      assert.strictEqual(
        sanitizedText.includes(forbidden),
        false,
        `Vector ${v.id} leak detected! Sanitized payload "${sanitizedText}" contained raw identifier "${forbidden}"`
      );
    }
  }
});

test('Shared Spec Vectors: Routing Vectors Match Deterministic Route Table', () => {
  const vectorsPath = resolve(specDir, 'vectors/routing_vectors.json');
  const vectors = JSON.parse(readFileSync(vectorsPath, 'utf-8'));

  for (const v of vectors) {
    let inputContent = v.input;
    if (v.repeatToLength && inputContent.length < v.repeatToLength) {
      inputContent += 'A'.repeat(v.repeatToLength - inputContent.length);
    }

    const entities = runDeterministicDetectors(inputContent);
    const policy = {
      ...DEFAULT_ROUTING_POLICY,
      killSwitchLocalOnly: v.killSwitch ?? false
    };

    const decision = evaluateRoute({
      task: {
        instruction: v.description,
        content: inputContent,
        taskType: v.taskType
      },
      entities,
      localModelAvailable: v.localModelAvailable ?? true,
      online: v.isOnline ?? true,
      policy,
      hasNERLayer: false
    });

    assert.strictEqual(
      decision.route,
      v.expectedRoute,
      `Vector ${v.id} routing mismatch: expected ${v.expectedRoute}, got ${decision.route} (reason: ${decision.reason})`
    );
  }
});
