export const brandedParameterInputKeys = new Set<string>([
  'temperature',
  'top_p',
  'topP',
  'frequency_penalty',
  'frequencyPenalty',
  'presence_penalty',
  'presencePenalty',
  'imageDetail',
  'image_detail',
  'reasoning_effort',
  'reasoningEffort',
  'reasoning_summary',
  'reasoningSummary',
  'verbosity',
]);

export const isBrandedParameterInputKey = (settingKey: string): boolean =>
  brandedParameterInputKeys.has(settingKey);
