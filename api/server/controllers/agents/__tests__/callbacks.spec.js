const { Tools } = require('librechat-data-provider');

// Mock all dependencies before requiring the module
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-id'),
}));

jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
  writeAttachmentEvent: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  getMessageId: jest.fn(),
  ToolEndHandler: jest.fn(),
  handleToolCalls: jest.fn(),
}));

jest.mock('~/server/services/Files/Citations', () => ({
  processFileCitations: jest.fn(),
}));

jest.mock('~/server/services/Files/Code/process', () => ({
  processCodeOutput: jest.fn(),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  saveBase64Image: jest.fn(),
}));

describe('createToolEndCallback', () => {
  let req, res, artifactPromises, createToolEndCallback;
  let logger;
  let saveBase64Image;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get the mocked logger
    logger = require('@librechat/data-schemas').logger;
    saveBase64Image = require('~/server/services/Files/process').saveBase64Image;

    // Now require the module after all mocks are set up
    const callbacks = require('../callbacks');
    createToolEndCallback = callbacks.createToolEndCallback;

    req = {
      user: { id: 'user123' },
    };
    res = {
      headersSent: false,
      write: jest.fn(),
    };
    artifactPromises = [];
  });

  describe('ui_resources artifact handling', () => {
    it('should process ui_resources artifact and return attachment when headers not sent', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [
              { type: 'button', label: 'Click me' },
              { type: 'input', placeholder: 'Enter text' },
            ],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);

      // Wait for all promises to resolve
      const results = await Promise.all(artifactPromises);

      // When headers are not sent, it returns attachment without writing
      expect(res.write).not.toHaveBeenCalled();

      const attachment = results[0];
      expect(attachment).toEqual({
        type: Tools.ui_resources,
        messageId: 'run456',
        toolCallId: 'tool123',
        conversationId: 'thread789',
        [Tools.ui_resources]: [
          { type: 'button', label: 'Click me' },
          { type: 'input', placeholder: 'Enter text' },
        ],
      });
    });

    it('should write to response when headers are already sent', async () => {
      res.headersSent = true;
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [{ type: 'carousel', items: [] }],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(res.write).toHaveBeenCalled();
      expect(results[0]).toEqual({
        type: Tools.ui_resources,
        messageId: 'run456',
        toolCallId: 'tool123',
        conversationId: 'thread789',
        [Tools.ui_resources]: [{ type: 'carousel', items: [] }],
      });
    });

    it('should handle errors when processing ui_resources', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      // Mock res.write to throw an error
      res.headersSent = true;
      res.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [{ type: 'test' }],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(logger.error).toHaveBeenCalledWith(
        'Error processing artifact content:',
        expect.any(Error),
      );
      expect(results[0]).toBeNull();
    });

    it('should handle multiple artifacts including ui_resources', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [{ type: 'chart', data: [] }],
          },
          [Tools.web_search]: {
            results: ['result1', 'result2'],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      // Both ui_resources and web_search should be processed
      expect(artifactPromises).toHaveLength(2);
      expect(results).toHaveLength(2);

      // Check ui_resources attachment
      const uiResourceAttachment = results.find((r) => r?.type === Tools.ui_resources);
      expect(uiResourceAttachment).toBeTruthy();
      expect(uiResourceAttachment[Tools.ui_resources]).toEqual([{ type: 'chart', data: [] }]);

      // Check web_search attachment
      const webSearchAttachment = results.find((r) => r?.type === Tools.web_search);
      expect(webSearchAttachment).toBeTruthy();
      expect(webSearchAttachment[Tools.web_search]).toEqual({
        results: ['result1', 'result2'],
      });
    });

    it('should not process artifacts when output has no artifacts', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        content: 'Some regular content',
        // No artifact property
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);

      expect(artifactPromises).toHaveLength(0);
      expect(res.write).not.toHaveBeenCalled();
    });
  });

  describe('image artifact handling', () => {
    it('should process direct image metadata artifacts without base64 conversion', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        name: 'flux',
        tool_call_id: 'tool123',
        artifact: {
          file_id: 'file123',
          filename: 'flux-image.png',
          filepath: '/images/flux-image.png',
          type: 'image/png',
          width: 1024,
          height: 1024,
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(saveBase64Image).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        file_id: 'file123',
        filename: 'flux-image.png',
        filepath: '/images/flux-image.png',
        messageId: 'run456',
        toolCallId: 'tool123',
        conversationId: 'thread789',
      });
    });

    it('should keep non-base64 image_url content as direct image attachment', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        name: 'flux',
        tool_call_id: 'tool123',
        artifact: {
          file_ids: ['file456'],
          content: [
            {
              type: 'image_url',
              image_url: { url: '/images/from-content.png' },
            },
          ],
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(saveBase64Image).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        file_id: 'file456',
        filepath: '/images/from-content.png',
        messageId: 'run456',
        toolCallId: 'tool123',
        conversationId: 'thread789',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty ui_resources data object', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(results[0]).toEqual({
        type: Tools.ui_resources,
        messageId: 'run456',
        toolCallId: 'tool123',
        conversationId: 'thread789',
        [Tools.ui_resources]: [],
      });
    });

    it('should handle ui_resources with complex nested data', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const complexData = {
        0: {
          type: 'form',
          fields: [
            { name: 'field1', type: 'text', required: true },
            { name: 'field2', type: 'select', options: ['a', 'b', 'c'] },
          ],
          nested: {
            deep: {
              value: 123,
              array: [1, 2, 3],
            },
          },
        },
      };

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: complexData,
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(results[0][Tools.ui_resources]).toEqual(complexData);
    });

    it('should handle when output is undefined', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output: undefined }, metadata);

      expect(artifactPromises).toHaveLength(0);
      expect(res.write).not.toHaveBeenCalled();
    });

    it('should handle when data parameter is undefined', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback(undefined, metadata);

      expect(artifactPromises).toHaveLength(0);
      expect(res.write).not.toHaveBeenCalled();
    });
  });
});

