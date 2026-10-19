export function validateAudio(body) {
  const error = message => Object.assign(new Error(message), { status: 400 });
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !['mimeType', 'audio'].includes(k)) ||
      !['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'].includes(body.mimeType))
    throw error('Formato de audio no admitido');
  if (typeof body.audio !== 'string' || body.audio.length > 1400000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.audio))
    throw error('Audio inválido o demasiado grande');
  const bytes = Buffer.from(body.audio, 'base64');
  if (bytes.length < 100 || bytes.length > 1024 * 1024 ||
      bytes.toString('base64') !== body.audio)
    throw error('Audio inválido o demasiado grande');
  return { mimeType: body.mimeType === 'audio/mp4' ? 'audio/m4a' : body.mimeType, data: body.audio };
}

export async function generateGemini(body, { env = process.env, transport = fetch } = {}) {
  const error = (message, status) => Object.assign(new Error(message), { status });

  if (!env.GEMINI_API_KEY) throw error('La IA requiere GEMINI_API_KEY en el servidor', 503);
  const model = env.GEMINI_MODEL;
  if (!model) throw error('GEMINI_MODEL must be set', 503);
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw error('GEMINI_MODEL inválido', 503);

  const maxAttempts = 3;
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await transport(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.GEMINI_API_KEY,
          },
          signal: controller.signal,
          body: JSON.stringify(body),
        }
      );
      clearTimeout(timer);

      // Specific error mapping
      if ([401, 403].includes(response.status)) {
        throw error('Revisa GEMINI_API_KEY y los permisos del proyecto en Google AI Studio', 503);
      }
      if (response.status === 404) {
        throw error('GEMINI_MODEL no está disponible para esta clave; revisa el modelo en Google AI Studio', 503);
      }
      if (response.status === 429) {
        throw error('Cuota de Google agotada. Intenta más tarde', 429);
      }
      if (!response.ok) {
        // Propagate the original status code (e.g., 502, 500, 503)
        throw error(`Google no pudo responder (HTTP ${response.status})`, response.status);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content;
      if (!Array.isArray(content?.parts)) throw error('Google no devolvió una respuesta', 502);
      return {
        content,
        text: content.parts
          .filter(p => typeof p.text === 'string' && !p.thought)
          .map(p => p.text)
          .join('\n')
          .trim(),
        calls: content.parts.filter(p => p.functionCall).map(p => p.functionCall),
      };
    } catch (e) {
      // Determine if the error is retryable: 5xx, network failure, or abort (timeout)
      const isRetryable =
        (e.status && e.status >= 500 && e.status < 600) ||
        e.name === 'AbortError' ||
        (!e.status && e.message && e.message.includes('Failed to fetch'));

      if (isRetryable && attempt < maxAttempts - 1) {
        attempt++;
        const delay = Math.min(500 * 2 ** attempt, 5000); // exponential backoff: 1s,2s,4s (capped)
        await new Promise(res => setTimeout(res, delay));
        continue; // retry
      }
      // Not retryable or retries exhausted – rethrow
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
