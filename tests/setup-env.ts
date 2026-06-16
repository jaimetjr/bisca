process.env.RECONNECT_TOKEN_SECRET ??= 'test-only-secret-do-not-use-in-production';
process.env.ALLOWED_ORIGINS ??= 'http://localhost:5000';
// Lift rate limits for the test suite — tests on 127.0.0.1 share an IP bucket
process.env.CREATE_ROOM_LIMIT_PER_MIN ??= '10000';
process.env.WS_MSG_LIMIT_PER_10S ??= '10000';
