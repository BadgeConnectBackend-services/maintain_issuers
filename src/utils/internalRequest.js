// src/utils/internalRequest.js

import axios from "axios";

// ── Client for badgeconnect_user (auth + user CRUD) ───────────────
const userServiceClient = axios.create({
  baseURL: process.env.USER_SERVICE_URL,
  headers: {
    "x-internal-secret": process.env.INTERNAL_SERVICE_SECRET,
    "Content-Type": "application/json",
  },
  timeout: 8000,
});

/**
 * Auth proxy calls to badgeconnect_user.
 */
export async function callAuthService(path, body) {
  console.log(`📡 [callAuthService] POST ${path}`);
  console.log(`📤 [callAuthService] payload:`, JSON.stringify(body, null, 2));

  try {
    const response = await userServiceClient.post(path, body);
    console.log(`✅ [callAuthService] POST ${path} → ${response.status}`);
    console.log(`📥 [callAuthService] response:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (err) {
    console.error(`❌ [callAuthService] POST ${path} failed:`, {
      status:  err?.response?.status,
      message: err?.response?.data?.message,
      raw:     err.message,
    });
    throw err;
  }
}

/**
 * User CRUD calls to badgeconnect_user /internal/user/*.
 */
export async function callUserService(method, path, body = null) {
  console.log(`📡 [callUserService] ${method.toUpperCase()} ${path}`);
  if (body) console.log(`📤 [callUserService] payload:`, JSON.stringify(body, null, 2));

  const config = { method, url: path };
  if (body) config.data = body;

  try {
    const response = await userServiceClient.request(config);
    console.log(`✅ [callUserService] ${method.toUpperCase()} ${path} → ${response.status}`);
    console.log(`📥 [callUserService] response:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (err) {
    console.error(`❌ [callUserService] ${method.toUpperCase()} ${path} failed:`, {
      status:  err?.response?.status,
      message: err?.response?.data?.message,
      raw:     err.message,
    });
    throw err;
  }
}