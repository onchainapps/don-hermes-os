#!/usr/bin/env bun
/**
 * CORS Test Script
 * Tests both preflight and actual SSE fetch against Hermes Gateway
 */

const GATEWAY = 'http://192.168.1.141:8642';
const AUTH = 'dev-key-12345';
const RUN_ID = 'run_500ada71c9b04ba58967a418e321284c';

async function test() {
  const url = `${GATEWAY}/v1/runs/${RUN_ID}/events`;
  console.log(`\n🔍 Testing: ${url}\n`);

  // 1. Preflight
  console.log('=== OPTIONS Preflight ===');
  try {
    const pre = await fetch(url, {
      method: 'OPTIONS',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Origin': 'http://192.168.1.141:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,accept'
      }
    });

    console.log(`Status: ${pre.status}`);
    const preHeaders: Record<string, string> = {};
    pre.headers.forEach((v, k) => preHeaders[k] = v);
    console.log('Headers:', JSON.stringify(preHeaders, null, 2));

    if (preHeaders['access-control-allow-origin']) {
      console.log('✅ Preflight CORS OK');
    } else {
      console.log('❌ Preflight missing ACAO header');
    }
  } catch (e) {
    console.error('Preflight error:', e);
  }

  console.log('\n=== GET + SSE ===');
  try {
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Authorization': `Bearer ${AUTH}`,
        'Accept': 'text/event-stream'
      }
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => headers[k] = v);
    console.log('Headers:', JSON.stringify(headers, null, 2));

    const acao = res.headers.get('access-control-allow-origin');
    if (acao) {
      console.log(`✅ Access-Control-Allow-Origin: ${acao}`);
    } else {
      console.log('❌ Missing Access-Control-Allow-Origin on actual response!');
    }

    if (!res.ok) {
      const text = await res.text();
      console.log('Body:', text);
      return;
    }

    // Read a bit of the stream
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = '';
      const start = Date.now();
      while (Date.now() - start < 2000) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 300) break;
      }
      console.log('Stream sample received (length:', buffer.length, ')');
    }
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

test();