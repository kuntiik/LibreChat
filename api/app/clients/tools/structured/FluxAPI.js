const axios = require('axios');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { FileContext, ContentTypes } = require('librechat-data-provider');

const fluxApiJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['generate'],
      description: 'Action to perform: "generate" for image generation.',
    },
    prompt: {
      type: 'string',
      description:
        'Text prompt for image generation. Required when action is "generate". Not used for list_finetunes.',
    },
    width: {
      type: 'number',
      description:
        'Width of the generated image in pixels. Must be a multiple of 32. Default is 1024.',
    },
    height: {
      type: 'number',
      description:
        'Height of the generated image in pixels. Must be a multiple of 32. Default is 768.',
    },
    prompt_upsampling: {
      type: 'boolean',
      description: 'Whether to perform upsampling on the prompt.',
    },
    steps: {
      type: 'integer',
      description: 'Number of steps to run the model for, a number from 1 to 50. Default is 40.',
    },
    seed: {
      type: 'number',
      description: 'Optional seed for reproducibility.',
    },
    safety_tolerance: {
      type: 'number',
      description:
        'Tolerance level for input and output moderation. Between 0 and 5, 0 being most strict, 5 being least strict.',
    },
    endpoint: {
      type: 'string',
      enum: [
        '/v1/flux-2-pro',
        '/v1/flux-2-max',
        '/v1/flux-2-flex',
        '/v1/flux-2-klein',
      ],
      description: 'Endpoint to use for image generation.',
    },
    raw: {
      type: 'boolean',
      description:
        'Generate less processed, more natural-looking images. Only works for /v1/flux-pro-1.1-ultra.',
    },
    finetune_id: {
      type: 'string',
      description: 'ID of the finetuned model to use',
    },
    finetune_strength: {
      type: 'number',
      description: 'Strength of the finetuning effect (typically between 0.1 and 1.2)',
    },
    guidance: {
      type: 'number',
      description: 'Guidance scale for finetuned models',
    },
    aspect_ratio: {
      type: 'string',
      description: 'Aspect ratio for ultra models (e.g., "16:9")',
    },
  },
  required: [],
};

const displayMessage =
  "Flux displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.";

/**
 * FluxAPI - A tool for generating high-quality images from text prompts using the Flux API.
 * Each call generates one image. If multiple images are needed, make multiple consecutive calls with the same or varied prompts.
 */
class FluxAPI extends Tool {
  // Pricing constants in USD per image
  static PRICING = {
    FLUX_PRO_1_1_ULTRA: -0.06, // /v1/flux-pro-1.1-ultra
    FLUX_PRO_1_1: -0.04, // /v1/flux-pro-1.1
    FLUX_PRO: -0.05, // /v1/flux-pro
    FLUX_DEV: -0.025, // /v1/flux-dev
    FLUX_PRO_FINETUNED: -0.06, // /v1/flux-pro-finetuned
    FLUX_PRO_1_1_ULTRA_FINETUNED: -0.07, // /v1/flux-pro-1.1-ultra-finetuned
  };

  constructor(fields = {}) {
    super();

    logger.debug('[FluxAPI] Constructor called with fields:', {
      hasUserId: !!fields.userId,
      hasFileStrategy: !!fields.fileStrategy,
      hasFluxApiKey: !!fields.FLUX_API_KEY,
      hasProcessFileURL: !!fields.processFileURL,
      isAgent: fields.isAgent,
      override: fields.override,
    });

    /** @type {boolean} Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;

    this.userId = fields.userId;
    this.fileStrategy = fields.fileStrategy;

    /** @type {boolean} **/
    this.isAgent = fields.isAgent;
    this.returnMetadata = fields.returnMetadata ?? false;

    if (fields.processFileURL) {
      /** @type {processFileURL} Necessary for output to contain all image metadata. */
      this.processFileURL = fields.processFileURL.bind(this);
    }

    this.apiKey = fields.FLUX_API_KEY || this.getApiKey();
    logger.info('[FluxAPI] API Key configured:', {
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey ? this.apiKey.length : 0,
      apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 8) + '...' : 'none',
    });

    this.name = 'flux';
    this.description =
      'Use Flux to generate images from text descriptions. Each generate call creates one image. For multiple images, make multiple consecutive calls. Uses flux-2-pro by default for best quality.';

