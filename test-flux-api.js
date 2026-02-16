/**
 * Test script to verify Flux API connectivity and authentication
 *
 * Usage: node test-flux-api.js
 *
 * This script will:
 * 1. Check if FLUX_API_KEY is set in environment
 * 2. Test API connectivity by listing finetunes
 * 3. Optionally test image generation (uncomment code at bottom)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Read API key from file or environment
let FLUX_API_KEY = process.env.FLUX_API_KEY;

if (!FLUX_API_KEY) {
  try {
    const keyFile = path.join(__dirname, 'mattoni_flux.txt');
    FLUX_API_KEY = fs.readFileSync(keyFile, 'utf8').trim();
    console.log('✓ Loaded FLUX_API_KEY from mattoni_flux.txt');
  } catch (error) {
    console.error('✗ Could not read API key from mattoni_flux.txt');
  }
}

if (!FLUX_API_KEY) {
  console.error('✗ FLUX_API_KEY not found in environment or mattoni_flux.txt');
  process.exit(1);
}

console.log('✓ FLUX_API_KEY found:', FLUX_API_KEY.substring(0, 8) + '...');
console.log('  Key length:', FLUX_API_KEY.length);

const BASE_URL = process.env.FLUX_API_BASE_URL || 'https://api.us1.bfl.ai';
console.log('✓ Using base URL:', BASE_URL);

// Test 1: List finetunes (simple GET request to verify auth)
async function testListFinetunes() {
  console.log('\n=== Test 1: List Finetunes ===');
  const url = `${BASE_URL}/v1/my_finetunes`;
  console.log('Request URL:', url);
  console.log('Request Method: GET');
  console.log('Request Headers:', {
    'x-key': FLUX_API_KEY.substring(0, 8) + '...',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });

  try {
    const response = await axios.get(url, {
      headers: {
        'x-key': FLUX_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    console.log('\n✓ API authentication successful');
    console.log('Response Status:', response.status, response.statusText);
    console.log('Response Headers:', {
      'content-type': response.headers['content-type'],
      'x-request-id': response.headers['x-request-id'],
    });
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error('\n✗ API request failed');
    console.error('Error Code:', error.code);
    console.error('Response Status:', error.response?.status, error.response?.statusText);
    console.error('Response Headers:', error.response?.headers);
    console.error('Response Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('Error Message:', error.message);
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('\n⚠ Network Error: Cannot reach Flux API server');
      console.error('   Check your internet connection and firewall settings');
    }
    return false;
  }
}

// Test 2: Simple image generation (commented out by default to avoid charges)
async function testImageGeneration() {
  console.log('\n=== Test 2: Image Generation ===');
  console.log('⚠ This will generate an image and may incur charges');

  const payload = {
    prompt: 'A beautiful sunset over mountains, vibrant colors, professional photography',
    width: 512,
    height: 512,
    prompt_upsampling: false,
    safety_tolerance: 6,
    output_format: 'png',
  };

  try {
    const generateUrl = `${BASE_URL}/v1/flux-pro`;
    console.log('Request URL:', generateUrl);
    console.log('Request Method: POST');
    console.log('Request Payload:', JSON.stringify(payload, null, 2));

    const taskResponse = await axios.post(generateUrl, payload, {
      headers: {
        'x-key': FLUX_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    console.log('Response Status:', taskResponse.status, taskResponse.statusText);
    console.log('Response Data:', JSON.stringify(taskResponse.data, null, 2));

    const taskId = taskResponse.data.id;
    console.log('✓ Task submitted:', taskId);

    // Poll for result
    let status = 'Pending';
    let pollCount = 0;
    const maxPolls = 30; // 30 polls * 2 seconds = 60 seconds max

    while (status !== 'Ready' && status !== 'Error' && pollCount < maxPolls) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      pollCount++;

      const resultUrl = `${BASE_URL}/v1/get_result?id=${taskId}`;
      const resultResponse = await axios.get(`${BASE_URL}/v1/get_result`, {
        headers: {
          'x-key': FLUX_API_KEY,
          Accept: 'application/json',
        },
        params: { id: taskId },
      });

      status = resultResponse.data.status;
      console.log(`  Poll ${pollCount}: Status = ${status}`, resultResponse.data);

      if (status === 'Ready') {
        console.log('✓ Image generation successful');
        console.log('  Image URL:', resultResponse.data.result.sample);
        return true;
      } else if (status === 'Error') {
        console.error('✗ Image generation failed');
        console.error('  Error:', resultResponse.data);
        return false;
      }
    }

    if (pollCount >= maxPolls) {
      console.error('✗ Image generation timed out after', pollCount * 2, 'seconds');
      return false;
    }
  } catch (error) {
    console.error('✗ Image generation request failed');
    console.error('  Status:', error.response?.status);
    console.error('  Status Text:', error.response?.statusText);
    console.error('  Error Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('  Error Message:', error.message);
    return false;
  }
}

// Run tests
(async () => {
  console.log('\n🧪 Starting Flux API Tests\n');
  console.log('==========================================');

  const finetunesOk = await testListFinetunes();

  // Uncomment the line below to test image generation (will incur charges)
  // const imageGenOk = await testImageGeneration();

  console.log('\n==========================================');
  console.log('\n📊 Test Summary:');
  console.log('  API Authentication:', finetunesOk ? '✓ PASS' : '✗ FAIL');
  // console.log('  Image Generation:', imageGenOk ? '✓ PASS' : '✗ FAIL');

  console.log('\n💡 Next Steps:');
  if (!finetunesOk) {
    console.log('  1. Verify your API key is correct');
    console.log('  2. Check if your API key has proper permissions');
    console.log('  3. Verify the Flux API base URL is correct');
    console.log('  4. Check if there are any network/firewall issues');
  } else {
    console.log('  ✓ API key is working correctly!');
    console.log('  - Make sure FLUX_API_KEY is set in your .env file or Railway environment variables');
    console.log('  - Restart your LibreChat backend after setting the environment variable');
    console.log('  - Check the backend logs when trying to use the Flux tool');
  }
})();