describe('createResponsesToolEndCallback', () => {
  let req, res, tracker, artifactPromises, createResponsesToolEndCallback;
  let writeAttachmentEvent;

  beforeEach(() => {
    jest.clearAllMocks();

    const callbacks = require('../callbacks');
    createResponsesToolEndCallback = callbacks.createResponsesToolEndCallback;
    writeAttachmentEvent = require('@librechat/api').writeAttachmentEvent;

    req = {
      user: { id: 'user123' },
    };
    res = {
      headersSent: true,
      writableEnded: false,
      write: jest.fn(),
    };
    tracker = {
      nextSequence: jest.fn(() => 7),
    };
    artifactPromises = [];
  });

  it('should emit response attachment for direct image metadata artifacts', async () => {
    const toolEndCallback = createResponsesToolEndCallback({
      req,
      res,
      tracker,
      artifactPromises,
    });

    const output = {
      name: 'flux',
      tool_call_id: 'tool123',
      artifact: {
        file_id: 'file123',
        filename: 'flux-image.png',
        filepath: '/images/flux-image.png',
        type: 'image/png',
        width: 1024,
        height: 1024,
      },
    };

    const metadata = {
      run_id: 'run456',
      thread_id: 'thread789',
    };

    await toolEndCallback({ output }, metadata);
    const results = await Promise.all(artifactPromises);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      file_id: 'file123',
      filepath: '/images/flux-image.png',
      messageId: 'run456',
      toolCallId: 'tool123',
      conversationId: 'thread789',
    });
    expect(writeAttachmentEvent).toHaveBeenCalledWith(
      res,
      7,
      expect.objectContaining({
        file_id: 'file123',
        url: '/images/flux-image.png',
        tool_call_id: 'tool123',
      }),
      {
        messageId: 'run456',
        conversationId: 'thread789',
      },
    );
  });
});