    this.description_for_model = `// Transform any image description into a detailed, high-quality prompt. Never submit a prompt under 3 sentences. Follow these core rules:
    // 1. ALWAYS enhance basic prompts into 5-10 detailed sentences (e.g., "a cat" becomes: "A close-up photo of a sleek Siamese cat with piercing blue eyes. The cat sits elegantly on a vintage leather armchair, its tail curled gracefully around its paws. Warm afternoon sunlight streams through a nearby window, casting gentle shadows across its face and highlighting the subtle variations in its cream and chocolate-point fur. The background is softly blurred, creating a shallow depth of field that draws attention to the cat's expressive features. The overall composition has a peaceful, contemplative mood with a professional photography style.")
    // 2. Each prompt MUST be 3-6 descriptive sentences minimum, focusing on visual elements: lighting, composition, mood, and style
    // Available endpoints: '/v1/flux-2-pro' (default, best quality), '/v1/flux-2-max' (highest quality), '/v1/flux-2-flex' (flexible), '/v1/flux-2-klein' (fast/efficient). Always use action: 'generate' with one of these endpoints.`;

    // Add base URL from environment variable with fallback
    this.baseUrl = process.env.FLUX_API_BASE_URL || 'https://api.us1.bfl.ai';
    logger.debug('[FluxAPI] Using base URL:', this.baseUrl);

