import { createApp } from './app.js';
import { configProblems, loadConfig, missingTwilioConfig } from './config.js';

const cfg = loadConfig();
const { app } = createApp({ cfg });

app.listen(cfg.port, () => {
  console.log(`Llamadas en Español — servidor en http://localhost:${cfg.port}`);
  console.log(`Voz: ${cfg.ttsVoice} (${cfg.ttsLanguage})`);
  if (cfg.appPasswordGenerated) {
    console.log(`\nAPP_PASSWORD no está definida. Contraseña temporal para esta ejecución: ${cfg.appPassword}\n`);
  }
  const missing = missingTwilioConfig(cfg);
  if (missing.length) {
    console.log(`Llamadas reales desactivadas. Faltan: ${missing.join(', ')}. El modo demostración sí funciona.`);
  } else {
    console.log(`Webhooks de Twilio: ${cfg.publicBaseUrl}/twilio/{voice,gather,status}/:id`);
  }
  for (const p of configProblems(cfg)) console.warn(`Aviso: ${p.text}`);
});
