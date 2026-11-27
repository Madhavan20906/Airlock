# Measurement harness

Drives a real Chrome (with Gemini Nano downloaded) over the Chrome DevTools Protocol. Nothing here simulates a model: it clicks the real Studio UI, which calls Firebase AI Logic.

1. Start Chrome with a dedicated profile and remote debugging (Prompt API flags enabled):
   `chrome.exe --user-data-dir=<profile> --remote-debugging-port=9333 --enable-features=OptimizationGuideOnDeviceModel,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput`
2. Build a measurement snapshot outside `apps/web/dist` and serve it:
   `pnpm --filter @tandem/studio exec vite build --outDir ../../.measure/dist` then `node eval/harness/serve.mjs .measure/dist 4173`
   (For the cloud lane locally, pass a registered App Check debug token as `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` at build time. Never commit it.)
3. Run batches (one task type per batch; resumable):
   `node eval/harness/batch.mjs http://localhost:4173 calibration local .measure/cal-local.jsonl`
   and the same for `cloud` and for the `heldout` split.
4. Assemble results: `node eval/build-results.mjs .measure/cal-local.jsonl .measure/cal-cloud.jsonl .measure/held-local.jsonl .measure/held-cloud.jsonl`
5. Screenshots: `node eval/harness/shots.mjs .measure/shots`
