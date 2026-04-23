import { GoogleAuth } from 'google-auth-library';

export type AuthResult =
  | { mode: 'api-key'; apiKey: string }
  | { mode: 'adc'; accessToken: string; project: string; location: string };

export async function resolveAuth(apiKey?: string): Promise<AuthResult> {
  if (apiKey && apiKey.length > 0) {
    console.log('[auth] using: api-key');
    return { mode: 'api-key', apiKey };
  }

  const envApiKey = process.env.GEMINI_API_KEY;
  if (envApiKey && envApiKey.length > 0) {
    console.log('[auth] using: api-key');
    return { mode: 'api-key', apiKey: envApiKey };
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION;
  if (!project || !location) {
    failWith(
      'ADC mode requires GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION. Either set them, or pass --api-key / set GEMINI_API_KEY.',
    );
  }

  let accessToken: string;
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const tokenResp = await client.getAccessToken();
    const token =
      typeof tokenResp === 'string' ? tokenResp : tokenResp?.token;
    if (!token) {
      failWith(
        'Failed to obtain access token from ADC. Run `gcloud auth application-default login`.',
      );
    }
    accessToken = token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failWith(
      'ADC authentication failed. Run `gcloud auth application-default login` or set GOOGLE_APPLICATION_CREDENTIALS. Underlying error: ' +
        msg,
    );
  }

  console.log('[auth] using: adc');
  return { mode: 'adc', accessToken, project, location };
}

function failWith(msg: string): never {
  process.stderr.write(`[auth] error: ${msg}\n`);
  process.exit(1);
}
