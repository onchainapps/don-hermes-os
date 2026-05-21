/**
 * Quick test harness for ProfileChat routing via Vite proxy.
 *
 * Tests two methods:
 * 1. X-Hermes-Profile header (current ProfileChat approach)
 * 2. profile field in request body (WebSocket style)
 *
 * Run with: bun run test-profile-routing.ts
 */

const VITE_PROXY = 'http://localhost:5173/gateway';
const PROFILE_NAME = 'don-developer'; // change to test different profiles

async function testWithHeader() {
  console.log('\n=== Test 1: Using X-Hermes-Profile header ===');
  try {
    const res = await fetch(`${VITE_PROXY}/v1/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hermes-Profile': PROFILE_NAME,
      },
      body: JSON.stringify({
        input: 'Hello from header test',
        stream: false,
      }),
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

async function testWithBodyProfile() {
  console.log('\n=== Test 2: Using profile field in body ===');
  try {
    const res = await fetch(`${VITE_PROXY}/v1/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: 'Hello from body test',
        profile: PROFILE_NAME,
        stream: false,
      }),
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

async function main() {
  console.log(`Testing profile routing for: ${PROFILE_NAME}`);
  console.log(`Proxy target: ${VITE_PROXY}`);

  await testWithHeader();
  await testWithBodyProfile();

  console.log('\nDone. Check which method returned a successful run_id from the correct profile.');
}

main();