# Flux Tool Debugging Guide

This guide will help you debug issues with the Flux image generation tool in LibreChat.

## Changes Made

I've added comprehensive logging throughout the Flux tool implementation to help identify where issues occur. The logs will appear in your backend console/logs.

### Files Modified

1. **`api/app/clients/tools/structured/FluxAPI.js`**
   - Added logging to constructor (tracks initialization)
   - Added logging to getApiKey() (tracks API key loading)
   - Added logging to _call() (tracks method invocation)
   - Added logging to API request/response flow
   - Added logging to polling mechanism
   - Added logging to image saving process

2. **`api/app/clients/tools/util/handleTools.js`**
   - Added logging to tool loading process
   - Added logging to credential validation
   - Added logging to auth value loading

### Files Created

3. **`test-flux-api.js`**
   - Standalone test script to verify Flux API connectivity
   - Tests authentication independently of LibreChat

## Setup Instructions for Railway

### Option 1: Environment Variables (Recommended)

1. Go to your Railway project dashboard
2. Navigate to your LibreChat service
3. Click on "Variables" tab
4. Add a new variable:
   - **Name**: `FLUX_API_KEY`
   - **Value**: `bfl_Xa5HHUEMZgf64YxzHToNwF66fBFdDIG6` (from mattoni_flux.txt)
5. Redeploy your service (Railway should do this automatically)

### Option 2: User-Level Authentication

Alternatively, users can add their own API keys through the LibreChat UI:
1. Log in to LibreChat
2. Go to Settings
3. Navigate to Tools/Plugins section
4. Find "Flux" tool
5. Enter API key: `bfl_Xa5HHUEMZgf64YxzHToNwF66fBFdDIG6`

## Testing

### Step 1: Test API Key Directly

Before testing in LibreChat, verify the API key works:

```bash
node test-flux-api.js
```

This will:
- Check if the API key is valid
- Test authentication with Flux API
- List available finetune models (if any)

Expected output if working:
```
✓ FLUX_API_KEY found: bfl_Xa5H...
✓ Using base URL: https://api.us1.bfl.ai
=== Test 1: List Finetunes ===
✓ API authentication successful
  Status: 200
  Finetunes: { finetunes: [] }
```

### Step 2: Check Backend Logs

When using the Flux tool in LibreChat, you should see detailed logs like:

```
[FluxAPI] Constructor called with fields: { hasUserId: true, hasFileStrategy: true, hasFluxApiKey: true, ... }
[FluxAPI] API Key configured: { hasApiKey: true, apiKeyLength: 34, apiKeyPrefix: 'bfl_Xa5H...' }
[FluxAPI] Using base URL: https://api.us1.bfl.ai
[FluxAPI] _call invoked with data: { action: 'generate', hasPrompt: true, endpoint: '/v1/flux-pro', ... }
[FluxAPI] Sending POST request to Flux API: { url: '...', hasApiKey: true, ... }
[FluxAPI] Task submission successful: { taskId: '...', status: 200 }
[FluxAPI] Starting polling for task result
[FluxAPI] Poll 1 status: { status: 'Pending', taskId: '...', ... }
[FluxAPI] Task completed successfully after 3 polls
[FluxAPI] Image saved successfully: { filepath: '/images/...', ... }
```

## Common Issues and Solutions

### Issue 1: "Missing FLUX_API_KEY environment variable"

**Symptoms:**
- Error message when trying to use Flux tool
- Log shows: `[FluxAPI] Missing FLUX_API_KEY environment variable`