    this.schema = fluxApiJsonSchema;
  }

  static get jsonSchema() {
    return fluxApiJsonSchema;
  }

  getAxiosConfig() {
    const config = {};
    if (process.env.PROXY) {
      config.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
    }
    return config;
  }

  /** @param {Object|string} value */
  getDetails(value) {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value, null, 2);
  }

  getApiKey() {
    const apiKey = process.env.FLUX_API_KEY || '';
    logger.debug('[FluxAPI] getApiKey called:', {
      hasEnvVar: !!process.env.FLUX_API_KEY,
      apiKeyLength: apiKey.length,
      override: this.override,
    });
    if (!apiKey && !this.override) {
      logger.error('[FluxAPI] Missing FLUX_API_KEY environment variable');
      throw new Error('Missing FLUX_API_KEY environment variable.');
    }
    return apiKey;
  }

  wrapInMarkdown(imageUrl) {
    // Return markdown without server domain - LibreChat handles serving files
    // This matches DALLE3 implementation
    return `![generated image](${imageUrl})`;
  }

  returnValue(value) {
    if (this.isAgent === true && typeof value === 'string') {
      return [value, {}];
    } else if (this.isAgent === true && typeof value === 'object') {
      if (Array.isArray(value)) {
        return value;
      }
      return [displayMessage, value];
    }
    return value;
  }

  async _call(data) {
    logger.info('[FluxAPI] _call invoked with data:', {
      action: data.action || 'generate',
      hasPrompt: !!data.prompt,
      endpoint: data.endpoint,
      width: data.width,
      height: data.height,
    });

    const { action = 'generate', ...imageData } = data;

    // Use provided API key for this request if available, otherwise use default
    const requestApiKey = this.apiKey || this.getApiKey();
    logger.debug('[FluxAPI] Using API key:', {
      hasKey: !!requestApiKey,
      keyLength: requestApiKey ? requestApiKey.length : 0,
      keyPrefix: requestApiKey ? requestApiKey.substring(0, 8) + '...' : 'none',
    });

    // Handle list_finetunes action
    if (action === 'list_finetunes') {
      logger.debug('[FluxAPI] Handling list_finetunes action');
      return this.getMyFinetunes(requestApiKey);
    }

    // Handle finetuned generation
    if (action === 'generate_finetuned') {
      logger.debug('[FluxAPI] Handling generate_finetuned action');
      return this.generateFinetunedImage(imageData, requestApiKey);
    }

    // For generate action, ensure prompt is provided
    if (!imageData.prompt) {
      logger.error('[FluxAPI] Missing required field: prompt');
      throw new Error('Missing required field: prompt');
    }

    logger.info('[FluxAPI] Proceeding with image generation for prompt:', imageData.prompt.substring(0, 100) + '...');

    let payload = {
      prompt: imageData.prompt,
      prompt_upsampling: imageData.prompt_upsampling || false,
      safety_tolerance: imageData.safety_tolerance ?? 5,
      output_format: imageData.output_format || 'png',
    };

    // Add optional parameters if provided
    if (imageData.width) {
      payload.width = imageData.width;
    }
    if (imageData.height) {
      payload.height = imageData.height;
    }
    if (imageData.steps) {
      payload.steps = imageData.steps;
    }
    if (imageData.seed !== undefined) {
      payload.seed = imageData.seed;
    }
    if (imageData.raw) {
      payload.raw = imageData.raw;
    }

    const generateUrl = `${this.baseUrl}${imageData.endpoint || '/v1/flux-2-pro'}`;
    const resultUrl = `${this.baseUrl}/v1/get_result`;

    logger.debug('[FluxAPI] Generating image with payload:', payload);
    logger.debug('[FluxAPI] Using endpoint:', generateUrl);

    let taskResponse;
    try {
      const requestInfo = {
        url: generateUrl,
        method: 'POST',
        hasApiKey: !!requestApiKey,
        apiKeyPrefix: requestApiKey ? requestApiKey.substring(0, 8) + '...' : 'none',
        payload: {
          ...payload,
          prompt: payload.prompt.substring(0, 100) + '...',
        },
        headers: {
          'x-key': '***',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      };
      logger.info('[FluxAPI] Sending POST request to Flux API: ' + JSON.stringify(requestInfo, null, 2));

      taskResponse = await axios.post(generateUrl, payload, {
        headers: {
          'x-key': requestApiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...this.getAxiosConfig(),
      });

      const responseInfo = {
        status: taskResponse.status,
        statusText: taskResponse.statusText,
        data: taskResponse.data,
        headers: {
          'content-type': taskResponse.headers['content-type'],
          'x-request-id': taskResponse.headers['x-request-id'],
        },
      };
      logger.info('[FluxAPI] Task submission response: ' + JSON.stringify(responseInfo, null, 2));
    } catch (error) {
      const details = this.getDetails(error?.response?.data || error.message);
      const errorInfo = {
        url: generateUrl,
        method: 'POST',
        statusCode: error?.response?.status,
        statusText: error?.response?.statusText,
        hasApiKey: !!requestApiKey,
        apiKeyPrefix: requestApiKey ? requestApiKey.substring(0, 8) + '...' : 'none',
        requestPayload: {
          ...payload,
          prompt: payload.prompt.substring(0, 100) + '...',
        },
        responseHeaders: error?.response?.headers,
        responseData: error?.response?.data,
        errorMessage: error.message,
        errorCode: error.code,
        details,
      };
      logger.error('[FluxAPI] Error while submitting task: ' + JSON.stringify(errorInfo, null, 2));

      return this.returnValue(
        `Something went wrong when trying to generate the image. The Flux API may be unavailable:
        Error Message: ${details}`,
      );
    }

    const taskId = taskResponse.data.id;
    const pollingUrl = taskResponse.data.polling_url || `${resultUrl}?id=${taskId}`;
    logger.info('[FluxAPI] Got task ID: ' + taskId + ' (full response: ' + JSON.stringify(taskResponse.data) + ')');
    logger.info('[FluxAPI] Using polling URL: ' + pollingUrl);

    // Polling for the result
    let status = 'Pending';
    let resultData = null;
    let pollCount = 0;
    const maxPolls = 60; // Maximum 60 polls (2 minutes)
    logger.info('[FluxAPI] Starting polling for task result');

    while (status !== 'Ready' && status !== 'Error' && status !== 'Request Moderated') {
      try {
        // Wait 2 seconds between polls
        await new Promise((resolve) => setTimeout(resolve, 2000));
        pollCount++;

        // Check if we've exceeded max polls
        if (pollCount > maxPolls) {
          logger.error('[FluxAPI] Max polling attempts reached:', { pollCount, taskId });
          return this.returnValue(
            `Image generation timed out after ${maxPolls} attempts. The task may still be processing.`,
          );
        }

        logger.debug(`[FluxAPI] Polling attempt ${pollCount}:`, {
          url: pollingUrl,
          method: 'GET',
          taskId,
        });

        const resultResponse = await axios.get(pollingUrl, {
          headers: {
            'x-key': requestApiKey,
            Accept: 'application/json',
          },
          ...this.getAxiosConfig(),
        });
        status = resultResponse.data.status;

        const pollResponseInfo = {
          status: resultResponse.status,
          statusText: resultResponse.statusText,
          taskStatus: status,
          taskId,
          data: resultResponse.data,
        };
        logger.info(`[FluxAPI] Poll ${pollCount} response: ` + JSON.stringify(pollResponseInfo, null, 2));

        if (status === 'Ready') {
          resultData = resultResponse.data.result;
          logger.info('[FluxAPI] Task completed successfully after', pollCount, 'polls');
          break;
        } else if (status === 'Error') {
          logger.error('[FluxAPI] Error in task:', {
            taskId,
            pollCount,
            responseData: resultResponse.data,
          });
          return this.returnValue('An error occurred during image generation.');
        } else if (status === 'Request Moderated') {
          const moderationReasons =
            resultResponse.data.details?.['Moderation Reasons']?.join(', ') || 'Unknown';
          logger.warn('[FluxAPI] Request was moderated:', {
            taskId,
            reasons: moderationReasons,
            details: resultResponse.data.details,
          });
          return this.returnValue(
            `The image generation request was blocked by content moderation filters. Reason: ${moderationReasons}. Please try a different prompt.`,
          );
        }
      } catch (error) {
        const details = this.getDetails(error?.response?.data || error.message);
        const errorInfo = {
          url: pollingUrl,
          method: 'GET',
          pollCount,
          taskId,
          statusCode: error?.response?.status,
          statusText: error?.response?.statusText,
          responseData: error?.response?.data,
          responseHeaders: error?.response?.headers,
          errorMessage: error.message,
          errorCode: error.code,
          details,
        };
        logger.error('[FluxAPI] Error while polling for result: ' + JSON.stringify(errorInfo, null, 2));
        return this.returnValue('An error occurred while retrieving the image.');
      }
    }

    // If no result data
    if (!resultData || !resultData.sample) {
      logger.error('[FluxAPI] No image data received from API. Response:', resultData);
      return this.returnValue('No image data received from Flux API.');
    }

    // Try saving the image locally
    const imageUrl = resultData.sample;
    const imageName = `img-${uuidv4()}.png`;

    logger.info('[FluxAPI] Received image URL from Flux API:', {
      imageUrl,
      imageName,
      isAgent: this.isAgent,
    });

    // For agents, we still need to save the file to avoid token overflow from base64
    // The base64 approach was causing 390k+ tokens which exceeds context limits

    try {
      logger.debug('[FluxAPI] Saving image:', {
        imageUrl,
        imageName,
        userId: this.userId,
        fileStrategy: this.fileStrategy,
        hasProcessFileURL: !!this.processFileURL,
      });

      if (!this.processFileURL) {
        logger.error('[FluxAPI] processFileURL is not available!');
        return this.returnValue('Failed to save the image: processFileURL function not available.');
      }

      const result = await this.processFileURL({
        fileStrategy: this.fileStrategy,
        userId: this.userId,
        URL: imageUrl,
        fileName: imageName,
        basePath: 'images',
        context: FileContext.image_generation,
      });

      logger.info('[FluxAPI] Image saved successfully:', {
        filepath: result.filepath,
        filename: result.filename,
      });

      // Calculate cost based on endpoint
      /**
       * TODO: Cost handling
      const endpoint = imageData.endpoint || '/v1/flux-pro';
      const endpointKey = Object.entries(FluxAPI.PRICING).find(([key, _]) =>
        endpoint.includes(key.toLowerCase().replace(/_/g, '-')),
      )?.[0];
      const cost = FluxAPI.PRICING[endpointKey] || 0;
       */
      this.result = this.returnMetadata ? result : this.wrapInMarkdown(result.filepath);
      logger.debug('[FluxAPI] Returning result:', this.result);
      return this.returnValue(this.result);
    } catch (error) {
      const details = this.getDetails(error?.message ?? 'No additional error details.');
      logger.error('[FluxAPI] Error while saving the image:', {
        details,
        error: error.message,
        stack: error.stack,
      });
      return this.returnValue(`Failed to save the image locally. ${details}`);
    }
  }

  async getMyFinetunes(apiKey = null) {
    const finetunesUrl = `${this.baseUrl}/v1/my_finetunes`;
    const detailsUrl = `${this.baseUrl}/v1/finetune_details`;

    logger.info('[FluxAPI] Getting finetunes list:', {
      url: finetunesUrl,
      method: 'GET',
    });

    try {
      const headers = {
        'x-key': apiKey || this.getApiKey(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // Get list of finetunes
      const response = await axios.get(finetunesUrl, {
        headers,
        ...this.getAxiosConfig(),
      });

      logger.debug('[FluxAPI] Finetunes list response:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
      });

      const finetunes = response.data.finetunes;

      // Fetch details for each finetune
      const finetuneDetails = await Promise.all(
        finetunes.map(async (finetuneId) => {
          try {
            const detailResponse = await axios.get(`${detailsUrl}?finetune_id=${finetuneId}`, {
              headers,
              ...this.getAxiosConfig(),
            });
            return {
              id: finetuneId,
              ...detailResponse.data,
            };
          } catch (error) {
            logger.error(`[FluxAPI] Error fetching details for finetune ${finetuneId}:`, error);
            return {
              id: finetuneId,
              error: 'Failed to fetch details',
            };
          }
        }),
      );

      if (this.isAgent) {
        const formattedDetails = JSON.stringify(finetuneDetails, null, 2);
        return [`Here are the available finetunes:\n${formattedDetails}`, null];
      }
      return JSON.stringify(finetuneDetails);
    } catch (error) {
      const details = this.getDetails(error?.response?.data || error.message);
      const errorInfo = {
        url: finetunesUrl,
        method: 'GET',
        statusCode: error?.response?.status,
        statusText: error?.response?.statusText,
        responseData: error?.response?.data,
        errorMessage: error.message,
        errorCode: error.code,
        details,
      };
      logger.error('[FluxAPI] Error while getting finetunes: ' + JSON.stringify(errorInfo, null, 2));
      const errorMsg = `Failed to get finetunes: ${details}`;
      return this.isAgent ? this.returnValue([errorMsg, {}]) : new Error(errorMsg);
    }
  }

  async generateFinetunedImage(imageData, requestApiKey) {
    if (!imageData.prompt) {
      throw new Error('Missing required field: prompt');
    }

    if (!imageData.finetune_id) {
      throw new Error(
        'Missing required field: finetune_id for finetuned generation. Please supply a finetune_id!',
      );
    }

    // Validate endpoint is appropriate for finetuned generation
    const validFinetunedEndpoints = ['/v1/flux-pro-finetuned', '/v1/flux-pro-1.1-ultra-finetuned'];
    const endpoint = imageData.endpoint || '/v1/flux-pro-finetuned';

    if (!validFinetunedEndpoints.includes(endpoint)) {
      throw new Error(
        `Invalid endpoint for finetuned generation. Must be one of: ${validFinetunedEndpoints.join(', ')}`,
      );
    }

    let payload = {
      prompt: imageData.prompt,
      prompt_upsampling: imageData.prompt_upsampling || false,
      safety_tolerance: imageData.safety_tolerance ?? 5,
      output_format: imageData.output_format || 'png',
      finetune_id: imageData.finetune_id,
      finetune_strength: imageData.finetune_strength || 1.0,
      guidance: imageData.guidance || 2.5,
    };

    // Add optional parameters if provided
    if (imageData.width) {
      payload.width = imageData.width;
    }
    if (imageData.height) {
      payload.height = imageData.height;
    }
    if (imageData.steps) {
      payload.steps = imageData.steps;
    }
    if (imageData.seed !== undefined) {
      payload.seed = imageData.seed;
    }
    if (imageData.raw) {
      payload.raw = imageData.raw;
    }

    const generateUrl = `${this.baseUrl}${endpoint}`;
    const resultUrl = `${this.baseUrl}/v1/get_result`;

    logger.debug('[FluxAPI] Generating finetuned image with payload:', payload);
    logger.debug('[FluxAPI] Using endpoint:', generateUrl);

    let taskResponse;
    try {
      logger.info('[FluxAPI] Sending POST request for finetuned generation:', {
        url: generateUrl,
        method: 'POST',
        finetune_id: imageData.finetune_id,
        endpoint,
        payload: {
          ...payload,
          prompt: payload.prompt.substring(0, 100) + '...',
        },
      });

      taskResponse = await axios.post(generateUrl, payload, {
        headers: {
          'x-key': requestApiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...this.getAxiosConfig(),
      });

      logger.info('[FluxAPI] Finetuned task submission response:', {
        status: taskResponse.status,
        statusText: taskResponse.statusText,
        data: taskResponse.data,
      });
    } catch (error) {
      const details = this.getDetails(error?.response?.data || error.message);
      const errorInfo = {
        url: generateUrl,
        method: 'POST',
        statusCode: error?.response?.status,
        statusText: error?.response?.statusText,
        responseData: error?.response?.data,
        requestPayload: {
          ...payload,
          prompt: payload.prompt.substring(0, 100) + '...',
        },
        errorMessage: error.message,
        errorCode: error.code,
        details,
      };
      logger.error('[FluxAPI] Error while submitting finetuned task: ' + JSON.stringify(errorInfo, null, 2));
      return this.returnValue(
        `Something went wrong when trying to generate the finetuned image. The Flux API may be unavailable:
        Error Message: ${details}`,
      );
    }

    const taskId = taskResponse.data.id;
    const pollingUrl = taskResponse.data.polling_url || `${resultUrl}?id=${taskId}`;
    logger.info('[FluxAPI] Finetuned task ID: ' + taskId);
    logger.info('[FluxAPI] Using polling URL: ' + pollingUrl);

    // Polling for the result
    let status = 'Pending';
    let resultData = null;
    let pollCount = 0;
    const maxPolls = 60; // Maximum 60 polls (2 minutes)

    while (status !== 'Ready' && status !== 'Error' && status !== 'Request Moderated') {
      try {
        // Wait 2 seconds between polls
        await new Promise((resolve) => setTimeout(resolve, 2000));
        pollCount++;

        // Check if we've exceeded max polls
        if (pollCount > maxPolls) {
          logger.error('[FluxAPI] Max polling attempts reached for finetuned task:', {
            pollCount,
            taskId,
          });
          return this.returnValue(
            `Finetuned image generation timed out after ${maxPolls} attempts. The task may still be processing.`,
          );
        }

        const resultResponse = await axios.get(pollingUrl, {
          headers: {
            'x-key': requestApiKey,
            Accept: 'application/json',
          },
          ...this.getAxiosConfig(),
        });
        status = resultResponse.data.status;

        logger.debug(`[FluxAPI] Finetuned poll ${pollCount}:`, {
          status,
          taskId,
        });

        if (status === 'Ready') {
          resultData = resultResponse.data.result;
          break;
        } else if (status === 'Error') {
          logger.error('[FluxAPI] Error in finetuned task:', resultResponse.data);
          return this.returnValue('An error occurred during finetuned image generation.');
        } else if (status === 'Request Moderated') {
          const moderationReasons =
            resultResponse.data.details?.['Moderation Reasons']?.join(', ') || 'Unknown';
          logger.warn('[FluxAPI] Finetuned request was moderated:', {
            taskId,
            reasons: moderationReasons,
          });
          return this.returnValue(
            `The finetuned image generation request was blocked by content moderation. Reason: ${moderationReasons}. Please try a different prompt.`,
          );
        }
      } catch (error) {
        const details = this.getDetails(error?.response?.data || error.message);
        logger.error('[FluxAPI] Error while getting finetuned result:', details);
        return this.returnValue('An error occurred while retrieving the finetuned image.');
      }
    }

    // If no result data
    if (!resultData || !resultData.sample) {
      logger.error('[FluxAPI] No image data received from API. Response:', resultData);
      return this.returnValue('No image data received from Flux API.');
    }

    // Try saving the image locally
    const imageUrl = resultData.sample;
    const imageName = `img-${uuidv4()}.png`;

    try {
      logger.debug('[FluxAPI] Saving finetuned image:', imageUrl);
      const result = await this.processFileURL({
        fileStrategy: this.fileStrategy,
        userId: this.userId,
        URL: imageUrl,
        fileName: imageName,
        basePath: 'images',
        context: FileContext.image_generation,
      });

      logger.debug('[FluxAPI] Finetuned image saved to path:', result.filepath);

      // Calculate cost based on endpoint
      const endpointKey = endpoint.includes('ultra')
        ? 'FLUX_PRO_1_1_ULTRA_FINETUNED'
        : 'FLUX_PRO_FINETUNED';
      const cost = FluxAPI.PRICING[endpointKey] || 0;
      // Return the result based on returnMetadata flag
      this.result = this.returnMetadata ? result : this.wrapInMarkdown(result.filepath);
      return this.returnValue(this.result);
    } catch (error) {
      const details = this.getDetails(error?.message ?? 'No additional error details.');
      logger.error('Error while saving the finetuned image:', details);
      return this.returnValue(`Failed to save the finetuned image locally. ${details}`);
    }
  }
}

module.exports = FluxAPI;
