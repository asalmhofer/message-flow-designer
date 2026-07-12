export function createNotificationService(){
  return {
    info(message){ console.info(`[MessageFlow] ${message}`); },
    warn(message){ console.warn(`[MessageFlow] ${message}`); },
    error(message, error){ console.error(`[MessageFlow] ${message}`, error); },
  };
}