**Solutions:**
- Verify `FLUX_API_KEY` is set in Railway environment variables
- Restart the backend service after adding the variable
- Check for typos in the variable name (it's case-sensitive)

### Issue 2: "Tool not available" or tool doesn't appear

**Symptoms:**
- Flux tool not listed in available tools
- Log shows: `[validateTools] No valid credentials found, removing tool: { toolName: 'flux', ... }`

**Solutions:**
- API key not properly configured
- Check logs for `[validateTools]` messages
- Try adding API key through user settings instead

### Issue 3: API request fails with 401/403

**Symptoms:**
- Log shows: `[FluxAPI] Error while submitting task: { statusCode: 401, ... }`
- Error message about authentication

**Solutions:**
- Verify the API key is correct (should start with `bfl_`)
- Test with `test-flux-api.js` script
- Check if API key has been revoked or expired
- Verify no extra spaces or newlines in the API key

### Issue 4: Image generation times out

**Symptoms:**
- Polling continues but never completes
- Log shows many poll attempts

**Solutions:**
- Flux API might be experiencing high load
- Check Flux API status page
- Try a simpler prompt
- Verify network connectivity to api.us1.bfl.ai

### Issue 5: "processFileURL function not available"

**Symptoms:**
- Log shows: `[FluxAPI] processFileURL is not available!`
- Image URL received but can't be saved

**Solutions:**
- This indicates a configuration issue with LibreChat's file handling
- Check fileStrategy configuration in librechat.yaml
- Verify file storage is properly configured (local/s3/firebase)

## Viewing Logs in Railway

### Via Railway Dashboard
1. Go to your Railway project
2. Click on your LibreChat service
3. Click on "Deployments" tab
4. Click on the latest deployment
5. View the logs in real-time

### Via Railway CLI
```bash
railway logs
```

## Environment Variables to Check

Make sure these are set in Railway:

Required:
- `FLUX_API_KEY` - Your Flux API key (from mattoni_flux.txt)

Optional but recommended:
- `FLUX_API_BASE_URL` - Base URL for Flux API (default: https://api.us1.bfl.ai)
- `LOG_LEVEL` - Set to `debug` for more detailed logs

## Testing with Different Prompts

Once everything is configured, test with:

1. **Simple prompt**: "a red apple"
2. **Detailed prompt**: "A photorealistic image of a red apple on a wooden table, with soft natural lighting from a window, professional photography style, shallow depth of field"
3. **With specific endpoint**: Try different endpoints like `/v1/flux-pro-1.1` or `/v1/flux-dev`

## Advanced Debugging

### Enable Maximum Logging

Add to Railway environment variables:
```
DEBUG=*
LOG_LEVEL=debug
NODE_ENV=development
```

### Check Tool Registration

Look for these logs on startup:
```
[loadToolWithAuth] Loading tool: { toolName: 'FluxAPI', ... }
[loadToolWithAuth] Auth values loaded: { toolName: 'FluxAPI', ... }
[loadToolWithAuth] Tool initialized: { toolName: 'FluxAPI', ... }
```

### Network Issues

If you suspect network issues:
```bash
# Test connectivity to Flux API
curl -H "x-key: bfl_Xa5HHUEMZgf64YxzHToNwF66fBFdDIG6" \
  https://api.us1.bfl.ai/v1/my_finetunes
```

## Getting Help

If you're still stuck:

1. Run `test-flux-api.js` and share the output
2. Share relevant backend logs (especially lines with `[FluxAPI]` or `[validateTools]`)
3. Verify Railway environment variables are set correctly
4. Check if other tools (like DALL-E, Stable Diffusion) work - this helps isolate the issue

## Next Steps After Fixing

Once Flux is working:

1. Test different endpoints:
   - `/v1/flux-pro` - Standard quality
   - `/v1/flux-pro-1.1` - Better quality
   - `/v1/flux-pro-1.1-ultra` - Highest quality
   - `/v1/flux-dev` - Development/testing (cheaper)

2. Experiment with parameters:
   - `width` and `height` (must be multiples of 32)
   - `steps` (1-50, higher = better quality but slower)
   - `prompt_upsampling` (enhances prompts automatically)
   - `safety_tolerance` (0-6, content moderation level)

3. Monitor costs:
   - Each endpoint has different pricing (see FluxAPI.PRICING constants)
   - Consider using flux-dev for testing
