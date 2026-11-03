/** Shared settings for the e2e server and the tests. These are fake, test-only values. */
export const E2E = {
  demoPort: 3101,
  realPort: 3102,
  password: 'e2e-password',
  accountSid: 'AC' + 'e'.repeat(32),
  authToken: 'e2e_fake_auth_token',
  fromNumber: '+34600111222',
  publicBaseUrl: 'https://e2e.example.test',
  demoStepMs: 400,
  defaultNumber: '+34 955 74 88 35',
  defaultMessage: 'Buenos días, ¿a qué hora abren hoy, por favor?',
} as const;

export const DEMO_URL = `http://localhost:${E2E.demoPort}`;
export const REAL_URL = `http://localhost:${E2E.realPort}`;
